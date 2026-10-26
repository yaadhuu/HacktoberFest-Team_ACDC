import { handle, inviteOwner, pub, serviceOwner } from "@/lib/server/core";
export const runtime = "nodejs";
export const maxDuration = 30;

/** Read-only view of the invite owner's galaxy for guests (no embeddings, no private fields). */
export const GET = (_: Request, { params }: { params: { token: string } }) => handle(async () => {
  const o = serviceOwner(inviteOwner(decodeURIComponent(params.token)));
  const [imgs, cl] = await Promise.all([
    o.sb.from("images").select("*").eq("user_id", o.id).order("created_at").limit(1500),
    o.sb.from("user_clusters").select("id,label,size,cx,cy,cz").eq("user_id", o.id),
  ]);
  return { images: (imgs.data ?? []).map(pub), clusters: cl.data ?? [] };
});
