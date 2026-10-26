-- Bliss v2: real pipeline fields, SigLIP-base embeddings (768), per-user RLS.
-- Non-destructive: no rows or tables are deleted. Old global `clusters` table is left unused.
-- Run in Supabase Dashboard -> SQL Editor.

alter table public.images drop constraint if exists images_cluster_id_fkey;
alter table public.images alter column embedding type vector(768);
alter table public.images
  add column if not exists sha256 text,
  add column if not exists phash text,
  add column if not exists width int,
  add column if not exists height int,
  add column if not exists taken_at timestamptz,
  add column if not exists gps_lat double precision,
  add column if not exists gps_lng double precision,
  add column if not exists camera text,
  add column if not exists palette text[] default '{}',
  add column if not exists categories text[] default '{}',
  add column if not exists primary_category text,
  add column if not exists category_scores jsonb default '{}'::jsonb,
  add column if not exists detections jsonb default '[]'::jsonb,
  add column if not exists people_count int default 0,
  add column if not exists verified_by text default 'none',
  add column if not exists rationale text,
  add column if not exists cloudinary_public_id text,
  add column if not exists favorite boolean default false;
alter table public.images alter column user_id set default auth.uid();
create unique index if not exists images_user_sha_uniq on public.images(user_id, sha256);
create index if not exists images_user_idx on public.images(user_id);
create index if not exists images_embedding_hnsw on public.images using hnsw (embedding vector_cosine_ops);

create table if not exists public.user_clusters (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null,
  size int not null default 0,
  cx double precision default 0, cy double precision default 0, cz double precision default 0,
  created_at timestamptz default now()
);

create table if not exists public.categories (
  slug text primary key,
  label text not null,
  parent text,
  prompts text[] default '{}',
  embedding vector(768),
  is_dynamic boolean default true,
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);

create table if not exists public.explanations (
  image_id text references public.images(id) on delete cascade,
  query text not null,
  result jsonb not null,
  created_at timestamptz default now(),
  primary key (image_id, query)
);

-- replace open demo policies with owner-only
drop policy if exists "images read" on public.images;
drop policy if exists "images insert" on public.images;
create policy images_owner_select on public.images for select to authenticated using (user_id = auth.uid());
create policy images_owner_insert on public.images for insert to authenticated with check (user_id = auth.uid());
create policy images_owner_update on public.images for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy images_owner_delete on public.images for delete to authenticated using (user_id = auth.uid());

alter table public.user_clusters enable row level security;
create policy user_clusters_owner on public.user_clusters for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.categories enable row level security;
create policy categories_read on public.categories for select to authenticated using (true);
create policy categories_insert on public.categories for insert to authenticated with check (created_by = auth.uid());

alter table public.explanations enable row level security;
create policy explanations_owner on public.explanations for all to authenticated
  using (exists (select 1 from public.images i where i.id = image_id and i.user_id = auth.uid()))
  with check (exists (select 1 from public.images i where i.id = image_id and i.user_id = auth.uid()));

drop policy if exists "searches read" on public.searches;
drop policy if exists "searches insert" on public.searches;
alter table public.searches alter column user_id set default auth.uid();
create policy searches_owner on public.searches for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.match_images(query_embedding vector(768), match_count int default 50)
returns table (id text, similarity double precision)
language sql stable security invoker set search_path = public, extensions
as $$
  select i.id, 1 - (i.embedding <=> query_embedding)
  from public.images i
  where i.embedding is not null and i.user_id = auth.uid()
  order by i.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.update_layout(payload jsonb)
returns void language sql security invoker set search_path = public
as $$
  update public.images i set x = p.x, y = p.y, z = p.z, cluster_id = p.cluster_id
  from jsonb_to_recordset(payload) as p(id text, x double precision, y double precision, z double precision, cluster_id text)
  where i.id = p.id and i.user_id = auth.uid();
$$;
