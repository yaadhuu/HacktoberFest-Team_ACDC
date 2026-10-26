import { authUser, handle, HttpError, embed, gemma, ingest, inviteOwner, makeInvite, pub, rank, serviceOwner } from "@/lib/server/core";
import { layoutGalaxy } from "@/lib/server/layout";
export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = (req: Request, { params }: { params: { token: string } }) => handle(async () => {
  const owner = serviceOwner(inviteOwner(decodeURIComponent(params.token)));
  const fd = await req.formData();
  const f = fd.get("file") as File | null;
  if (!f) throw new HttpError(400, "no file");
  const name = String(fd.get("name") ?? "").trim().slice(0, 40) || "Guest";
  const res: any = await ingest(Buffer.from(await f.arrayBuffer()), owner, name);
  if (res.status === "created") { // group the shared galaxy into labelled clusters as it fills (3rd photo, then every 5th)
    const { count } = await owner.sb.from("images").select("id", { count: "exact", head: true }).eq("user_id", owner.id);
    if (count === 3 || (count ?? 0) % 5 === 0) await layoutGalaxy(owner, gemma).catch((e) => console.error("layout failed", e));
  }
  return res;
});
