import { authUser, handle, HttpError, embed, gemma, ingest, inviteOwner, makeInvite, pub, rank, serviceOwner } from "@/lib/server/core";
export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = (req: Request) => handle(async () => {
  const o = await authUser(req);
  serviceOwner(o.id); // 503 if no service key configured
  return { token: makeInvite(o.id) };
});
