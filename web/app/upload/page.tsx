"use client";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { unzip } from "fflate";
import RequireAuth from "@/components/RequireAuth";
import { api, type Img } from "@/lib/supabase";

const CONCURRENCY = 3;
const MAX_RETRIES = 3;
const IMAGE_EXT = /\.(jpe?g|png|webp|bmp|gif|tiff?)$/i;

type Status = "queued" | "uploading" | "done" | "duplicate" | "failed";
type Job = { key: string; file: File; status: Status; tries: number; error?: string; image?: Img };
type Counts = Record<Status, number>;
const ZERO: Counts = { queued: 0, uploading: 0, done: 0, duplicate: 0, failed: 0 };

export default function UploadPage() {
  return (
    <RequireAuth>
      <Uploader />
    </RequireAuth>
  );
}

function Uploader() {
  const jobs = useRef<Job[]>([]);
  const seen = useRef(new Set<string>());
  const active = useRef(0);
  const [counts, setCounts] = useState<Counts>(ZERO);
  const [recent, setRecent] = useState<Img[]>([]);
  const [failed, setFailed] = useState<Job[]>([]);
  const [drag, setDrag] = useState(false);
  const [layout, setLayout] = useState<string | null>(null);
  const created = useRef(0);

  const refresh = useCallback(() => {
    const c = { ...ZERO };
    for (const j of jobs.current) c[j.status]++;
    setCounts(c);
    setFailed(jobs.current.filter((j) => j.status === "failed"));
  }, []);

  const rebuild = useCallback(async () => {
    setLayout("Rebuilding galaxy layout (UMAP + HDBSCAN)…");
    try {
      const r = await api<{ clusters: number; images: number }>("/galaxy/rebuild", { method: "POST" });
      setLayout(`Galaxy rebuilt: ${r.images} stars in ${r.clusters} star systems.`);
    } catch (e) {
      setLayout(`Layout rebuild failed: ${(e as Error).message}`);
    }
  }, []);

  const pump = useCallback(() => {
    while (active.current < CONCURRENCY) {
      const job = jobs.current.find((j) => j.status === "queued");
      if (!job) break;
      active.current++;
      job.status = "uploading";
      run(job).finally(() => {
        active.current--;
        refresh();
        pump();
        if (active.current === 0 && !jobs.current.some((j) => j.status === "queued") && created.current > 0) {
          created.current = 0;
          rebuild();
        }
      });
    }
    refresh();
  }, [refresh, rebuild]);

  async function run(job: Job) {
    const fd = new FormData();
    fd.append("file", job.file);
    try {
      const r = await api<{ status: "created" | "duplicate"; image: Img }>("/images", { method: "POST", body: fd });
      job.status = r.status === "duplicate" ? "duplicate" : "done";
      job.image = r.image;
      if (r.status === "created") {
        created.current++;
        setRecent((prev) => [r.image, ...prev].slice(0, 48));
      }
    } catch (e) {
      const msg = (e as Error).message;
      job.tries++;
      const permanent = /^4\d\d/.test(msg);
      if (!permanent && job.tries < MAX_RETRIES) {
        await new Promise((res) => setTimeout(res, 1000 * 3 ** (job.tries - 1)));
        job.status = "queued";
      } else {
        job.status = "failed";
        job.error = msg;
      }
    }
  }

  async function add(files: File[]) {
    const zips = files.filter((f) => /\.zip$/i.test(f.name));
    for (const z of zips) {
      try {
        files = [...files, ...(await unzipImages(z))];
      } catch (e) {
        setLayout(`Could not read ${z.name}: ${(e as Error).message}`);
      }
    }
    for (const f of files) {
      if (!IMAGE_EXT.test(f.name)) continue;
      const key = `${f.webkitRelativePath || f.name}:${f.size}:${f.lastModified}`;
      if (seen.current.has(key)) continue;
      seen.current.add(key);
      jobs.current.push({ key, file: f, status: "queued", tries: 0 });
    }
    pump();
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    const entries = Array.from(e.dataTransfer.items)
      .map((i) => i.webkitGetAsEntry?.())
      .filter(Boolean) as FileSystemEntry[];
    if (!entries.length) return add(Array.from(e.dataTransfer.files));
    add(await walk(entries));
  }

  function retryFailed() {
    for (const j of jobs.current) if (j.status === "failed") { j.status = "queued"; j.tries = 0; j.error = undefined; }
    pump();
  }

  const total = jobs.current.length;
  const finished = counts.done + counts.duplicate + counts.failed;
  const pct = total ? Math.round((finished / total) * 100) : 0;

  return (
    <main className="pt-24 pb-16 px-6 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <h1 className="font-display text-5xl leading-[0.95] tracking-tightest">
          Add photos to your <span className="italic">galaxy.</span>
        </h1>
        <p className="mt-3 text-ink-dim text-[15px] max-w-2xl">
          Drop a whole folder or thousands of files. Each photo is hashed, read for EXIF and colour, checked by a person/object
          detector, classified by SigLIP, and verified by Gemma when the models disagree.
        </p>

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          className={`mt-8 rounded-3xl border border-dashed transition ${drag ? "bg-cream-card border-ink" : "bg-cream-soft border-ink-line"}`}
        >
          <div className="py-14 grid place-items-center text-center px-6 gap-4">
            <div className="font-medium">Drop photos, folders or .zip files here</div>
            <div className="flex gap-2">
              <label className="btn-dark cursor-pointer">
                Choose files
                <input type="file" accept="image/*,.zip,application/zip" multiple hidden onChange={(e) => add(Array.from(e.target.files ?? []))} />
              </label>
              <label className="btn-ghost border border-ink-line cursor-pointer">
                Choose folder
                <input type="file" hidden multiple
                  {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
                  onChange={(e) => add(Array.from(e.target.files ?? []))} />
              </label>
            </div>
            <div className="text-xs text-ink-faint">JPG · PNG · WebP · ZIP archives · up to 30 MB per photo · duplicates are skipped</div>
          </div>
        </div>

        {total > 0 && (
          <section className="mt-8 surface rounded-2xl p-5">
            <div className="flex items-baseline justify-between gap-4 flex-wrap">
              <div className="text-3xl font-display tabular-nums">
                {finished.toLocaleString()} <span className="text-ink-faint">/ {total.toLocaleString()}</span>
              </div>
              <div className="flex gap-4 text-xs text-ink-dim tabular-nums">
                <span>{counts.uploading} processing</span>
                <span>{counts.queued} queued</span>
                <span className="text-dot-green">{counts.done} placed</span>
                <span>{counts.duplicate} duplicates</span>
                <span className={counts.failed ? "text-dot-red" : ""}>{counts.failed} failed</span>
              </div>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-black/5 overflow-hidden">
              <div className="h-full bg-ink transition-all" style={{ width: `${pct}%` }} />
            </div>
            {failed.length > 0 && (
              <div className="mt-4">
                <button onClick={retryFailed} className="btn-ghost border border-ink-line text-xs">Retry {failed.length} failed</button>
                <ul className="mt-2 text-xs text-ink-dim max-h-32 overflow-y-auto space-y-0.5">
                  {failed.slice(0, 50).map((j) => <li key={j.key}>{j.file.name}: {j.error}</li>)}
                </ul>
              </div>
            )}
            {layout && <div className="mt-4 text-sm">{layout} {layout.startsWith("Galaxy") && <Link href="/galaxy" className="underline ml-1">Open galaxy →</Link>}</div>}
          </section>
        )}

        {recent.length > 0 && (
          <div className="mt-6 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {recent.map((img) => (
              <div key={img.id} className="rounded-xl overflow-hidden surface">
                <div className="aspect-square bg-cream-card"><img src={img.thumb} alt={img.caption ?? ""} className="w-full h-full object-cover" /></div>
                <div className="p-2">
                  <div className="text-[11px] font-medium truncate">{img.primary_category}</div>
                  <div className="text-[10px] text-ink-faint truncate" title={img.rationale ?? ""}>
                    {img.verified_by && img.verified_by !== "none" ? "verified · " : ""}{img.caption}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

async function walk(entries: FileSystemEntry[]): Promise<File[]> {
  const out: File[] = [];
  for (const e of entries) {
    if (e.isFile) {
      out.push(await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej)));
    } else if (e.isDirectory) {
      const reader = (e as FileSystemDirectoryEntry).createReader();
      let batch: FileSystemEntry[];
      do {
        batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        out.push(...(await walk(batch)));
      } while (batch.length);
    }
  }
  return out;
}

/** Unzip in the browser (fflate, off-main-thread for large entries); keep image entries only. */
async function unzipImages(zip: File): Promise<File[]> {
  const buf = new Uint8Array(await zip.arrayBuffer());
  const entries = await new Promise<Record<string, Uint8Array>>((res, rej) =>
    unzip(buf, { filter: (f) => IMAGE_EXT.test(f.name) && !/(^|\/)(__MACOSX|\.)/.test(f.name) }, (err, out) => (err ? rej(err) : res(out))),
  );
  return Object.entries(entries).map(([path, data]) => {
    const name = path.split("/").pop()!;
    const ext = name.split(".").pop()!.toLowerCase();
    const type = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
    return new File([data], path.replaceAll("/", "_"), { type, lastModified: zip.lastModified });
  });
}
