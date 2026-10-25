begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(31);

select has_table('public', 'customers', 'Existing customer table is present');
select has_table('public', 'inquiries', 'Existing inquiry table is present');
select has_table('public', 'jobs', 'Existing job table is present');
select has_table('public', 'sales', 'Existing sales table is present');
select has_table('public', 'content_projects', 'Content foreign key dependency is satisfied');
select has_table('public', 'media_assets', 'Media foreign key dependency is satisfied');
select ok((select relrowsecurity from pg_class where oid = 'public.telegram_schedule_messages'::regclass), 'Inbox RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.telegram_schedule_revisions'::regclass), 'Revision RLS enabled');

set local role service_role;
select public.ingest_telegram_schedule_message(-1001234567890, 11, '2026-10-25 01:00:00Z', '2026-10-25 01:00:00Z', null, 'original', '[]');
reset role;
select is((select count(*) from public.telegram_schedule_messages), 1::bigint, 'New post creates one inbox row');
select is((select count(*) from public.telegram_schedule_revisions), 1::bigint, 'New post creates one revision');

set local role service_role;
select public.ingest_telegram_schedule_message(-1001234567890, 11, '2026-10-25 01:00:00Z', '2026-10-25 01:00:00Z', null, 'original', '[]');
select public.ingest_telegram_schedule_message(-1001234567890, 11, '2026-10-25 02:00:00Z', '2026-10-25 01:00:00Z', '2026-10-25 02:00:00Z', 'edited', '[{"type":"photo","file_id":"synthetic-photo"}]');
select public.ingest_telegram_schedule_message(-1001234567890, 11, '2026-10-25 02:00:00Z', '2026-10-25 01:00:00Z', '2026-10-25 02:00:00Z', 'edited', '[]');
reset role;
select is((select count(*) from public.telegram_schedule_messages), 1::bigint, 'Retries and edit retain one inbox row');
select is((select count(*) from public.telegram_schedule_revisions), 2::bigint, 'Retries do not duplicate revisions');
select is((select message_text from public.telegram_schedule_messages), 'edited', 'Latest edit is displayed');
select is((select attachments->0->>'file_id' from public.telegram_schedule_messages), 'synthetic-photo', 'Duplicate revision does not replace attachments');

update public.telegram_schedule_messages set status = 'reviewed', parsed_schedule = '{"approved":true}';
set local role service_role;
select public.ingest_telegram_schedule_message(-1001234567890, 11, '2026-10-25 01:30:00Z', '2026-10-25 01:00:00Z', '2026-10-25 01:30:00Z', 'older-delayed', '[]');
reset role;
select is((select message_text from public.telegram_schedule_messages), 'edited', 'Out-of-order revision cannot undo latest edit');
select is((select status from public.telegram_schedule_messages), 'reviewed', 'Stale revision does not reset review status');
select is((select count(*) from public.telegram_schedule_revisions), 3::bigint, 'Delayed revision retained in history');

set local role service_role;
select public.ingest_telegram_schedule_message(-1001234567890, 11, '2026-10-25 03:00:00Z', '2026-10-25 01:00:00Z', '2026-10-25 03:00:00Z', 'newest', '[]');
reset role;
select ok((select status = 'pending_review' and parsed_schedule is null from public.telegram_schedule_messages), 'Newer edit requires a fresh review');

select ok(not has_table_privilege('anon', 'public.telegram_schedule_messages', 'SELECT'), 'Anonymous read denied');
select ok(has_table_privilege('authenticated', 'public.telegram_schedule_messages', 'SELECT'), 'Authenticated read granted');
select ok(not has_table_privilege('authenticated', 'public.telegram_schedule_messages', 'INSERT, UPDATE, DELETE'), 'Authenticated writes denied');
select ok(not has_function_privilege('authenticated', 'public.ingest_telegram_schedule_message(bigint,bigint,timestamptz,timestamptz,timestamptz,text,jsonb)', 'EXECUTE'), 'Authenticated RPC denied');
select ok(not has_function_privilege('anon', 'public.ingest_telegram_schedule_message(bigint,bigint,timestamptz,timestamptz,timestamptz,text,jsonb)', 'EXECUTE'), 'Anonymous RPC denied');

set local role authenticated;
select is((select count(*) from public.telegram_schedule_messages), 1::bigint, 'Authenticated role can actually read the inbox');
select throws_ok($$insert into public.telegram_schedule_messages(channel_id,message_id,revision_at,posted_at) values (-1001234567890,99,now(),now())$$, '42501', null, 'Authenticated insert blocked');
select throws_ok($$update public.telegram_schedule_messages set message_text = 'denied'$$, '42501', null, 'Authenticated update blocked');
select throws_ok($$delete from public.telegram_schedule_messages$$, '42501', null, 'Authenticated delete blocked');
select throws_ok($$select public.ingest_telegram_schedule_message(-1001234567890,99,now(),now(),null,'denied','[]')$$, '42501', null, 'Authenticated RPC invocation blocked');
reset role;
set local role anon;
select throws_ok($$select * from public.telegram_schedule_messages$$, '42501', null, 'Anonymous inbox read blocked');
select throws_ok($$select * from public.telegram_schedule_revisions$$, '42501', null, 'Anonymous history read blocked');
select throws_ok($$select public.ingest_telegram_schedule_message(-1001234567890,99,now(),now(),null,'denied','[]')$$, '42501', null, 'Anonymous RPC invocation blocked');
reset role;

select * from finish();
rollback;
