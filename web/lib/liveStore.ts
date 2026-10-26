"use client";
import { IMG_COLS, supabase, type Img } from "./supabase";
import type { ImageItem } from "./types";

export function toItem(r: Img): ImageItem {
  return {
    id: r.id,
    url: r.url,
    thumb: r.thumb,
    caption: r.caption ?? "",
    tags: r.tags ?? [],
    ocr: r.ocr ?? undefined,
    cluster: r.cluster_id ?? "",
    xyz: [r.x, r.y, r.z],
    source: "live",
    createdAt: r.created_at,
  };
}

/** The signed-in user's images only (RLS). */
export async function fetchAllImages(): Promise<Img[]> {
  const out: Img[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase().from("images").select(IMG_COLS).order("created_at").range(from, from + 999);
    if (error) throw error;
    out.push(...((data as Img[]) ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** Realtime INSERT/UPDATE stream; RLS limits events to the user's own rows. */
export function subscribe(onInsert: (img: Img) => void, onUpdate?: (img: Img) => void): () => void {
  const ch = supabase()
    .channel(`images-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "images" }, (p) => onInsert(p.new as Img))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "images" }, (p) => onUpdate?.(p.new as Img))
    .subscribe();
  return () => { supabase().removeChannel(ch); };
}
