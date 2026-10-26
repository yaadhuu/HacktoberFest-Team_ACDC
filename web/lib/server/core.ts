import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";
import exifr from "exifr";
import sharp from "sharp";

export class HttpError extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

const env = (k: string) => process.env[k] ?? "";
const SB_URL = () => env("SUPABASE_URL") || env("NEXT_PUBLIC_SUPABASE_URL");
const ANON = () => env("SUPABASE_ANON_KEY") || env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const CLOUD = () => env("CLOUDINARY_CLOUD_NAME") || env("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME");
const MODEL = () => env("GEMINI_MODEL") || "gemma-4-26b-a4b-it";

export type Owner = { id: string; sb: SupabaseClient; service: boolean };

export async function authUser(req: Request): Promise<Owner> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError(401, "missing bearer token");
  const sb = createClient(SB_URL(), ANON(), { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "invalid session");
  return { id: data.user.id, sb, service: false };
}

export function serviceOwner(id: string): Owner {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new HttpError(503, "invites need SUPABASE_SERVICE_ROLE_KEY");
  return { id, sb: createClient(SB_URL(), key, { auth: { persistSession: false } }), service: true };
}

export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ detail: e.message }, { status: e.status });
    console.error(e);
    return Response.json({ detail: (e as Error).message }, { status: 500 });
  }
}

// ------------------------------------------------------------------ invites (stateless HMAC)
const secret = () => env("INVITE_SECRET") || crypto.createHash("sha256").update(`bliss-invite:${env("SUPABASE_SERVICE_ROLE_KEY")}`).digest("hex");
const sign = (uid: string) => crypto.createHmac("sha256", secret()).update(uid).digest().subarray(0, 16).toString("base64url");
export const makeInvite = (uid: string) => `${uid}.${sign(uid)}`;
export function inviteOwner(token: string): string {
  const [uid, sig] = token.split(".");
  if (!env("SUPABASE_SERVICE_ROLE_KEY") || !uid || !sig || sig.length !== sign(uid).length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(sign(uid)))) throw new HttpError(404, "invite not found");
  return uid;
}

// ------------------------------------------------------------------ Gemma 4 + embeddings (Gemini API)
async function post(url: string, body: unknown, tries = 3): Promise<any> {
  let last = "";
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) return r.json();
    last = `${r.status} ${(await r.text()).slice(0, 160)}`;
    if (![429, 500, 502, 503, 504].includes(r.status)) break;
    await new Promise((s) => setTimeout(s, 1200 * (i + 1)));
  }
  throw new Error(`gemini: ${last}`);
}

export async function gemma(prompt: string, jpeg?: Buffer): Promise<any> {
  const parts: any[] = [{ text: prompt }];
  if (jpeg) parts.unshift({ inline_data: { mime_type: "image/jpeg", data: jpeg.toString("base64") } });
  for (let i = 0; i < 2; i++) {
    const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent?key=${env("GEMINI_API_KEY")}`,
      { contents: [{ parts }], generationConfig: { temperature: 0.2, maxOutputTokens: 4096 } });
    const text = (j.candidates?.[0]?.content?.parts ?? []).filter((p: any) => !p.thought).map((p: any) => p.text ?? "").join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch { /* retry */ } }
  }
  throw new Error("gemma returned no JSON");
}

export async function embed(text: string): Promise<number[]> {
  const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${env("GEMINI_API_KEY")}`,
    { content: { parts: [{ text: text.slice(0, 2000) }] }, outputDimensionality: 768 });
  const v: number[] = j.embedding.values;
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

export const vec = (v: number[]) => `[${v.map((x) => x.toFixed(6)).join(",")}]`;

// ------------------------------------------------------------------ taxonomy
export const TAXONOMY: [string, string][] = [
  ["people/portrait", "Portrait"], ["people/group", "Group"], ["people/selfie", "Selfie"],
  ["food/dish", "Dishes"], ["food/drink", "Drinks"], ["food/dessert", "Desserts"], ["food/produce", "Produce"],
  ["nature/mountains", "Mountains"], ["nature/water", "Water & coast"], ["nature/forest", "Forest"], ["nature/sky", "Sky"], ["nature/plants", "Plants & flowers"],
  ["animals/dogs", "Dogs"], ["animals/cats", "Cats"], ["animals/birds", "Birds"], ["animals/wild", "Wildlife"],
  ["architecture/exterior", "Buildings"], ["architecture/interior", "Interiors"], ["architecture/street", "Streets"],
  ["documents/receipt", "Receipts"], ["documents/notes", "Notes"], ["documents/printed", "Printed pages"], ["documents/sign", "Signs & posters"],
  ["screenshots/app", "App screens"], ["screenshots/web", "Web pages"], ["screenshots/code", "Code"],
  ["products/electronics", "Electronics"], ["products/fashion", "Fashion"], ["products/home", "Home & kitchen"],
  ["art/painting", "Paintings"], ["art/diagram", "Diagrams & charts"], ["art/sketch", "Sketches"],
  ["vehicles/car", "Cars"], ["vehicles/bike", "Bikes"], ["vehicles/transit", "Transit"],
  ["events/party", "Parties"], ["events/concert", "Concerts"], ["events/sports", "Sports"], ["events/wedding", "Weddings"],
];
const SLUGS = new Set(TAXONOMY.map(([s]) => s));

// ------------------------------------------------------------------ preprocess
export type Pre = {
  sha256: string; phash: string; width: number; height: number; palette: string[];
  taken_at: string | null; gps_lat: number | null; gps_lng: number | null; camera: string | null; thumb: Buffer;
};

export async function preprocess(raw: Buffer): Promise<Pre> {
  if (!raw.length || raw.length > 30 * 1024 * 1024) throw new HttpError(400, "file empty or larger than 30 MB");
  let meta;
  try { meta = await sharp(raw).metadata(); } catch (e) { throw new HttpError(400, `not a readable image: ${(e as Error).message}`); }
  if (!meta.format || !["jpeg", "png", "webp", "gif", "tiff", "heif", "avif"].includes(meta.format)) throw new HttpError(400, `unsupported format ${meta.format}`);
  const base = sharp(raw).rotate();
  const thumb = await base.clone().resize(640, 640, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  const { data: g } = await base.clone().resize(9, 8, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  let bits = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += g[y * 9 + x] > g[y * 9 + x + 1] ? "1" : "0";
  const phash = BigInt("0b" + bits).toString(16).padStart(16, "0");
  const { data: px } = await base.clone().resize(32, 32, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const bins = new Map<number, number>();
  for (let i = 0; i < px.length; i += 3) { const k = ((px[i] >> 5) << 6) | ((px[i + 1] >> 5) << 3) | (px[i + 2] >> 5); bins.set(k, (bins.get(k) ?? 0) + 1); }
  const palette = [...bins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => {
    const c = [(k >> 6) & 7, (k >> 3) & 7, k & 7].map((v) => Math.min(255, v * 32 + 16));
    return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  });
  let ex: any = {};
  try { ex = (await exifr.parse(raw, { gps: true, pick: ["DateTimeOriginal", "Make", "Model", "latitude", "longitude"] })) ?? {}; } catch { /* no EXIF */ }
  const dt = ex.DateTimeOriginal instanceof Date ? ex.DateTimeOriginal.toISOString() : null;
  return {
    sha256: crypto.createHash("sha256").update(raw).digest("hex"), phash,
    width: meta.width ?? 0, height: meta.height ?? 0, palette, taken_at: dt,
    gps_lat: typeof ex.latitude === "number" ? ex.latitude : null, gps_lng: typeof ex.longitude === "number" ? ex.longitude : null,
    camera: [ex.Make, ex.Model].filter(Boolean).join(" ").slice(0, 80) || null, thumb,
  };
}

const hamming = (a: string, b: string) => { let x = BigInt("0x" + a) ^ BigInt("0x" + b), n = 0; while (x) { n += Number(x & 1n); x >>= 1n; } return n; };

// ------------------------------------------------------------------ analyze (Gemma 4 does detect + classify + verify in one call)
type Analysis = { caption: string; description: string; categories: string[]; primary: string; tags: string[]; ocr: string | null; people: number; rationale: string; objects: string[] };

const list = (v: any, n: number) => (Array.isArray(v) ? v : []).map((t: any) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, n);

async function analyze(thumb: Buffer): Promise<Analysis> {
  const allowed = TAXONOMY.map(([s, l]) => `${s} (${l})`).join(", ");
  const v = await gemma(
    "You build an exhaustive search index for ONE photo in a personal library. Be extremely thorough and specific; the more distinct, accurate details, the better. Answer with ONLY a JSON object. " +
    `Allowed category slugs: ${allowed}. ` +
    'Keys: "caption" (one sentence, max 25 words), "description" (a dense 80-150 word paragraph: who/what, actions, setting, lighting, mood, composition, notable details, anything searchable), ' +
    '"people" (integer count of visible people), "people_details" (per person: apparent age group, gender presentation, clothing, hair, expression, action), ' +
    '"categories" (1-3 slugs from the allowed list, most important first; if people are a main subject the first MUST be a people/* slug, never food or an object), ' +
    '"new_category" (null, or {"slug","label"} only if nothing fits), ' +
    '"objects" (EVERY visible object and item, up to 40), "scene" (scene/place types), "activities" (actions/events), "colors" (named dominant colors), ' +
    '"mood" (mood/atmosphere words), "style" (photo style, time of day, weather, season, indoor/outdoor), "clothing" (clothes/accessories), "brands" (visible brands/logos), ' +
    '"tags" (60-100 lowercase single words or short phrases covering everything above plus synonyms and likely search terms), ' +
    '"text" (all visible text verbatim, "" if none), "rationale" (one line on the main visual evidence).', thumb);
  let cats: string[] = list(v.categories, 3).filter((c: string) => SLUGS.has(c));
  const nc = v.new_category;
  if (!cats.length && nc?.label) cats = [String(nc.slug || nc.label).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)];
  const people = Number.isFinite(+v.people) ? Math.max(0, Math.round(+v.people)) : 0;
  if (people > 0 && !cats.some((c) => c.startsWith("people")) && /person|people|man|woman|child|boy|girl|portrait|face/i.test(`${v.caption} ${list(v.objects, 40).join(" ")}`)) cats.unshift("people/portrait");
  if (!cats.length) cats = ["products/home"];
  const objects = list(v.objects, 40);
  const tags = [...new Set([...list(v.tags, 100), ...objects, ...list(v.scene, 10), ...list(v.activities, 12), ...list(v.colors, 8), ...list(v.mood, 8), ...list(v.style, 10), ...list(v.clothing, 12), ...list(v.brands, 6)])].slice(0, 160);
  const details = Array.isArray(v.people_details) ? v.people_details.map((d: any) => (typeof d === "string" ? d : JSON.stringify(d))).join(" | ") : "";
  const description = `${v.description ?? ""} ${details}`.trim().slice(0, 1500);
  return {
    caption: String(v.caption ?? "").slice(0, 300), description, categories: cats.slice(0, 3), primary: cats[0], tags,
    ocr: v.text ? String(v.text).slice(0, 1500) : null, people, rationale: `${description || v.rationale || ""}`.slice(0, 1500), objects,
  };
}

export const embedText = (a: { caption: string; description?: string; categories: string[]; tags: string[]; ocr?: string | null }) =>
  `${a.caption}. ${a.description ?? ""} Categories: ${a.categories.join(", ")}. Tags: ${a.tags.join(", ")}.${a.ocr ? ` Text: ${a.ocr}` : ""}`;

// ------------------------------------------------------------------ ingest
export async function ingest(raw: Buffer, o: Owner, uploader: string | null = null) {
  const pre = await preprocess(raw);
  const { data: existing } = await o.sb.from("images").select("*").eq("user_id", o.id).not("phash", "is", null);
  const dup = (existing ?? []).find((r: any) => r.sha256 === pre.sha256 || hamming(r.phash, pre.phash) <= 4);
  if (dup) return { status: "duplicate", image: pub(dup) };

  const a = await analyze(pre.thumb);
  const emb = await embed(embedText(a));
  cloudinary.config({ cloud_name: CLOUD(), api_key: env("CLOUDINARY_API_KEY"), api_secret: env("CLOUDINARY_API_SECRET"), secure: true });
  const up: any = await new Promise((res, rej) =>
    cloudinary.uploader.upload_stream({ folder: `bliss/${o.id}`, public_id: pre.sha256.slice(0, 24), overwrite: false, unique_filename: false, resource_type: "image" },
      (e, r) => (e ? rej(e) : res(r))).end(raw));
  const pid = up.public_id as string;

  const { x, y, z, cluster } = await place(o, emb);
  const row = {
    id: `${o.id.slice(0, 8)}_${pre.sha256.slice(0, 20)}`, user_id: o.id, uploader_name: uploader,
    url: up.secure_url, thumb: `https://res.cloudinary.com/${CLOUD()}/image/upload/c_fill,w_400,h_500,q_auto,f_auto/${pid}`, cloudinary_public_id: pid,
    caption: a.caption, tags: a.tags, ocr: a.ocr, embedding: vec(emb), x, y, z, cluster_id: cluster,
    sha256: pre.sha256, phash: pre.phash, width: pre.width, height: pre.height, taken_at: pre.taken_at,
    gps_lat: pre.gps_lat, gps_lng: pre.gps_lng, camera: pre.camera, palette: pre.palette,
    categories: a.categories, primary_category: a.primary, category_scores: {}, detections: a.objects.slice(0, 30).map((label) => ({ label, conf: 1, box: [0, 0, 0, 0] })),
    people_count: a.people, verified_by: MODEL(), rationale: a.rationale, source: "live",
  };
  const { data, error } = await o.sb.from("images").upsert(row, { onConflict: "id", ignoreDuplicates: true }).select().maybeSingle();
  if (error) throw new Error(`db: ${error.message}`);
  return { status: "created", image: pub(data ?? row) };
}

async function place(o: Owner, emb: number[]) {
  const { data: nn } = await o.sb.rpc("match_images", { query_embedding: vec(emb), match_count: 6 });
  const ids = (nn ?? []).map((n: any) => n.id);
  const { data: pts } = ids.length ? await o.sb.from("images").select("x,y,z,cluster_id").in("id", ids) : { data: [] };
  const j = (s: number) => (Math.random() * 2 - 1) * s;
  if (!pts?.length) return { x: j(3), y: j(3), z: j(3), cluster: null as string | null };
  const m = (k: "x" | "y" | "z") => pts.reduce((s: number, p: any) => s + p[k], 0) / pts.length + j(0.4);
  const count = new Map<string, number>();
  pts.forEach((p: any) => p.cluster_id && count.set(p.cluster_id, (count.get(p.cluster_id) ?? 0) + 1));
  const cluster = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { x: m("x"), y: m("y"), z: m("z"), cluster };
}

const PUB = "id,url,thumb,cloudinary_public_id,caption,tags,ocr,x,y,z,cluster_id,sha256,width,height,taken_at,gps_lat,gps_lng,camera,palette,categories,primary_category,category_scores,detections,people_count,verified_by,rationale,favorite,source,created_at".split(",");
export const pub = (r: any) => Object.fromEntries(PUB.map((k) => [k, r[k] ?? null]));

// ------------------------------------------------------------------ search
export async function rank(o: Owner, emb: number[], words: string[], limit = 400) {
  const [{ data: nn }, { data: meta }] = await Promise.all([
    o.sb.rpc("match_images", { query_embedding: vec(emb), match_count: limit }),
    o.sb.from("images").select("id,caption,tags,categories,ocr,rationale"),
  ]);
  if (!nn?.length) return [];
  const text = new Map((meta ?? []).map((r: any) => [r.id, [r.caption ?? "", r.rationale ?? "", r.ocr ?? "", ...(r.tags ?? []), ...(r.categories ?? [])].join(" ").toLowerCase()]));
  const sims: number[] = nn.map((n: any) => n.similarity);
  const lo = Math.min(...sims), hi = Math.max(...sims);
  const out = nn.map((n: any) => {
    const t = text.get(n.id) ?? "";
    const hit = words.length ? words.filter((w) => t.includes(w)).length / words.length : 0;
    const named = words.some((w) => t.includes(`person:${w}`));
    const score = Math.min(1, (named ? 0.4 : 0) + 0.7 * (hi > lo ? (n.similarity - lo) / (hi - lo) : 1) + 0.3 * hit);
    return { id: n.id, score: +score.toFixed(4), similarity: +n.similarity.toFixed(4), text_hit: +hit.toFixed(2), match: false };
  }).sort((a: any, b: any) => b.score - a.score);
  const best = out[0].score;
  out.forEach((r: any) => (r.match = r.score >= Math.max(0.55, best * 0.8)));
  return out;
}
