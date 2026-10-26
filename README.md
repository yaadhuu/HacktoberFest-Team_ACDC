# Bliss — see what your images mean

A visual AI explorer. Groups images by meaning, searches in plain words, shows the evidence behind every match. Built for MLH Hacktoberfest Hack Day (open-source / open-weight AI theme).

## Demo moments

1. **Cinematic landing** at `/` — tilted parallax gallery + glass chat/search card.
2. **The galaxy** at `/galaxy` — 3D r3f map with cluster labels, orbit controls, search fly-to, auto-tour.
3. **Live judge participation** — QR on screen → `/join` on phone → photo appears flying into galaxy within ~2s via Supabase realtime.
4. **Explainable search** at `/search` — text, by-image, or sketch; results show bounding boxes + "why it matched".

## How it works

Each user gets a private galaxy: every photo is a star, clusters (UMAP 3D + HDBSCAN) are star systems.

Upload pipeline (`api/`, FastAPI): preprocess (validation, sha256 + pHash dedupe, EXIF, palette) -> detect (YOLO11n + faces; a detected person is never overridden by a weaker label) -> classify (SigLIP zero-shot over a hierarchical taxonomy, prompt ensembling, multi-label) -> verify (Gemma 4 via Gemini API when confidence is low, margins are close, or detector and classifier disagree) -> dynamic categories (merged by embedding similarity) -> Cloudinary signed upload -> Supabase insert (pgvector). Results are cached by sha256; a processed image never hits the models or Gemini twice.

## Models (all open-weight)

| Model | License | Use |
|---|---|---|
| google/siglip-base-patch16-224 | Apache 2.0 | image/text embeddings, zero-shot classification, search |
| Ultralytics YOLO11n | AGPL-3.0 | object and person detection |
| OpenCV Haar cascade | Apache 2.0 | face count |
| Gemma 4 (gemma-4-26b-a4b-it, Gemini API) | Gemma terms | verifier, captions, search evidence, cluster names |
| umap-learn / scikit-learn HDBSCAN | BSD-3 | galaxy layout and clustering |

## Eval

`cd api && python eval.py [--verify]`: 69 hand-checked images (65 Wikimedia Commons, 4 synthetic). SigLIP+YOLO alone: 92.8% overall; the "person classified as food" cases pass. Exit code 1 if any person lands in food.

## Run

```bash
# DB: run supabase/migrations/002_pipeline_auth.sql in the Supabase SQL editor
cd api && uv venv -p 3.12 .venv && uv pip install -p .venv/Scripts/python.exe -r requirements.txt
cp .env.example .env   # fill in keys
.venv/Scripts/python.exe -m uvicorn app:app --port 8000
cd ../web && cp .env.local.example .env.local && npm install --legacy-peer-deps && npm run dev
```

Notes: needs about 2 GB RAM for the models. On Windows, `ultralytics` must be imported before SigLIP loads (already handled).

## Cut for time

Lasso/multi-select and bulk actions, album/cluster rename-merge-split, timeline view, minimap, 2D/3D toggle, duplicate finder UI (duplicates are skipped at upload), color/date/people filters. Category filter, find-similar, favorites, delete and download are in.

