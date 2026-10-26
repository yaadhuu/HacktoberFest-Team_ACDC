import { authUser, handle, HttpError, embed, gemma, ingest, inviteOwner, makeInvite, pub, rank, serviceOwner } from "@/lib/server/core";
export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = (req: Request, { params }: { params: { token: string } }) => handle(async () => {
  const owner = serviceOwner(inviteOwner(decodeURIComponent(params.token)));
  const fd = await req.formData();
  const f = fd.get("file") as File | null;
  if (!f) throw new HttpError(400, "no file");
  const name = String(fd.get("name") ?? "").trim().slice(0, 40) || "Guest";
  return ingest(Buffer.from(await f.arrayBuffer()), owner, name);
});
