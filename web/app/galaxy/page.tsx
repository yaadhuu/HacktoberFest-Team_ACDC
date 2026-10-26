"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import DetailPanel from "@/components/galaxy/DetailPanel";
import { fetchAllImages, subscribe } from "@/lib/liveStore";
import { api, apiUrl, cdn, supabase, type Cluster, type Img } from "@/lib/supabase";

const Galaxy = dynamic(() => import("@/components/galaxy/Galaxy"), {
  ssr: false,
  loading: () => <div className="fixed inset-0 grid place-items-center text-snow/50 text-sm">Loading galaxy…</div>,
});

type Hit = { id: string; score: number; match: boolean };

export default function GalaxyPage() {
  return (
    <Suspense>
      <GalaxyGate />
    </Suspense>
  );
}

/** ?g=<invite> -> read-only guest view of a friend's shared galaxy (no account). Otherwise your own galaxy. */
function GalaxyGate() {
  const guest = useSearchParams().get("g");
  if (guest) return <GalaxyView guest={guest} />;
  return (
    <RequireAuth dark>
      <GalaxyView guest={null} />
    </RequireAuth>
  );
}

function GalaxyView({ guest }: { guest: string | null }) {
  const [imgs, setImgs] = useState<Img[] | null>(null);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [mode, setMode] = useState<"highlight" | "reorder">("highlight");
  const [filter, setFilter] = useState<Set<string> | null>(null);
  const [selected, setSelected] = useState<Img | null>(null);
  const [arriving, setArriving] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<{ id: string; text: string }[]>([]);
  const [introKey, setIntroKey] = useState(0);
  const [introOn, setIntroOn] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (guest) {
      const r = await fetch(`${apiUrl()}/join/${encodeURIComponent(guest)}/galaxy`);
      if (!r.ok) throw new Error(r.status === 404 ? "This invite link is not valid" : `${r.status}`);
      const j = (await r.json()) as { images: Img[]; clusters: Cluster[] };
      setImgs((prev) => {
        if (prev) { // poll: animate genuinely new photos in
          const known = new Set(prev.map((p) => p.id));
          const fresh = j.images.filter((i) => !known.has(i.id));
          if (fresh.length) {
            setArriving((a) => new Set([...a, ...fresh.map((f) => f.id)]));
            setTimeout(() => setArriving(new Set()), 3000);
            setToasts((t) => [...t, ...fresh.map((f) => ({ id: f.id, text: `New star · ${f.primary_category ?? "photo"}` }))]);
            setTimeout(() => setToasts([]), 4000);
          }
        }
        return j.images;
      });
      setClusters(j.clusters);
      return;
    }
    const [all, cl] = await Promise.all([
      fetchAllImages(),
      supabase().from("user_clusters").select("id,label,size,cx,cy,cz"),
    ]);
    setImgs(all);
    setClusters((cl.data as Cluster[]) ?? []);
  }, [guest]);

  useEffect(() => {
    load().catch((e) => setBusy(`Could not load the galaxy: ${e.message}`));
    if (guest) { // guests can't use realtime (RLS), so poll
      const t = setInterval(() => load().catch(() => {}), 6000);
      return () => clearInterval(t);
    }
    return subscribe(
      (img) => {
        setImgs((prev) => (prev && !prev.some((p) => p.id === img.id) ? [...prev, img] : prev));
        setArriving((a) => new Set(a).add(img.id));
        setTimeout(() => setArriving((a) => { const n = new Set(a); n.delete(img.id); return n; }), 3000);
        const t = { id: img.id, text: `New star · ${img.primary_category ?? "photo"}` };
        setToasts((p) => [...p, t]);
        setTimeout(() => setToasts((p) => p.filter((x) => x.id !== t.id)), 4000);
      },
      (img) => setImgs((prev) => prev?.map((p) => (p.id === img.id ? img : p)) ?? prev),
    );
  }, [load, guest]);

  // one-time upgrade: photos from the old pipeline get re-indexed so search covers every photo
  useEffect(() => {
    if (guest) return;
    let stop = false;
    (async () => {
      let r = await api<{ done: number; remaining: number }>("/reindex", { method: "POST" }).catch(() => null);
      if (!r || (r.remaining === 0 && r.done === 0)) return;
      while (!stop && r && r.remaining > 0) {
        setBusy(`Re-indexing older photos for search… ${r.remaining} left`);
        r = await api<{ done: number; remaining: number }>("/reindex", { method: "POST" }).catch(() => null);
      }
      if (stop) return;
      setBusy("Search index updated. Re-clustering…");
      await api("/galaxy/rebuild", { method: "POST" }).catch(() => {});
      await load();
      setBusy(null);
    })();
    return () => { stop = true; };
  }, [guest, load]);

  const scores = useMemo(() => (hits ? new Map(hits.map((h) => [h.id, h.score])) : null), [hits]);
  const matches = useMemo(() => (hits ? new Set(hits.filter((h) => h.match).map((h) => h.id)) : null), [hits]);
  const byId = useMemo(() => new Map((imgs ?? []).map((i) => [i.id, i])), [imgs]);
  const cats = useMemo(() => {
    const c = new Map<string, number>();
    for (const i of imgs ?? []) { const k = (i.primary_category ?? "other").split("/")[0]; c.set(k, (c.get(k) ?? 0) + 1); }
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [imgs]);

  async function search(q: string) {
    const text = q.trim();
    if (!text) return;
    setBusy("Searching…");
    try {
      const r = await api<{ results: Hit[] }>("/search", { method: "POST", body: JSON.stringify({ query: text }) });
      setQuery(text);
      setHits(r.results);
      setSelected(null);
      setBusy(r.results.some((h) => h.match) ? null : `No photos match “${text}”. Try other words.`);
    } catch (e) {
      setBusy(`Search failed: ${(e as Error).message}`);
    }
  }

  async function similar(img: Img) {
    setBusy("Finding similar…");
    try {
      const r = await api<{ results: Hit[] }>("/similar", { method: "POST", body: JSON.stringify({ image_id: img.id }) });
      setQuery(null);
      setHits(r.results);
      setBusy(null);
    } catch (e) {
      setBusy(`Failed: ${(e as Error).message}`);
    }
  }

  function clear() {
    setHits(null);
    setQuery(null);
    setInput("");
  }

  async function rebuild() {
    setBusy("Re-clustering (UMAP + HDBSCAN)…");
    try {
      const r = await api<{ clusters: number; images: number }>("/galaxy/rebuild", { method: "POST" });
      await load();
      setBusy(`${r.images} stars · ${r.clusters} star systems`);
      setTimeout(() => setBusy(null), 2500);
    } catch (e) {
      setBusy(`Rebuild failed: ${(e as Error).message}`);
    }
  }

  const topHits = (hits ?? []).filter((h) => h.match).slice(0, 10).flatMap((h) => (byId.has(h.id) ? [byId.get(h.id)!] : []));

  if (imgs && imgs.length === 0) {
    return (
      <main className="fixed inset-0 bg-night grid place-items-center text-center px-6">
        <div>
          <h1 className="font-display text-5xl text-snow tracking-tightest">{guest ? "No stars yet." : <>Your galaxy is <span className="italic">empty.</span></>}</h1>
          <p className="mt-3 text-snow/60 text-sm">{guest ? "Scan the QR and add the first photo. This page updates on its own." : "Every photo you add becomes a star."}</p>
          <Link href={guest ? `/join?g=${encodeURIComponent(guest)}` : "/upload"} className="mt-6 inline-flex bg-snow text-night rounded-full px-5 py-2.5 text-sm font-medium">{guest ? "Add a photo" : "Upload photos"}</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 bg-night text-snow">
      {imgs && (
        <Galaxy imgs={imgs} clusters={clusters} scores={scores} matches={matches} mode={mode} filter={filter}
          selectedId={selected?.id ?? null} arriving={arriving} introKey={introKey}
          onIntroEnd={() => setIntroOn(false)} onSelect={setSelected} />
      )}

      {/* category filters */}
      <div className="fixed top-20 left-5 z-30 flex flex-col gap-1 max-w-[180px]">
        {cats.slice(0, 10).map(([c, n]) => {
          const on = !filter || filter.has(c);
          return (
            <button key={c} onClick={() => setFilter((f) => {
              const next = new Set(f ?? []);
              if (!f) { next.clear(); next.add(c); } else if (next.has(c)) next.delete(c); else next.add(c);
              return next.size ? next : null;
            })}
              className={`text-left text-xs px-3 py-1 rounded-full transition ${on ? "text-snow" : "text-snow/30"} hover:bg-white/5`}>
              <span className="capitalize">{c}</span> <span className="text-snow/40 tabular-nums">{n}</span>
            </button>
          );
        })}
        {filter && <button onClick={() => setFilter(null)} className="text-left text-[11px] px-3 py-1 text-snow/40 hover:text-snow">Show all</button>}
      </div>

      {/* top-right controls */}
      <div className="fixed top-20 right-5 z-30 flex items-center gap-2 text-xs">
        <span className="text-snow/40 tabular-nums mr-1">{imgs?.length ?? 0} stars · {clusters.length} systems</span>
        {introOn ? (
          <button onClick={() => window.dispatchEvent(new Event("bliss:skip-intro"))} className="glass-dark rounded-full px-3 py-1.5">Skip intro</button>
        ) : (
          <button onClick={() => { setIntroOn(true); setIntroKey((k) => k + 1); }} className="glass-dark rounded-full px-3 py-1.5 text-snow/70 hover:text-snow">Replay intro</button>
        )}
        {!guest && <button onClick={rebuild} className="glass-dark rounded-full px-3 py-1.5 text-snow/70 hover:text-snow">Re-cluster</button>}
        {guest && <a href={`/join?g=${encodeURIComponent(guest)}`} className="rounded-full px-3 py-1.5 bg-snow text-night font-medium">Add your photo</a>}
      </div>

      {/* results strip */}
      {topHits.length > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 flex gap-2 max-w-[92vw] overflow-x-auto no-scrollbar">
          {topHits.map((img) => (
            <button key={img.id} onClick={() => setSelected(img)}
              className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border ${selected?.id === img.id ? "border-[#f5b14c]" : "border-white/10"}`}>
              <img src={cdn(img, 112)} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* search */}
      {!guest && <form onSubmit={(e) => { e.preventDefault(); search(input); }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 w-[min(680px,94vw)]">
        <div className="glass-dark rounded-full pl-5 pr-2 py-2 flex items-center gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search your galaxy in plain words…"
            className="flex-1 bg-transparent outline-none text-snow placeholder:text-snow/35 py-1.5 text-sm" />
          <div className="flex rounded-full bg-white/5 p-0.5 text-[11px]">
            {(["highlight", "reorder"] as const).map((m) => (
              <button type="button" key={m} onClick={() => setMode(m)}
                className={`px-2.5 py-1 rounded-full capitalize ${mode === m ? "bg-white/15 text-snow" : "text-snow/50"}`}>{m}</button>
            ))}
          </div>
          {hits && <button type="button" onClick={clear} className="text-xs text-snow/60 hover:text-snow px-2">Clear</button>}
          <button type="submit" aria-label="search" className="w-9 h-9 rounded-full bg-snow text-night grid place-items-center">→</button>
        </div>
        {busy && <div className="mt-2 text-center text-[11px] text-snow/50">{busy}</div>}
      </form>}

      <div className="fixed bottom-24 right-5 z-40 flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="glass-dark rounded-full px-3 py-1.5 text-xs flex items-center gap-2 animate-popIn">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f5b14c]" /> {t.text}
          </div>
        ))}
      </div>

      {selected && (
        <DetailPanel readOnly={!!guest} img={selected} query={query} onClose={() => setSelected(null)} onSimilar={similar}
          onChange={(img) => { setSelected(img); setImgs((p) => p?.map((x) => (x.id === img.id ? img : x)) ?? p); }}
          onDelete={(id) => { setSelected(null); setImgs((p) => p?.filter((x) => x.id !== id) ?? p); }} />
      )}
    </main>
  );
}
