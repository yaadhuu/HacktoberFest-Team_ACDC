"use client";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

let _client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!_client) _client = createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return _client;
}

/** undefined = still loading, null = signed out */
export function useSession(): Session | null | undefined {
  const [s, setS] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => setS(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, session) => setS(session));
    return () => data.subscription.unsubscribe();
  }, []);
  return s;
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("not signed in");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const r = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<T>;
}

export type Img = {
  id: string;
  url: string;
  thumb: string;
  cloudinary_public_id: string | null;
  caption: string | null;
  tags: string[] | null;
  ocr: string | null;
  x: number; y: number; z: number;
  cluster_id: string | null;
  width: number | null; height: number | null;
  taken_at: string | null;
  gps_lat: number | null; gps_lng: number | null;
  camera: string | null;
  palette: string[] | null;
  categories: string[] | null;
  primary_category: string | null;
  category_scores: Record<string, number> | null;
  detections: { label: string; conf: number; box: [number, number, number, number] }[] | null;
  people_count: number | null;
  verified_by: string | null;
  rationale: string | null;
  favorite: boolean | null;
  created_at: string;
};

export type Cluster = { id: string; label: string; size: number; cx: number; cy: number; cz: number };

export const IMG_COLS =
  "id,url,thumb,cloudinary_public_id,caption,tags,ocr,x,y,z,cluster_id,width,height,taken_at,gps_lat,gps_lng,camera,palette,categories,primary_category,category_scores,detections,people_count,verified_by,rationale,favorite,created_at";

/** Cloudinary transform for a square thumb of the given size (LOD). */
export function cdn(img: Pick<Img, "cloudinary_public_id" | "thumb">, size: number) {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!img.cloudinary_public_id || !cloud) return img.thumb;
  return `https://res.cloudinary.com/${cloud}/image/upload/c_fill,w_${size},h_${size},q_auto,f_auto/${img.cloudinary_public_id}`;
}
