# Bliss — see what your images mean

A visual AI explorer. Groups images by meaning, searches in plain words, shows the evidence behind every match. Built for MLH Hacktoberfest Hack Day (open-source / open-weight AI theme).

## Demo moments

1. **Cinematic landing** at `/` — tilted parallax gallery + glass chat/search card.
2. **The galaxy** at `/galaxy` — 3D r3f map with cluster labels, orbit controls, search fly-to, auto-tour.
3. **Live judge participation** — QR on screen → `/join` on phone → photo appears flying into galaxy within ~2s via Supabase realtime.
4. **Explainable search** at `/search` — text, by-image, or sketch; results show bounding boxes + "why it matched".

## Stack

| Layer | Tool |
|---|---|
| Frontend | Next.js 14 (App Router) · TypeScript · Tailwind |
| 3D galaxy | react-three-fiber + drei + three.js |
| Database | Supabase Postgres + `pgvector` |
| Realtime | Supabase Realtime (postgres_changes) |
| Image storage | Cloudinary |
| Auth (stubbed) | Supabase Auth (ready to wire) |
| AI (open-weight, scaffolded) | SigLIP (embeddings) · Gemma 3 (captions/explanations) · UMAP (projection) · HDBSCAN (clustering) |

Mock mode (`NEXT_PUBLIC_MOCK=1`) runs the whole UI offline against local fixtures and `BroadcastChannel` for live-arrival — perfect for a venue with flaky wifi.

## Routes

- `/` landing + chat search
- `/galaxy` 3D/2D embedding map
- `/search` text / image / sketch, with bbox evidence
- `/upload` desktop drag-drop with animated pipeline (Upload → Embed → Caption → Tag → OCR → Place)
- `/join` mobile camera capture + name field
- `/u/[username]` profile with photos, collections, activity, badges
- `/profile` → redirects to current user
- `/login`, `/signup` minimal forms
- `/admin` hidden reset page

## Quickstart

```bash
cd web
cp .env.local.example .env.local         # fill in Supabase + Cloudinary
npm install --legacy-peer-deps
npm run dev
```

Open http://localhost:3000. Flip `NEXT_PUBLIC_MOCK=0` to switch from fixtures to real Supabase + Cloudinary.

### Seed the database (optional)

```bash
# from repo root
node scripts/seed_supabase.mjs
```

Loads 72 picsum-sourced images across 6 clusters into `public.images`.

## Supabase schema

```
clusters(id text pk, label, color, centroid double[])
images(id text pk, url, thumb, caption, tags[], ocr, embedding vector(512),
       x, y, z, cluster_id → clusters, uploader_name, source, created_at)
searches(id uuid pk, user_id, query, created_at)
```

- `vector` extension on.
- RLS enabled; demo policies allow public reads/inserts.
- `public.images` added to `supabase_realtime` publication for INSERT events.

## Live-arrival flow

- `/join` or `/upload` → POST `/api/upload` (multipart → Cloudinary) → INSERT into `public.images`.
- `/galaxy` subscribes to `postgres_changes` on `images`.
- New row triggers a sprite fly-in animation + toast.

In mock mode the same `lib/liveStore.ts` interface uses `BroadcastChannel` + `localStorage` instead.

## Deploy

- **Frontend**: Vercel. Set the same `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_MOCK=0`, and `CLOUDINARY_*` env vars.
- **DB + realtime**: Supabase project (already provisioned in `ap-south-1`).
- **Image storage**: Cloudinary (free tier).

## Open-weight model credits (scaffolded)

| Model | License | Used for |
|---|---|---|
| SigLIP (google/siglip-base-patch16-224) | Apache 2.0 | Shared text/image embeddings |
| Gemma 3 (via Ollama or HF) | Gemma Terms | Captions, tags, "why it matched" explanations, OCR-ish extraction |
| UMAP (umap-learn) | BSD-3 | 3D projection |
| HDBSCAN | BSD-3 | Cluster assignment |

The `vector(512)` column and `/api/*` seams are ready for a FastAPI inference service; the real ML is deferred (Phase 5.5) and the UI stays plausible via deterministic mock search.

## Repo layout

```
HacktoberFest/
├── web/              Next.js app
│   ├── app/          route handlers + pages
│   ├── components/   UI
│   ├── lib/          mock, types, supabase, liveStore, user
│   ├── public/
│   ├── .env.local.example
│   ├── package.json
│   └── ...
├── scripts/
│   └── seed_supabase.mjs
└── README.md
```

## Attribution

Co-built with Claude. Open-source visual explorer prototype — not a product.
