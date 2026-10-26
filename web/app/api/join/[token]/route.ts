import { authUser, handle, HttpError, embed, gemma, ingest, inviteOwner, makeInvite, pub, rank, serviceOwner } from "@/lib/server/core";
export const runtime = "nodejs";
export const maxDuration = 60;

export const GET = (_: Request, { params }: { params: { token: string } }) => handle(async () => {
  inviteOwner(decodeURIComponent(params.token));
  return { ok: true };
});
