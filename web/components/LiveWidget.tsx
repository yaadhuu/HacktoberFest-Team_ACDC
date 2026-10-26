"use client";
import { useEffect, useState } from "react";
import { STATS } from "@/lib/mock";

export default function LiveWidget() {
  const [count, setCount] = useState(STATS.liveAdded);
  const [url, setUrl] = useState("https://prism.demo/join");

  useEffect(() => {
    if (typeof window !== "undefined") setUrl(`${window.location.origin}/join`);
    const t = setInterval(() => setCount((c) => c + (Math.random() < 0.3 ? 1 : 0)), 4000);
    return () => clearInterval(t);
  }, []);

  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=0&bgcolor=ffffff&color=0e0e10&data=${encodeURIComponent(url)}`;

  return (
    <div className="fixed bottom-5 right-5 z-40 surface rounded-2xl p-3 flex items-center gap-3 max-w-[280px]">
      <div className="w-[72px] h-[72px] rounded-lg overflow-hidden bg-white border border-ink-line grid place-items-center">
        <img src={qr} alt="QR to /join" className="w-full h-full" />
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-ink-faint">Scan to join</div>
        <div className="text-sm font-medium mt-0.5 text-ink">Add a photo live</div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-dim">
          <span className="w-1.5 h-1.5 rounded-full bg-dot-green animate-pulseDot" />
          <span className="tabular-nums">{count}</span> added
        </div>
      </div>
    </div>
  );
}
