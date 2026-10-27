import { existsSync,readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
if(process.argv.length!==2)throw new Error('No arguments accepted');
for(const file of ['.env','.env.local','.env.production','.env.production.local']){
  if(existsSync(path.join(root,file)))throw new Error('Use an isolated copy without automatic env files');
}
if(existsSync(path.join(root,'.security-local/supabase/.temp/project-ref')))throw new Error('Remote project links rejected');
if(!existsSync(path.join(root,'.next/BUILD_ID')))throw new Error('Build the isolated copy first');
const env={...process.env};
for(const key of Object.keys(env))if(/^(SUPABASE_|NEXT_PUBLIC_SUPABASE_|DATABASE_URL$|PG|TELEGRAM_|VERCEL_|OPENAI_)/i.test(key))delete env[key];
const cli=spawnSync(process.execPath,[path.join(root,'node_modules/supabase/dist/supabase.js'),
  '--workdir',path.join(root,'.security-local'),'status','--output','json'],{cwd:root,env,encoding:'utf8',windowsHide:true});
if(cli.status!==0)throw new Error('Local Supabase status unavailable');
const info=JSON.parse(cli.stdout);
if(info.API_URL!=='http://127.0.0.1:56321'||!info.ANON_KEY||!info.SERVICE_ROLE_KEY)throw new Error('Only local synthetic Auth is allowed');
// Development fixture stays outside supabase/migrations; never invoke db push/reset.
// Apply twice to verify repeatable local setup without replaying the CRM baseline.
for(let attempt=0;attempt<2;attempt++){
  const schema=spawnSync('docker',['exec','-i','supabase_db_clean-manager-security','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],
    {input:readFileSync(path.join(root,'supabase/dev/ai-schedule-v1.sql')),encoding:'utf8',env,windowsHide:true});
  if(schema.status!==0)throw new Error('Local V1 fixture setup failed; no remote command was run');
}
console.log('Local-only V1 fixture applied and reapplied successfully.');
const result=spawnSync(process.execPath,['--test','tests/ai-office-local.integration.mjs'],{cwd:root,
  windowsHide:true,stdio:'inherit',env:{...env,NEXT_PUBLIC_SUPABASE_URL:info.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:info.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:info.SERVICE_ROLE_KEY,
    CLEAN_MANAGER_LOCAL_API_URL:info.API_URL,CLEAN_MANAGER_LOCAL_SERVICE_KEY:info.SERVICE_ROLE_KEY,
    CLEAN_MANAGER_LOCAL_ANON_KEY:info.ANON_KEY,NEXT_TELEMETRY_DISABLED:'1',OPENAI_API_KEY:''}});
process.exitCode=result.status??1;
