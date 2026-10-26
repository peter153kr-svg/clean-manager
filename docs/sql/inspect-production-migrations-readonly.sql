-- Read-only metadata inspection. Never run migration/repair/push/reset here.
-- Phase 1: run this first. If history_table is NULL, there is no CLI history
-- table; do not infer that existing application tables have not been created.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '1s';
SELECT to_regclass('supabase_migrations.schema_migrations') AS history_table;
-- Complete public schema metadata, including homepage/content dependencies.
-- Never SELECT application rows, storage.objects rows, or auth.users rows.
SELECT table_name, ordinal_position, column_name, data_type, udt_name,
       is_nullable, column_default
FROM information_schema.columns WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' ORDER BY tablename, indexname;
SELECT c.relname AS table_name, k.conname, k.contype,
       pg_get_constraintdef(k.oid) AS definition
FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' ORDER BY c.relname, k.conname;
SELECT c.relname AS table_name, t.tgname, pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal ORDER BY c.relname, t.tgname;
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
       has_table_privilege('service_role', c.oid, 'SELECT') AS service_select,
       has_table_privilege('service_role', c.oid, 'INSERT') AS service_insert,
       has_table_privilege('service_role', c.oid, 'UPDATE') AS service_update,
       has_table_privilege('service_role', c.oid, 'DELETE') AS service_delete
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY c.relname;
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_functiondef(p.oid) AS definition, p.prosecdef,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f' ORDER BY p.proname, p.oid;
SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = 'service_role';
SELECT has_schema_privilege('service_role', 'public', 'USAGE') AS service_schema_usage;
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
