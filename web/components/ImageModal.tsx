"use client";
import Link from "next/link";
import { useEffect } from "react";
import type { ImageItem } from "@/lib/types";
import { CLUSTERS, IMAGES } from "@/lib/mock";

export default function ImageModal({ img, onClose }: { img: ImageItem | null; onClose: () => void }) {
  useEffect(() => {
    if (!img) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [img, onClose]);

  if (!img) return null;
  const cluster = CLUSTERS.find((c) => c.id === img.cluster);
  const similar = IMAGES.filter((i) => i.cluster === img.cluster && i.id !== img.id).slice(0, 6);

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div
        className="relative bg-cream rounded-2xl max-w-5xl w-full max-h-[88vh] overflow-hidden flex flex-col md:flex-row shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="close"
          className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-white/90 hover:bg-white grid place-items-center text-ink"
        >
          ×
        </button>
        <div className="md:w-3/5 bg-black grid place-items-center min-h-[50vh]">
          <img src={img.url} alt={img.caption} className="max-h-[88vh] w-full object-contain" />
        </div>
        <div className="md:w-2/5 p-5 overflow-y-auto">
          <div className="text-xs text-ink-faint uppercase tracking-wider">Caption</div>
          <div className="text-lg font-medium mt-1">{img.caption}</div>
          {cluster && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-semibold"
              style={{ color: cluster.color }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: cluster.color }} />
              {cluster.label}
            </div>
          )}
          <div className="mt-2 flex gap-1 flex-wrap">
            {img.tags.map((t) => (
              <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-black/5 text-ink-dim">{t}</span>
            ))}
          </div>
          {img.ocr && (
            <>
              <div className="mt-4 text-xs text-ink-faint uppercase tracking-wider">OCR</div>
              <div className="mt-1 bg-cream-soft rounded-md p-2 font-mono text-xs">{img.ocr}</div>
            </>
          )}
          <div className="mt-4 text-xs text-ink-faint uppercase tracking-wider">Similar</div>
          <div className="mt-1 grid grid-cols-3 gap-1.5">
            {similar.map((s) => (
              <div key={s.id} className="aspect-square rounded-md overflow-hidden bg-cream-card">
                <img src={s.thumb} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
          {img.uploader && (
            <div className="mt-4 text-xs text-ink-dim">
              Uploaded by <Link href={`/u/${img.uploader.name.split(" ")[0].toLowerCase()}`} className="text-ink hover:underline">{img.uploader.name}</Link>
              {img.source === "live" && <span className="ml-2 text-dot-green">· live</span>}
            </div>
          )}
          <div className="mt-5 flex gap-2">
            <Link href={`/galaxy?focus=${img.id}`} className="btn-dark flex-1 justify-center">Show in galaxy</Link>
            <Link href={`/search?q=${encodeURIComponent(img.caption)}`} className="btn-ghost flex-1 justify-center border border-ink-line">
              Find more like this
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
