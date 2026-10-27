import { spawn } from 'node:child_process';
import { Writable } from 'node:stream';

export function promptOutput(destination) {
  let muted = false;
  const output = new Writable({ write(chunk, _encoding, callback) {
    if (muted) callback(); else destination.write(chunk, callback);
  } });
  return { output, mute(value) { muted = value; } };
}

export function launchBackupProcess({ executable = process.execPath, script, credentials, cwd,
  env = process.env, fixture = false }) {
  // The only credential transport is anonymous stdin. No shell, arguments or env values.
  return new Promise((resolve) => {
    const childEnv = { ...env };
    for (const name of Object.keys(childEnv)) {
      if (/^(PG|DATABASE_URL$|SUPABASE_|NEXT_PUBLIC_SUPABASE_|AGE_|DOCKER_|TELEGRAM_|VERCEL_)/i.test(name)) delete childEnv[name];
    }
    const result = { started:false, exitCode:null, signal:null, errorClass:null, summaryFile:null };
    let output = '';
    let bytes = Buffer.from(JSON.stringify(credentials), 'utf8');
    let child;
    try { child = spawn(executable, [script, ...(fixture ? [] : ['--credentials-stdin'])], {
      cwd, env:childEnv, shell:false, windowsHide:true, stdio:['pipe','pipe','pipe'],
    }); } catch {
      bytes.fill(0); resolve({ ...result, errorClass:'launch-failed' }); return;
    }
    child.once('spawn', () => { result.started = true; });
    child.once('error', error => {
      result.errorClass = error.code === 'ENOENT' ? 'executable-not-found' : 'launch-failed';
    });
    child.stdout.on('data', chunk => { if (output.length < 32768) output += chunk.toString('utf8'); });
    child.stderr.resume(); // Never forward raw error text, paths, credentials or stack traces.
    child.stdin.on('error', () => { result.errorClass ??= 'credential-pipe-failed'; });
    child.stdin.end(bytes, () => { bytes.fill(0); bytes = Buffer.alloc(0); });
    child.once('close', (code, signal) => {
      bytes.fill(0); result.exitCode = code; result.signal = signal;
      if (result.started && code !== 0) result.errorClass ??= 'backup-process-failed';
      const summary = output.match(/^Non-secret summary: (.+)$/m);
      if (summary && /[\\/]\.supabase-local[\\/]production-backup-summary-[0-9a-f-]+\.json$/.test(summary[1].trim())) {
        result.summaryFile = summary[1].trim();
      }
      // Fixture output contains booleans only; never expose normal child output.
      if (fixture) { try { result.fixtureVerified = JSON.parse(output).success === true; } catch { result.fixtureVerified = false; } }
      output = ''; resolve(result);
    });
  });
}
