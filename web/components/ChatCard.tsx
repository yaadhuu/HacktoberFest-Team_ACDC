"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PLACEHOLDERS, SUGGESTIONS } from "@/lib/mock";
import { api, IMG_COLS, supabase, type Img } from "@/lib/supabase";
import { shrinkImage } from "@/lib/shrink";

type Hit = { id: string; score: number; match: boolean };
type Match = { image: Img; score: number };
type Msg = { role: "user"; text: string } | { role: "ai"; text: string; matches: Match[] };

async function runSearch(path: string, init: RequestInit): Promise<Match[]> {
  const r = await api<{ results: Hit[] }>(path, init);
  const top = r.results.filter((h) => h.match).slice(0, 6);
  if (!top.length) return [];
  const { data } = await supabase().from("images").select(IMG_COLS).in("id", top.map((h) => h.id));
  const byId = new Map((data as Img[] | null ?? []).map((i) => [i.id, i]));
  return top.flatMap((h) => (byId.has(h.id) ? [{ image: byId.get(h.id)!, score: h.score }] : []));
}

export default function ChatCard() {
  const router = useRouter();
  const params = useSearchParams();
  const [phIdx, setPhIdx] = useState(0);
  const [value, setValue] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const threadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ran = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setPhIdx((i) => (i + 1) % PLACEHOLDERS.length), 2800);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: 1e9, behavior: "smooth" });
  }, [msgs]);

  // returning from login with ?q= -> run the preserved search once
  useEffect(() => {
    const q = params.get("q");
    if (q && !ran.current) {
      ran.current = true;
      submit(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function signedIn(query: string) {
    const { data } = await supabase().auth.getSession();
    if (data.session) return true;
    router.push(`/login?next=${encodeURIComponent(`/?q=${encodeURIComponent(query)}`)}`);
    return false;
  }

  async function submit(q: string) {
    const query = q.trim();
    if (!query || !(await signedIn(query))) return;
    setValue("");
    setMsgs((m) => [...m, { role: "user", text: query }, { role: "ai", text: "Searching your galaxy…", matches: [] }]);
    let reply: Msg;
    try {
      const matches = await runSearch("/search", { method: "POST", body: JSON.stringify({ query }) });
      reply = { role: "ai", matches, text: matches.length ? `${matches.length} photos match. Tap one for the evidence.` : "Nothing in your galaxy matches that yet." };
    } catch (e) {
      reply = { role: "ai", matches: [], text: `Search failed: ${(e as Error).message}` };
    }
    setMsgs((m) => [...m.slice(0, -1), reply]);
  }

  async function byImage(f: File) {
    if (!(await signedIn("photo"))) return;
    const fd = new FormData();
    fd.append("file", await shrinkImage(f));
    setMsgs((m) => [...m, { role: "user", text: `Photos like ${f.name}` }, { role: "ai", text: "Comparing…", matches: [] }]);
    try {
      const matches = await runSearch("/search/image", { method: "POST", body: fd });
      setMsgs((m) => [...m.slice(0, -1), { role: "ai", matches, text: `${matches.length} visually similar photos.` }]);
    } catch (e) {
      setMsgs((m) => [...m.slice(0, -1), { role: "ai", matches: [], text: `Search failed: ${(e as Error).message}` }]);
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      {msgs.length === 0 && (
        <div className="text-center mb-10 px-4">
          <h1 className="font-display text-[clamp(44px,8vw,96px)] leading-[0.95] tracking-tightest text-ink">
            See what your images{" "}
            <span className="italic bg-gradient-to-r from-ink via-dot-purple to-dot-blue bg-clip-text text-transparent">
              mean.
            </span>
          </h1>
          <p className="mt-5 text-ink-dim mx-auto text-[15px] whitespace-nowrap overflow-x-auto no-scrollbar">
            Group your library by meaning. Search in plain words. Bliss shows the evidence behind every match.
          </p>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
        className="surface rounded-full pl-5 pr-2 py-2 flex items-center gap-2 shadow-[0_8px_30px_-12px_rgba(14,14,16,0.18)]"
      >
        <IconLens />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={PLACEHOLDERS[phIdx]}
          className="flex-1 bg-transparent outline-none text-ink placeholder:text-ink-faint py-2.5 text-[15px]"
        />
        <IconBtn label="search by image" onClick={() => fileRef.current?.click()}>
          <IconImage />
        </IconBtn>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && byImage(e.target.files[0])} />
        <button
          type="submit"
          className="ml-1 w-10 h-10 rounded-full bg-ink text-cream grid place-items-center hover:bg-black transition"
          aria-label="search"
        >
          <IconSend />
        </button>
      </form>

      {msgs.length === 0 && (
        <div className="mt-4 flex flex-wrap gap-2 justify-center">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => (s.startsWith("Find similar") ? fileRef.current?.click() : submit(s))}
              className="text-xs px-3 py-1.5 rounded-full bg-black/5 hover:bg-black/10 text-ink-dim hover:text-ink transition"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {msgs.length > 0 && (
        <div
          ref={threadRef}
          className="max-h-[60vh] overflow-y-auto space-y-5 mt-6 pr-1"
        >
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="bg-ink text-cream rounded-2xl rounded-br-md px-4 py-2 max-w-[80%] text-sm">
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={i} className="space-y-3">
                <div className="text-ink-dim text-sm">
                  <span className="font-medium text-ink mr-2">bliss</span>
                  {m.text}
                </div>
                {m.matches.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {m.matches.map((mt) => (
                      <ResultCard key={mt.image.id} match={mt} query={msgs[i - 1]?.text ?? ""} />
                    ))}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function ResultCard({ match, query }: { match: Match; query: string }) {
  const [why, setWhy] = useState<{ reason: string; box: [number, number, number, number] | null } | null>(null);
  const img = match.image;
  useEffect(() => {
    api<{ reason: string; box: [number, number, number, number] | null }>("/explain", {
      method: "POST", body: JSON.stringify({ image_id: img.id, query }),
    }).then(setWhy).catch(() => setWhy({ reason: img.rationale ?? "", box: null }));
  }, [img.id, img.rationale, query]);
  const b = why?.box;
  return (
    <div className="group rounded-xl overflow-hidden surface">
      <div className="relative aspect-[4/5]">
        <img src={img.thumb} alt={img.caption ?? ""} className="w-full h-full object-cover" />
        {b && (
          <div className="absolute border-2 border-white rounded shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]"
            style={{ left: `${b[0] * 100}%`, top: `${b[1] * 100}%`, width: `${b[2] * 100}%`, height: `${b[3] * 100}%` }} />
        )}
        <div className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cream/95 text-ink">
          {Math.round(match.score * 100)}% match
        </div>
        {img.ocr && <div className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full bg-ink text-cream">OCR</div>}
      </div>
      <div className="p-2.5">
        <div className="text-xs text-ink line-clamp-3 min-h-[3em]">{why ? why.reason : "Reading the evidence…"}</div>
        <div className="mt-1.5 flex gap-1 flex-wrap">
          {(img.tags ?? []).slice(0, 3).map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/5 text-ink-dim">{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function IconBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} onClick={onClick}
      className="w-9 h-9 rounded-full grid place-items-center text-ink-dim hover:text-ink hover:bg-black/5 transition">
      {children}
    </button>
  );
}

const sx = { width: 18, height: 18, stroke: "currentColor", fill: "none", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const IconLens = () => (<svg viewBox="0 0 24 24" {...sx} className="text-ink-dim"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
const IconImage = () => (<svg viewBox="0 0 24 24" {...sx}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="m4 18 5-5 4 4 3-2 4 4" /></svg>);
const IconSend = () => (<svg viewBox="0 0 24 24" {...sx}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>);
