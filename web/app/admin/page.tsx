"use client";
import { useEffect, useState } from "react";
import { IS_MOCK, supabase } from "@/lib/supabase";
import { clearLive, fetchAllImages } from "@/lib/liveStore";

export default function AdminPage() {
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    const all = await fetchAllImages();
    setCount(all.filter((i) => i.source === "live").length);
  }

  useEffect(() => { refresh(); }, []);

  async function wipe() {
    if (!confirm("Delete every live upload? This cannot be undone.")) return;
    setBusy(true);
    setMsg(null);
    try {
      if (IS_MOCK) {
        clearLive();
      } else {
        const { error } = await supabase().from("images").delete().eq("source", "live");
        if (error) throw error;
      }
      setMsg("Live uploads cleared.");
      await refresh();
    } catch (e: any) {
      setMsg(`Error: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pt-24 pb-16 px-5 min-h-screen">
      <div className="max-w-xl mx-auto">
        <div className="text-xs uppercase tracking-[0.2em] text-ink-faint mb-2">Admin</div>
        <h1 className="font-display text-5xl tracking-tightest">
          Reset the <span className="italic">demo.</span>
        </h1>
        <p className="mt-3 text-ink-dim text-sm">
          Hidden page. Removes every live upload. Preloaded set is untouched.
        </p>

        <div className="mt-8 surface rounded-2xl p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Live uploads</div>
              <div className="text-xs text-ink-dim">
                Mode: <span className="text-ink">{IS_MOCK ? "mock (localStorage)" : "supabase"}</span>
              </div>
            </div>
            <div className="text-3xl font-display tabular-nums">
              {count ?? "…"}
            </div>
          </div>
          <button
            onClick={wipe}
            disabled={busy || count === 0}
            className="mt-5 w-full justify-center btn-dark disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "Clearing…" : "Clear live uploads"}
          </button>
          {msg && <div className="mt-3 text-xs text-ink-dim">{msg}</div>}
        </div>
      </div>
    </main>
  );
}
