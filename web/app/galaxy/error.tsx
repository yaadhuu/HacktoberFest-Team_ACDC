"use client";
export default function GalaxyError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="min-h-screen grid place-items-center p-6 text-center">
      <div className="max-w-md">
        <h2 className="font-display text-4xl tracking-tightest">Galaxy failed to load.</h2>
        <p className="text-snow/60 mt-2 text-sm">
          Likely WebGL unavailable or a texture failed. Try a different browser.
        </p>
        <pre className="mt-4 text-xs bg-black/40 border border-white/10 rounded-md p-3 overflow-x-auto text-left">{error.message}</pre>
        <button onClick={reset} className="mt-4 bg-snow text-night rounded-full px-5 py-2 text-sm">Retry</button>
      </div>
    </main>
  );
}
