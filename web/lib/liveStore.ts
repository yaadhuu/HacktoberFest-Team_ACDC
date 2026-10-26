"use client";
import { CLUSTERS, IMAGES } from "./mock";
import { IS_MOCK, supabase, dbToImageItem, type DbImage } from "./supabase";
import type { ImageItem } from "./types";

const CHANNEL = "bliss-live";
const STORAGE = "bliss:live-images";
type Subscriber = (img: ImageItem) => void;
const subs = new Set<Subscriber>();

// ---- helpers ----
function placeNearCluster(hintTag?: string): { cluster: string; xyz: [number, number, number] } {
  let target = CLUSTERS[Math.floor(Math.random() * CLUSTERS.length)];
  if (hintTag) {
    const h = hintTag.toLowerCase();
    const hit = CLUSTERS.find((c) => c.label.toLowerCase().includes(h) || c.id.includes(h));
    if (hit) target = hit;
  }
  const j = () => (Math.random() - 0.5) * 1.4;
  return {
    cluster: target.id,
    xyz: [target.centroid[0] + j(), target.centroid[1] + j(), target.centroid[2] + j()],
  };
}

// ---- MOCK transport (localStorage + BroadcastChannel) ----
const bc =
  IS_MOCK && typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel(CHANNEL)
    : null;
if (bc) {
  bc.onmessage = (e) => {
    const img = e.data as ImageItem;
    for (const s of subs) s(img);
  };
}

function mockList(): ImageItem[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE) || "[]"); } catch { return []; }
}
function mockPersist(all: ImageItem[]) {
  try { localStorage.setItem(STORAGE, JSON.stringify(all.slice(-50))); } catch {}
}

// ---- REAL transport (Supabase) ----
let realtimeInited = false;
function ensureRealtime() {
  if (realtimeInited || IS_MOCK || typeof window === "undefined") return;
  realtimeInited = true;
  supabase()
    .channel("images-stream")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "images" }, (payload) => {
      const img = dbToImageItem(payload.new as DbImage);
      for (const s of subs) s(img);
    })
    .subscribe();
}

// ---- public API ----
export function subscribe(fn: Subscriber): () => void {
  subs.add(fn);
  ensureRealtime();
  return () => { subs.delete(fn); };
}

export function listLive(): ImageItem[] {
  // mock-only cache; real images are fetched by caller via fetchAllImages()
  return mockList();
}

export function clearLive() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE);
}

export async function addLive(opts: {
  file?: File;
  dataUrl?: string;
  uploader?: string;
  hintTag?: string;
}): Promise<ImageItem> {
  const place = placeNearCluster(opts.hintTag);
  const id = `live_${Date.now()}_${Math.floor(Math.random() * 1e4)}`;

  if (IS_MOCK) {
    const dataUrl = opts.dataUrl ?? (opts.file ? await fileToDataUrl(opts.file) : "");
    const img: ImageItem = {
      id, url: dataUrl, thumb: dataUrl, caption: "fresh capture",
      tags: ["live", "guest"], cluster: place.cluster, xyz: place.xyz,
      uploader: { name: opts.uploader || "Guest" },
      source: "live", createdAt: new Date().toISOString(),
    };
    mockPersist([...mockList(), img]);
    bc?.postMessage(img);
    for (const s of subs) s(img);
    return img;
  }

  // REAL: upload to Cloudinary then insert row
  let uploadedUrl = opts.dataUrl ?? "";
  let uploadedThumb = uploadedUrl;
  if (opts.file) {
    const fd = new FormData();
    fd.append("file", opts.file);
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    if (!r.ok) throw new Error(`upload failed: ${r.status}`);
    const j = await r.json();
    uploadedUrl = j.url;
    uploadedThumb = j.thumb;
  }

  const row = {
    id,
    url: uploadedUrl,
    thumb: uploadedThumb,
    caption: "fresh capture",
    tags: ["live", "guest"],
    ocr: null,
    x: place.xyz[0], y: place.xyz[1], z: place.xyz[2],
    cluster_id: place.cluster,
    uploader_name: opts.uploader || "Guest",
    source: "live" as const,
  };
  const { data, error } = await supabase().from("images").insert(row).select("*").single();
  if (error) throw error;
  return dbToImageItem(data as DbImage);
}

export async function fetchAllImages(): Promise<ImageItem[]> {
  if (IS_MOCK) return [...IMAGES, ...mockList()];
  const { data, error } = await supabase()
    .from("images")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error) {
    console.warn("supabase fetch failed, falling back to mock", error);
    return [...IMAGES];
  }
  const live = (data ?? []).map((r) => dbToImageItem(r as DbImage));
  // combine with preloaded mock set (demo keeps galaxy populated even if DB empty)
  return [...IMAGES, ...live];
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
