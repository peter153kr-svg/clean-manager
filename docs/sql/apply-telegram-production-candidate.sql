-- REVIEW CANDIDATE ONLY: production metadata and local DB validation pending.
-- Requires explicit production DDL approval. Execute the complete file atomically.
-- Fresh-install only. Repeat execution fails closed without replacing objects.
-- Never run historical migrations or change migration history with this file.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
DO $preflight$
BEGIN
  IF NOT pg_try_advisory_xact_lock(61025, 1) THEN
    RAISE EXCEPTION 'Another Telegram schema installation is in progress';
  END IF;
  IF to_regclass('public.telegram_schedule_messages') IS NOT NULL
     OR to_regclass('public.telegram_schedule_revisions') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='ingest_telegram_schedule_message')
     OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='public' AND c.relname IN (
                  'telegram_schedule_messages_posted_at_idx',
                  'telegram_schedule_messages_status_idx',
                  'telegram_schedule_revisions_message_idx')) THEN
    RAISE EXCEPTION 'Existing Telegram objects: stop and compare metadata; replacement forbidden';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='set_updated_at'
                   AND p.pronargs=0 AND p.prorettype='trigger'::regtype) THEN
    RAISE EXCEPTION 'Required public.set_updated_at() trigger function missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls)
     OR NOT has_schema_privilege('service_role','public','USAGE') THEN
    RAISE EXCEPTION 'service_role BYPASSRLS/public USAGE prerequisite missing';
  END IF;
  IF to_regprocedure('gen_random_uuid()') IS NULL THEN
    RAISE EXCEPTION 'gen_random_uuid prerequisite missing';
  END IF;
END
$preflight$;
-- Telegram channel posts are captured as reviewable source records.
-- Nothing in this migration creates or changes customer bookings or sales.
create table if not exists public.telegram_schedule_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id bigint not null,
  message_id bigint not null,
  revision_at timestamptz not null,
  posted_at timestamptz not null,
  edited_at timestamptz,
  message_text text,
  attachments jsonb not null default '[]'::jsonb,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'reviewed', 'ignored', 'error')),
  parsed_schedule jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id, message_id)
);

-- Keep an immutable record of received post versions for audit and corrections.
create table if not exists public.telegram_schedule_revisions (
  id uuid primary key default gen_random_uuid(),
  channel_id bigint not null,
  message_id bigint not null,
  revision_at timestamptz not null,
  posted_at timestamptz not null,
  edited_at timestamptz,
  message_text text,
  attachments jsonb not null default '[]'::jsonb,
  received_at timestamptz not null default now(),
  unique (channel_id, message_id, revision_at)
);

create index if not exists telegram_schedule_messages_posted_at_idx
  on public.telegram_schedule_messages(posted_at desc);
create index if not exists telegram_schedule_messages_status_idx
  on public.telegram_schedule_messages(status);
create index if not exists telegram_schedule_revisions_message_idx
  on public.telegram_schedule_revisions(channel_id, message_id, revision_at desc);

drop trigger if exists telegram_schedule_messages_updated_at on public.telegram_schedule_messages;
create trigger telegram_schedule_messages_updated_at
  before update on public.telegram_schedule_messages
  for each row execute function public.set_updated_at();

alter table public.telegram_schedule_messages enable row level security;
alter table public.telegram_schedule_revisions enable row level security;
revoke all on public.telegram_schedule_messages from anon, authenticated;
revoke all on public.telegram_schedule_revisions from anon, authenticated;
grant select on public.telegram_schedule_messages to authenticated;
grant select on public.telegram_schedule_revisions to authenticated;

create policy "authenticated users read telegram schedule inbox"
  on public.telegram_schedule_messages for select to authenticated
  using (true);
create policy "authenticated users read telegram schedule revisions"
  on public.telegram_schedule_revisions for select to authenticated
  using (true);

-- Atomic upsert ensures retried or out-of-order webhooks cannot undo a newer edit.
create or replace function public.ingest_telegram_schedule_message(
  p_channel_id bigint,
  p_message_id bigint,
  p_revision_at timestamptz,
  p_posted_at timestamptz,
  p_edited_at timestamptz,
  p_message_text text,
  p_attachments jsonb
) returns void language sql security invoker set search_path = public as $$
  insert into public.telegram_schedule_revisions (
    channel_id, message_id, revision_at, posted_at, edited_at,
    message_text, attachments
  ) values (
    p_channel_id, p_message_id, p_revision_at, p_posted_at, p_edited_at,
    p_message_text, coalesce(p_attachments, '[]'::jsonb)
  ) on conflict (channel_id, message_id, revision_at) do nothing;

  insert into public.telegram_schedule_messages (
    channel_id, message_id, revision_at, posted_at, edited_at,
    message_text, attachments
  ) values (
    p_channel_id, p_message_id, p_revision_at, p_posted_at, p_edited_at,
    p_message_text, coalesce(p_attachments, '[]'::jsonb)
  )
  on conflict (channel_id, message_id) do update set
    revision_at = excluded.revision_at,
    posted_at = excluded.posted_at,
    edited_at = excluded.edited_at,
    message_text = excluded.message_text,
    attachments = excluded.attachments,
    status = 'pending_review',
    parsed_schedule = null
  where excluded.revision_at > telegram_schedule_messages.revision_at;
$$;

revoke all on function public.ingest_telegram_schedule_message(
  bigint, bigint, timestamptz, timestamptz, timestamptz, text, jsonb
) from public, anon, authenticated;
grant execute on function public.ingest_telegram_schedule_message(
  bigint, bigint, timestamptz, timestamptz, timestamptz, text, jsonb
) to service_role;

-- SECURITY INVOKER requires explicit table privileges in production.
REVOKE ALL ON public.telegram_schedule_messages, public.telegram_schedule_revisions FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.telegram_schedule_messages TO service_role;
GRANT SELECT, INSERT ON public.telegram_schedule_revisions TO service_role;
COMMIT;
