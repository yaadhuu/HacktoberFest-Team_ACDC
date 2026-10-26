"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await new Promise((r) => setTimeout(r, 600));
    router.push("/profile");
  }

  return (
    <main className="min-h-screen grid place-items-center pt-20 pb-10 px-5">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-5xl tracking-tightest text-center">
          Welcome <span className="italic">back.</span>
        </h1>
        <p className="text-ink-dim text-sm text-center mt-2">Sign in to your bliss library.</p>

        <form onSubmit={submit} className="mt-7 surface rounded-2xl p-5 space-y-3">
          <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@domain.com" required />
          <Field label="Password" type="password" value={pw} onChange={setPw} placeholder="••••••••" required />
          <button disabled={busy} className="btn-dark w-full justify-center mt-2">
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <button type="button"
            onClick={() => { setBusy(true); setTimeout(() => router.push("/profile"), 600); }}
            className="w-full border border-ink-line rounded-full px-5 py-2.5 text-sm hover:bg-cream-soft transition">
            Continue with Google
          </button>
        </form>

        <div className="mt-4 text-xs text-ink-dim text-center">
          No account? <Link href="/signup" className="text-ink hover:underline">Sign up</Link>
          <span className="mx-2 text-ink-faint">·</span>
          <Link href="/join" className="text-ink hover:underline">Join live as guest</Link>
        </div>
      </div>
    </main>
  );
}

function Field({ label, type, value, onChange, placeholder, required }:{
  label:string; type:string; value:string; onChange:(v:string)=>void; placeholder?:string; required?:boolean
}) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wider text-ink-faint mb-1">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full bg-cream-soft rounded-xl px-4 py-3 text-sm outline-none placeholder:text-ink-faint"
      />
    </label>
  );
}
