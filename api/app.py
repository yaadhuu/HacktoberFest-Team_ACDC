"""Bliss ML API. Every request carries the user's Supabase JWT; all DB access runs as that user, so RLS applies."""
import threading

threading.stack_size(64 * 1024 * 1024)  # Windows worker threads default to 1 MB; model inference overflows it

from ultralytics import YOLO  # noqa: E402,F401  -- torch DLLs must load before numpy/PIL users on Windows

import io  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import random  # noqa: E402
import time  # noqa: E402
from collections import Counter  # noqa: E402
from contextlib import asynccontextmanager  # noqa: E402

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import cloudinary  # noqa: E402
import cloudinary.uploader  # noqa: E402
import httpx  # noqa: E402
import imagehash  # noqa: E402
import numpy as np  # noqa: E402
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile  # noqa: E402
from fastapi.concurrency import run_in_threadpool  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from PIL import Image  # noqa: E402
from pydantic import BaseModel  # noqa: E402

import pipeline  # noqa: E402
from models import get_models  # noqa: E402

SB_URL = os.environ["SUPABASE_URL"].rstrip("/")
SB_ANON = os.environ["SUPABASE_ANON_KEY"]
CLOUD = os.environ["CLOUDINARY_CLOUD_NAME"]
cloudinary.config(cloud_name=CLOUD, api_key=os.environ["CLOUDINARY_API_KEY"],
                  api_secret=os.environ["CLOUDINARY_API_SECRET"], secure=True)

@asynccontextmanager
async def lifespan(_app):
    get_models()  # load once on the main thread at startup, not inside a request
    yield


app = FastAPI(title="bliss-api", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
                   allow_methods=["*"], allow_headers=["*"])


# ------------------------------------------------------------------ auth + db
class User(BaseModel):
    id: str
    token: str


_token_cache: dict[str, tuple[float, str]] = {}


def auth(authorization: str = Header(default="")) -> User:
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "missing bearer token")
    hit = _token_cache.get(token)
    if hit and hit[0] > time.time():
        return User(id=hit[1], token=token)
    r = httpx.get(f"{SB_URL}/auth/v1/user", headers={"apikey": SB_ANON, "Authorization": f"Bearer {token}"}, timeout=15)
    if r.status_code != 200:
        raise HTTPException(401, "invalid session")
    uid = r.json()["id"]
    _token_cache[token] = (time.time() + 300, uid)
    return User(id=uid, token=token)


def db(u: User) -> httpx.Client:
    return httpx.Client(base_url=f"{SB_URL}/rest/v1", timeout=30, headers={
        "apikey": SB_ANON, "Authorization": f"Bearer {u.token}",
        "Content-Type": "application/json", "Prefer": "return=representation"})


def _ok(r: httpx.Response):
    if r.status_code >= 300:
        raise HTTPException(502, f"supabase {r.status_code}: {r.text[:300]}")
    return r.json() if r.content else None


def vec(v) -> str:
    return "[" + ",".join(f"{x:.6f}" for x in v) + "]"


_dynamic_loaded = False


def load_dynamic_categories(u: User):
    """Pull user-created categories into the classifier once per process."""
    global _dynamic_loaded
    if _dynamic_loaded:
        return
    with db(u) as c:
        rows = _ok(c.get("/categories", params={"select": "slug,label,parent,prompts,embedding", "is_dynamic": "eq.true"}))
    m = get_models()
    known = {l["slug"] for l in m.labels}
    for r in rows or []:
        if r["slug"] not in known and r.get("embedding"):
            emb = np.array(json.loads(r["embedding"]), np.float32)
            m.add_label({"slug": r["slug"], "label": r["label"], "parent": r["parent"], "prompts": r["prompts"], "dynamic": True}, emb)
    _dynamic_loaded = True


# ------------------------------------------------------------------ routes
@app.get("/health")
def health():
    return {"ok": True, "verifier": pipeline.GEMINI_MODEL if pipeline.GEMINI_KEY else None}


@app.get("/categories")
def categories(u: User = Depends(auth)):
    load_dynamic_categories(u)
    return [{k: l[k] for k in ("slug", "label", "parent")} | {"dynamic": l.get("dynamic", False)} for l in get_models().labels]


_phash_cache: dict[str, list[tuple[str, imagehash.ImageHash]]] = {}


def _near_duplicate(u: User, ph: str) -> str | None:
    if u.id not in _phash_cache:
        with db(u) as c:
            rows = _ok(c.get("/images", params={"select": "id,phash", "phash": "not.is.null"}))
        _phash_cache[u.id] = [(r["id"], imagehash.hex_to_hash(r["phash"])) for r in rows or []]
    h = imagehash.hex_to_hash(ph)
    for img_id, other in _phash_cache[u.id]:
        if h - other <= 4:
            return img_id
    return None


@app.post("/images")
async def upload(file: UploadFile = File(...), u: User = Depends(auth)):
    raw = await file.read()
    try:
        pre = await run_in_threadpool(pipeline.preprocess, raw)
    except pipeline.BadImage as e:
        raise HTTPException(400, str(e)) from e

    dup = _near_duplicate(u, pre["phash"])
    if dup:
        with db(u) as c:
            rows = _ok(c.get("/images", params={"id": f"eq.{dup}", "select": "*"}))
        return {"status": "duplicate", "image": _public(rows[0]) if rows else {"id": dup}}

    load_dynamic_categories(u)
    res = await run_in_threadpool(pipeline.analyze, pre)

    if res.get("new_category"):
        slug, row = await run_in_threadpool(pipeline.resolve_new_category, res["new_category"])
        if row:
            with db(u) as c:
                c.post("/categories", json={"slug": row["slug"], "label": row["label"], "prompts": row["prompts"],
                                            "embedding": vec(row["embedding"]), "is_dynamic": True},
                       headers={"Prefer": "resolution=ignore-duplicates"})
        res["primary_category"] = slug
        res["categories"] = [slug] + [c for c in res["categories"] if c != slug][:2]

    # signed, server-side upload; public_id is content-addressed so retries never duplicate
    up = await run_in_threadpool(lambda: cloudinary.uploader.upload(
        io.BytesIO(raw), folder=f"bliss/{u.id}", public_id=pre["sha256"][:24],
        overwrite=False, unique_filename=False, resource_type="image"))
    pid = up["public_id"]

    x, y, z, cluster = _place(u, res["embedding"])
    row = {
        "id": f"{u.id[:8]}_{pre['sha256'][:20]}",
        "url": up["secure_url"],
        "thumb": f"https://res.cloudinary.com/{CLOUD}/image/upload/c_fill,w_400,h_500,q_auto,f_auto/{pid}",
        "cloudinary_public_id": pid,
        "caption": res["caption"], "tags": res["tags"], "ocr": res["ocr"],
        "embedding": vec(res["embedding"]),
        "x": x, "y": y, "z": z, "cluster_id": cluster,
        "sha256": pre["sha256"], "phash": pre["phash"], "width": pre["width"], "height": pre["height"],
        "taken_at": pre["taken_at"], "gps_lat": pre["gps_lat"], "gps_lng": pre["gps_lng"], "camera": pre["camera"],
        "palette": pre["palette"], "categories": res["categories"], "primary_category": res["primary_category"],
        "category_scores": res["category_scores"], "detections": res["detections"], "people_count": res["people_count"],
        "verified_by": res["verified_by"], "rationale": res["rationale"], "source": "live",
    }
    with db(u) as c:
        r = c.post("/images", json=row, headers={"Prefer": "return=representation,resolution=ignore-duplicates"})
        rows = _ok(r)
    _phash_cache.setdefault(u.id, []).append((row["id"], imagehash.hex_to_hash(pre["phash"])))
    return {"status": "created", "image": _public(rows[0] if rows else row)}


def _place(u: User, emb: list[float]) -> tuple[float, float, float, str | None]:
    """Until the next UMAP rebuild, drop a new star next to its nearest neighbours."""
    with db(u) as c:
        nn = _ok(c.post("/rpc/match_images", json={"query_embedding": vec(emb), "match_count": 6})) or []
        if nn:
            ids = ",".join(n["id"] for n in nn)
            pts = _ok(c.get("/images", params={"id": f"in.({ids})", "select": "x,y,z,cluster_id"})) or []
        else:
            pts = []
    j = lambda s: random.uniform(-s, s)  # noqa: E731
    if not pts:
        return j(3), j(3), j(3), None
    cl = Counter(p["cluster_id"] for p in pts).most_common(1)[0][0]
    return (float(np.mean([p["x"] for p in pts])) + j(0.4), float(np.mean([p["y"] for p in pts])) + j(0.4),
            float(np.mean([p["z"] for p in pts])) + j(0.4), cl)


PUBLIC_COLS = ("id,url,thumb,cloudinary_public_id,caption,tags,ocr,x,y,z,cluster_id,sha256,width,height,taken_at,"
               "gps_lat,gps_lng,camera,palette,categories,primary_category,category_scores,detections,people_count,"
               "verified_by,rationale,favorite,source,created_at")


def _public(r: dict) -> dict:
    return {k: r.get(k) for k in PUBLIC_COLS.split(",")}


# ------------------------------------------------------------------ search
class SearchBody(BaseModel):
    query: str
    limit: int = 400


def _rank(u: User, emb: np.ndarray, words: list[str], limit: int) -> list[dict]:
    m = get_models()
    with db(u) as c:
        nn = _ok(c.post("/rpc/match_images", json={"query_embedding": vec(emb), "match_count": limit})) or []
        meta = _ok(c.get("/images", params={"select": "id,caption,tags,categories"})) or []
    text = {r["id"]: " ".join([r.get("caption") or "", *(r.get("tags") or []), *(r.get("categories") or [])]).lower() for r in meta}
    if not nn:
        return []
    sims = np.array([n["similarity"] for n in nn])
    lo, hi = float(sims.min()), float(sims.max())
    out = []
    for n, s in zip(nn, sims):
        t = text.get(n["id"], "")
        hit = sum(w in t for w in words) / len(words) if words else 0.0
        score = 0.75 * ((s - lo) / (hi - lo) if hi > lo else 1.0) + 0.25 * hit
        out.append({"id": n["id"], "score": round(float(score), 4), "similarity": round(float(s), 4),
                    "prob": round(float(m.prob(np.array([s]))[0]), 4), "text_hit": round(hit, 2)})
    out.sort(key=lambda r: -r["score"])
    best = out[0]["score"]
    for r in out:
        r["match"] = r["score"] >= max(0.55, best * 0.8)
    return out


@app.post("/search")
async def search(body: SearchBody, u: User = Depends(auth)):
    q = body.query.strip()
    if not q:
        raise HTTPException(400, "empty query")
    m = get_models()
    e = await run_in_threadpool(m.embed_texts, [q, f"a photo of {q}."])
    emb = e.mean(0)
    emb /= np.linalg.norm(emb)
    words = [w for w in q.lower().split() if len(w) > 2]
    with db(u) as c:
        c.post("/searches", json={"query": q[:200]})
    return {"query": q, "results": await run_in_threadpool(_rank, u, emb, words, body.limit)}


@app.post("/search/image")
async def search_image(file: UploadFile = File(...), u: User = Depends(auth)):
    try:
        pre = await run_in_threadpool(pipeline.preprocess, await file.read())
    except pipeline.BadImage as e:
        raise HTTPException(400, str(e)) from e
    emb = (await run_in_threadpool(get_models().embed_images, [pre["thumb"]]))[0]
    return {"results": await run_in_threadpool(_rank, u, emb, [], 400)}


class SimilarBody(BaseModel):
    image_id: str


@app.post("/similar")
async def similar(body: SimilarBody, u: User = Depends(auth)):
    with db(u) as c:
        rows = _ok(c.get("/images", params={"id": f"eq.{body.image_id}", "select": "embedding"}))
    if not rows or not rows[0].get("embedding"):
        raise HTTPException(404, "image not found")
    emb = np.array(json.loads(rows[0]["embedding"]), np.float32)
    return {"results": await run_in_threadpool(_rank, u, emb, [], 400)}


# ------------------------------------------------------------------ explain
class ExplainBody(BaseModel):
    image_id: str
    query: str


@app.post("/explain")
async def explain(body: ExplainBody, u: User = Depends(auth)):
    q = body.query.strip()[:200]
    with db(u) as c:
        hit = _ok(c.get("/explanations", params={"image_id": f"eq.{body.image_id}", "query": f"eq.{q}", "select": "result"}))
        if hit:
            return hit[0]["result"]
        rows = _ok(c.get("/images", params={"id": f"eq.{body.image_id}",
                                            "select": "cloudinary_public_id,caption,categories,tags,detections"}))
    if not rows:
        raise HTTPException(404, "image not found")
    r = rows[0]
    result = None
    if pipeline.GEMINI_KEY:
        try:
            url = f"https://res.cloudinary.com/{CLOUD}/image/upload/w_640,q_auto,f_jpg/{r['cloudinary_public_id']}"
            img = Image.open(io.BytesIO(httpx.get(url, timeout=20).content)).convert("RGB")
            v = await run_in_threadpool(pipeline.gemini, (
                f'The user searched their photos for "{q}" and this image was returned. Reply with ONLY JSON: '
                '{"reason": one sentence naming the visual evidence for (or against) the match, '
                '"evidence": up to 3 short phrases, "box": [x, y, w, h] normalized 0-1 around the strongest evidence, or null}'), img)
            result = {"reason": str(v.get("reason", ""))[:300], "evidence": v.get("evidence", [])[:3],
                      "box": v.get("box"), "by": pipeline.GEMINI_MODEL}
        except Exception as e:  # noqa: BLE001
            print("explain verifier failed:", e)
    if result is None:
        result = _template_explain(r, q)
    with db(u) as c:
        c.post("/explanations", json={"image_id": body.image_id, "query": q, "result": result},
               headers={"Prefer": "resolution=ignore-duplicates"})
    return result


def _template_explain(r: dict, q: str) -> dict:
    words = set(q.lower().split())
    dets = r.get("detections") or []
    hit = next((d for d in dets if d["label"] in words or any(w in d["label"] for w in words)), None) or (dets[0] if dets else None)
    cats = ", ".join(r.get("categories") or [])
    reason = f"Embedding similarity to “{q}”; classified as {cats}" + (f", detector found {hit['label']} ({hit['conf']:.0%})" if hit else "") + "."
    return {"reason": reason, "evidence": [r.get("caption") or ""], "box": hit["box"] if hit else None, "by": "siglip+yolo"}


# ------------------------------------------------------------------ galaxy layout (UMAP + HDBSCAN)
@app.post("/galaxy/rebuild")
async def rebuild(u: User = Depends(auth)):
    return await run_in_threadpool(_rebuild, u)


def _rebuild(u: User) -> dict:
    with db(u) as c:
        rows = _ok(c.get("/images", params={"select": "id,embedding,caption,primary_category", "embedding": "not.is.null"})) or []
    n = len(rows)
    if n == 0:
        return {"clusters": 0, "images": 0}
    X = np.array([json.loads(r["embedding"]) for r in rows], np.float32)
    if n < 8:
        rng = np.random.default_rng(0)
        coords, labels = rng.normal(0, 2, (n, 3)), np.zeros(n, int)
    else:
        import umap
        from sklearn.cluster import HDBSCAN
        coords = umap.UMAP(n_components=3, n_neighbors=min(15, n - 1), min_dist=0.2, metric="cosine",
                           random_state=42).fit_transform(X)
        labels = HDBSCAN(min_cluster_size=max(3, n // 30), min_samples=2).fit_predict(coords)
    coords = coords - coords.mean(0)
    coords = coords / (np.abs(coords).max() or 1) * 8

    cats = get_models()
    label_of = {l["slug"]: l["label"] for l in cats.labels}
    clusters, payload = [], []
    for k in sorted(set(labels) - {-1}):
        idx = np.where(labels == k)[0]
        cid = f"{u.id[:8]}_c{k}"
        common = Counter(rows[i]["primary_category"] for i in idx).most_common(1)[0][0]
        name = label_of.get(common, common or "Cluster")
        if pipeline.GEMINI_KEY and len(clusters) < 16:
            caps = "; ".join(rows[i]["caption"] or "" for i in idx[:8])
            try:
                name = str(pipeline.gemini(f'Photo captions from one cluster: {caps}. Reply ONLY JSON {{"label": "1-3 word name"}}')["label"])[:32]
            except Exception as e:  # noqa: BLE001
                print("cluster naming failed:", e)
        c = coords[idx].mean(0)
        clusters.append({"id": cid, "label": name, "size": int(len(idx)), "cx": float(c[0]), "cy": float(c[1]), "cz": float(c[2])})
    for i, r in enumerate(rows):
        payload.append({"id": r["id"], "x": float(coords[i, 0]), "y": float(coords[i, 1]), "z": float(coords[i, 2]),
                        "cluster_id": f"{u.id[:8]}_c{labels[i]}" if labels[i] != -1 else None})
    with db(u) as c:
        _ok(c.delete("/user_clusters", params={"user_id": f"eq.{u.id}"}))
        if clusters:
            _ok(c.post("/user_clusters", json=clusters))
        _ok(c.post("/rpc/update_layout", json={"payload": payload}))
    return {"clusters": len(clusters), "images": n, "noise": int((labels == -1).sum())}
