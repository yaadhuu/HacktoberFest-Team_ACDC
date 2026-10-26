"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import Logo from "./Logo";

const DARK_ROUTES = ["/galaxy"];

const links = [
  { href: "/galaxy", label: "Galaxy" },
  { href: "/search", label: "Search" },
  { href: "/upload", label: "Upload" },
  { href: "/profile", label: "Profile" },
];

export default function Navbar() {
  const path = usePathname() || "/";
  const dark = DARK_ROUTES.some((r) => path.startsWith(r));

  useEffect(() => {
    document.body.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  const shell = dark
    ? "bg-night/70 border border-white/10 text-snow backdrop-blur-md"
    : "bg-white/80 border border-ink-line text-ink backdrop-blur";
  const dim = dark ? "text-snow/60 hover:text-snow" : "text-ink-dim hover:text-ink";
  const activeBg = dark ? "bg-white/10 text-snow" : "bg-black/5 text-ink";
  const joinCls = dark
    ? "ml-1 inline-flex items-center gap-1.5 bg-snow text-night rounded-full px-3 py-1 text-xs font-medium"
    : "ml-1 inline-flex items-center gap-1.5 bg-ink text-cream rounded-full px-3 py-1 text-xs font-medium";

  return (
    <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
      <div className={`${shell} rounded-full px-2 py-1.5 flex items-center gap-1 text-sm shadow-[0_4px_20px_-10px_rgba(14,14,16,0.25)]`}>
        <Link href="/" className="flex items-center gap-1.5 px-2 py-1">
          <Logo size={18} />
          <span className="text-[13px] font-semibold tracking-tight">bliss</span>
        </Link>
        <span className={`w-px h-4 mx-1 ${dark ? "bg-white/15" : "bg-ink-line"}`} />
        {links.map((l) => {
          const on = l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-1 rounded-full transition ${on ? activeBg : dim}`}
            >
              {l.label}
            </Link>
          );
        })}
        <Link href="/join" className={joinCls}>
          <span className="w-1.5 h-1.5 rounded-full bg-dot-green animate-pulseDot" />
          Join live
        </Link>
      </div>
    </nav>
  );
}
