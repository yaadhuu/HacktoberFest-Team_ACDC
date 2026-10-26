# Prism — see what your images mean

Visual AI explorer. Groups images by meaning, searches in natural language, explains every match. Built for MLH Hacktoberfest Hack Day (open-source / open-weight AI theme).

> Status: Phase 0 scaffold. Phases 1–6 fill in the UI, galaxy, live upload, and backend.

## Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind.
- **3D galaxy**: react-three-fiber (Phase 2).
- **Backend**: FastAPI (Phase 5).
- **AI (open-weight)**: SigLIP embeddings, Gemma 3 captions/explanations, UMAP + HDBSCAN clustering.
- **DB / realtime / storage / auth**: Supabase (Postgres + pgvector).

## Quickstart (Phase 0)

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000.

Mock mode is on by default (`NEXT_PUBLIC_MOCK=1`). Backend not required until Phase 5.

## Credits

Models and datasets listed per release in `web/app/about/page.tsx` (Phase 6).
