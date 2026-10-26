"use client";
import type { ImageItem } from "@/lib/types";
import { CLUSTERS, IMAGES } from "@/lib/mock";

export default function SidePanel({
  img,
  onClose,
}: {
  img: ImageItem | null;
  onClose: () => void;
}) {
  if (!img) return null;
  const cluster = CLUSTERS.find((c) => c.id === img.cluster);
  const similar = IMAGES.filter((i) => i.cluster === img.cluster && i.id !== img.id).slice(0, 6);
  return (
    <aside className="fixed top-20 right-5 bottom-24 w-[360px] z-40 glass-dark text-snow rounded-2xl p-4 overflow-y-auto">
      <button
        onClick={onClose}
        aria-label="close"
        className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 grid place-items-center text-snow/60"
      >
        ×
      </button>
      <div className="rounded-xl overflow-hidden bg-black/40 aspect-[4/5] mb-3">
        <img src={img.url} alt={img.caption} className="w-full h-full object-cover" />
      </div>
      <div className="text-sm font-medium">{img.caption}</div>
      {cluster && (
        <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-semibold"
          style={{ color: cluster.color }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: cluster.color }} />
          {cluster.label}
        </div>
      )}
      <div className="mt-2 flex gap-1 flex-wrap">
        {img.tags.map((t) => (
          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-snow/70">
            {t}
          </span>
        ))}
      </div>
      {img.ocr && (
        <div className="mt-3 text-xs">
          <div className="text-snow/40 uppercase tracking-wider mb-1">OCR</div>
          <div className="bg-black/30 border border-white/10 rounded-md p-2 font-mono text-snow/80">{img.ocr}</div>
        </div>
      )}
      <div className="mt-3 text-xs">
        <div className="text-snow/40 uppercase tracking-wider mb-1">Why it's here</div>
        <div className="text-snow/70">
          Clustered with {cluster?.label.toLowerCase()} by semantic similarity (SigLIP embedding, UMAP projection).
        </div>
      </div>
      <div className="mt-4">
        <div className="text-snow/40 text-xs uppercase tracking-wider mb-2">Similar</div>
        <div className="grid grid-cols-3 gap-1.5">
          {similar.map((s) => (
            <div key={s.id} className="aspect-square rounded-md overflow-hidden bg-black/30">
              <img src={s.thumb} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      </div>
      {img.uploader && (
        <div className="mt-4 text-xs text-snow/60">
          Uploaded by <span className="text-snow">{img.uploader.name}</span>
          {img.source === "live" && <span className="ml-2 inline-flex items-center gap-1 text-dot-green">· live</span>}
        </div>
      )}
    </aside>
  );
}
