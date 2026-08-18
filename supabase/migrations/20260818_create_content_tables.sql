create table if not exists public.content_projects (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  title text,
  status text not null default 'draft'
    check (status in ('draft', 'review', 'approved', 'published', 'archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_generations (
  id uuid primary key default gen_random_uuid(),
  content_project_id uuid not null references public.content_projects(id) on delete cascade,
  content_type text not null
    check (content_type in ('blog', 'threads', 'reels', 'social', 'captions', 'full_package')),
  model text,
  prompt_version text,
  input_snapshot jsonb not null default '{}'::jsonb,
  output_data jsonb not null default '{}'::jsonb,
  edited_output jsonb,
  status text not null default 'generated'
    check (status in ('generated', 'edited', 'approved', 'discarded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  content_type text not null
    check (content_type in ('blog', 'threads', 'reels', 'social', 'captions', 'full_package')),
  system_instructions text,
  template_text text,
  is_active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_projects_job_id_idx on public.content_projects(job_id);
create index if not exists content_generations_project_id_idx on public.content_generations(content_project_id);
create index if not exists content_templates_type_active_idx on public.content_templates(content_type, is_active);

drop trigger if exists content_projects_updated_at on public.content_projects;
create trigger content_projects_updated_at before update on public.content_projects
for each row execute function public.set_updated_at();

drop trigger if exists content_generations_updated_at on public.content_generations;
create trigger content_generations_updated_at before update on public.content_generations
for each row execute function public.set_updated_at();

drop trigger if exists content_templates_updated_at on public.content_templates;
create trigger content_templates_updated_at before update on public.content_templates
for each row execute function public.set_updated_at();

alter table public.content_projects enable row level security;
alter table public.content_generations enable row level security;
alter table public.content_templates enable row level security;

revoke all on public.content_projects, public.content_generations, public.content_templates from anon;
grant select, insert, update, delete on public.content_projects, public.content_generations, public.content_templates to authenticated;

create policy "authenticated users manage content projects"
on public.content_projects for all to authenticated using (true) with check (true);

create policy "authenticated users manage content generations"
on public.content_generations for all to authenticated using (true) with check (true);

create policy "authenticated users manage content templates"
on public.content_templates for all to authenticated using (true) with check (true);
