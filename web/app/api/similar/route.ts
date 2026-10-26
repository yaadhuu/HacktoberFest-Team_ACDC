import { authUser, handle, HttpError, embed, gemma, ingest, inviteOwner, makeInvite, pub, rank, serviceOwner } from "@/lib/server/core";
export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = (req: Request) => handle(async () => {
  const o = await authUser(req);
  const { image_id } = await req.json();
  const { data } = await o.sb.from("images").select("embedding").eq("id", image_id).maybeSingle();
  if (!data?.embedding) throw new HttpError(404, "image not found");
  return { results: await rank(o, JSON.parse(data.embedding as string), []) };
});
