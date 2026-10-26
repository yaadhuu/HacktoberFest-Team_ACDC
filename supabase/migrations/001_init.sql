-- Bliss v1 base schema. Run this first, then 002_pipeline_auth.sql (Supabase Dashboard -> SQL Editor).
create extension if not exists vector;

create table if not exists public.images (
  id text primary key,
  user_id uuid null,
  url text not null,
  thumb text not null,
  caption text default '',
  tags text[] default '{}',
  ocr text default null,
  embedding vector(512) default null,   -- resized to 768 by 002
  x double precision not null default 0,
  y double precision not null default 0,
  z double precision not null default 0,
  cluster_id text,
  uploader_name text default null,
  source text default 'preloaded',
  created_at timestamptz not null default now()
);
create index if not exists images_cluster_idx on public.images(cluster_id);
create index if not exists images_created_idx on public.images(created_at desc);

create table if not exists public.searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  query text not null,
  created_at timestamptz not null default now()
);

alter table public.images   enable row level security;
alter table public.searches enable row level security;

-- stream new photos to open galaxies
alter publication supabase_realtime add table public.images;
