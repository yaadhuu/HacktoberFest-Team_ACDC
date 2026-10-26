"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, supabase } from "@/lib/supabase";

const qrSrc = (data: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=0&bgcolor=ffffff&color=0e0e10&data=${encodeURIComponent(data)}`;

/** Blurred until clicked; then mints a personal invite so friends can add photos to your galaxy. */
export default function LiveWidget() {
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function reveal() {
    if (link || busy) return;
    const { data } = await supabase().auth.getSession();
    if (!data.session) return router.push(`/login?next=${encodeURIComponent("/")}`);
    setBusy(true);
    try {
      const { token } = await api<{ token: string }>("/invites", { method: "POST" });
      setLink(`${window.location.origin}/join?g=${encodeURIComponent(token)}`);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!link) return;
    if (navigator.share) {
      await navigator.share({ title: "Add photos to my galaxy", url: link }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(link);
      setMsg("Link copied");
      setTimeout(() => setMsg(null), 1800);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 surface rounded-2xl p-3 flex items-center gap-3 max-w-[300px]">
      <button onClick={reveal} aria-label="Create invite QR"
        className="relative w-[84px] h-[84px] shrink-0 rounded-lg overflow-hidden bg-white border border-ink-line">
        <img src={qrSrc(link ?? "https://bliss.galaxy/invite")} alt={link ? "Invite QR" : ""}
          className={`w-full h-full transition-[filter,transform] duration-500 ${link ? "" : "blur-[6px] scale-110"}`} />
        {!link && (
          <span className="absolute inset-0 grid place-items-center text-[10px] font-medium text-ink bg-white/40">
            {busy ? "…" : "Tap"}
          </span>
        )}
      </button>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-ink-faint">{link ? "Scan to join" : "Shared galaxy"}</div>
        <div className="text-sm font-medium mt-0.5 text-ink">{link ? "Friends add photos here" : "Invite friends to add photos"}</div>
        {link ? (
          <button onClick={share} className="mt-1 text-xs text-ink underline underline-offset-2">Share link</button>
        ) : (
          <div className="mt-1 text-xs text-ink-dim">Tap the QR to create yours</div>
        )}
        {msg && <div className="mt-1 text-[11px] text-ink-dim truncate">{msg}</div>}
      </div>
    </div>
  );
}
