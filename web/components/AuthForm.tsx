"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase, useSession } from "@/lib/supabase";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const session = useSession();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (session) router.replace(next);
  }, [session, next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const sb = supabase().auth;
    const { data, error } =
      mode === "login"
        ? await sb.signInWithPassword({ email, password: pw })
        : await sb.signUp({ email, password: pw, options: { emailRedirectTo: `${location.origin}/login?next=${encodeURIComponent(next)}` } });
    setBusy(false);
    if (error) return setMsg(error.message);
    if (!data.session) setMsg("Check your inbox to confirm your email, then sign in.");
  }

  async function google() {
    const { error } = await supabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/login?next=${encodeURIComponent(next)}` },
    });
    if (error) setMsg(error.message);
  }

  const query = new URLSearchParams(next.split("?")[1] ?? "").get("q");

  return (
    <main className="min-h-screen grid place-items-center pt-20 pb-10 px-5">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-5xl tracking-tightest text-center">
          {mode === "login" ? <>Welcome <span className="italic">back.</span></> : <>Make it <span className="italic">yours.</span></>}
        </h1>
        <p className="text-ink-dim text-sm text-center mt-2">
          {query ? <>Sign in to search your galaxy for “{query}”.</> : mode === "login" ? "Sign in to your galaxy." : "Every account gets its own private galaxy."}
        </p>

        <form onSubmit={submit} className="mt-7 surface rounded-2xl p-5 space-y-3">
          <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@domain.com" />
          <Field label="Password" type="password" value={pw} onChange={setPw} placeholder="min 6 characters" />
          <button disabled={busy} className="btn-dark w-full justify-center mt-2 disabled:opacity-50">
            {busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
          <button type="button" onClick={google}
            className="w-full border border-ink-line rounded-full px-5 py-2.5 text-sm hover:bg-cream-soft transition">
            Continue with Google
          </button>
          {msg && <div className="text-xs text-ink-dim">{msg}</div>}
        </form>

        <div className="mt-4 text-xs text-ink-dim text-center">
          {mode === "login" ? (
            <>No account? <Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-ink hover:underline">Sign up</Link></>
          ) : (
            <>Have an account? <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-ink hover:underline">Log in</Link></>
          )}
        </div>
      </div>
    </main>
  );
}

/** Only allow same-site relative paths, never "//evil.com". */
function safeNext(n: string | null) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/galaxy";
}

function Field({ label, type, value, onChange, placeholder }: {
  label: string; type: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wider text-ink-faint mb-1">{label}</div>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required
        minLength={type === "password" ? 6 : undefined}
        className="w-full bg-cream-soft rounded-xl px-4 py-3 text-sm outline-none placeholder:text-ink-faint" />
    </label>
  );
}
