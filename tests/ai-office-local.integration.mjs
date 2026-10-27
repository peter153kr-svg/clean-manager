import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const endpoint=process.env.CLEAN_MANAGER_LOCAL_API_URL;
assert.equal(endpoint,'http://127.0.0.1:56321');
const admin=createClient(endpoint,process.env.CLEAN_MANAGER_LOCAL_SERVICE_KEY,
  {auth:{persistSession:false,autoRefreshToken:false}});
const base='http://127.0.0.1:3176';
async function withServer(enabled,action){
  const env={...process.env};delete env.AI_OFFICE_DEV_MODE;delete env.VERCEL_ENV;
  if(enabled)env.AI_OFFICE_DEV_MODE='synthetic';
  const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3176'],
    {env,windowsHide:true,stdio:'ignore'});
  try{
    let ready=false;
    for(let i=0;i<100;i++){try{if((await fetch(base+'/login')).status===200){ready=true;break;}}catch{}await delay(100);}
    assert.ok(ready,'Local Next server did not start');await action();
  }finally{
    if(server.exitCode===null){server.kill();await new Promise(resolve=>server.once('exit',resolve));}
  }
}
test('AI lab uses local synthetic Auth, preserves protection and requires development mode',async t=>{
  const email=`ai-lab-${randomBytes(6).toString('hex')}@example.invalid`;
  const password=randomBytes(24).toString('base64url');
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
  assert.equal(created.error,null);
  t.after(async()=>{const r=await admin.auth.admin.deleteUser(created.data.user.id);assert.equal(r.error,null);});
  const cookies=[];
  const ssr=createServerClient(endpoint,process.env.CLEAN_MANAGER_LOCAL_ANON_KEY,{cookies:{getAll:()=>cookies,
    setAll:items=>{for(const item of items){const old=cookies.findIndex(v=>v.name===item.name);if(old>=0)cookies[old]=item;else cookies.push(item);}}}});
  assert.equal((await ssr.auth.signInWithPassword({email,password})).error,null);
  const headers={cookie:cookies.map(v=>`${v.name}=${v.value}`).join('; ')};
  await withServer(true,async()=>{
    await t.test('anonymous requests still require CRM login',async()=>{
      const r=await fetch(base+'/ai-office-lab',{redirect:'manual'});assert.equal(r.status,307);
      assert.match(r.headers.get('location'),/\/login/);
    });
    await t.test('signed-in development route renders synthetic lab and all four staff roles',async()=>{
      const r=await fetch(base+'/ai-office-lab',{headers,redirect:'manual'});assert.equal(r.status,200);
      const html=await r.text();for(const label of ['AI 비서 개발실','일정관리 직원','AI 총괄실장','고객·매출 직원','블로그·릴스 직원','합성 데이터 전용'])assert.ok(html.includes(label),label);
      assert.match(html,/noindex/);
    });
  });
  await withServer(false,async()=>{
    await t.test('without development/preview mode the new route returns 404',async()=>{
      const r=await fetch(base+'/ai-office-lab',{headers,redirect:'manual'});assert.equal(r.status,404);
    });
  });
  await ssr.auth.signOut();
});
