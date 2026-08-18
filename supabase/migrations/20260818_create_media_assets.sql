create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  storage_path text not null unique,
  original_filename text,
  display_name text,
  category text not null default 'other' check (category in ('before','during','after','detail','result','other')),
  description text,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists media_assets_job_sort_idx on public.media_assets(job_id, sort_order, created_at);
drop trigger if exists media_assets_updated_at on public.media_assets;
create trigger media_assets_updated_at before update on public.media_assets for each row execute function public.set_updated_at();
alter table public.media_assets enable row level security;
revoke all on public.media_assets from anon;
grant select, insert, update, delete on public.media_assets to authenticated;
create policy "authenticated users manage media assets" on public.media_assets for all to authenticated using (true) with check (true);
