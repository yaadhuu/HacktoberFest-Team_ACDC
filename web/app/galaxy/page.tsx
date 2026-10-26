"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { CLUSTERS } from "@/lib/mock";
import SidePanel from "@/components/galaxy/SidePanel";
import type { ImageItem } from "@/lib/types";

const GalaxyScene = dynamic(() => import("@/components/galaxy/GalaxyScene"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 grid place-items-center text-snow/60">
      Loading galaxy…
    </div>
  ),
});

type Toast = { id: string; text: string };

export default function GalaxyPage() {
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const [active, setActive] = useState<Set<string>>(new Set(CLUSTERS.map((c) => c.id)));
  const [selected, setSelected] = useState<ImageItem | null>(null);
  const [tourKey, setTourKey] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toggleCluster = (id: string) => {
    const n = new Set(active);
    n.has(id) ? n.delete(id) : n.add(id);
    setActive(n);
  };

  const onLiveArrive = useCallback((img: ImageItem) => {
    const t: Toast = {
      id: img.id,
      text: `New photo from ${img.uploader?.name ?? "Guest"} · ${CLUSTERS.find((c) => c.id === img.cluster)?.label ?? ""}`,
    };
    setToasts((prev) => [...prev, t]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 4200);
  }, []);

  useEffect(() => () => { document.body.style.cursor = "default"; }, []);

  return (
    <main className="fixed inset-0 bg-night">
      <GalaxyScene
        mode={mode}
        query={query}
        activeClusters={active}
        onSelect={setSelected}
        onLiveArrive={onLiveArrive}
        tourKey={tourKey}
      />

      {/* Cluster filter chips */}
      <div className="fixed top-20 left-5 z-30 flex flex-col gap-2 max-w-[200px]">
        {CLUSTERS.map((c) => {
          const on = active.has(c.id);
          return (
            <button
              key={c.id}
              onClick={() => toggleCluster(c.id)}
              className={`text-xs px-3 py-1.5 rounded-full border transition text-left ${
                on ? "bg-white/5 text-snow" : "bg-black/30 text-snow/40"
              }`}
              style={{ borderColor: on ? c.color + "88" : "rgba(255,255,255,0.08)" }}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full mr-2" style={{ background: c.color }} />
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Mode + tour */}
      <div className="fixed top-20 right-5 z-30 flex items-center gap-2">
        <div className="glass-dark rounded-full p-1 flex text-xs">
          <button onClick={() => setMode("3d")}
            className={`px-3 py-1 rounded-full ${mode === "3d" ? "bg-white/10 text-snow" : "text-snow/60"}`}>3D</button>
          <button onClick={() => setMode("2d")}
            className={`px-3 py-1 rounded-full ${mode === "2d" ? "bg-white/10 text-snow" : "text-snow/60"}`}>2D</button>
        </div>
        <button onClick={() => setTourKey((k) => k + 1)}
          className="glass-dark rounded-full px-3 py-1.5 text-xs text-snow/70 hover:text-snow">
          ▶ Tour
        </button>
      </div>

      {/* Bottom search */}
      <form
        onSubmit={(e) => { e.preventDefault(); setQuery(input.trim()); }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 w-[min(640px,92vw)]"
      >
        <div className="glass-dark rounded-full pl-5 pr-2 py-2 flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search the galaxy — try 'street food'…"
            className="flex-1 bg-transparent outline-none text-snow placeholder:text-snow/40 py-2"
          />
          {query && (
            <button type="button" onClick={() => { setQuery(""); setInput(""); }}
              className="text-xs text-snow/60 hover:text-snow px-2">Clear</button>
          )}
          <button type="submit"
            className="w-9 h-9 rounded-full bg-snow text-night grid place-items-center" aria-label="search">→</button>
        </div>
      </form>

      {/* Live arrival toasts */}
      <div className="fixed bottom-24 right-5 z-40 flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id}
            className="glass-dark rounded-full pl-3 pr-4 py-1.5 text-xs text-snow flex items-center gap-2 animate-popIn">
            <span className="w-1.5 h-1.5 rounded-full bg-dot-green animate-pulseDot" />
            {t.text}
          </div>
        ))}
      </div>

      <SidePanel img={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
