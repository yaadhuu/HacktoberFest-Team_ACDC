import { analyze, authUser, embed, embedText, handle, INDEX_TAG, vec } from "@/lib/server/core";
export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH = 5;

/** Re-index photos from the old SigLIP pipeline: dense Gemma analysis + Gemini text embedding, so every photo
 *  lives in the same vector space as search queries. Call repeatedly until remaining = 0. */
export const POST = (req: Request) => handle(async () => {
  const o = await authUser(req);
  const { data: rows, error } = await o.sb.from("images").select("id,cloudinary_public_id,tags").not("tags", "cs", `{${INDEX_TAG}}`).limit(BATCH);
  if (error) throw new Error(error.message);
  const cloud = process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const named = (t: string[]) => (t ?? []).filter((x) => x.startsWith("person:") || x.startsWith("named:"));
  let done = 0;
  await Promise.all((rows ?? []).map(async (r: any) => {
    try {
      const jpg = Buffer.from(await (await fetch(`https://res.cloudinary.com/${cloud}/image/upload/w_640,h_640,c_limit,q_auto,f_jpg/${r.cloudinary_public_id}`)).arrayBuffer());
      const a = await analyze(jpg);
      const tags = [...new Set([...named(r.tags), ...a.tags, INDEX_TAG])];
      const emb = await embed(embedText({ ...a, tags }));
      const { error: ue } = await o.sb.from("images").update({
        caption: a.caption, tags, ocr: a.ocr, categories: a.categories, primary_category: a.primary,
        people_count: a.people, rationale: a.rationale, embedding: vec(emb), verified_by: process.env.GEMINI_MODEL || "gemma-4",
      }).eq("id", r.id);
      if (!ue) done++;
    } catch (e) { console.error("reindex", r.id, e); }
  }));
  const { count } = await o.sb.from("images").select("id", { count: "exact", head: true }).not("tags", "cs", `{${INDEX_TAG}}`);
  return { done, remaining: count ?? 0 };
});
