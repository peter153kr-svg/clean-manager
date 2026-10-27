import {createAdminClient} from '@/lib/supabase/admin';
import {localEnabled,localOrigin,localUser,boundedJson,isOfficeAdmin} from '@/lib/ai-office/local-server';
import {validateFields} from '@/lib/ai-office/schedule-v1';
export const runtime='nodejs';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
 if(!localEnabled())return reply({error:'local_only'},404);
 if(!localOrigin(request))return reply({error:'origin_rejected'},403);
 const user=await localUser();if(!user)return reply({error:'login_required'},401);
 if(!await isOfficeAdmin(user.id))return reply({error:'admin_required'},403);
 let body;try{body=await boundedJson(request);}catch{return reply({error:'invalid_input'},400);}
 if(body?.action==='lookup'&&typeof body.customer==='string'&&body.customer.trim().length>0&&body.customer.length<=300){
  const {data,error}=await createAdminClient().from('customers').select('id,name,address,phone').eq('name',body.customer.trim()).limit(101);
  if(error||data.length>100)return reply({error:'customer_lookup_failed'},409);
  return reply({candidates:data});
 }
 if(!body||!['approve','reject'].includes(body.action)||body.confirmed!==true||typeof body.id!=='string'||
   !/^[0-9a-f-]{36}$/i.test(body.id)||typeof body.revision!=='string'||!Number.isFinite(Date.parse(body.revision))||
   !(body.baseRevision===null||typeof body.baseRevision==='string')||!(body.baseFields===null||typeof body.baseFields==='object')||
   !(body.customerId===null||typeof body.customerId==='string'))return reply({error:'confirmation_required'},422);
 if(body.action==='approve'&&(!body.fields||validateFields(body.fields).length))return reply({error:'review_required'},422);
 const {error}=await createAdminClient().rpc('dev_decide_ai_change',{
  p_id:body.id,p_revision:body.revision,p_fields:body.fields??null,p_actor:user.id,p_decision:body.action,
  p_base_revision:body.baseRevision,p_base_fields:body.baseFields,p_customer:body.customerId,
 });
 if(error){const kind=['admin_required','stale_revision','already_decided','stale_approval','schedule_conflict','crm_time_conflict',
  'crm_changed_review_required','customer_selection_required','invalid_fields'].find(k=>error.message.includes(k));
  return reply({error:kind??'decision_failed'},kind==='admin_required'?403:kind?409:503);}
 return reply({ok:true});
}
