// Explicit local transport verification only. No database client is invoked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { encodeCredentialFrame, readonlySourceShell } from '../scripts/lib/production-backup-policy.mjs';

test('shared source wrapper delivers all supplied fields to a network-isolated fake client', () => {
  const fixture = { host:'aws-1-ap-south-1.pooler.supabase.com',user:'postgres.abcdefghijklmnopqrst',
    port:'5432',password:'SYNTHETIC-ONLY-한글-"-quote-\\-$-&-not-a-real-password' };
  const fingerprint = createHash('sha256').update(fixture.password,'utf8').digest('hex');
  const checker = `test "$PGHOST" = "${fixture.host}" &&
    test "$PGUSER" = "${fixture.user}" && test "$PGPORT" = "${fixture.port}" &&
    test "$PGSSLMODE" = verify-full && test "$PGSSLROOTCERT" = system &&
    test "$PGDATABASE" = postgres &&
    case "$PGOPTIONS" in *default_transaction_read_only=on*) true;; *) exit 6;; esac &&
    test "$(printf '%s' "$PGPASSWORD" | sha256sum | cut -d ' ' -f 1)" = '${fingerprint}' &&
    printf 'SYNTHETIC_TRANSPORT_PASS'`;
  const args = ['--context','desktop-linux','run','--rm','--pull','never','--network','none',
    '--read-only','--no-healthcheck','--cap-drop','ALL','--security-opt','no-new-privileges',
    '--user','postgres','--log-driver','none','-i','--entrypoint','/bin/sh',
    'public.ecr.aws/supabase/postgres:17.11.0.006','-c',readonlySourceShell,'synthetic-only',
    '/bin/sh','-c',checker];
  assert.equal(args.some(arg=>arg.includes(fixture.password)),false);
  const r=spawnSync('C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',args,
    {input:encodeCredentialFrame(fixture),encoding:'utf8',windowsHide:true,timeout:30000});
  assert.equal(r.status,0,'Synthetic transport failed; raw stderr intentionally omitted');
  assert.equal(r.stdout,'SYNTHETIC_TRANSPORT_PASS');
  assert.equal((r.stdout+r.stderr).includes(fixture.password),false);
});
