-- Read-only metadata inspection. Never run migration/repair/push/reset here.
-- Phase 1: run this first. If history_table is NULL, there is no CLI history
-- table; do not infer that existing application tables have not been created.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '1s';
SELECT to_regclass('supabase_migrations.schema_migrations') AS history_table;
SELECT n.nspname AS schema_name, c.relname AS object_name, c.relrowsecurity AS rls_enabled,
       has_table_privilege('service_role', c.oid, 'SELECT') AS service_select,
       has_table_privilege('service_role', c.oid, 'INSERT') AS service_insert,
       has_table_privilege('service_role', c.oid, 'UPDATE') AS service_update
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN (
  'customers', 'inquiries', 'jobs', 'sales',
  'telegram_schedule_messages', 'telegram_schedule_revisions'
) AND c.relkind IN ('r', 'p')
ORDER BY c.relname;
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('set_updated_at', 'ingest_telegram_schedule_message');
SELECT tablename, policyname, roles, cmd
FROM pg_policies WHERE schemaname = 'public'
AND tablename IN ('telegram_schedule_messages', 'telegram_schedule_revisions')
ORDER BY tablename, policyname;
ROLLBACK;

-- Phase 2: execute separately ONLY if Phase 1 returns a non-NULL history_table.
-- BEGIN TRANSACTION READ ONLY;
-- SET LOCAL statement_timeout = '10s';
-- SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
-- ROLLBACK;
