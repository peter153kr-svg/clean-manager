create extension if not exists pgcrypto;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(), name text not null, phone text not null,
  address text, apartment_name text, area_pyeong numeric, memo text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id) on delete restrict,
  inquiry_date date not null default current_date, source text not null check (source in ('네이버','블로그','플레이스','스레드','인스타그램','지인','입주민커뮤니티','광고','기타')),
  region text, apartment_name text, area_pyeong numeric, content text, estimated_amount integer check (estimated_amount is null or estimated_amount >= 0),
  status text not null default 'new' check (status in ('new','consulting','quote_sent','reserved','completed','cancelled','hold')),
  memo text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists inquiries_customer_id_idx on public.inquiries(customer_id);
create index if not exists inquiries_status_idx on public.inquiries(status);
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists customers_updated_at on public.customers; create trigger customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
drop trigger if exists inquiries_updated_at on public.inquiries; create trigger inquiries_updated_at before update on public.inquiries for each row execute function public.set_updated_at();
alter table public.customers enable row level security; alter table public.inquiries enable row level security;
revoke all on public.customers, public.inquiries from anon;
grant select, insert, update, delete on public.customers, public.inquiries to authenticated;
create policy "authenticated users manage customers" on public.customers for all to authenticated using (true) with check (true);
create policy "authenticated users manage inquiries" on public.inquiries for all to authenticated using (true) with check (true);
