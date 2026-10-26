import { authUser, handle, HttpError, embed, gemma, ingest, inviteOwner, makeInvite, pub, rank, serviceOwner } from "@/lib/server/core";
export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = (req: Request) => handle(async () => {
  const o = await authUser(req);
  const q = String((await req.json()).query ?? "").trim();
  if (!q) throw new HttpError(400, "empty query");
  const emb = await embed(q);
  await o.sb.from("searches").insert({ query: q.slice(0, 200) });
  return { query: q, results: await rank(o, emb, q.split(/\s+/)) };
});
