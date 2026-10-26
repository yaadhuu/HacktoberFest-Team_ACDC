import { authUser, handle, HttpError, embed, gemma, ingest, inviteOwner, makeInvite, pub, rank, serviceOwner } from "@/lib/server/core";
export const runtime = "nodejs";
export const maxDuration = 60;

import { layoutGalaxy } from "@/lib/server/layout";
export const POST = (req: Request) => handle(async () => layoutGalaxy(await authUser(req), gemma));
