"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/supabase";

export default function RequireAuth({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  const session = useSession();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (session === null) {
      const next = path + (typeof window !== "undefined" ? window.location.search : "");
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [session, path, router]);

  if (!session) {
    return (
      <div className={`fixed inset-0 grid place-items-center text-sm ${dark ? "bg-night text-snow/50" : "text-ink-dim"}`}>
        Checking your session…
      </div>
    );
  }
  return <>{children}</>;
}
