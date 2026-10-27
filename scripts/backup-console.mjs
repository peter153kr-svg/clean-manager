// Run manually with node.exe. Does not use .ps1 or change execution policy.
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { promptOutput, launchBackupProcess } from './lib/backup-launcher.mjs';
import { approveBackupCredentials } from './lib/production-backup-policy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv[2] ?? '--prepare';
if (process.argv.length > 3 || !['--prepare','--run-production-backup'].includes(mode)) {
  console.error('Use --prepare or --run-production-backup. Never pass credentials in arguments.'); process.exit(2);
}
if (mode === '--prepare') {
  console.log(JSON.stringify({ mode:'preparation-only', nodeVersion:process.version,
    interactiveConsole:process.stdin.isTTY===true && process.stdout.isTTY===true,
    backendExists:existsSync(path.join(root,'scripts/backup-production-encrypted.mjs')),
    passwordRequested:false, productionAccessed:false },null,2));
  process.exit(0);
}
// No automatic launcher: real execution must be explicitly selected by the operator.
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('STOP: a manually opened interactive console is required.'); process.exit(2);
}
const prompts = promptOutput(process.stdout);
const rl = createInterface({ input:process.stdin, output:prompts.output, terminal:true, historySize:0 });
let credentials;
try {
  console.log('Read-only production backup. Use only after renewed approval. No raw output is logged.');
  const host = await rl.question('Dashboard Session pooler Host: ');
  const user = await rl.question('Dashboard Session pooler User: ');
  const port = await rl.question('Dashboard Session pooler Port: ');
  const source = readFileSync(path.join(root,'.env.local'),'utf8');
  const url = source.match(/^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*['"]?([^\r\n'"]+)/m)?.[1].trim();
  if (!url) throw new Error('connection-validation-failed');
  approveBackupCredentials({host,user,port,password:'CONNECTION-CHECK-ONLY'},url);
  const confirm = await rl.question('Type BACKUP to start the approved operation; anything else cancels: ');
  if (confirm !== 'BACKUP') { console.log('Cancelled; no database contacted.'); process.exitCode=2; }
  else {
    process.stdout.write('DB password (hidden; paste or type locally, then Enter): ');
    prompts.mute(true);
    let password;
    try { password = await rl.question(''); } finally { prompts.mute(false); process.stdout.write('\n'); }
    credentials = approveBackupCredentials({host,user,port,password},url); password='';
    rl.close();
    console.log('Starting. Please wait for the sanitized completion status.');
    const result = await launchBackupProcess({script:path.join(root,'scripts/backup-production-encrypted.mjs'), credentials, cwd:root});
    console.log(JSON.stringify(result,null,2));
    process.exitCode = result.started && result.exitCode===0 ? 0 : 1;
  }
} catch {
  console.error('STOP: input, connection validation or launch failed. No automatic retry.'); process.exitCode=1;
} finally {
  prompts.mute(false); rl.close(); if(credentials)credentials.password=''; credentials=null;
}
