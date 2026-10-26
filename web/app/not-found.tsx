import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen grid place-items-center px-6 text-center">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-ink-faint">404</div>
        <h1 className="font-display text-6xl tracking-tightest mt-2">
          Lost in the <span className="italic bg-gradient-to-r from-ink via-dot-purple to-dot-blue bg-clip-text text-transparent">void.</span>
        </h1>
        <p className="text-ink-dim mt-3 text-sm">That page is not here.</p>
        <Link href="/" className="btn-dark mt-6 inline-flex">← Back to Explore</Link>
      </div>
    </main>
  );
}
