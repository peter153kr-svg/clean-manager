// Disposable database inside the explicitly named LOCAL Supabase container only.
// No Supabase cloud CLI, env files, network DB URLs, or customer rows are used.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

if (process.argv.length !== 2) throw new Error('No arguments accepted');
const root = fileURLToPath(new URL('../', import.meta.url));
const container = 'supabase_db_clean-manager-local';
const database = `telegram_candidate_${randomUUID().replaceAll('-', '')}`;
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (/^(SUPABASE_|NEXT_PUBLIC_SUPABASE_|DATABASE_URL$|PG|TELEGRAM_|VERCEL_)/i.test(key)) delete env[key];
}
function docker(args, input, allowFailure = false) {
  const result = spawnSync('docker', args, {
    cwd: root, env, input, encoding: 'utf8', windowsHide: true, timeout: 120000,
  });
  if (result.error || (!allowFailure && result.status !== 0)) {
    throw new Error(result.error?.message || result.stderr || 'Local Docker command failed');
  }
  return result;
}
function sql(text, allowFailure = false, db = database) {
  return docker(['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', db, '-A', '-t'], text, allowFailure);
}
const read = (name) => readFileSync(new URL(name, new URL('../', import.meta.url)), 'utf8');
const inspection = JSON.parse(docker(['inspect', container]).stdout)[0];
if (!inspection.State.Running || !inspection.Config.Image.includes('supabase/postgres') ||
    !inspection.NetworkSettings.Ports['5432/tcp']?.some((port) => port.HostPort === '55322')) {
  throw new Error('Refusing unexpected local database container/image/port');
}
let created = false;
try {
  sql(`CREATE DATABASE ${database};`, false, 'postgres');
  created = true;
  // Match the local Supabase bootstrap grants for pgTAP assertions after SET ROLE.
  sql('CREATE SCHEMA IF NOT EXISTS extensions; GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;');
  const candidate = read('docs/sql/apply-telegram-production-candidate.sql');
  const missing = sql(candidate, true);
  if (missing.status === 0 || !missing.stderr.includes('trigger function missing')) {
    throw new Error('Missing prerequisite was not rejected');
  }
  console.log('PASS: missing shared trigger function rejected');
  // Fresh local fixture only: never replay these on production.
  for (const name of [
    '20260817_create_customers_and_inquiries.sql',
    '20260818_create_jobs_and_sales.sql',
    '20260818_create_content_tables.sql',
    '20260818_create_media_assets.sql',
    '20260819_add_homepage_inquiry_source.sql',
  ]) sql(read(`supabase/migrations/${name}`));
  // Capture existing objects individually, including columns, constraints,
  // ACLs, policies, indexes and triggers, without reading any data rows.
  const tables = ['customers', 'inquiries', 'jobs', 'sales', 'content_projects',
    'content_generations', 'content_templates', 'media_assets'];
  const snapshot = () => docker(['exec', container, 'pg_dump', '-U', 'postgres', '-d', database,
    '--schema-only', ...tables.flatMap((table) => ['-t', `public.${table}`])]).stdout
    .split('\n').filter((line) => !/^\\(un)?restrict /.test(line)).join('\n');
  const before = snapshot();
  sql(read('docs/sql/inspect-production-migrations-readonly.sql'));
  sql('CREATE TABLE public.telegram_schedule_messages (synthetic_sentinel text);');
  const partial = sql(candidate, true);
  if (partial.status === 0 || !partial.stderr.includes('Existing Telegram objects') ||
      sql("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='telegram_schedule_messages';").stdout.trim() !== 'synthetic_sentinel' ||
      snapshot() !== before) {
    throw new Error('Partial installation was not preserved');
  }
  sql('DROP TABLE public.telegram_schedule_messages;');
  console.log('PASS: conflicting partial installation rejected without replacement');
  sql(candidate);
  if (snapshot() !== before) throw new Error('Existing CRM/content schema changed');
  console.log('PASS: first application preserves existing CRM/content schema');
  const allSchema = () => docker(['exec', container, 'pg_dump', '-U', 'postgres', '-d', database,
    '--schema-only', '--schema=public']).stdout
    .split('\n').filter((line) => !/^\\(un)?restrict /.test(line)).join('\n');
  const after = allSchema();
  const repeat = sql(candidate, true);
  if (repeat.status === 0 || !repeat.stderr.includes('Existing Telegram objects')) {
    throw new Error('Repeat execution did not fail closed as expected');
  }
  if (snapshot() !== before) throw new Error('Repeat application changed existing schema');
  if (allSchema() !== after) throw new Error('Repeat application changed Telegram schema');
  console.log('PASS: repeat application rejected before replacement');
  const tests = sql(read('supabase/tests/telegram_schedule.sql')).stdout;
  console.log(tests);
  if (/not ok|Looks like you failed/.test(tests) || !tests.includes('1..31') ||
      tests.split('\n').filter((line) => /^ok \d+ -/.test(line)).length !== 31) {
    throw new Error('Telegram pgTAP tests failed or did not run');
  }
} finally {
  if (created) sql(`DROP DATABASE ${database};`, false, 'postgres');
}
