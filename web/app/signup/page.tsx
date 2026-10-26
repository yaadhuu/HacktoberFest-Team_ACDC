"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await new Promise((r) => setTimeout(r, 700));
    router.push("/profile");
  }

  return (
    <main className="min-h-screen grid place-items-center pt-20 pb-10 px-5">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-5xl tracking-tightest text-center">
          Make it <span className="italic bg-gradient-to-r from-ink via-dot-purple to-dot-blue bg-clip-text text-transparent">yours.</span>
        </h1>
        <p className="text-ink-dim text-sm text-center mt-2">Create a free account.</p>

        <form onSubmit={submit} className="mt-7 surface rounded-2xl p-5 space-y-3">
          <Field label="Name" type="text" value={name} onChange={setName} placeholder="Your name" required />
          <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@domain.com" required />
          <Field label="Password" type="password" value={pw} onChange={setPw} placeholder="min 8 chars" required />
          <button disabled={busy} className="btn-dark w-full justify-center mt-2">
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>

        <div className="mt-4 text-xs text-ink-dim text-center">
          Already have one? <Link href="/login" className="text-ink hover:underline">Log in</Link>
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
