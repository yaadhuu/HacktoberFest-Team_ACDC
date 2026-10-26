import { authUser, handle, HttpError, embed, gemma, ingest, inviteOwner, makeInvite, pub, rank, serviceOwner } from "@/lib/server/core";
export const runtime = "nodejs";
export const maxDuration = 60;

import { preprocess } from "@/lib/server/core";
export const POST = (req: Request) => handle(async () => {
  const o = await authUser(req);
  const f = (await req.formData()).get("file") as File | null;
  if (!f) throw new HttpError(400, "no file");
  const pre = await preprocess(Buffer.from(await f.arrayBuffer()));
  const v = await gemma('Describe this photo for search. ONLY JSON: {"caption": "max 15 words", "tags": ["5-8 lowercase words"]}', pre.thumb);
  return { results: await rank(o, await embed(`${v.caption}. ${(v.tags ?? []).join(", ")}.`), []) };
});
