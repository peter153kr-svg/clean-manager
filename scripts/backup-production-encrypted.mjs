// Approved clean-manager production backup only. Credentials arrive via anonymous
// stdin from the user's console, never argv/env/files. No plaintext dump files.
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, writeFileSync, createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { approveBackupCredentials, encodeCredentialFrame, readonlySourceShell, readBackupCredentialInput } from './lib/production-backup-policy.mjs';

if (process.argv.length !== 3 || process.argv[2] !== '--credentials-stdin' || process.stdin.isTTY) {
  console.error('STOP: user-controlled credential stdin launcher required; no credentials in arguments.');
  process.exit(2);
}
const root = fileURLToPath(new URL('../', import.meta.url));
const local = String.raw`C:\Users\온혁목\AppData\Local`;
const outputDir = path.join(local, 'SkyCleanSecureBackups');
const identity = path.join(local, 'SkyCleanSecureKeys',
  'clean-manager-production-b8065939e74448fe82ed91e4bd11b44b', 'identity.txt');
const age = path.join(local, 'Microsoft/WinGet/Packages/FiloSottile.age_Microsoft.Winget.Source_8wekyb3d8bbwe/age/age.exe');
const keygen = path.join(path.dirname(age), 'age-keygen.exe');
const docker = String.raw`C:\Program Files\Docker\Docker\resources\bin\docker.exe`;
const image = 'public.ecr.aws/supabase/postgres:17.11.0.006';
const id = randomUUID();
const container = `skyclean-production-restore-${id}`;
const archive = path.join(outputDir, `clean-manager-production-${id}.dump.age`);
const metadataFile = path.join(outputDir, `clean-manager-production-${id}.metadata.age`);
const summaryFile = path.join(root, `.supabase-local/production-backup-summary-${id}.json`);
const env = { ...process.env };
for (const key of Object.keys(env)) if (/^(SUPABASE_|NEXT_PUBLIC_SUPABASE_|DATABASE_URL$|PG|AGE_|DOCKER_|TELEGRAM_|VERCEL_)/i.test(key)) delete env[key];
const summary = { id, stage: 'credential-validation', success: false, operations: [],
  productionWriteOperations: false, plaintextDumpFileCreated: false,
  backupScope: 'logical-database-dump; global role passwords and Storage binaries excluded',
  cleanupVerified: false, archiveVerified: false };
let credentials;
let sourceApproved = false;
const remoteContainers = [];
const safeOsCode = (code) => ['ENOENT','EACCES','EPERM','EPIPE','ECONNRESET','ETIMEDOUT','ENOBUFS',
  'ERR_STREAM_PREMATURE_CLOSE','ERR_STREAM_DESTROYED'].includes(code) ? code : null;
function fail(kind) { const error = new Error(kind); error.safeKind = kind; return error; }
function sync(operation, exe, args, input) {
  const r = spawnSync(exe, args, { cwd: root, env, input, encoding: 'utf8', timeout: 120000, windowsHide: true });
  summary.operations.push({ operation, exitCode: r.status, osCode: safeOsCode(r.error?.code) });
  if (r.error || r.status !== 0) throw fail('command-failed');
  return r.stdout.trim();
}
const da = (args) => ['--context','desktop-linux',...args];
const d = (operation, args, input) => sync(operation,docker,da(args),input);
function worker(operation, exe, args, input) {
  const proc = spawn(exe,args,{cwd:root,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  const status = { operation, exitCode:null, signal:null, osCode:null, errorClass:null, terminatedForCleanup:false };
  summary.operations.push(status);
  proc.stderr.on('data',(chunk)=>{
    // Examine transient text, record enum only. Never print/store raw error text.
    const text=chunk.toString('utf8');
    if (/password authentication failed|incorrect passphrase|no identity matched/i.test(text)) status.errorClass='authentication';
    else if (/certificate|SSL|TLS/i.test(text)) status.errorClass='tls';
    else if (/permission denied|access is denied/i.test(text)) status.errorClass='permission';
    else if (/could not connect|connection refused|could not translate host/i.test(text)) status.errorClass='connection';
    else if (/version mismatch|unsupported version/i.test(text)) status.errorClass='version';
    else if (/broken pipe/i.test(text)) status.errorClass='pipe';
  });
  const done = new Promise(resolve=>{
    proc.once('error',error=>{status.errorClass='spawn';status.osCode=safeOsCode(error.code);});
    proc.once('close',(code,signal)=>{status.exitCode=code;status.signal=signal;resolve(code===0);});
  });
  if(input!==undefined)proc.stdin.end(input);
  return {proc,status,done};
}
function stop(w){if(w.proc.exitCode===null&&w.proc.signalCode===null){w.status.terminatedForCleanup=true;w.proc.kill();}}
async function transfer(source,sink){
  const hash=createHash('sha256');
  const tap=new Transform({transform(chunk,_encoding,cb){hash.update(chunk);cb(null,chunk);}});
  source.done.then(ok=>{if(!ok)stop(sink);});
  sink.done.then(ok=>{if(!ok)stop(source);});
  try{
    await pipeline(source.proc.stdout,tap,sink.proc.stdin);
    if(!(await Promise.all([source.done,sink.done])).every(Boolean))throw fail('process-failed');
    return hash.digest('hex');
  }catch(error){
    stop(source);stop(sink);await Promise.all([source.done,sink.done]);
    summary.streamOsCode=safeOsCode(error.code);throw fail('stream-or-process-failed');
  }
}
async function collect(w,limit){
  const parts=[];let total=0;
  try{
    for await(const chunk of w.proc.stdout){total+=chunk.length;if(total>limit)throw fail('metadata-size-limit');parts.push(chunk);}
    if(!(await w.done))throw fail('process-failed');
    return Buffer.concat(parts);
  }catch(error){stop(w);await w.done;throw error;}
}
function remote(operation,args){
  if(!sourceApproved)throw fail('source-not-approved');
  // No credential in docker args/config/env. Input is consumed in memory by sh.
  const secretInput=encodeCredentialFrame(credentials);
  const remoteName=`skyclean-production-read-${randomUUID()}`;
  remoteContainers.push(remoteName);
  const w=worker(operation,docker,da(['run','--rm','--name',remoteName,'--pull','never','--network','bridge','--read-only',
    '--no-healthcheck','--cap-drop','ALL','--security-opt','no-new-privileges','--log-driver','none',
    '--user','postgres','--tmpfs','/tmp:rw,size=32m,mode=1777','-i','--entrypoint','/bin/sh',
    image,'-c',readonlySourceShell,'skyclean-readonly',...args]),secretInput);
  w.proc.stdin.once('finish',()=>secretInput.fill(0));
  return w;
}
const localSql=(text)=>d('local-sql',['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1',
  '-h','/verify','-U','postgres','-d','postgres','-A','-t'],Buffer.from(text,'utf8'));
try{
  credentials=await readBackupCredentialInput(process.stdin);
  const applicationEnv=readFileSync(path.join(root,'.env.local'),'utf8');
  const match=applicationEnv.match(/^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*['"]?([^\r\n'"]+)/m);
  if(!match)throw fail('expected-project-unavailable');
  credentials=approveBackupCredentials(credentials,match[1].trim());
  sourceApproved=true;
  mkdirSync(path.dirname(summaryFile),{recursive:true});mkdirSync(outputDir,{recursive:true});
  if(!existsSync(identity)||!existsSync(age)||!existsSync(keygen))throw fail('production-key-or-age-missing');
  if(!d('docker-context',['context','inspect','desktop-linux','--format','{{.Endpoints.docker.Host}}'])
    .startsWith('npipe:////./pipe/dockerDesktopLinuxEngine'))throw fail('docker-not-local');
  summary.ageVersion=sync('age-version',age,['--version']);
  const recipient=sync('derive-production-public-key',keygen,['-y',identity]);
  if(!/^age1[a-z0-9]+$/.test(recipient))throw fail('production-key-invalid');
  d('existing-image-check',['image','inspect',image,'--format','{{.Id}}']);
  summary.stage='production-readonly-metadata';
  const metadataQuery=`SELECT json_build_object('readOnly',current_setting('transaction_read_only'),
    'serverVersionNum',current_setting('server_version_num'),
    'roles',(SELECT array_agg(rolname ORDER BY rolname) FROM pg_roles),
    'publicTables',(SELECT array_agg(c.relname ORDER BY c.relname) FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')));`;
  const metadataBytes=await collect(remote('production-metadata',['psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',metadataQuery]),1024*1024);
  const metadata=JSON.parse(metadataBytes.toString('utf8'));
  if(metadata.readOnly!=='on'||Math.floor(Number(metadata.serverVersionNum)/10000)>17)throw fail('readonly-or-version-check-failed');
  const metaEncrypt=worker('metadata-encrypt',age,['--encrypt','--recipient',recipient,'--output',metadataFile],metadataBytes);
  metaEncrypt.proc.stdout.resume();if(!(await metaEncrypt.done))throw fail('metadata-encryption-failed');
  summary.stage='production-readonly-dump';
  const dump=remote('production-pg-dump',['pg_dump','--format=custom',
    '--serializable-deferrable','--lock-wait-timeout=2s']);
  const encrypt=worker('production-age-encrypt',age,['--encrypt','--recipient',recipient,'--output',archive]);
  encrypt.proc.stdout.resume();
  const dumpHash=await transfer(dump,encrypt);
  credentials.password='';credentials=null;
  summary.encryptedArchive=archive;summary.encryptedMetadata=metadataFile;
  summary.stage='isolated-local-restore';
  d('local-container-create',['create','--pull','never','--name',container,'--network','none','--read-only',
    '--no-healthcheck','--cap-drop','ALL','--security-opt','no-new-privileges','--user','postgres',
    '--tmpfs','/verify:rw,size=1g,mode=1777','--tmpfs','/tmp:rw,size=64m,mode=1777',
    '--log-driver','none','--entrypoint','/bin/sh',image,'-c',
    "mkdir /verify/pgdata && initdb -D /verify/pgdata --auth=trust --encoding=UTF8 --locale=C.UTF-8 >/dev/null && exec postgres -D /verify/pgdata -k /verify -c listen_addresses='' -c logging_collector=off -c log_statement=none -c log_min_messages=warning"]);
  d('local-container-start',['start',container]);
  const inspection=JSON.parse(d('local-isolation-check',['inspect',container]))[0];
  if(inspection.HostConfig.NetworkMode!=='none'||!inspection.HostConfig.ReadonlyRootfs||
    (inspection.HostConfig.Binds?.length??0)!==0||Object.keys(inspection.HostConfig.PortBindings??{}).length!==0||
    !inspection.HostConfig.Tmpfs['/verify'])throw fail('local-isolation-failed');
  d('local-ready',['exec',container,'/bin/sh','-c',
    'for n in $(seq 1 60); do pg_isready -q -h /verify -U postgres && exit 0; sleep 1; done; exit 1']);
  const decodedMetadata=await collect(worker('metadata-decrypt',age,['--decrypt','--identity',identity,metadataFile],Buffer.alloc(0)),1024*1024);
  if(!createHash('sha256').update(decodedMetadata).digest().equals(createHash('sha256').update(metadataBytes).digest()))throw fail('metadata-integrity-mismatch');
  const restoredMetadata=JSON.parse(decodedMetadata.toString('utf8'));
  // Role names only; never clone server-global role passwords or login powers.
  for(const role of restoredMetadata.roles){
    if(role==='postgres'||role.startsWith('pg_'))continue;
    const identifier='"'+role.replaceAll('"','""')+'"';localSql(`CREATE ROLE ${identifier} NOLOGIN;`);
  }
  const decrypt=worker('production-age-decrypt',age,['--decrypt','--identity',identity,archive],Buffer.alloc(0));
  const restore=worker('local-pg-restore',docker,da(['exec','-i',container,'pg_restore','-h','/verify',
    '-U','postgres','-d','postgres','--no-owner','--no-privileges','--single-transaction','--exit-on-error']));
  restore.proc.stdout.resume();const decodedHash=await transfer(decrypt,restore);
  if(dumpHash!==decodedHash)throw fail('dump-integrity-mismatch');
  const tables=JSON.parse(localSql("SELECT coalesce(json_agg(c.relname ORDER BY c.relname),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p');"));
  if(JSON.stringify(tables)!==JSON.stringify(restoredMetadata.publicTables??[]))throw fail('restored-table-mismatch');
  summary.archiveVerified=true;summary.decryptedStreamMatches=true;summary.metadataMatches=true;
  summary.publicTableSetMatches=true;summary.stage='verified';
  summary.localVerificationSecurityScope='ownership and grants retained in archive; not applied to isolated verification DB';
  const cipherHash=createHash('sha256');for await(const chunk of createReadStream(archive))cipherHash.update(chunk);
  summary.encryptedArchiveSha256=cipherHash.digest('hex');
}catch(error){
  // All safeKind values are fixed code strings. Never expose error.message/stack.
  summary.errorClass=error.safeKind??'unexpected-error';
  console.error('STOP: backup/verification did not complete. No retry or production writes performed.');
}finally{
  if(credentials)credentials.password='';credentials=null;
  try{
    for(const name of [...remoteContainers,container]){
      const remaining=d('container-presence',['ps','-a','--filter',`name=^/${name}$`,'--format','{{.Names}}']);
      if(remaining)d('container-cleanup',['rm','--force','--volumes',name]);
      if(d('container-absence',['ps','-a','--filter',`name=^/${name}$`,'--format','{{.Names}}']))throw fail('cleanup-incomplete');
    }
    summary.cleanupVerified=true;
  }catch{summary.cleanupVerified=false;summary.cleanupError='local-cleanup-not-verified';summary.localContainer=container;}
  summary.success=summary.archiveVerified&&summary.cleanupVerified;
  summary.finishedAt=new Date().toISOString();
  // Preserve ciphertext even on restore failure; never delete verified backups.
  if(existsSync(archive))summary.encryptedArchive=archive;
  if(existsSync(metadataFile))summary.encryptedMetadata=metadataFile;
  try{mkdirSync(path.dirname(summaryFile),{recursive:true});writeFileSync(summaryFile,JSON.stringify(summary,null,2)+'\n',{flag:'wx'});}
  catch{console.error('Non-secret summary could not be saved.');process.exitCode=1;}
  console.log(summary.success?'PASS: encrypted production dump restored in isolated local DB; temporary data removed.'
    :'NOT COMPLETE: stop and inspect non-secret summary; production remains unchanged.');
  console.log(`Non-secret summary: ${summaryFile}`);
  process.exitCode=summary.success?0:1;
}
