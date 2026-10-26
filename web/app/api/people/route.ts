import { authUser, embed, embedText, handle, HttpError, vec } from "@/lib/server/core";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Name the people in a photo: adds person:<name> + <name> tags, re-embeds so the AI can find them by name. */
export const POST = (req: Request) => handle(async () => {
  const o = await authUser(req);
  const b = await req.json();
  const names: string[] = (b.names ?? []).map((n: string) => String(n).trim().slice(0, 40)).filter(Boolean).slice(0, 12);
  const { data: r } = await o.sb.from("images").select("caption,tags,categories,ocr,rationale").eq("id", b.image_id).maybeSingle();
  if (!r) throw new HttpError(404, "image not found");
  const keep = (r.tags ?? []).filter((t: string) => !t.startsWith("person:") && !t.startsWith("named:"));
  const named = names.flatMap((n) => [`person:${n.toLowerCase()}`, `named:${n}`, n.toLowerCase()]);
  const tags = [...new Set([...named, ...keep])];
  const caption = names.length ? `${names.join(" and ")} — ${String(r.caption ?? "").replace(/^.* — /, "")}` : String(r.caption ?? "").replace(/^.* — /, "");
  const emb = await embed(embedText({ caption, description: r.rationale ?? "", categories: r.categories ?? [], tags, ocr: r.ocr }));
  const { data, error } = await o.sb.from("images").update({ tags, caption, embedding: vec(emb) }).eq("id", b.image_id).select().single();
  if (error) throw new Error(error.message);
  return { image: data };
});
