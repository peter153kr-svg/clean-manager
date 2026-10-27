import {createAdminClient} from '@/lib/supabase/admin';
import {localEnabled,localOrigin,localUser,boundedJson,isOfficeAdmin} from '@/lib/ai-office/local-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export async function GET(request:Request){
  if(!localEnabled())return reply({error:'local_only'},404);
  if(!await localUser())return reply({error:'login_required'},401);
  const id=new URL(request.url).searchParams.get('id');if(!uuid(id))return reply({error:'invalid_input'},400);
  const db=createAdminClient();
  const [source,approval,link,decisions]=await Promise.all([
    db.from('telegram_schedule_messages').select('revision_at,status').eq('id',id).maybeSingle(),
    db.from('dev_ai_schedule_approvals').select('fields,revision_at').eq('message_id',id).maybeSingle(),
    db.from('dev_ai_schedule_job_links').select('job_id,customer_id,revision_at,fields').eq('message_id',id).maybeSingle(),
    db.from('dev_ai_schedule_decisions').select('revision_at,decision').eq('message_id',id),
  ]);
  if(source.error||approval.error||link.error||decisions.error)return reply({error:'local_schema_unavailable'},503);
  if(!source.data||!approval.data||source.data.status!=='reviewed'||(source.data.revision_at!==approval.data.revision_at&&
    !decisions.data.some(d=>d.revision_at===source.data!.revision_at&&d.decision==='reject')))
    return reply({error:'review_required',link:link.data},409);
  const candidates=await db.rpc('dev_ai_customer_candidates',{p_id:id});if(candidates.error)return reply({error:'lookup_failed'},503);
  if(candidates.data.length>100)return reply({error:'too_many_candidates'},409);
  return reply({approval:approval.data,candidates:candidates.data,link:link.data});
}
export async function POST(request:Request){
  if(!localEnabled())return reply({error:'local_only'},404);
  if(!localOrigin(request))return reply({error:'origin_rejected'},403);
  const user=await localUser();if(!user)return reply({error:'login_required'},401);
  if(!await isOfficeAdmin(user.id))return reply({error:'admin_required'},403);
  let body;try{body=await boundedJson(request);}catch(e){return reply({error:'invalid_input'},e instanceof Error&&e.message==='input_too_large'?413:400);}
  if(!body||!uuid(body.id)||typeof body.revision!=='string'||!body.fields||body.confirmed!==true||
    !(body.customerId===null||uuid(body.customerId))||typeof body.phone!=='string'||body.phone.length>40)
    return reply({error:'confirmation_required'},422);
  const {data,error}=await createAdminClient().rpc('dev_link_ai_schedule_job',{
    p_id:body.id,p_revision:body.revision,p_fields:body.fields,p_customer:body.customerId,p_phone:body.phone,p_actor:user.id,
  });
  if(error){const kind=['stale_approval','linked_job_review_required','customer_selection_required','customer_duplicate_review','existing_job_candidate','phone_required']
    .find(key=>error.message.includes(key));return reply({error:error.message.includes('admin_required')?'admin_required':kind??'link_failed'},error.message.includes('admin_required')?403:kind?409:503);}
  return reply({jobId:data});
}
