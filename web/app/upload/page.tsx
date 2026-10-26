"use client";
import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { addLive } from "@/lib/liveStore";

type Step = "upload" | "embed" | "caption" | "tag" | "ocr" | "place" | "done";
const STEPS: { k: Step; label: string }[] = [
  { k: "upload",  label: "Uploading" },
  { k: "embed",   label: "Embedding (SigLIP)" },
  { k: "caption", label: "Captioning (Gemma 3)" },
  { k: "tag",     label: "Tagging" },
  { k: "ocr",     label: "OCR" },
  { k: "place",   label: "Placing in galaxy" },
];

type Job = {
  id: string;
  name: string;
  dataUrl: string;
  stepIdx: number;
  done: boolean;
};

export default function UploadPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files).slice(0, 10)) runJob(f, setJobs);
  }, []);

  return (
    <main className="pt-24 pb-12 px-6 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="text-xs tracking-[0.2em] uppercase text-ink-faint mb-3">Upload</div>
        <h1 className="font-display text-5xl leading-[0.95] tracking-tightest text-ink">
          Add images to the <span className="italic">library.</span>
        </h1>
        <p className="mt-3 text-ink-dim text-[15px] max-w-xl">
          Drop files or pick from your computer. Each one runs through embed → caption → tag → OCR → placement.
        </p>

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`mt-8 rounded-3xl border border-dashed transition cursor-pointer ${
            drag ? "bg-cream-card border-ink" : "bg-cream-soft border-ink-line hover:bg-cream-card"
          }`}
        >
          <div className="h-56 grid place-items-center text-center px-6">
            <div>
              <div className="w-14 h-14 mx-auto rounded-full bg-ink text-cream grid place-items-center mb-3">
                <IconPlus />
              </div>
              <div className="font-medium">Drop images here, or click to pick</div>
              <div className="text-xs text-ink-dim mt-1">PNG / JPG / WebP · up to 10 at a time</div>
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => addFiles(e.target.files)}
            className="hidden"
          />
        </div>

        {jobs.length > 0 && (
          <div className="mt-10 space-y-3">
            {jobs.map((j) => (
              <JobRow key={j.id} job={j} />
            ))}
            <div className="pt-4">
              <Link href="/galaxy" className="btn-dark">Open the galaxy →</Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function JobRow({ job }: { job: Job }) {
  return (
    <div className="surface rounded-2xl p-3 flex items-center gap-4">
      <div className="w-20 h-20 rounded-lg overflow-hidden bg-black/5 shrink-0">
        <img src={job.dataUrl} alt="" className="w-full h-full object-cover" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{job.name}</div>
        <div className="mt-2 flex items-center gap-2">
          {STEPS.map((s, i) => {
            const state = i < job.stepIdx ? "done" : i === job.stepIdx ? "active" : "idle";
            return (
              <div key={s.k} className="flex items-center gap-1 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    state === "done" ? "bg-dot-green"
                      : state === "active" ? "bg-ink animate-pulseDot"
                      : "bg-ink/15"
                  }`}
                />
                <span className={`text-[11px] truncate ${
                  state === "idle" ? "text-ink-faint" : "text-ink-dim"
                }`}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && <span className="text-ink-faint mx-1">·</span>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="text-xs">
        {job.done ? (
          <span className="inline-flex items-center gap-1 text-dot-green">
            <span className="w-1.5 h-1.5 rounded-full bg-dot-green" /> Placed
          </span>
        ) : (
          <span className="text-ink-dim">Processing</span>
        )}
      </div>
    </div>
  );
}

function runJob(file: File, setJobs: React.Dispatch<React.SetStateAction<Job[]>>) {
  const reader = new FileReader();
  reader.onload = () => {
    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const dataUrl = reader.result as string;
    const job: Job = { id, name: file.name, dataUrl, stepIdx: 0, done: false };
    setJobs((j) => [job, ...j]);
    let idx = 0;
    const tick = async () => {
      idx++;
      setJobs((prev) => prev.map((p) => (p.id === id ? { ...p, stepIdx: idx } : p)));
      if (idx < STEPS.length) {
        setTimeout(tick, 650);
      } else {
        try {
          await addLive({ file, dataUrl, uploader: "You" });
          setJobs((prev) => prev.map((p) => (p.id === id ? { ...p, done: true } : p)));
        } catch (e) {
          console.error(e);
          setJobs((prev) => prev.map((p) => (p.id === id ? { ...p, done: true } : p)));
        }
      }
    };
    setTimeout(tick, 500);
  };
  reader.readAsDataURL(file);
}

const IconPlus = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
