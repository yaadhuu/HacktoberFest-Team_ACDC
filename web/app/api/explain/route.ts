import { authUser, handle, HttpError, embed, gemma, ingest, inviteOwner, makeInvite, pub, rank, serviceOwner } from "@/lib/server/core";
export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = async (req: Request) => handle(async () => {
  const o = await authUser(req);
  const b = await req.json();
  const q = String(b.query ?? "").trim().slice(0, 200);
  const { data: hit } = await o.sb.from("explanations").select("result").eq("image_id", b.image_id).eq("query", q).maybeSingle();
  if (hit) return hit.result;
  const { data: r } = await o.sb.from("images").select("cloudinary_public_id,caption,categories,tags").eq("id", b.image_id).maybeSingle();
  if (!r) throw new HttpError(404, "image not found");
  let result: any;
  try {
    const cloud = process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const img = Buffer.from(await (await fetch(`https://res.cloudinary.com/${cloud}/image/upload/w_640,q_auto,f_jpg/${r.cloudinary_public_id}`)).arrayBuffer());
    const v = await gemma(`The user searched their photos for "${q}" and this image was returned. Reply with ONLY JSON: {"reason": one sentence naming the visual evidence for (or against) the match, "evidence": up to 3 short phrases, "box": [x, y, w, h] normalized 0-1 around the strongest evidence, or null}`, img);
    result = { reason: String(v.reason ?? "").slice(0, 300), evidence: (v.evidence ?? []).slice(0, 3), box: Array.isArray(v.box) && v.box.length === 4 ? v.box : null, by: process.env.GEMINI_MODEL || "gemma-4" };
  } catch {
    result = { reason: `Embedding similarity to "${q}"; classified as ${(r.categories ?? []).join(", ")}.`, evidence: [r.caption ?? ""], box: null, by: "embedding" };
  }
  await o.sb.from("explanations").upsert({ image_id: b.image_id, query: q, result }, { ignoreDuplicates: true });
  return result;
});
