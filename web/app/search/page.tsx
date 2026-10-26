"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { mockSearch } from "@/lib/mock";
import ImageModal from "@/components/ImageModal";
import type { ImageItem, SearchMatch } from "@/lib/types";

type Mode = "text" | "image" | "sketch";

export default function SearchPage() {
  const [mode, setMode] = useState<Mode>("text");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [showBoxes, setShowBoxes] = useState(true);
  const [sel, setSel] = useState<ImageItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const seed = url.searchParams.get("q");
    if (seed) { setQ(seed); setResults(mockSearch(seed)); }
  }, []);

  function runText(text: string) {
    setMode("text");
    setPreviewUrl(null);
    setQ(text);
    setResults(mockSearch(text));
  }

  function runImage(file: File) {
    const r = new FileReader();
    r.onload = () => {
      setMode("image");
      setPreviewUrl(r.result as string);
      setResults(mockSearch("find similar to my photo"));
    };
    r.readAsDataURL(file);
  }

  return (
    <main className="pt-24 pb-16 px-5 md:px-8 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <h1 className="font-display text-5xl tracking-tightest">
          Search with <span className="italic bg-gradient-to-r from-ink via-dot-purple to-dot-blue bg-clip-text text-transparent">evidence.</span>
        </h1>
        <p className="text-ink-dim mt-2 text-[15px]">Type a phrase, drop an image, or doodle a shape.</p>

        <div className="mt-6 flex gap-1 bg-cream-soft rounded-full p-1 w-max">
          <ModeBtn on={mode === "text"} onClick={() => setMode("text")}>Text</ModeBtn>
          <ModeBtn on={mode === "image"} onClick={() => setMode("image")}>By image</ModeBtn>
          <ModeBtn on={mode === "sketch"} onClick={() => setMode("sketch")}>Sketch</ModeBtn>
        </div>

        <div className="mt-5">
          {mode === "text" && (
            <form
              onSubmit={(e) => { e.preventDefault(); runText(q); }}
              className="surface rounded-full pl-5 pr-2 py-2 flex items-center gap-2"
            >
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="something you'd use to cut vegetables…"
                className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-ink-faint py-2"
              />
              <button type="submit" className="w-10 h-10 rounded-full bg-ink text-cream grid place-items-center">→</button>
            </form>
          )}

          {mode === "image" && (
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) runImage(f); }}
              className="surface rounded-3xl p-6 border border-dashed border-ink-line cursor-pointer flex items-center gap-4 hover:bg-cream-soft transition"
            >
              {previewUrl ? (
                <img src={previewUrl} alt="query" className="w-20 h-20 object-cover rounded-lg" />
              ) : (
                <div className="w-20 h-20 rounded-lg bg-cream-soft grid place-items-center text-ink-dim text-xs">
                  Drop
                </div>
              )}
              <div className="text-sm">
                <div className="font-medium">Search by image</div>
                <div className="text-ink-dim text-xs">Drop a file or click to pick. Encoded with the same model.</div>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => e.target.files?.[0] && runImage(e.target.files[0])} />
            </div>
          )}

          {mode === "sketch" && <SketchPad onSearch={() => setResults(mockSearch("sketch"))} />}
        </div>

        {results.length > 0 && (
          <>
            <div className="mt-8 flex items-center justify-between">
              <div className="text-ink-dim text-sm">{results.length} results</div>
              <label className="flex items-center gap-2 text-xs text-ink-dim cursor-pointer">
                <input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} />
                Show evidence overlays
              </label>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {results.map((m) => (
                <ResultCard key={m.image.id} match={m} showBox={showBoxes} onOpen={() => setSel(m.image)} />
              ))}
            </div>
          </>
        )}
      </div>

      <ImageModal img={sel} onClose={() => setSel(null)} />
    </main>
  );
}

function ResultCard({ match, showBox, onOpen }: { match: SearchMatch; showBox: boolean; onOpen: () => void }) {
  const pct = Math.round(match.score * 100);
  const b = match.bbox;
  return (
    <button onClick={onOpen} className="group text-left rounded-2xl overflow-hidden surface">
      <div className="relative aspect-[4/5]">
        <img src={match.image.thumb} alt={match.image.caption} className="w-full h-full object-cover" />
        {showBox && b && (
          <div
            className="absolute border-2 border-ink/70 rounded transition"
            style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
          />
        )}
        <div className="absolute top-3 left-3 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-cream/95 text-ink">
          {pct}% match
        </div>
      </div>
      <div className="p-3">
        <div className="text-sm text-ink line-clamp-2">{match.reason}</div>
        <div className="mt-2 flex gap-1 flex-wrap">
          {match.image.tags.slice(0, 3).map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/5 text-ink-dim">{t}</span>
          ))}
        </div>
      </div>
    </button>
  );
}

function ModeBtn({ children, on, onClick }: { children: React.ReactNode; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs transition ${
        on ? "bg-ink text-cream" : "text-ink-dim hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function SketchPad({ onSearch }: { onSearch: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const draw = useRef(false);

  function start(e: React.PointerEvent) {
    const c = ref.current!; const r = c.getBoundingClientRect();
    const ctx = c.getContext("2d")!;
    ctx.strokeStyle = "#0e0e10"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
    draw.current = true;
  }
  function move(e: React.PointerEvent) {
    if (!draw.current) return;
    const c = ref.current!; const r = c.getBoundingClientRect();
    const ctx = c.getContext("2d")!;
    ctx.lineTo(e.clientX - r.left, e.clientY - r.top); ctx.stroke();
  }
  function end() { draw.current = false; }
  function clear() {
    const c = ref.current!; const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
  }

  useEffect(() => { clear(); /* eslint-disable-next-line */ }, []);

  return (
    <div className="surface rounded-3xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">Doodle anything</div>
        <div className="flex gap-2">
          <button onClick={clear} className="btn-ghost text-xs border border-ink-line">Clear</button>
          <button onClick={onSearch} className="btn-dark text-xs">Search sketch</button>
        </div>
      </div>
      <canvas
        ref={ref}
        width={560}
        height={340}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full rounded-xl bg-white border border-ink-line touch-none cursor-crosshair"
      />
    </div>
  );
}
