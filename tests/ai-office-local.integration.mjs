import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { crmCases } from './ai-office-crm-cases.mjs';
import { mobileCases } from './ai-office-mobile-cases.mjs';
import { changeCases } from './ai-office-change-cases.mjs';

const endpoint=process.env.CLEAN_MANAGER_LOCAL_API_URL;
assert.equal(endpoint,'http://127.0.0.1:56321');
const admin=createClient(endpoint,process.env.CLEAN_MANAGER_LOCAL_SERVICE_KEY,
  {auth:{persistSession:false,autoRefreshToken:false}});
const base='http://127.0.0.1:3176';
const webhookSecret=randomBytes(24).toString('hex');
async function withServer(enabled,action){
  const env={...process.env};delete env.AI_OFFICE_DEV_MODE;delete env.VERCEL_ENV;
  if(enabled)env.AI_OFFICE_DEV_MODE='synthetic';
  env.TELEGRAM_SCHEDULE_CHANNEL_ID='-1000000000001';env.TELEGRAM_SCHEDULE_WEBHOOK_SECRET=webhookSecret;
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
  assert.equal((await admin.from('dev_ai_office_admins').insert({user_id:created.data.user.id})).error,null);
  t.after(async()=>{const r=await admin.auth.admin.deleteUser(created.data.user.id);assert.equal(r.error,null);});
  const cookies=[];
  const ssr=createServerClient(endpoint,process.env.CLEAN_MANAGER_LOCAL_ANON_KEY,{cookies:{getAll:()=>cookies,
    setAll:items=>{for(const item of items){const old=cookies.findIndex(v=>v.name===item.name);if(old>=0)cookies[old]=item;else cookies.push(item);}}}});
  assert.equal((await ssr.auth.signInWithPassword({email,password})).error,null);
  const headers={cookie:cookies.map(v=>`${v.name}=${v.value}`).join('; ')};
  const ids=[];
  const customerIds=[];const jobIds=[];
  t.after(async()=>{if(ids.length){
    const links=await admin.from('dev_ai_schedule_job_links').select('job_id,customer_id').in('message_id',ids);assert.equal(links.error,null);
    jobIds.push(...links.data.map(l=>l.job_id));customerIds.push(...links.data.map(l=>l.customer_id));
    assert.equal((await admin.from('dev_ai_schedule_job_links').delete().in('message_id',ids)).error,null);
    if(jobIds.length){assert.equal((await admin.from('sales').delete().in('job_id',[...new Set(jobIds)])).error,null);
      assert.equal((await admin.from('jobs').delete().in('id',[...new Set(jobIds)])).error,null);}
    if(customerIds.length)assert.equal((await admin.from('customers').delete().in('id',[...new Set(customerIds)])).error,null);
    // PR #1 keeps revisions independently; deleting the inbox does not cascade to them.
    const source=await admin.from('telegram_schedule_messages').select('message_id').in('id',ids);assert.equal(source.error,null);
    if(source.data.length){const revisions=await admin.from('telegram_schedule_revisions').delete()
      .eq('channel_id',-1000000000001).in('message_id',source.data.map(row=>row.message_id));assert.equal(revisions.error,null);}
    const r=await admin.from('telegram_schedule_messages').delete().in('id',ids);assert.equal(r.error,null);
  }});
  const api='/api/ai-office/schedules';
  const jsonHeaders={...headers,origin:base,'Content-Type':'application/json'};
  const list=async()=>{const r=await fetch(base+api,{headers});assert.equal(r.status,200);return (await r.json()).items;};
  const save=(item,fields)=>fetch(base+api,{method:'POST',headers:jsonHeaders,body:JSON.stringify({id:item.id,revision:item.revision_at,fields:fields??item.review.fields})});
  const date=Math.floor(Date.now()/1000);const messageId=Date.now();
  const source='2090-10-27 오전 9시\n고객명: 합성 고객\n주소: 합성시 테스트로 1\n현장: V1 합성 현장\n작업 종류: 입주청소\n소요시간: 120분\n금액: 45만원';
  const webhook=async(id,text,edit=0)=>{
    const message={message_id:id,date,chat:{id:-1000000000001,type:'channel'},text,...(edit?{edit_date:date+edit}:{})};
    return fetch(base+'/api/telegram/schedule',{method:'POST',headers:{'Content-Type':'application/json','x-telegram-bot-api-secret-token':webhookSecret},
      body:JSON.stringify({[edit?'edited_channel_post':'channel_post']:message})});
  };
  let item;
  await withServer(true,async()=>{
    await t.test('anonymous requests still require CRM login',async()=>{
      const r=await fetch(base+'/ai-office-lab',{redirect:'manual'});assert.equal(r.status,307);
      assert.match(r.headers.get('location'),/\/login/);
    });
    await t.test('signed-in development route renders synthetic lab and all four staff roles',async()=>{
      const r=await fetch(base+'/ai-office-lab',{headers,redirect:'manual'});assert.equal(r.status,200);
      const html=await r.text();for(const label of ['AI 비서 개발실','일정관리 직원','AI 총괄실장','고객·매출 직원','블로그·릴스 직원','합성 데이터 전용'])assert.ok(html.includes(label),label);
      assert.match(html,/noindex/);
      for(const label of ['일정관리 V1','관리자 검토함','승인 달력','일일 브리핑'])assert.ok(html.includes(label),label);
    });
    await t.test('real PR #1 webhook persists synthetic inbox, extracts six fields and waits for review',async()=>{
      assert.equal((await webhook(messageId,source)).status,200);
      item=(await list()).find(i=>i.message_text===source);assert.ok(item);ids.push(item.id);
      assert.equal(item.approved,null);assert.deepEqual(item.review.issues,[]);
      assert.equal(item.review.fields.customer,'합성 고객');assert.equal(item.review.fields.address,'합성시 테스트로 1');
      assert.equal(item.review.fields.service,'입주청소');assert.equal(item.review.fields.amount,450000);
    });
    await t.test('CSRF and invalid reviews cannot approve',async()=>{
      assert.equal((await fetch(base+api,{method:'POST',headers:{...jsonHeaders,origin:'https://example.invalid'},body:JSON.stringify({})})).status,403);
      assert.equal((await save(item,{...item.review.fields,customer:''})).status,422);
      assert.equal((await save(item,{...item.review.fields,duration:0})).status,422);
      assert.equal((await fetch(base+api,{method:'POST',headers:jsonHeaders,body:' '.repeat(17000)})).status,413);
      const direct=await admin.rpc('dev_approve_ai_schedule',{p_id:item.id,p_revision:item.revision_at,
        p_fields:{...item.review.fields,customer:null},p_actor:created.data.user.id});
      assert.ok(direct.error);assert.ok(direct.error.message.includes('invalid_fields'));
    });
    await t.test('approval persists across requests for the calendar and briefing',async()=>{
      assert.equal((await save(item)).status,200);
      assert.deepEqual((await list()).find(i=>i.id===item.id).approved,item.review.fields);
    });
    await t.test('duplicate delivery is idempotent and keeps approval',async()=>{
      assert.equal((await webhook(messageId,source)).status,200);
      const result=await list();assert.equal(result.filter(i=>i.id===item.id).length,1);
      assert.ok(result.find(i=>i.id===item.id).approved);
    });
    await t.test('separate message duplicates and overlapping durations are blocked by atomic DB approval',async()=>{
      assert.equal((await webhook(messageId+1,source)).status,200);
      const duplicate=(await list()).find(i=>i.id!==item.id&&i.message_text===source);assert.ok(duplicate);ids.push(duplicate.id);
      assert.equal((await save(duplicate)).status,409);
      assert.equal((await save(duplicate,{...duplicate.review.fields,time:'10:30'})).status,409);
      assert.equal((await save(duplicate,{...duplicate.review.fields,time:'11:00'})).status,200);
    });
    await t.test('newer webhook edit preserves active approval and rejects an open stale review',async()=>{
      assert.equal((await webhook(messageId,source.replace('45만원','50만원'),1)).status,200);
      const changed=(await list()).find(i=>i.id===item.id);assert.equal(changed.pendingChange,true);assert.equal(changed.approved.amount,450000);assert.equal(changed.review.fields.amount,500000);
      assert.equal((await save(item)).status,409);item=changed;
      assert.equal((await fetch(base+'/api/ai-office/changes',{method:'POST',headers:jsonHeaders,body:JSON.stringify({id:item.id,
        revision:item.revision_at,baseRevision:item.baseRevision,baseFields:item.approved,fields:item.review.fields,
        action:'approve',customerId:null,confirmed:true})})).status,200);
      assert.equal((await webhook(messageId,source)).status,200);
      assert.equal((await list()).find(i=>i.id===item.id).approved.amount,500000);
    });
    await t.test('missing information is explicit and can be manually corrected before approval',async()=>{
      assert.equal((await webhook(messageId+2,'내일 3시\n현장: 합성 누락 현장')).status,200);
      const missing=(await list()).find(i=>i.message_text.includes('합성 누락 현장'));ids.push(missing.id);
      assert.ok(missing.review.issues.length>=5);assert.equal((await save(missing)).status,422);
      assert.equal((await save(missing,{...item.review.fields,time:'14:00',site:'합성 보완 현장'})).status,200);
    });
    await t.test('simultaneous overlapping approvals serialize: exactly one succeeds',async()=>{
      for(const offset of [3,4])assert.equal((await webhook(messageId+offset,source.replace('2090-10-27','2090-10-28')+'\n메모: 동시 승인 '+offset)).status,200);
      const candidates=(await list()).filter(i=>i.message_text.includes('메모: 동시 승인'));assert.equal(candidates.length,2);ids.push(...candidates.map(i=>i.id));
      const results=await Promise.all(candidates.map(i=>save(i)));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    });
    await t.test('local UI synthetic ingress invokes the same PR #1 handler without revealing its secret',async()=>{
      const r=await fetch(base+api,{method:'PUT',headers:jsonHeaders,body:JSON.stringify({text:'합성 UI 이벤트 '+messageId})});assert.equal(r.status,200);
      const received=(await list()).find(i=>i.message_text==='합성 UI 이벤트 '+messageId);assert.ok(received);ids.push(received.id);
      assert.equal(received.approved,null);assert.ok(received.review.issues.length>0);
      assert.ok(!(await r.text()).includes(webhookSecret));
    });
    await t.test('anon and authenticated clients cannot write approvals or execute approval RPC',async()=>{
      const anon=createClient(endpoint,process.env.CLEAN_MANAGER_LOCAL_ANON_KEY,{auth:{persistSession:false}});
      for(const db of [anon,ssr]){
        assert.ok((await db.from('dev_ai_schedule_approvals').select('*')).error);
        assert.ok((await db.rpc('dev_approve_ai_schedule',{p_id:item.id,p_revision:item.revision_at,p_fields:item.review.fields,p_actor:created.data.user.id})).error);
      }
    });
    await crmCases(t,{admin,ssr,base,headers,jsonHeaders,list,save,webhook,messageId,ids,customerIds,jobIds,actor:created.data.user.id});
    await changeCases(t,{admin,ssr,base,headers,jsonHeaders,list,save,webhook,messageId,ids,customerIds,actor:created.data.user.id});
    await mobileCases(t,{admin,base,cookies,ids});
  });
  await withServer(true,async()=>{
    await t.test('approved schedules and CRM links survive application restart',async()=>{
      const r=await list();assert.ok(r.some(i=>i.link));
      const linked=r.find(i=>i.link);const job=await admin.from('jobs').select('id,expected_amount,final_amount,status').eq('id',linked.link.job_id).single();
      assert.equal(job.error,null);assert.equal(job.data.status,'scheduled');assert.equal(job.data.final_amount,null);
      assert.equal((await admin.from('sales').select('id').eq('job_id',job.data.id)).data.length,0);
    });
  });
  await withServer(false,async()=>{
    await t.test('without development/preview mode the new route returns 404',async()=>{
      const r=await fetch(base+'/ai-office-lab',{headers,redirect:'manual'});assert.equal(r.status,404);
      assert.equal((await fetch(base+api,{headers})).status,404);
      assert.equal((await fetch(base+'/api/ai-office/crm?id='+item.id,{headers})).status,404);
    });
  });
  await ssr.auth.signOut();
});
