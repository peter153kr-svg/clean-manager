import test from 'node:test';
import assert from 'node:assert/strict';
import { approveBackupCredentials, encodeCredentialFrame } from '../scripts/lib/production-backup-policy.mjs';
const ref = 'abcdefghijklmnopqrst';
const url = `https://${ref}.supabase.co`;
const sentinel = 'SYNTHETIC-ONLY-NOT-A-REAL-PASSWORD-한글';
test('approved Dashboard host/user/port are preserved exactly', () => {
  for (const [host, user] of [['aws-1-ap-south-1.pooler.supabase.com', `postgres.${ref}`]]) {
    const approved = approveBackupCredentials({ host, password: sentinel, user, port: '5432' }, url);
    assert.equal(approved.host, host);
    assert.equal(approved.user, user);
    assert.equal(approved.port, '5432');
    assert.equal(approved.password, sentinel);
  }
});
test('unrelated hosts, deceptive suffixes, URI input and another direct project are rejected', () => {
  for (const host of ['localhost', 'evil.example', `db.${ref}.supabase.co.evil.example`,
    'aws-1-ap-south-1.pooler.supabase.com.evil.example',
    'postgresql://user:password@localhost/postgres', `db.${'z'.repeat(20)}.supabase.co`, `db.${ref}.supabase.co`]) {
    assert.throws(() => approveBackupCredentials({ host, user: `postgres.${ref}`, port: '5432', password: sentinel }, url),
      error => error.safeKind === 'host-not-approved' && !error.message.includes(sentinel));
  }
});
test('empty, multiline and NUL passwords cannot alter the stdin framing', () => {
  for (const password of ['', 'a\nb', 'a\rb', 'a\0b']) {
    assert.throws(() => approveBackupCredentials({ host: `db.${ref}.supabase.co`, user: 'postgres', port: '5432', password }, url),
      error => error.safeKind === 'credential-input-invalid');
  }
});
test('invalid expected application URLs cannot authorize a source', () => {
  for (const applicationUrl of ['http://'+ref+'.supabase.co', 'not-a-url',
    'https://'+ref+'.supabase.co.evil.example']) {
    assert.throws(() => approveBackupCredentials({ host: `db.${ref}.supabase.co`, user: 'postgres', port: '5432', password: sentinel }, applicationUrl),
      error => error.safeKind === 'expected-project-invalid' && !error.message.includes(sentinel));
  }
});
test('pooler postgres without project suffix and another project are rejected, not corrected', () => {
  for (const user of ['postgres', `postgres.${'z'.repeat(20)}`, `postgres.${ref}\ninjected`]) {
    assert.throws(() => approveBackupCredentials({ host:'aws-1-ap-south-1.pooler.supabase.com',
      user, port:'5432', password:sentinel },url), error => error.safeKind==='dashboard-user-mismatch');
  }
});
test('missing, malformed and transaction-pooler ports are rejected without fallback', () => {
  for (const port of [undefined, 5432, '', '6543', '5432\n1', '05432']) {
    assert.throws(() => approveBackupCredentials({host:'aws-1-ap-south-1.pooler.supabase.com',
      user:`postgres.${ref}`,port,password:sentinel},url));
  }
});
test('UTF-8 framing includes the provided host/user/port/password in order without shell interpolation', () => {
  const input={host:'aws-1-ap-south-1.pooler.supabase.com',user:`postgres.${ref}`,port:'5432',
    password:sentinel+String.raw` $ \ " ' & |`};
  const approved=approveBackupCredentials(input,url);
  assert.deepEqual(encodeCredentialFrame(approved).toString('utf8').split('\n'),
    [input.host,input.user,input.port,input.password,'']);
});
