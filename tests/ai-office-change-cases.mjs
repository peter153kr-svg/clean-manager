import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createServerClient} from '@supabase/ssr';
export async function changeCases(t,c){
 const {admin,ssr,base,jsonHeaders,list,save,webhook,messageId,ids,customerIds,actor}=c;
 let offset=100;const changeUrl=base+'/api/ai-office/changes';
 const decide=(item,action='approve',fields=item.review.fields,customerId=null)=>fetch(changeUrl,{method:'POST',headers:jsonHeaders,body:JSON.stringify({
  id:item.id,revision:item.revision_at,baseRevision:item.baseRevision,baseFields:item.approved,fields,action,customerId,confirmed:true})});
 async function setup(day,withJob=true){const mid=messageId+offset++;const text=`2095-01-${day} 09:00\n고객명: 합성 변경 ${mid}\n주소: 합성 변경로 ${mid}\n현장: 합성 변경 현장 ${mid}\n작업 종류: 입주청소\n작업 범위: 창틀 포함\n소요시간: 60분\n금액: 30만원`;
  assert.equal((await webhook(mid,text)).status,200);let item=(await list()).find(i=>i.message_text===text);ids.push(item.id);
  assert.equal((await save(item)).status,200);item=(await list()).find(i=>i.id===item.id);
  if(!withJob)return {mid,text,item};
  const r=await fetch(base+'/api/ai-office/crm',{method:'POST',headers:jsonHeaders,body:JSON.stringify({id:item.id,revision:item.revision_at,fields:item.approved,customerId:null,phone:'010-'+String(mid).slice(-8),confirmed:true})});
  assert.equal(r.status,200);const jobId=(await r.json()).jobId;
  const job=(await admin.from('jobs').select('*').eq('id',jobId).single()).data;customerIds.push(job.customer_id);
  return {mid,text,item,job};
 }
 async function edit(f,text,revision=10){assert.equal((await webhook(f.mid,text,revision)).status,200);return (await list()).find(i=>i.id===f.item.id);}
 let changed;
 await t.test('ordinary user and self-asserted admin claims cannot write via APIs, RLS or RPC',async()=>{
  const password=randomBytes(24).toString('base64url'),email='ordinary-'+randomBytes(8).toString('hex')+'@example.invalid';
  const user=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{admin:true,role:'admin'}});assert.equal(user.error,null);
  try{
   const jar=[];const regular=createServerClient(process.env.CLEAN_MANAGER_LOCAL_API_URL,process.env.CLEAN_MANAGER_LOCAL_ANON_KEY,{cookies:{getAll:()=>jar,setAll:values=>{for(const v of values){const at=jar.findIndex(x=>x.name===v.name);if(at<0)jar.push(v);else jar[at]=v;}}}});
   assert.equal((await regular.auth.signInWithPassword({email,password})).error,null);
   const rh={...jsonHeaders,cookie:jar.map(v=>`${v.name}=${v.value}`).join('; ')};
   const r=await fetch(base+'/api/ai-office/schedules',{headers:rh});assert.equal(r.status,200);assert.equal((await r.json()).isAdmin,false);
   for(const [url,method] of [['schedules','POST'],['schedules','PUT'],['crm','POST'],['changes','POST']])assert.equal((await fetch(base+'/api/ai-office/'+url,{method,headers:rh,body:'{}'})).status,403);
   assert.ok((await regular.from('dev_ai_office_admins').insert({user_id:user.data.user.id})).error);
   const sample=await setup('01');changed=sample;
   assert.ok((await regular.from('customers').insert({name:'권한 없는 합성',phone:'010-0000-0000'})).error);
   assert.ok((await regular.from('jobs').insert({customer_id:sample.job.customer_id,job_date:'2095-01-01'})).error);
   assert.ok((await regular.from('inquiries').insert({customer_id:sample.job.customer_id,source:'기타'})).error);
   assert.ok((await regular.from('sales').insert({customer_id:sample.job.customer_id,job_id:sample.job.id,sale_date:'2095-01-01',revenue:1})).error);
   assert.ok((await regular.from('telegram_schedule_messages').update({status:'reviewed'}).eq('id',sample.item.id)).error);
   assert.equal((await regular.from('customers').update({name:'변조'}).eq('id',sample.job.customer_id).select('id')).data.length,0);
   assert.equal((await regular.from('jobs').delete().eq('id',sample.job.id).select('id')).data.length,0);
   assert.equal((await admin.from('jobs').select('id').eq('id',sample.job.id)).data.length,1);
   const denied=await admin.rpc('dev_apply_ai_schedule',{p_id:sample.item.id,p_revision:sample.item.revision_at,p_fields:sample.item.review.fields,p_actor:user.data.user.id});
   assert.match(denied.error.message,/admin_required/);
   assert.ok((await regular.rpc('dev_decide_ai_change',{p_id:sample.item.id,p_revision:sample.item.revision_at,p_fields:sample.item.review.fields,p_actor:actor,p_decision:'approve',p_base_revision:null,p_base_fields:null,p_customer:null})).error);
   await regular.auth.signOut();
  }finally{assert.equal((await admin.auth.admin.deleteUser(user.data.user.id)).error,null);}
 });
 await t.test('pending Telegram change preserves active calendar/CRM, and admin sees before/after fields',async()=>{
  const proposal=await edit(changed,changed.text.replace('2095-01-01 09:00','2095-01-02 10:00').replace('30만원','40만원').replace('창틀 포함','창틀 및 베란다 포함'));
  assert.equal(proposal.pendingChange,true);assert.equal(proposal.approved.date,'2095-01-01');assert.equal(proposal.review.fields.date,'2095-01-02');
  assert.equal(proposal.approved.scope,'창틀 포함');assert.equal(proposal.review.fields.scope,'창틀 및 베란다 포함');
  assert.equal((await admin.from('jobs').select('job_date').eq('id',changed.job.id).single()).data.job_date,'2095-01-01');changed.proposal=proposal;
 });
 await t.test('admin change approval atomically updates calendar and same CRM job without sales',async()=>{
  assert.equal((await decide(changed.proposal)).status,200);
  const job=(await admin.from('jobs').select('*').eq('id',changed.job.id).single()).data;
  assert.equal(job.job_date,'2095-01-02');assert.equal(job.start_time,'10:00:00');assert.equal(job.expected_amount,400000);assert.equal(job.work_scope,'창틀 및 베란다 포함');
  assert.equal(job.final_amount,null);assert.equal((await admin.from('sales').select('id').eq('job_id',job.id)).data.length,0);
  assert.equal((await decide(changed.proposal)).status,200);
  assert.equal((await list()).find(i=>i.id===changed.item.id).pendingChange,false);
  const withoutScope=await edit(changed,changed.proposal.message_text.replace(/\n작업 범위:[^\n]*/,''),11);
  assert.equal(withoutScope.review.fields.scope,'창틀 및 베란다 포함');
  const rawFields={...withoutScope.review.fields};delete rawFields.scope;
  assert.equal((await decide(withoutScope,'approve',rawFields)).status,200);
  assert.equal((await decide(withoutScope,'approve',rawFields)).status,200);
  assert.equal((await admin.from('jobs').select('work_scope').eq('id',changed.job.id).single()).data.work_scope,'창틀 및 베란다 포함');
 });
 await t.test('rejection preserves approved schedule and CRM and duplicate delivery cannot reopen it',async()=>{
  const f=await setup('03');const proposal=await edit(f,f.text.replace('30만원','50만원'));
  assert.equal((await decide(proposal,'reject')).status,200);assert.equal((await decide(proposal,'reject')).status,200);
  assert.equal((await webhook(f.mid,f.text.replace('30만원','50만원'),10)).status,200);
  const item=(await list()).find(i=>i.id===f.item.id);assert.equal(item.approved.amount,300000);assert.equal(item.decision,'reject');assert.equal(item.pendingChange,false);
  assert.equal((await admin.from('jobs').select('expected_amount').eq('id',f.job.id).single()).data.expected_amount,300000);
  assert.equal((await decide(proposal,'approve')).status,409);
 });
 await t.test('concurrent approve/reject produces a single final decision',async()=>{
  const f=await setup('04');const proposal=await edit(f,f.text.replace('30만원','60만원'));
  const results=await Promise.all([decide(proposal,'approve'),decide(proposal,'reject')]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const rows=await admin.from('dev_ai_schedule_decisions').select('decision').eq('message_id',f.item.id);assert.equal(rows.data.length,1);
 });
 await t.test('changed customer requires explicit candidate selection before relinking the job',async()=>{
  const f=await setup('05');const name='합성 고객 변경 대상 '+f.mid;
  const customer=await admin.from('customers').insert({name,phone:'010-9999-8888',address:'합성 다른 주소'}).select('id').single();assert.equal(customer.error,null);customerIds.push(customer.data.id);
  const proposal=await edit(f,f.text.replace('합성 변경 '+f.mid,name));
  assert.equal((await decide(proposal)).status,409);
  const lookup=await fetch(changeUrl,{method:'POST',headers:jsonHeaders,body:JSON.stringify({action:'lookup',customer:name})});assert.equal(lookup.status,200);assert.equal((await lookup.json()).candidates.length,1);
  assert.equal((await decide(proposal,'approve',proposal.review.fields,customer.data.id)).status,200);
  assert.equal((await admin.from('jobs').select('customer_id').eq('id',f.job.id).single()).data.customer_id,customer.data.id);
 });
 await t.test('time conflicts and manually changed CRM work block automatic changes',async()=>{
  const f=await setup('06');const blocker=await setup('07');
  const conflict=await edit(f,f.text.replace('2095-01-06','2095-01-07'));
  assert.equal((await decide(conflict)).status,409);
  assert.equal((await admin.from('jobs').update({expected_amount:310000}).eq('id',f.job.id)).error,null);
  assert.equal((await decide(conflict)).status,409);
  assert.equal((await admin.from('jobs').select('expected_amount').eq('id',f.job.id).single()).data.expected_amount,310000);
  assert.ok(blocker.job.id);
 });
 await t.test('stale revision, missing confirmation and revoked administrator cannot decide',async()=>{
  const f=await setup('08');const stale=await edit(f,f.text.replace('30만원','40만원'),10);await edit(f,f.text.replace('30만원','50만원'),11);
  assert.equal((await decide(stale)).status,409);
  assert.equal((await fetch(changeUrl,{method:'POST',headers:jsonHeaders,body:JSON.stringify({action:'reject',id:f.item.id})})).status,422);
  assert.equal((await admin.from('dev_ai_office_admins').delete().eq('user_id',actor)).error,null);
  try{assert.equal((await decide(stale)).status,403);}finally{assert.equal((await admin.from('dev_ai_office_admins').insert({user_id:actor})).error,null);}
  assert.equal((await fetch(changeUrl,{method:'POST',headers:{...jsonHeaders,origin:'https://example.invalid'},body:'{}'})).status,403);
  assert.ok((await ssr.from('dev_ai_schedule_decisions').select('*')).error);
  assert.equal((await fetch(changeUrl,{method:'POST',body:'{}',redirect:'manual'})).status,307);
 });
 await t.test('completed paid CRM work and its revenue are preserved when a change is requested',async()=>{
  const f=await setup('09');assert.equal((await admin.from('jobs').update({status:'completed',final_amount:300000}).eq('id',f.job.id)).error,null);
  assert.equal((await admin.from('sales').insert({job_id:f.job.id,customer_id:f.job.customer_id,sale_date:'2095-01-09',revenue:300000,payment_status:'paid'})).error,null);
  const proposal=await edit(f,f.text.replace('30만원','80만원'));
  const response=await decide(proposal);assert.equal(response.status,409);assert.equal((await response.json()).error,'crm_changed_review_required');
  const sale=(await admin.from('sales').select('revenue,payment_status').eq('job_id',f.job.id).single()).data;
  assert.equal(sale.revenue,300000);assert.equal(sale.payment_status,'paid');
 });
 await t.test('rejected change before CRM linking still permits creating the unchanged approved work',async()=>{
  const f=await setup('10',false);const proposal=await edit(f,f.text.replace('30만원','50만원'));
  assert.equal((await decide(proposal,'reject')).status,200);
  const lookup=await fetch(base+'/api/ai-office/crm?id='+f.item.id,{headers:c.headers});assert.equal(lookup.status,200);
  const approval=(await lookup.json()).approval;assert.equal(approval.fields.amount,300000);
  const response=await fetch(base+'/api/ai-office/crm',{method:'POST',headers:jsonHeaders,body:JSON.stringify({id:f.item.id,
   revision:approval.revision_at,fields:approval.fields,customerId:null,phone:'010-'+String(f.mid).slice(-8),confirmed:true})});
  assert.equal(response.status,200);const jobId=(await response.json()).jobId;
  assert.equal((await admin.from('jobs').select('expected_amount').eq('id',jobId).single()).data.expected_amount,300000);
 });
 await t.test('deleting an administrator preserves approved schedules and clears only reviewer identity',async()=>{
  const user=await admin.auth.admin.createUser({email:'retired-'+randomBytes(8).toString('hex')+'@example.invalid',password:randomBytes(24).toString('base64url'),email_confirm:true});assert.equal(user.error,null);
  try{
   assert.equal((await admin.from('dev_ai_office_admins').insert({user_id:user.data.user.id})).error,null);
   const mid=messageId+offset++,text='2095-01-11 09:00\n고객명: 합성 퇴사 검증\n주소: 합성 퇴사 검증로\n현장: 합성 퇴사 검증\n작업 종류: 청소\n소요시간: 60분\n금액: 10만원';
   assert.equal((await webhook(mid,text)).status,200);const item=(await list()).find(i=>i.message_text===text);ids.push(item.id);
   assert.equal((await admin.rpc('dev_approve_ai_schedule',{p_id:item.id,p_revision:item.revision_at,p_fields:item.review.fields,p_actor:user.data.user.id})).error,null);
   assert.equal((await admin.auth.admin.deleteUser(user.data.user.id)).error,null);
   const approval=await admin.from('dev_ai_schedule_approvals').select('fields,reviewed_by').eq('message_id',item.id).single();assert.equal(approval.error,null);
   assert.equal(approval.data.reviewed_by,null);assert.equal(approval.data.fields.amount,100000);
  }finally{await admin.auth.admin.deleteUser(user.data.user.id);}
 });
}
