"use client";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, supabase, useSession } from "@/lib/supabase";

// TODO: hardcoded public host for now (ngrok); swap for the real domain after deploy
const INVITE_BASE = "https://dollop-amaretto-impolite.ngrok-free.dev";
const keyFor = (uid: string) => `bliss:shared-token:${uid}`;

/** Generated in the browser (no outside QR service, works offline). High contrast + error correction for projectors. */
async function qr(data: string, width: number) {
  return QRCode.toDataURL(data, { width, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0e0e10", light: "#ffffff" } });
}

/** Blurred until tapped; then mints a brand-new shared galaxy and shows a scannable QR for it. */
export default function LiveWidget() {
  const router = useRouter();
  const session = useSession();
  const uid = session?.user.id ?? null;
  const [token, setToken] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [big, setBig] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [small, setSmall] = useState<string>("");
  const [large, setLarge] = useState<string>("");

  const link = token ? `${INVITE_BASE}/${token}` : null;

  // remembered per account; a different login on this browser never inherits someone else's galaxy
  useEffect(() => {
    setRevealed(false);
    try { setToken(uid ? localStorage.getItem(keyFor(uid)) : null); } catch { setToken(null); }
  }, [uid]);

  // harmless placeholder text (not a real invite) until the QR is revealed
  useEffect(() => {
    let alive = true;
    qr(link && revealed ? link : "Tap to reveal your shared galaxy", 256).then((d) => alive && setSmall(d));
    if (link && revealed) qr(link, 720).then((d) => alive && setLarge(d));
    return () => { alive = false; };
  }, [link, revealed]);

  async function mint() {
    const { token: t } = await api<{ token: string }>("/invites", { method: "POST" });
    try { if (uid) localStorage.setItem(keyFor(uid), t); } catch {}
    setToken(t);
  }

  async function reveal() {
    if (busy) return;
    if (revealed) return setBig(true);
    const { data } = await supabase().auth.getSession();
    if (!data.session) return router.push(`/login?next=${encodeURIComponent("/")}`);
    setBusy(true);
    setMsg(null);
    try {
      if (!token) await mint();
      setRevealed(true);
    } catch (e) {
      const m = (e as Error).message;
      if (/log in again/i.test(m)) return router.push(`/login?next=${encodeURIComponent("/")}`);
      setMsg(`Could not create the QR: ${m.slice(0, 80)}`);
    } finally {
      setBusy(false);
    }
  }

  async function newGalaxy() {
    if (!confirm("Start a brand-new empty shared galaxy? The old QR keeps working, but this page switches to the new one.")) return;
    setBusy(true);
    setMsg(null);
    try { await mint(); setRevealed(true); } catch (e) { setMsg(`Failed: ${(e as Error).message.slice(0, 80)}`); } finally { setBusy(false); }
  }

  async function share() {
    if (!link) return;
    try {
      if (navigator.share) await navigator.share({ title: "Add photos to my galaxy", url: link });
      else { await navigator.clipboard.writeText(link); setMsg("Link copied"); setTimeout(() => setMsg(null), 1800); }
    } catch { /* user cancelled */ }
  }

  return (
    <>
      <div className="fixed bottom-5 right-5 z-40 surface rounded-2xl p-3 flex items-center gap-3 max-w-[320px]">
        <button onClick={reveal} aria-label={revealed ? "Enlarge QR" : "Create QR"}
          className="relative w-[104px] h-[104px] shrink-0 rounded-lg overflow-hidden bg-white border border-ink-line">
          {small && <img src={small} alt={revealed ? "Invite QR" : ""} className={`w-full h-full transition-[filter,transform] duration-500 ${revealed ? "" : "blur-[7px] scale-110"}`} />}
          {!revealed && (
            <span className="absolute inset-0 grid place-items-center text-[11px] font-medium text-ink bg-white/40">{busy ? "Creating…" : "Tap to reveal"}</span>
          )}
        </button>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-ink-faint">{revealed ? "Scan to join" : "Shared galaxy"}</div>
          <div className="text-sm font-medium mt-0.5 text-ink">{revealed ? "Friends add photos here" : "Invite friends to add photos"}</div>
          {revealed ? (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
              <button onClick={() => setBig(true)} className="text-ink underline underline-offset-2">Enlarge</button>
              <a href={`/galaxy?g=${encodeURIComponent(token ?? "")}`} className="text-ink underline underline-offset-2">Open galaxy</a>
              <button onClick={share} className="text-ink underline underline-offset-2">Share</button>
              <button onClick={newGalaxy} className="text-ink-dim underline underline-offset-2">New</button>
            </div>
          ) : (
            <div className="mt-1 text-xs text-ink-dim">Tap the QR to create yours</div>
          )}
          {msg && <div className="mt-1 text-[11px] text-ink-dim">{msg}</div>}
        </div>
      </div>

      {big && link && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm grid place-items-center p-6" onClick={() => setBig(false)}>
          <div className="bg-white rounded-3xl p-5 text-center max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
            {large && <img src={large} alt="Invite QR" className="w-[min(78vw,420px)] h-[min(78vw,420px)]" />}
            <div className="mt-2 font-medium text-ink">Scan to add your photos</div>
            <div className="text-xs text-ink-dim mt-1 break-all max-w-[420px]">{link}</div>
            <button onClick={() => setBig(false)} className="btn-dark mt-4">Close</button>
          </div>
        </div>
      )}
    </>
  );
}
