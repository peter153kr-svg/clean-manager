import { analyzeSchedule, validDay } from './engine';

export type ScheduleFields = {
  date:string; time:string; customer:string; address:string; site:string;
  service:string; scope?:string; amount:number|null; duration:number|null;
};
export type ScheduleReview = { fields:ScheduleFields; issues:string[] };
export function koreanDay(timestamp:string):string {
  return new Date(new Date(timestamp).getTime()+9*3600000).toISOString().slice(0,10);
}
export function validateFields(fields:ScheduleFields):string[] {
  const issues:string[]=[];
  if(!validDay(fields.date)||!/^20\d{2}-/.test(fields.date))issues.push('날짜 확인 필요');
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(fields.time))issues.push('시간 확인 필요');
  for(const [key,label] of [['customer','고객명'],['address','주소'],['site','현장'],['service','작업 종류']] as const){
    if(typeof fields[key]!=='string'||!fields[key].trim()||fields[key].length>300)issues.push(`${label} 확인 필요`);
  }
  if(!Number.isSafeInteger(fields.amount)||fields.amount===null||fields.amount<0||fields.amount>1e9)issues.push('금액 확인 필요');
  if(!Number.isInteger(fields.duration)||fields.duration===null||fields.duration<1||fields.duration>1440)issues.push('소요시간(1~1440분) 확인 필요');
  if(fields.scope!==undefined&&(typeof fields.scope!=='string'||fields.scope.length>300))issues.push('작업 범위 확인 필요');
  return issues;
}
export function extractSchedule(text:string,referenceDay:string):ScheduleReview {
  // Customer/address/service text and duration units are not candidate start times.
  const timingText=text.split('\n').filter(line=>!/^\s*(?:고객명|고객|주소|현장|장소|작업 종류|작업종류|작업 범위|작업범위|작업|소요시간|작업시간)\s*[:：]/.test(line)).join('\n');
  const base=analyzeSchedule(timingText,referenceDay);
  const label=(names:string)=>{
    const matches=[...text.matchAll(new RegExp(`(?:^|\\n)[ \\t]*(?:${names})[ \\t]*[:：][ \\t]*([^\\r\\n]*)`,'g'))];
    const values=[...new Set(matches.map(m=>m[1].trim()))];
    return values.length===1?values[0]:'';
  };
  const durationText=label('소요시간|작업시간');
  const durationMatch=durationText.match(/^(\d+)\s*(분|시간)$/);
  const duration=durationMatch?Number(durationMatch[1])*(durationMatch[2]==='시간'?60:1):null;
  const fields:ScheduleFields={date:base.date??'',time:base.time??'',customer:label('고객명|고객'),
    address:label('주소'),site:label('현장|장소'),service:label('작업 종류|작업종류|작업'),
    amount:base.expectedAmount,duration};
  const scope=label('작업 범위|작업범위');if(scope)fields.scope=scope;
  const uncertainty=/(?:아마|미정|추정|대략|잠정|확인\s*필요|예정\s*미확정|취소|변경\s*예정|\?)/.test(text)?['원문 불확실·취소 표현: 관리자 확인 필요']:[];
  return {fields,issues:[...new Set([...base.issues.filter(issue=>issue!=='현장명 확인 필요'),...validateFields(fields),...uncertainty])]};
}
export function scheduleWarnings(candidate:ScheduleFields,others:ScheduleFields[]):string[] {
  if(validateFields(candidate).length)return [];
  const start=(f:ScheduleFields)=>Date.parse(`${f.date}T${f.time}:00+09:00`);
  const normalize=(s:string)=>s.replace(/\s/g,'').toLowerCase();
  const warnings=new Set<string>();
  for(const other of others){
    if(validateFields(other).length)continue;
    if(candidate.date===other.date&&candidate.time===other.time&&normalize(candidate.address)===normalize(other.address)
      &&normalize(candidate.customer)===normalize(other.customer))warnings.add('중복 일정 후보');
    if(start(candidate)<start(other)+other.duration!*60000&&start(other)<start(candidate)+candidate.duration!*60000)warnings.add('작업 시간 충돌');
  }
  return [...warnings];
}
