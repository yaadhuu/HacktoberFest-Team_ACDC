"use client";
import { useMemo, useState } from "react";
import { CLUSTERS, IMAGES } from "@/lib/mock";
import ImageModal from "@/components/ImageModal";
import type { ImageItem } from "@/lib/types";

type Sort = "newest" | "oldest";

export default function ExplorePage() {
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Set<string>>(new Set(CLUSTERS.map((c) => c.id)));
  const [sort, setSort] = useState<Sort>("newest");
  const [sel, setSel] = useState<ImageItem | null>(null);

  const items = useMemo(() => {
    const qs = q.trim().toLowerCase();
    let list = IMAGES.filter((i) => active.has(i.cluster));
    if (qs) {
      list = list.filter((i) =>
        (i.caption + " " + i.tags.join(" ")).toLowerCase().includes(qs)
      );
    }
    list = [...list].sort((a, b) =>
      sort === "newest"
        ? +new Date(b.createdAt) - +new Date(a.createdAt)
        : +new Date(a.createdAt) - +new Date(b.createdAt)
    );
    return list;
  }, [q, active, sort]);

  const toggle = (id: string) => {
    const n = new Set(active);
    n.has(id) ? n.delete(id) : n.add(id);
    setActive(n);
  };

  return (
    <main className="pt-24 pb-16 px-5 md:px-8 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="font-display text-5xl tracking-tightest">Explore</h1>
            <p className="text-ink-dim mt-1 text-sm">
              {items.length} of {IMAGES.length} images.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="surface rounded-full pl-4 pr-2 py-1.5 flex items-center gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter by text…"
                className="bg-transparent outline-none text-sm placeholder:text-ink-faint w-56"
              />
              {q && (
                <button onClick={() => setQ("")} className="text-xs text-ink-dim hover:text-ink px-2">×</button>
              )}
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="surface rounded-full px-3 py-2 text-sm bg-white"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap mb-6">
          <ChipAll active={active} setActive={setActive} />
          {CLUSTERS.map((c) => {
            const on = active.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                className={`text-xs px-3 py-1.5 rounded-full border transition ${
                  on ? "bg-ink text-cream border-ink" : "bg-white text-ink-dim border-ink-line hover:text-ink"
                }`}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full mr-2" style={{ background: c.color }} />
                {c.label}
              </button>
            );
          })}
        </div>

        {items.length === 0 ? (
          <div className="text-center py-24 text-ink-dim">
            Nothing matches that filter.
          </div>
        ) : (
          <div className="columns-2 md:columns-3 lg:columns-4 gap-4 [column-fill:_balance]">
            {items.map((img, i) => (
              <button
                key={img.id}
                onClick={() => setSel(img)}
                className="group mb-4 w-full block break-inside-avoid rounded-xl overflow-hidden bg-white shadow-[0_6px_20px_-10px_rgba(14,14,16,0.18)] text-left"
              >
                <div style={{ aspectRatio: ratioFor(i) }} className="bg-cream-card">
                  <img src={img.thumb} alt={img.caption} loading="lazy"
                    className="w-full h-full object-cover group-hover:opacity-95 transition" />
                </div>
                <div className="p-2">
                  <div className="text-xs text-ink truncate">{img.caption}</div>
                  <div className="text-[10px] text-ink-faint mt-0.5">
                    {CLUSTERS.find((c) => c.id === img.cluster)?.label}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <ImageModal img={sel} onClose={() => setSel(null)} />
    </main>
  );
}

function ratioFor(i: number) {
  const seq = ["3/4", "4/5", "1/1", "4/5", "3/4", "5/6"];
  return seq[i % seq.length];
}

function ChipAll({ active, setActive }: { active: Set<string>; setActive: (s: Set<string>) => void }) {
  const all = active.size === CLUSTERS.length;
  return (
    <button
      onClick={() => setActive(all ? new Set() : new Set(CLUSTERS.map((c) => c.id)))}
      className={`text-xs px-3 py-1.5 rounded-full border transition ${
        all ? "bg-ink text-cream border-ink" : "bg-white text-ink-dim border-ink-line hover:text-ink"
      }`}
    >
      All
    </button>
  );
}
