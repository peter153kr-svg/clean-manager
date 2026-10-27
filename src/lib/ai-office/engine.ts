import type { SchedulePost } from '../telegram/schedule';

export type Draft = {
  key:string; revision:string; text:string; date:string|null; time:string|null;
  site:string|null; expectedAmount:number|null; issues:string[];
  status:'draft'|'needs_review'|'approved'|'ignored'; history:string[];
};
export type OfficeJob = { id:string; job_date:string; start_time:string|null; site:string;
  expected_amount:number|null; status:'scheduled'|'in_progress'|'completed'|'cancelled' };
export type OfficeSale = { id:string; job_id:string; sale_date:string; revenue:number;
  payment_status:'unpaid'|'partial'|'paid'; collected_amount?:number };

export function validDay(value:string):boolean {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const d=new Date(value+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function shiftDay(day:string,delta:number):string {
  if(!validDay(day)||!Number.isInteger(delta))throw new Error('Invalid reference date');
  const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);
}
const iso=(y:number,m:number,d:number)=>`${y.toString().padStart(4,'0')}-${m.toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;
export function analyzeSchedule(text:string,referenceDay:string,key='synthetic-draft',revision='0'):Draft {
  if(!validDay(referenceDay)||typeof text!=='string'||text.length>20000)throw new Error('Invalid synthetic input');
  const issues:string[]=[];
  const full=[...text.matchAll(/\b(20\d{2})[년./-]\s*(\d{1,2})[월./-]\s*(\d{1,2})(?:일|\b)/g)];
  let date:string|null=null;
  const dates=[...new Set(full.map(m=>iso(Number(m[1]),Number(m[2]),Number(m[3]))))];
  if(dates.length===1){if(validDay(dates[0]))date=dates[0];else issues.push('존재하지 않는 날짜');}
  else if(dates.length>1)issues.push('복수 날짜: 일정 분리 필요');
  else {
    const relative=[...new Set(text.match(/오늘|내일|모레/g)??[])];
    if(relative.length===1)date=shiftDay(referenceDay,relative[0]==='오늘'?0:relative[0]==='내일'?1:2);
    else if(relative.length>1)issues.push('복수 상대 날짜: 일정 분리 필요');
    else if(/\d{1,2}(?:월|\/)\s*\d{1,2}/.test(text))issues.push('연도를 포함한 날짜 확인 필요');
  }
  if(!date)issues.push('작업일 확인 필요');
  if(date&&dates.length===1){
    const relative=text.match(/오늘|내일|모레/g)??[];
    if(relative.some(word=>shiftDay(referenceDay,word==='오늘'?0:word==='내일'?1:2)!==date)){
      date=null;issues.push('명시 날짜와 상대 날짜 불일치');
    }
  }
  const times=[...text.matchAll(/(오전|오후)?\s*(\d{1,2})(?::(\d{2})|시(?:\s*(\d{1,2})분)?)/g)];
  let time:string|null=null;
  if(times.length===1){
    const match=times[0];let hour=Number(match[2]);const minute=Number(match[3]??match[4]??0);
    if(match[1]){if(hour<1||hour>12)hour=-1;else hour=hour%12+(match[1]==='오후'?12:0);}
    else if(!match[3]&&hour>0&&hour<=12){hour=-1;issues.push('오전/오후 확인 필요');}
    if(hour>=0&&hour<24&&minute>=0&&minute<60)time=`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
    else issues.push('시간 확인 필요');
  }else issues.push(times.length?'복수 시간: 일정 분리 필요':'시간 확인 필요');
  const site=text.match(/(?:^|\n)\s*(?:현장|장소)\s*[:：]\s*([^\n]+)/)?.[1].trim().slice(0,150)??null;
  if(!site)issues.push('현장명 확인 필요');
  const amounts=[...text.matchAll(/(?:예상\s*금액|예상\s*매출|금액|견적)\s*[:：]?\s*(-?[\d,]+(?:\.\d+)?)\s*(만원|만\s*원|원)/g)];
  let expectedAmount:number|null=null;
  if(amounts.length===1){
    const m=amounts[0];const value=Number(m[1].replaceAll(',',''))*(m[2].includes('만')?10000:1);
    if(/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(m[1])&&
      Number.isSafeInteger(value)&&value>=0&&value<=1_000_000_000)expectedAmount=value;
  }
  if(expectedAmount===null)issues.push(amounts.length>1?'복수 금액: 견적 확인 필요':'단위가 있는 예상 금액 확인 필요');
  return {key,revision,text,date,time,site,expectedAmount,issues:[...new Set(issues)],
    status:issues.length?'needs_review':'draft',history:[text]};
}

export function receiveSchedule(drafts:Draft[],post:SchedulePost,referenceDay:string):Draft[] {
  const key=`${post.channel_id}:${post.message_id}`;
  const existing=drafts.find(d=>d.key===key);
  if(existing&&existing.revision>=post.revision_at)return drafts;
  const draft=analyzeSchedule(post.message_text??'',referenceDay,key,post.revision_at);
  if(existing)draft.history=[...existing.history,draft.text];
  return [...drafts.filter(d=>d.key!==key),draft];
}
export function approveDraft(draft:Draft):Draft {
  if(draft.issues.length||!draft.date||!draft.time||!draft.site||draft.expectedAmount===null)throw new Error('Review unresolved fields first');
  return {...draft,status:'approved'};
}
export function approvedJobs(drafts:Draft[]):OfficeJob[] {
  return drafts.filter(d=>d.status==='approved'&&d.date&&d.site).map(d=>({id:d.key,job_date:d.date!,
    start_time:d.time,site:d.site!,expected_amount:d.expectedAmount,status:'scheduled'}));
}
export function reportingPeriod(day:string,kind:'day'|'week'|'month'):{start:string;end:string} {
  if(!validDay(day))throw new Error('Invalid reporting day');
  if(kind==='day')return {start:day,end:day};
  if(kind==='week'){const dow=new Date(day+'T00:00:00Z').getUTCDay();const start=shiftDay(day,-((dow+6)%7));return {start,end:shiftDay(start,6)};}
  const start=day.slice(0,7)+'-01';const next=new Date(start+'T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);
  return {start,end:shiftDay(next.toISOString().slice(0,10),-1)};
}
export function revenueReport(jobs:OfficeJob[],sales:OfficeSale[],start:string,end:string) {
  if(!validDay(start)||!validDay(end)||start>end)throw new Error('Invalid revenue period');
  const inRange=(day:string)=>validDay(day)&&day>=start&&day<=end;
  const money=(n:number)=>Number.isSafeInteger(n)&&n>=0;
  let expected=0,confirmed=0,collected=0,unknownCollections=0;
  const seenJobs=new Set<string>();const seenSales=new Set<string>();
  for(const job of jobs){
    if(seenJobs.has(job.id))throw new Error('Duplicate job');seenJobs.add(job.id);
    if(!inRange(job.job_date)||!['scheduled','in_progress'].includes(job.status))continue;
    if(job.expected_amount!==null){if(!money(job.expected_amount))throw new Error('Invalid expected amount');expected+=job.expected_amount;}
  }
  for(const sale of sales){
    if(seenSales.has(sale.id))throw new Error('Duplicate sale');seenSales.add(sale.id);
    if(!inRange(sale.sale_date))continue;
    if(!money(sale.revenue))throw new Error('Invalid confirmed amount');confirmed+=sale.revenue;
    if(sale.collected_amount!==undefined){
      if(!money(sale.collected_amount)||sale.collected_amount>sale.revenue)throw new Error('Invalid collected amount');
      collected+=sale.collected_amount;
    }else if(sale.payment_status==='paid')collected+=sale.revenue;
    else if(sale.payment_status==='partial')unknownCollections++;
  }
  return {expected,confirmed,collected,unknownCollections,
    receivable:unknownCollections?null:confirmed-collected};
}
export function chiefBriefing(drafts:Draft[],jobs:OfficeJob[],day:string) {
  const upcoming=jobs.filter(j=>j.status!=='cancelled'&&j.status!=='completed');
  const today=upcoming.filter(j=>j.job_date===day);
  const tomorrow=upcoming.filter(j=>j.job_date===shiftDay(day,1));
  const grouped=new Map<string,string[]>();
  for(const j of upcoming){if(!j.start_time)continue;const key=`${j.job_date} ${j.start_time}`;
    grouped.set(key,[...(grouped.get(key)??[]),j.site]);}
  return {today,tomorrow,pending:drafts.filter(d=>['draft','needs_review'].includes(d.status)).length,
    conflicts:[...grouped].filter(([,sites])=>sites.length>1).map(([at,sites])=>({at,sites})),
    missingTimes:upcoming.filter(j=>!j.start_time).length};
}
export function contentBrief(job:OfficeJob) {
  return {title:`${job.site} 청소 콘텐츠 기획안`,status:'approval_required' as const,
    blog:[`현장: ${job.site}`,`예정일: ${job.job_date}`,'작업 범위·촬영 동의 확인',
      '완료 사진과 실제 작업 사실 확보 후 본문 작성','주소·연락처·얼굴·차량번호 공개 전 검토'],
    reels:[{seconds:'0–3초',text:'현장과 오늘의 작업 계획 소개'},
      {seconds:'3–12초',text:'동의받은 작업 과정 촬영'},
      {seconds:'12–20초',text:'완료 결과 확인 후 비교 장면 구성'},
      {seconds:'20–25초',text:'검수·음원 권리 확인 후 게시 승인 요청'}]};
}
