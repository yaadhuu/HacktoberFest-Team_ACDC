import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const IS_MOCK = process.env.NEXT_PUBLIC_MOCK === "1" || !SUPABASE_URL || !SUPABASE_KEY;

let _client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!_client) {
    if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Supabase env not set");
    _client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return _client;
}

export type DbImage = {
  id: string;
  url: string;
  thumb: string;
  caption: string | null;
  tags: string[] | null;
  ocr: string | null;
  x: number;
  y: number;
  z: number;
  cluster_id: string;
  uploader_name: string | null;
  source: "preloaded" | "live";
  created_at: string;
};

export function dbToImageItem(r: DbImage) {
  return {
    id: r.id,
    url: r.url,
    thumb: r.thumb,
    caption: r.caption ?? "",
    tags: r.tags ?? [],
    ocr: r.ocr ?? undefined,
    cluster: r.cluster_id,
    xyz: [r.x, r.y, r.z] as [number, number, number],
    uploader: r.uploader_name ? { name: r.uploader_name } : undefined,
    source: r.source,
    createdAt: r.created_at,
  };
}
