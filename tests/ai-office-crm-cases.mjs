import assert from 'node:assert/strict';
export async function crmCases(t,c){
  const {admin,ssr,base,jsonHeaders,list,save,webhook,messageId,ids,customerIds,jobIds,actor}=c;
  const api=base+'/api/ai-office/crm';let offset=20;
  async function draft(name,day='01'){
    const text=`2092-01-${day} 09:00\n고객명: ${name}\n주소: 합성 ${name}로\n현장: 합성 ${name}\n작업 종류: 입주청소\n소요시간: 60분\n금액: 30만원`;
    assert.equal((await webhook(messageId+offset++,text)).status,200);
    const item=(await list()).find(i=>i.message_text===text);ids.push(item.id);assert.equal((await save(item)).status,200);return item;
  }
  async function customer(name,phone){const r=await admin.from('customers').insert({name,phone,address:'합성 '+name+'로'}).select('id').single();assert.equal(r.error,null);customerIds.push(r.data.id);return r.data.id;}
  const lookup=async item=>{const r=await fetch(api+'?id='+item.id,{headers:c.headers});assert.equal(r.status,200);return r.json();};
  const link=(item,customerId=null,phone='010-0000-1234',confirmed=true)=>fetch(api,{method:'POST',headers:jsonHeaders,
    body:JSON.stringify({id:item.id,revision:item.revision_at,fields:item.review.fields,customerId,phone,confirmed})});
  let ambiguous,chosen,createdJob;
  await t.test('ambiguous CRM customer matches are returned without selecting or creating one',async()=>{
    const name='합성 동명이인 '+messageId;chosen=await customer(name,'010-0000-1111');await customer(name,'010-0000-2222');
    ambiguous=await draft(name);const found=await lookup(ambiguous);assert.equal(found.candidates.length,2);assert.equal(found.link,null);
    assert.equal((await link(ambiguous)).status,409);
    assert.equal((await link(ambiguous,chosen,'',false)).status,422);
  });
  await t.test('explicit existing customer confirmation creates one scheduled job without sales',async()=>{
    const r=await link(ambiguous,chosen,'');assert.equal(r.status,200);createdJob=(await r.json()).jobId;
    const job=await admin.from('jobs').select('*').eq('id',createdJob).single();assert.equal(job.error,null);
    assert.equal(job.data.customer_id,chosen);assert.equal(job.data.address,ambiguous.review.fields.address);
    assert.equal(job.data.service_type,'입주청소');assert.equal(job.data.expected_amount,300000);assert.equal(job.data.final_amount,null);
    assert.equal((await admin.from('sales').select('id').eq('job_id',createdJob)).data.length,0);
  });
  await t.test('repeated and concurrent CRM creation requests return the same job',async()=>{
    const responses=await Promise.all([link(ambiguous,chosen,''),link(ambiguous,chosen,'')]);
    for(const r of responses){assert.equal(r.status,200);assert.equal((await r.json()).jobId,createdJob);}
  });
  await t.test('new customer is a draft until confirmed, and phone duplicate blocks creation atomically',async()=>{
    const item=await draft('합성 신규 '+messageId,'02');assert.equal((await lookup(item)).candidates.length,0);
    assert.equal((await link(item,null,'',true)).status,409);
    assert.equal((await link(item,null,'010-0000-1111')).status,409);
    const responses=await Promise.all([link(item,null,'010-0000-3333'),link(item,null,'010-0000-3333')]);
    const jobs=[];for(const r of responses){assert.equal(r.status,200);jobs.push((await r.json()).jobId);}assert.equal(jobs[0],jobs[1]);
    const found=await lookup(item);assert.equal(found.candidates.length,1);assert.equal(found.link.job_id,jobs[0]);
  });
  await t.test('existing manually entered CRM job is not duplicated',async()=>{
    const name='합성 수동 '+messageId;const selected=await customer(name,'010-0000-4444');const item=await draft(name,'03');
    const r=await admin.from('jobs').insert({customer_id:selected,job_date:item.review.fields.date,start_time:'09:00',address:item.review.fields.address,status:'scheduled'}).select('id').single();assert.equal(r.error,null);jobIds.push(r.data.id);
    assert.equal((await link(item,selected,'')).status,409);
  });
  await t.test('different messages cannot concurrently create the same new customer',async()=>{
    const name='합성 동시 신규 '+messageId;const first=await draft(name,'04');const second=await draft(name,'05');
    const responses=await Promise.all([link(first,null,'010-0000-5555'),link(second,null,'010-0000-5555')]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
    const loser=responses[0].status===409?first:second;const found=await lookup(loser);
    assert.equal(found.candidates.length,1);assert.equal((await link(loser,found.candidates[0].id,'')).status,200);
  });
  await t.test('Telegram edits require re-review and never overwrite or delete linked CRM jobs',async()=>{
    const record=await admin.from('telegram_schedule_messages').select('message_id,message_text').eq('id',ambiguous.id).single();
    assert.equal((await webhook(record.data.message_id,record.data.message_text.replace('30만원','40만원'),5)).status,200);
    const changed=(await list()).find(i=>i.id===ambiguous.id);assert.equal(changed.pendingChange,true);assert.equal(changed.link.job_id,createdJob);
    assert.equal((await link(ambiguous,chosen,'')).status,409);
    assert.equal((await save(changed)).status,409);assert.equal((await link(changed,chosen,'')).status,409);
    assert.equal((await admin.from('jobs').select('expected_amount').eq('id',createdJob).single()).data.expected_amount,300000);
  });
  await t.test('CRM API enforces origin, confirmation, login and direct RPC permissions',async()=>{
    assert.equal((await fetch(api,{method:'POST',headers:{...jsonHeaders,origin:'https://example.invalid'},body:'{}'})).status,403);
    assert.equal((await fetch(api+'?id='+ambiguous.id,{redirect:'manual'})).status,307);
    const pending=(await list()).find(i=>!i.approved);assert.ok(pending);
    assert.equal((await fetch(api+'?id='+pending.id,{headers:c.headers})).status,409);
    assert.equal((await link(pending,chosen,'')).status,409);
    const unlinked=(await list()).find(i=>i.approved&&!i.link);
    assert.ok(unlinked);assert.equal((await link({...unlinked,review:{fields:unlinked.approved}},chosen,'')).status,409);
    assert.ok((await ssr.from('dev_ai_schedule_job_links').select('*')).error);
    assert.ok((await ssr.rpc('dev_link_ai_schedule_job',{p_id:ambiguous.id,p_revision:ambiguous.revision_at,p_fields:ambiguous.review.fields,p_customer:chosen,p_phone:'',p_actor:actor})).error);
  });
}
