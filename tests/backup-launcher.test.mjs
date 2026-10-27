import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchBackupProcess, promptOutput } from '../scripts/lib/backup-launcher.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
test('one-command preparation never requests a password or starts production',()=>{
  const r=spawnSync(process.execPath,['scripts/backup-console.mjs','--prepare'],{cwd:root,encoding:'utf8'});
  assert.equal(r.status,0);const value=JSON.parse(r.stdout);
  assert.equal(value.passwordRequested,false);assert.equal(value.productionAccessed,false);
});
test('explicit real mode is blocked in redirected test console',()=>{
  const r=spawnSync(process.execPath,['scripts/backup-console.mjs','--run-production-backup'],{cwd:root,encoding:'utf8'});
  assert.equal(r.status,2);
});
test('muted password display forwards no input text',()=>{
  let visible='';const target=new Writable({write(chunk,_enc,cb){visible+=chunk.toString();cb();}});
  const p=promptOutput(target);p.mute(true);p.output.write('SYNTHETIC-PASSWORD');p.mute(false);p.output.write('SAFE');
  assert.equal(visible,'SAFE');
});
test('missing executable returns launch failure without null-process dereference',async()=>{
  const result=await launchBackupProcess({executable:'C:\\SYNTHETIC-NOT-INSTALLED\\node.exe',
    script:'unused.mjs',credentials:{password:'SYNTHETIC-ONLY'},cwd:root});
  assert.equal(result.started,false);assert.equal(result.errorClass,'executable-not-found');
  assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC-ONLY/);
});
test('single launcher preserves synthetic credentials through anonymous stdin',async()=>{
  const result=await launchBackupProcess({script:fileURLToPath(new URL('./fixtures/production-credential-receiver.mjs',import.meta.url)),
    credentials:{host:'aws-1-ap-south-1.pooler.supabase.com',user:'postgres.abcdefghijklmnopqrst',port:'5432',
      password:'SYNTHETIC-ONLY-한글-"-quote-\\-$-&-not-a-real-password'},cwd:root,fixture:true});
  assert.equal(result.started,true);assert.equal(result.exitCode,0);assert.equal(result.fixtureVerified,true);
  assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC-ONLY/);
});
