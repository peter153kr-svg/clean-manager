import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractSchedule,koreanDay,validateFields } from '@/lib/ai-office/schedule-v1';
import type { ScheduleFields } from '@/lib/ai-office/schedule-v1';
import { POST as telegramIntake } from '@/app/api/telegram/schedule/route';
import { randomInt } from 'node:crypto';
import {isOfficeAdmin} from '@/lib/ai-office/local-server';

export const runtime='nodejs';
export const dynamic='force-dynamic';
// This prototype cannot reach a hosted Supabase project, even with an accidental env file.
function enabled(){
  try{const url=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL??'');
    return process.env.AI_OFFICE_DEV_MODE==='synthetic'&&process.env.VERCEL_ENV!=='production'&&
      url.protocol==='http:'&&url.hostname==='127.0.0.1'&&['55321','56321'].includes(url.port);
  }catch{return false;}
}
async function authorize(){
  if(!enabled())return null;
  const {data,error}=await (await createClient()).auth.getUser();
  return error?null:data.user;
}
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function sameOrigin(request:Request){
  try{const origin=new URL(request.headers.get('origin')??'');
    // Next normalizes request.url to localhost; validate the actual HTTP Host instead.
    return origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname)&&origin.host===request.headers.get('host');
  }catch{return false;}
}
export async function GET(){
  if(!enabled())return reply({error:'local_only'},404);
  const user=await authorize();if(!user)return reply({error:'login_required'},401);
  const isAdmin=await isOfficeAdmin(user.id);
  const db=createAdminClient();
  const [messages,approvals,links,decisions]=await Promise.all([
    db.from('telegram_schedule_messages').select('id,revision_at,posted_at,message_text,status').order('posted_at',{ascending:false}).limit(201),
    db.from('dev_ai_schedule_approvals').select('message_id,revision_at,fields'),
    db.from('dev_ai_schedule_job_links').select('message_id,job_id,revision_at,fields'),
    db.from('dev_ai_schedule_decisions').select('message_id,revision_at,decision'),
  ]);
  if(messages.error||approvals.error||links.error||decisions.error)return reply({error:'local_schema_unavailable'},503);
  if(messages.data.length>200)return reply({error:'inbox_limit_reached'},409);
  return reply({isAdmin,items:messages.data.map(m=>{
    const approval=approvals.data.find(a=>a.message_id===m.id);
    const decision=decisions.data.find(d=>d.message_id===m.id&&d.revision_at===m.revision_at);
    const review=extractSchedule(m.message_text??'',koreanDay(m.posted_at));
    if(review.fields.scope===undefined&&typeof approval?.fields?.scope==='string')review.fields.scope=approval.fields.scope;
    return {...m,review,approved:approval?.fields??null,
      baseRevision:approval?.revision_at??null,decision:decision?.decision??null,
      pendingChange:Boolean(approval&&approval.revision_at!==m.revision_at&&!decision),
      link:links.data.find(link=>link.message_id===m.id)??null};
  })});
}
export async function POST(request:Request){
  if(!enabled())return reply({error:'local_only'},404);
  if(!sameOrigin(request))return reply({error:'origin_rejected'},403);
  const user=await authorize();if(!user)return reply({error:'login_required'},401);
  if(!await isOfficeAdmin(user.id))return reply({error:'admin_required'},403);
  // Bound the actual byte stream, not just an untrusted Content-Length header.
  if(!request.body)return reply({error:'invalid_input'},400);
  const reader=request.body.getReader();let raw='';let bytes=0;const decoder=new TextDecoder();
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
    if(bytes>16384){await reader.cancel();return reply({error:'input_too_large'},413);}raw+=decoder.decode(value,{stream:true});}
    raw+=decoder.decode();
  }finally{reader.releaseLock();}
  let body;try{body=JSON.parse(raw);}catch{return reply({error:'invalid_input'},400);}
  if(!body||typeof body!=='object'||typeof body.id!=='string'||! /^[0-9a-f-]{36}$/i.test(body.id)||
    typeof body.revision!=='string'||!Number.isFinite(Date.parse(body.revision)))return reply({error:'invalid_input'},400);
  const fields=body.fields as ScheduleFields;
  if(!fields||typeof fields!=='object'||validateFields(fields).length)return reply({error:'review_required'},422);
  const {error}=await createAdminClient().rpc('dev_approve_ai_schedule',{
    p_id:body.id,p_revision:body.revision,p_fields:fields,p_actor:user.id,
  });
  if(error){
    if(error.message.includes('stale_revision'))return reply({error:'stale_revision'},409);
    if(error.message.includes('schedule_conflict'))return reply({error:'schedule_conflict'},409);
    if(error.message.includes('change_approval_required'))return reply({error:'change_approval_required'},409);
    if(error.message.includes('admin_required'))return reply({error:'admin_required'},403);
    return reply({error:'approval_failed'},503);
  }
  return reply({ok:true});
}

export async function PUT(request:Request){
  if(!enabled())return reply({error:'local_only'},404);
  if(!sameOrigin(request))return reply({error:'origin_rejected'},403);
  const user=await authorize();if(!user)return reply({error:'login_required'},401);
  if(!await isOfficeAdmin(user.id))return reply({error:'admin_required'},403);
  // Only a fixed fake channel is supported; never expose the webhook secret to the browser.
  if(process.env.TELEGRAM_SCHEDULE_CHANNEL_ID!=='-1000000000001'||!process.env.TELEGRAM_SCHEDULE_WEBHOOK_SECRET)
    return reply({error:'synthetic_intake_unconfigured'},503);
  const reader=request.body?.getReader();if(!reader)return reply({error:'invalid_input'},400);
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>32000){await reader.cancel();return reply({error:'input_too_large'},413);}chunks.push(value);}
  }finally{reader.releaseLock();}
  let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reply({error:'invalid_input'},400);}
  if(!input||typeof input.text!=='string'||!input.text.trim()||input.text.length>10000)return reply({error:'invalid_input'},400);
  const event={channel_post:{message_id:randomInt(1,2**47),date:Math.floor(Date.now()/1000),
    chat:{id:-1000000000001,type:'channel'},text:input.text}};
  return telegramIntake(new Request(new URL('/api/telegram/schedule',request.url),{method:'POST',
    headers:{'x-telegram-bot-api-secret-token':process.env.TELEGRAM_SCHEDULE_WEBHOOK_SECRET},body:JSON.stringify(event)}));
}
