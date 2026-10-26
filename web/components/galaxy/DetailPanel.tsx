"use client";
import { useEffect, useState } from "react";
import { api, supabase, type Img } from "@/lib/supabase";

type Why = { reason: string; evidence?: string[]; box: [number, number, number, number] | null; by?: string };

export default function DetailPanel({ img, query, onClose, onSimilar, onChange, onDelete }: {
  img: Img;
  query: string | null;
  onClose: () => void;
  onSimilar: (img: Img) => void;
  onChange: (img: Img) => void;
  onDelete: (id: string) => void;
}) {
  const [why, setWhy] = useState<Why | null>(null);

  useEffect(() => {
    setWhy(null);
    if (!query) return;
    api<Why>("/explain", { method: "POST", body: JSON.stringify({ image_id: img.id, query }) })
      .then(setWhy)
      .catch((e) => setWhy({ reason: `Explanation unavailable: ${e.message}`, box: null }));
  }, [img.id, query]);

  async function toggleFav() {
    const { data, error } = await supabase().from("images").update({ favorite: !img.favorite }).eq("id", img.id).select().single();
    if (!error && data) onChange(data as Img);
  }

  async function remove() {
    if (!confirm("Delete this photo from your galaxy?")) return;
    const { error } = await supabase().from("images").delete().eq("id", img.id);
    if (!error) onDelete(img.id);
  }

  const b = why?.box;
  const scores = Object.entries(img.category_scores ?? {}).slice(0, 4);
  const exif = [
    img.taken_at && new Date(img.taken_at).toLocaleString(),
    img.camera,
    img.gps_lat != null && img.gps_lng != null && `${img.gps_lat.toFixed(4)}, ${img.gps_lng.toFixed(4)}`,
    img.width && `${img.width}×${img.height}`,
  ].filter(Boolean) as string[];

  return (
    <aside className="fixed top-20 right-5 bottom-28 w-[360px] max-w-[calc(100vw-40px)] z-40 glass-dark rounded-2xl p-4 overflow-y-auto text-snow">
      <button onClick={onClose} aria-label="close" className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 grid place-items-center">×</button>
      <div className="relative rounded-xl overflow-hidden bg-black/40">
        <img src={img.thumb.replace("w_400,h_500", "w_720,h_900")} alt={img.caption ?? ""} className="w-full object-cover" />
        {b && (
          <div className="absolute border-2 border-[#f5b14c] rounded shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] transition-all"
            style={{ left: `${b[0] * 100}%`, top: `${b[1] * 100}%`, width: `${b[2] * 100}%`, height: `${b[3] * 100}%` }} />
        )}
      </div>

      {query && (
        <div className="mt-3 rounded-xl border border-[#f5b14c]/30 bg-[#f5b14c]/5 p-3">
          <div className="text-[10px] uppercase tracking-wider text-[#f5b14c]">Why it matched “{query}”</div>
          <div className="mt-1 text-sm">{why ? why.reason : "Asking Gemma for the visual evidence…"}</div>
          {why?.evidence && why.evidence.length > 0 && (
            <ul className="mt-1 text-xs text-snow/60 list-disc pl-4">{why.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
          )}
          {why?.by && <div className="mt-1 text-[10px] text-snow/30">{why.by}</div>}
        </div>
      )}

      <div className="mt-3 text-sm font-medium">{img.caption}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wider text-snow/50">{(img.categories ?? []).join(" · ")}</div>

      <div className="mt-2 flex gap-1 flex-wrap">
        {(img.tags ?? []).map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-snow/70">{t}</span>)}
      </div>

      {(img.palette ?? []).length > 0 && (
        <div className="mt-3 flex gap-1">
          {img.palette!.map((c) => <span key={c} title={c} className="h-5 flex-1 rounded" style={{ background: c }} />)}
        </div>
      )}

      {scores.length > 0 && (
        <div className="mt-3 space-y-1">
          {scores.map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 text-[11px]">
              <span className="w-24 capitalize text-snow/60">{k}</span>
              <span className="flex-1 h-1 rounded bg-white/10"><span className="block h-1 rounded bg-snow/70" style={{ width: `${v * 100}%` }} /></span>
              <span className="tabular-nums text-snow/40 w-8 text-right">{Math.round(v * 100)}</span>
            </div>
          ))}
        </div>
      )}

      {img.rationale && <div className="mt-3 text-[11px] text-snow/50">{img.verified_by && img.verified_by !== "none" ? "✓ " : ""}{img.rationale}</div>}
      {img.ocr && <div className="mt-2 text-[11px] font-mono bg-black/30 rounded p-2 text-snow/70">{img.ocr}</div>}
      {exif.length > 0 && <div className="mt-3 text-[11px] text-snow/50 space-y-0.5">{exif.map((e) => <div key={e}>{e}</div>)}</div>}

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <button onClick={() => onSimilar(img)} className="rounded-full bg-snow text-night py-2 font-medium">Similar</button>
        <button onClick={toggleFav} className="rounded-full border border-white/15 py-2">{img.favorite ? "★ Saved" : "☆ Favorite"}</button>
        <button onClick={remove} className="rounded-full border border-white/15 py-2 text-snow/60">Delete</button>
      </div>
      <a href={img.url} target="_blank" rel="noreferrer" className="mt-2 block text-center text-[11px] text-snow/40 hover:text-snow">Download original</a>
    </aside>
  );
}
