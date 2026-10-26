"""Upload pipeline: preprocess -> detect -> classify -> verify (Gemma via Gemini API) -> dynamic categories."""
import base64
import hashlib
import io
import json
import os
import re
from datetime import datetime
from pathlib import Path

import httpx
import imagehash
import numpy as np
from PIL import ExifTags, Image, ImageOps

from models import COCO_FOOD, get_models

MAX_BYTES = 30 * 1024 * 1024
ALLOWED = {"JPEG", "PNG", "WEBP", "MPO", "BMP", "GIF", "TIFF"}
ANALYSIS_CACHE = Path(__file__).parent / "cache" / "analysis"
ANALYSIS_CACHE.mkdir(parents=True, exist_ok=True)

GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemma-4-26b-a4b-it")

# Decision thresholds (tuned on eval set; see eval.py)
CONF_LOW = 0.45          # top-level softmax confidence below this -> verify
MARGIN_LOW = 0.12        # top1 - top2 below this -> verify
MULTI_ON = 0.20          # extra top-level categories at/above this softmax share are kept
SUB_ON = 0.30            # subcategory share needed to assign
PERSON_CONF = 0.45
NEW_CATEGORY_SIM = 0.88  # proposed category this similar to an existing one is merged into it


class BadImage(ValueError):
    pass


# ---------------------------------------------------------------- preprocess
def preprocess(raw: bytes) -> dict:
    if not raw or len(raw) > MAX_BYTES:
        raise BadImage("file empty or larger than 30 MB")
    try:
        probe = Image.open(io.BytesIO(raw))
        probe.verify()
        img = Image.open(io.BytesIO(raw))
    except Exception as e:  # noqa: BLE001
        raise BadImage(f"not a readable image: {e}") from e
    if img.format not in ALLOWED:
        raise BadImage(f"unsupported format {img.format}")
    exif = _exif(img)
    img = ImageOps.exif_transpose(img).convert("RGB")
    thumb = img.copy()
    thumb.thumbnail((640, 640))
    return {
        "sha256": hashlib.sha256(raw).hexdigest(),
        "phash": str(imagehash.phash(img)),
        "width": img.width,
        "height": img.height,
        "palette": _palette(thumb),
        "thumb": thumb,
        **exif,
    }


def _exif(img: Image.Image) -> dict:
    out = {"taken_at": None, "gps_lat": None, "gps_lng": None, "camera": None}
    try:
        ex = img.getexif()
    except Exception:  # noqa: BLE001
        return out
    if not ex:
        return out
    make, model = ex.get(271), ex.get(272)
    if make or model:
        out["camera"] = " ".join(str(x).strip() for x in (make, model) if x)[:80]
    sub = ex.get_ifd(ExifTags.IFD.Exif)
    dt = sub.get(36867) or ex.get(306)
    if dt:
        try:
            out["taken_at"] = datetime.strptime(str(dt).strip()[:19], "%Y:%m:%d %H:%M:%S").isoformat()
        except ValueError:
            pass
    gps = ex.get_ifd(ExifTags.IFD.GPSInfo)
    try:
        def deg(v, ref):
            d = float(v[0]) + float(v[1]) / 60 + float(v[2]) / 3600
            return -d if ref in ("S", "W") else d
        if 2 in gps and 4 in gps:
            out["gps_lat"] = round(deg(gps[2], gps.get(1)), 6)
            out["gps_lng"] = round(deg(gps[4], gps.get(3)), 6)
    except Exception:  # noqa: BLE001
        pass
    return out


def _palette(img: Image.Image, n: int = 5) -> list[str]:
    q = img.resize((64, 64)).quantize(colors=n, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()
    counts = sorted(q.getcolors(), reverse=True)
    return ["#%02x%02x%02x" % tuple(pal[i * 3:i * 3 + 3]) for _, i in counts[:n]]


# ---------------------------------------------------------------- analyze
def analyze(pre: dict, use_verifier: bool = True) -> dict:
    """Cached by sha256: a processed image is never sent through the models (or Gemini) twice."""
    cache = ANALYSIS_CACHE / f"{pre['sha256']}.json"
    if cache.exists():
        return json.loads(cache.read_text())
    res = _analyze(pre["thumb"], use_verifier)
    cache.write_text(json.dumps(res))
    return res


def _analyze(thumb: Image.Image, use_verifier: bool) -> dict:
    m = get_models()
    dets = m.detect(thumb)
    faces = m.count_faces(thumb)
    emb = m.embed_images([thumb])[0]

    cos = m.label_embs @ emb
    prob = m.prob(cos)
    slugs = [l["slug"] for l in m.labels]
    by_slug = {l["slug"]: l for l in m.labels}
    top_idx = [i for i, l in enumerate(m.labels) if l["parent"] is None]

    # top level: softmax over SigLIP logits = relative confidence between categories
    top_logits = m.scale * cos[top_idx]
    share = np.exp(top_logits - top_logits.max())
    share /= share.sum()
    order = np.argsort(-share)
    ranked = [(slugs[top_idx[i]], float(share[i])) for i in order]
    (c1, s1), (c2, s2) = ranked[0], ranked[1]

    persons = [d for d in dets if d["label"] == "person" and d["conf"] >= PERSON_CONF]
    person_area = max((d["box"][2] * d["box"][3] for d in persons), default=0.0)
    coverage = min(1.0, sum(d["box"][2] * d["box"][3] for d in persons))
    crowd = len(persons) >= 5
    strong_person = bool(persons) and (person_area >= 0.10 or coverage >= 0.2 or crowd or (faces > 0 and person_area >= 0.04))
    food_objs = [d for d in dets if d["label"] in COCO_FOOD and d["conf"] >= 0.4]

    cats = [c for c, s in ranked if s >= MULTI_ON] or [c1]
    primary = c1
    reasons = []
    # A detected person is never overridden by a weaker label.
    if strong_person:
        if "people" not in cats:
            cats.insert(0, "people")
        people_dominant = person_area >= 0.2 or coverage >= 0.25 or crowd
        if primary != "people" and (people_dominant or s1 < 0.6):
            reasons.append(f"detector: person conf {persons[0]['conf']:.2f} overrides {c1} ({s1:.2f})")
            primary = "people"
            cats.remove("people")
            cats.insert(0, "people")
    # Food objects alone never force a category; they only feed the disagreement check.
    disagree = (strong_person and c1 != "people" and s1 >= 0.5) or (bool(food_objs) and "food" not in cats and not strong_person)
    needs_verify = s1 < CONF_LOW or (s1 - s2) < MARGIN_LOW or disagree

    sub = _subcategory(m, cos, slugs, by_slug, primary, persons)
    out = {
        "embedding": emb.tolist(),
        "primary_category": sub or primary,
        "categories": [sub or primary] + [c for c in cats if c != primary][:2],
        "category_scores": {c: round(s, 4) for c, s in ranked[:5]},
        "detections": dets[:20],
        "people_count": len(persons),
        "faces": faces,
        "confidence": round(s1, 4),
        "margin": round(s1 - s2, 4),
        "verified_by": "none",
        "rationale": "; ".join(reasons) or f"SigLIP zero-shot: {c1} {s1:.2f} vs {c2} {s2:.2f}",
        "needs_verify": needs_verify,
        "caption": _template_caption(by_slug, sub or primary, dets),
        "tags": _tags(by_slug, [sub or primary, *cats], dets),
        "ocr": None,
        "new_category": None,
    }
    if needs_verify and use_verifier and GEMINI_KEY:
        try:
            _verify(out, thumb, ranked, strong_person)
        except Exception as e:  # noqa: BLE001 — verifier is best-effort
            out["rationale"] += f"; verifier failed: {e}"[:200]
    return out


def _subcategory(m, cos, slugs, by_slug, top: str, persons: list) -> str | None:
    if top == "people":
        if len(persons) >= 3:
            return "people/group"
    kids = [i for i, l in enumerate(m.labels) if l["parent"] == top]
    if not kids:
        return None
    lg = m.scale * cos[kids]
    sh = np.exp(lg - lg.max())
    sh /= sh.sum()
    best = int(np.argmax(sh))
    if top == "people" and slugs[kids[best]] == "people/group" and len(persons) < 2:
        return "people/portrait"
    return slugs[kids[best]] if sh[best] >= SUB_ON else None


def _template_caption(by_slug, cat: str, dets: list) -> str:
    objs = []
    for d in dets:
        if d["conf"] >= 0.4 and d["label"] not in objs:
            objs.append(d["label"])
    label = by_slug[cat]["label"] if cat in by_slug else cat
    return f"{label}" + (f" with {', '.join(objs[:3])}" if objs else "")


def _tags(by_slug, cats: list, dets: list) -> list[str]:
    tags = []
    for c in cats:
        for t in (by_slug.get(c, {}).get("label", c).lower(), c.split("/")[0]):
            if t not in tags:
                tags.append(t)
    for d in dets:
        if d["conf"] >= 0.4 and d["label"] not in tags:
            tags.append(d["label"])
    return tags[:10]


# ---------------------------------------------------------------- Gemma verifier
def _jpeg_b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode()


def gemini(prompt: str, img: Image.Image | None = None, timeout: float = 40) -> dict:
    parts = [{"text": prompt}]
    if img is not None:
        parts.insert(0, {"inline_data": {"mime_type": "image/jpeg", "data": _jpeg_b64(img)}})
    r = httpx.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
        params={"key": GEMINI_KEY},
        json={"contents": [{"parts": parts}], "generationConfig": {"temperature": 0.2}},
        timeout=timeout,
    )
    r.raise_for_status()
    text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        raise ValueError(f"no JSON in model reply: {text[:120]}")
    return json.loads(match.group(0))


def _verify(out: dict, thumb: Image.Image, ranked: list, strong_person: bool):
    m = get_models()
    allowed = "\n".join(f"- {l['slug']}: {l['label']}" for l in m.labels)
    objs = ", ".join(f"{d['label']} {d['conf']:.2f}" for d in out["detections"][:8]) or "none"
    prompt = (
        "You verify an automatic photo classifier. Look at the image and answer with ONLY a JSON object.\n"
        f"Allowed category slugs:\n{allowed}\n"
        f"Classifier guess: {ranked[0][0]} ({ranked[0][1]:.2f}), runner-up {ranked[1][0]} ({ranked[1][1]:.2f}). "
        f"Object detector: {objs}.\n"
        'JSON keys: "caption" (max 15 words), "categories" (1-3 slugs from the list, most important first; '
        'prefer the most specific slug), "new_category" (null, or {"slug","label"} ONLY if no allowed slug fits), '
        '"tags" (5-8 lowercase words), "objects" (visible objects), "text" (visible text, "" if none), '
        '"rationale" (one line on what visual evidence decided it).'
    )
    v = gemini(prompt, thumb)
    valid = [c for c in v.get("categories", []) if c in {l["slug"] for l in m.labels}]
    if valid:
        top = valid[0].split("/")[0]
        if strong_person and top != "people" and "people" not in [c.split("/")[0] for c in valid]:
            valid.append("people")
        out["primary_category"] = valid[0]
        out["categories"] = valid[:3]
    out["caption"] = str(v.get("caption") or out["caption"])[:200]
    out["tags"] = [str(t).lower() for t in v.get("tags", [])][:10] or out["tags"]
    out["ocr"] = (v.get("text") or None) and str(v["text"])[:1000]
    out["rationale"] = f"Gemma: {v.get('rationale', '')}"[:300]
    out["verified_by"] = GEMINI_MODEL
    nc = v.get("new_category")
    if isinstance(nc, dict) and nc.get("label"):
        out["new_category"] = {"slug": _slug(nc.get("slug") or nc["label"]), "label": str(nc["label"])[:40]}


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40]


# ---------------------------------------------------------------- dynamic categories
def resolve_new_category(proposal: dict) -> tuple[str, dict | None]:
    """Return (slug to use, row to insert or None). Near-duplicates merge into the existing category."""
    m = get_models()
    emb = m.embed_label([proposal["label"]])
    sims = m.label_embs @ emb
    best = int(np.argmax(sims))
    if sims[best] >= NEW_CATEGORY_SIM:
        return m.labels[best]["slug"], None
    slug = proposal["slug"] or _slug(proposal["label"])
    row = {"slug": slug, "label": proposal["label"], "parent": None, "prompts": [proposal["label"]],
           "embedding": emb, "dynamic": True}
    m.add_label(row, emb)
    return slug, row
