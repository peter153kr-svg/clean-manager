create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  inquiry_id uuid references public.inquiries(id) on delete set null,
  job_date date not null,
  start_time time,
  status text not null default 'scheduled' check (status in ('scheduled','in_progress','completed','cancelled')),
  service_type text,
  address text,
  apartment_name text,
  area_pyeong numeric,
  work_scope text,
  memo text,
  expected_amount integer check (expected_amount is null or expected_amount >= 0),
  final_amount integer check (final_amount is null or final_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  sale_date date not null,
  revenue integer not null default 0 check (revenue >= 0),
  expense integer not null default 0 check (expense >= 0),
  profit integer generated always as (revenue - expense) stored,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','partial')),
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_job_date_idx on public.jobs(job_date);
create index if not exists jobs_status_idx on public.jobs(status);
create index if not exists sales_sale_date_idx on public.sales(sale_date);

drop trigger if exists jobs_updated_at on public.jobs;
create trigger jobs_updated_at before update on public.jobs for each row execute function public.set_updated_at();
drop trigger if exists sales_updated_at on public.sales;
create trigger sales_updated_at before update on public.sales for each row execute function public.set_updated_at();

alter table public.jobs enable row level security;
alter table public.sales enable row level security;
revoke all on public.jobs, public.sales from anon;
grant select, insert, update, delete on public.jobs, public.sales to authenticated;
create policy "authenticated users manage jobs" on public.jobs for all to authenticated using (true) with check (true);
create policy "authenticated users manage sales" on public.sales for all to authenticated using (true) with check (true);
