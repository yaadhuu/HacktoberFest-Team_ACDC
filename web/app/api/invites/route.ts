import { authUser, createSharedGalaxy, handle, makeInvite } from "@/lib/server/core";
export const runtime = "nodejs";
export const maxDuration = 30;

/** Each QR gets its own new, empty galaxy (separate account); the token is that galaxy's id + HMAC. */
export const POST = (req: Request) => handle(async () => {
  await authUser(req); // only signed-in users can create one
  return { token: makeInvite(await createSharedGalaxy()) };
});
