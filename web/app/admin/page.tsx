"use client";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { api, supabase } from "@/lib/supabase";

export default function AdminPage() {
  return (
    <RequireAuth>
      <Admin />
    </RequireAuth>
  );
}

function Admin() {
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    const { count: c } = await supabase().from("images").select("id", { count: "exact", head: true });
    setCount(c ?? 0);
  }
  useEffect(() => { refresh(); }, []);

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg(`${label}: done.`);
      await refresh();
    } catch (e) {
      setMsg(`${label} failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pt-24 pb-16 px-5 min-h-screen">
      <div className="max-w-xl mx-auto">
        <h1 className="font-display text-5xl tracking-tightest">Your <span className="italic">galaxy.</span></h1>
        <div className="mt-8 surface rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Images in your galaxy</div>
            <div className="text-3xl font-display tabular-nums">{count ?? "…"}</div>
          </div>
          <button disabled={busy} onClick={() => act("Re-cluster", () => api("/galaxy/rebuild", { method: "POST" }))}
            className="w-full justify-center btn-ghost border border-ink-line disabled:opacity-40">
            Re-run UMAP + HDBSCAN
          </button>
          <button disabled={busy || !count}
            onClick={() => confirm("Delete every image in your galaxy? This cannot be undone.") &&
              act("Reset", async () => {
                const { data } = await supabase().auth.getUser();
                const { error } = await supabase().from("images").delete().eq("user_id", data.user!.id);
                if (error) throw error;
              })}
            className="w-full justify-center btn-dark disabled:opacity-40">
            Reset my galaxy
          </button>
          {msg && <div className="text-xs text-ink-dim">{msg}</div>}
        </div>
      </div>
    </main>
  );
}
