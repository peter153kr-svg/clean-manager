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
