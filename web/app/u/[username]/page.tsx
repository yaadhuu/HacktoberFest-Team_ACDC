"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PROFILES, imagesForUser, statsForUser } from "@/lib/user";
import { CLUSTERS } from "@/lib/mock";
import ImageModal from "@/components/ImageModal";
import type { ImageItem } from "@/lib/types";

type Tab = "photos" | "collections" | "activity";

export default function UserPage({ params }: { params: { username: string } }) {
  const profile = PROFILES[params.username];
  if (!profile) notFound();
  const imgs = useMemo(() => imagesForUser(params.username), [params.username]);
  const stats = useMemo(() => statsForUser(params.username), [params.username]);
  const [tab, setTab] = useState<Tab>("photos");
  const [sel, setSel] = useState<ImageItem | null>(null);

  const userClusters = Array.from(new Set(imgs.map((i) => i.cluster)))
    .map((id) => CLUSTERS.find((c) => c.id === id)!)
    .filter(Boolean);

  return (
    <main className="pt-24 pb-16 px-5 md:px-8 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-5">
          <img src={profile.avatar} alt={profile.displayName}
            className="w-20 h-20 rounded-full object-cover border border-ink-line" />
          <div className="flex-1">
            <h1 className="font-display text-4xl tracking-tightest">{profile.displayName}</h1>
            <div className="text-ink-dim text-sm">@{profile.username} · joined {new Date(profile.joined).toLocaleDateString()}</div>
            <p className="mt-1 text-ink text-[15px]">{profile.bio}</p>
          </div>
          <button className="btn-ghost border border-ink-line">Edit profile</button>
        </div>

        <div className="mt-5 flex gap-6 text-sm">
          <Stat label="Photos" value={stats.photos} />
          <Stat label="Clusters" value={stats.clusters} />
          <Stat label="Searches" value={stats.searches} />
        </div>

        {profile.badges.length > 0 && (
          <div className="mt-4 flex gap-2 flex-wrap">
            {profile.badges.map((b) => (
              <span key={b.id} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-cream-soft border border-ink-line">
                <span className="w-1.5 h-1.5 rounded-full bg-dot-orange" /> {b.label}
              </span>
            ))}
          </div>
        )}

        <div className="mt-8 flex gap-1 bg-cream-soft rounded-full p-1 w-max">
          <TabBtn on={tab === "photos"} onClick={() => setTab("photos")}>My Photos</TabBtn>
          <TabBtn on={tab === "collections"} onClick={() => setTab("collections")}>Collections</TabBtn>
          <TabBtn on={tab === "activity"} onClick={() => setTab("activity")}>Activity</TabBtn>
        </div>

        <div className="mt-6">
          {tab === "photos" && (
            imgs.length === 0 ? (
              <div className="text-center py-20 text-ink-dim">No photos yet.</div>
            ) : (
              <div className="columns-2 md:columns-3 lg:columns-4 gap-4">
                {imgs.map((img, i) => (
                  <button key={img.id} onClick={() => setSel(img)}
                    className="mb-4 w-full block break-inside-avoid rounded-xl overflow-hidden bg-white shadow-[0_6px_20px_-10px_rgba(14,14,16,0.18)]"
                  >
                    <div style={{ aspectRatio: ["3/4","4/5","1/1"][i%3] }} className="bg-cream-card">
                      <img src={img.thumb} alt="" className="w-full h-full object-cover" />
                    </div>
                  </button>
                ))}
              </div>
            )
          )}

          {tab === "collections" && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {userClusters.map((c) => {
                const sample = imgs.filter((i) => i.cluster === c.id).slice(0, 4);
                return (
                  <div key={c.id} className="surface rounded-2xl p-3">
                    <div className="grid grid-cols-2 gap-1 aspect-square">
                      {sample.map((s) => (
                        <div key={s.id} className="rounded-md overflow-hidden bg-cream-card">
                          <img src={s.thumb} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-sm font-medium">{c.label}</div>
                    <div className="text-xs text-ink-dim">{sample.length} photos</div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "activity" && (
            <ul className="space-y-2">
              {imgs.slice(0, 8).map((img) => (
                <li key={img.id} className="surface rounded-xl p-3 flex items-center gap-3">
                  <img src={img.thumb} alt="" className="w-12 h-12 rounded-md object-cover" />
                  <div className="flex-1">
                    <div className="text-sm">Added <span className="font-medium">{img.caption}</span></div>
                    <div className="text-xs text-ink-dim">{new Date(img.createdAt).toLocaleString()}</div>
                  </div>
                  <Link href={`/galaxy?focus=${img.id}`} className="text-xs text-ink-dim hover:text-ink">Open →</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ImageModal img={sel} onClose={() => setSel(null)} />
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-2xl font-display tracking-tightest">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-ink-faint">{label}</div>
    </div>
  );
}

function TabBtn({ children, on, onClick }: { children: React.ReactNode; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-full text-xs transition ${on ? "bg-ink text-cream" : "text-ink-dim hover:text-ink"}`}>
      {children}
    </button>
  );
}
