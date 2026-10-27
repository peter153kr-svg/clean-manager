import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
export async function isOfficeAdmin(userId:string){
  if(!localEnabled())return false;
  const {data,error}=await createAdminClient().from('dev_ai_office_admins').select('user_id').eq('user_id',userId).maybeSingle();
  return !error&&Boolean(data);
}
export function localEnabled(){
  try{const url=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL??'');
    return process.env.AI_OFFICE_DEV_MODE==='synthetic'&&process.env.VERCEL_ENV!=='production'&&
      url.protocol==='http:'&&url.hostname==='127.0.0.1'&&['55321','56321'].includes(url.port);
  }catch{return false;}
}
export function localOrigin(request:Request){
  try{const origin=new URL(request.headers.get('origin')??'');return origin.protocol==='http:'&&
    ['localhost','127.0.0.1'].includes(origin.hostname)&&origin.host===request.headers.get('host');}catch{return false;}
}
export async function localUser(){
  if(!localEnabled())return null;
  const {data,error}=await (await createClient()).auth.getUser();return error?null:data.user;
}
export async function boundedJson(request:Request){
  const reader=request.body?.getReader();if(!reader)throw new Error('invalid_input');
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>16384){await reader.cancel();throw new Error('input_too_large');}chunks.push(value);}
  }finally{reader.releaseLock();}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
