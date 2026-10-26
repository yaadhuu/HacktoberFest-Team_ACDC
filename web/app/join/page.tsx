"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { api, apiUrl, type Img } from "@/lib/supabase";

type Phase = "idle" | "preview" | "uploading" | "done";

export default function JoinPage() {
  return (
    <Suspense>
      <JoinGate />
    </Suspense>
  );
}

/** ?g=<invite> -> guest upload into a friend's shared galaxy (no account). Otherwise: your own galaxy. */
function JoinGate() {
  const invite = useSearchParams().get("g");
  if (invite) return <Join invite={invite} />;
  return (
    <RequireAuth>
      <Join invite={null} />
    </RequireAuth>
  );
}

function Join({ invite }: { invite: string | null }) {
  const [inviteOk, setInviteOk] = useState<boolean | null>(invite ? null : true);
  useEffect(() => {
    if (!invite) return;
    fetch(`${apiUrl()}/join/${encodeURIComponent(invite)}`).then((r) => setInviteOk(r.ok)).catch(() => setInviteOk(false));
  }, [invite]);
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [cluster, setCluster] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pick() { fileRef.current?.click(); }

  function onFile(f: File | null) {
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(reader.result as string);
      setPhase("preview");
    };
    reader.readAsDataURL(f);
  }

  async function submit() {
    if (!preview) return;
    setErr(null);
    setPhase("uploading");
    try {
      const fd = new FormData();
      fd.append("file", file!);
      let r: { image: Img };
      if (invite) {
        fd.append("name", name);
        const res = await fetch(`${apiUrl()}/join/${encodeURIComponent(invite)}/images`, { method: "POST", body: fd });
        if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
        r = await res.json();
      } else {
        r = await api<{ image: Img }>("/images", { method: "POST", body: fd });
      }
      setCluster(r.image.primary_category ?? "");
      setPhase("done");
    } catch (e: any) {
      setErr(e?.message ?? "upload failed");
      setPhase("preview");
    }
  }

  return (
    <main className="pt-20 pb-10 px-5 min-h-screen">
      <div className="max-w-md mx-auto">
        <div className="text-xs tracking-[0.2em] uppercase text-ink-faint mb-3 text-center">
          Live demo
        </div>
        <h1 className="font-display text-5xl leading-[0.95] tracking-tightest text-ink text-center">
          Add your photo to the <span className="italic">galaxy.</span>
        </h1>
        <p className="mt-4 text-ink-dim text-center text-[15px]">
          Snap anything around you. Bliss places it next to visually similar images in seconds.
        </p>

        {invite && inviteOk === false && (
          <div className="mt-6 text-center text-sm text-ink-dim">This invite link is not valid. Ask your friend for a new QR.</div>
        )}
        {invite && inviteOk && (
          <div className="mt-6 text-center text-xs text-ink-dim">You were invited to a shared galaxy. No account needed.</div>
        )}

        <div className={`mt-8 surface rounded-3xl p-5 ${inviteOk ? "" : "hidden"}`}>
          {phase === "idle" && (
            <>
              <button
                onClick={pick}
                className="w-full aspect-[4/5] rounded-2xl bg-cream-soft border border-dashed border-ink-line grid place-items-center text-ink-dim hover:bg-cream-card transition"
              >
                <div className="text-center px-6">
                  <div className="w-14 h-14 mx-auto rounded-full bg-ink text-cream grid place-items-center mb-3">
                    <IconCamera />
                  </div>
                  <div className="font-medium text-ink">Open camera</div>
                  <div className="text-xs mt-1">or pick from gallery</div>
                </div>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </>
          )}

          {phase === "preview" && preview && (
            <>
              <div className="rounded-2xl overflow-hidden bg-black/5 aspect-[4/5]">
                <img src={preview} alt="preview" className="w-full h-full object-cover" />
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name (optional)"
                className="mt-3 w-full bg-cream-soft rounded-xl px-4 py-3 text-sm outline-none placeholder:text-ink-faint"
              />
              {err && <div className="mt-2 text-xs text-red-600">{err}</div>}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => { setPreview(null); setFile(null); setPhase("idle"); }}
                  className="btn-ghost flex-1 justify-center"
                >
                  Retake
                </button>
                <button onClick={submit} className="btn-dark flex-1 justify-center">
                  Send it to the galaxy
                </button>
              </div>
            </>
          )}

          {phase === "uploading" && (
            <div className="aspect-[4/5] grid place-items-center text-center px-6">
              <div>
                <div className="w-14 h-14 mx-auto rounded-full border-2 border-ink border-t-transparent animate-spin mb-4" />
                <div className="font-medium">Embedding, captioning, placing…</div>
                <div className="text-xs text-ink-dim mt-1">Open-weight models at work</div>
              </div>
            </div>
          )}

          {phase === "done" && preview && (
            <div className="text-center">
              <div className="rounded-2xl overflow-hidden bg-black/5 aspect-[4/5] animate-popIn">
                <img src={preview} alt="uploaded" className="w-full h-full object-cover" />
              </div>
              <div className="mt-4 inline-flex items-center gap-2 text-sm text-ink">
                <span className="w-1.5 h-1.5 rounded-full bg-dot-green animate-pulseDot" />
                Placed in the galaxy
                {cluster && <span className="text-ink-dim">· cluster <span className="text-ink">{cluster}</span></span>}
              </div>
              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => { setPreview(null); setFile(null); setPhase("idle"); setName(""); }}
                  className="btn-ghost flex-1 justify-center"
                >
                  Add another
                </button>
                {invite ? (
                  <span className="btn-dark flex-1 justify-center">Watch the big screen ✦</span>
                ) : (
                  <Link href="/galaxy" className="btn-dark flex-1 justify-center">See it on screen</Link>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 text-xs text-ink-faint text-center">
          No account needed. Open-weight models. Your photo stays with the demo.
        </div>
      </div>
    </main>
  );
}

const IconCamera = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);
