import { authUser, handle, HttpError, embed, gemma, ingest, inviteOwner, makeInvite, pub, rank, serviceOwner } from "@/lib/server/core";
export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = (req: Request) => handle(async () => {
  const o = await authUser(req);
  const f = (await req.formData()).get("file") as File | null;
  if (!f) throw new HttpError(400, "no file");
  return ingest(Buffer.from(await f.arrayBuffer()), o);
});
