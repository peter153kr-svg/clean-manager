import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import OfficeLab from './office-lab';

export const dynamic = 'force-dynamic';
export const metadata:Metadata={title:'AI 비서 개발실 | 맑은하늘클린',robots:{index:false,follow:false}};
export default function AiOfficeLabPage(){
  if(process.env.AI_OFFICE_DEV_MODE!=='synthetic'&&process.env.VERCEL_ENV!=='preview')notFound();
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const part=(kind:string)=>parts.find(p=>p.type===kind)!.value;
  return <OfficeLab initialDay={`${part('year')}-${part('month')}-${part('day')}`}/>;
}
