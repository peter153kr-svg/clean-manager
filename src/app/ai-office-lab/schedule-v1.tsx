'use client';
import { useCallback,useEffect,useState } from 'react';
import { scheduleWarnings,validateFields } from '@/lib/ai-office/schedule-v1';
import type { ScheduleFields,ScheduleReview } from '@/lib/ai-office/schedule-v1';
import { shiftDay } from '@/lib/ai-office/engine';
import CrmReview from './crm-review';
import ChangeDecision from './change-decision';
type Item={id:string;revision_at:string;message_text:string;status:string;review:ScheduleReview;approved:ScheduleFields|null;
  link:{job_id:string;revision_at:string;fields:ScheduleFields}|null;baseRevision:string|null;pendingChange:boolean;decision:'approve'|'reject'|null};
const api='/api/ai-office/schedules';
const labels={date:'날짜',time:'시작 시간',customer:'고객명',address:'주소',site:'현장명',service:'작업 종류',scope:'작업 범위',amount:'예상 금액(원)',duration:'소요시간(분)'};
const button='min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-40';
const errors:Record<string,string>={local_only:'로컬 합성 DB에서만 연결할 수 있습니다.',local_schema_unavailable:'로컬 V1 스키마 준비가 필요합니다.',
  stale_revision:'수신 원문이 수정됐습니다. 최신 정보를 다시 검토하세요.',schedule_conflict:'승인 일정과 시간이 겹칩니다. 날짜·시간·소요시간을 확인하세요.',
  synthetic_intake_unconfigured:'로컬 합성 채널 설정이 필요합니다.',inbox_limit_reached:'합성 수신함 200건 한도입니다. 테스트 데이터를 정리하세요.',review_required:'모든 필드를 확인하세요.'};
export default function ScheduleV1({day,briefingOnly=false}:{day:string;briefingOnly?:boolean}){
  const [items,setItems]=useState<Item[]>([]);const [notice,setNotice]=useState('로컬 수신함 연결 중');
  const [isAdmin,setIsAdmin]=useState(false);
  const [busy,setBusy]=useState(false);const [text,setText]=useState(`${day} 오전 9시\n고객명: 합성 고객 A\n주소: 합성시 테스트로 1\n현장: 합성 아파트 A\n작업 종류: 입주청소\n소요시간: 120분\n금액: 45만원`);
  const [review,setReview]=useState<{item:Item;fields:ScheduleFields}|null>(null);
  const [selected,setSelected]=useState('');const [monthOffset,setMonthOffset]=useState(0);
  const monthDate=new Date(day.slice(0,7)+'-01T00:00:00Z');monthDate.setUTCMonth(monthDate.getUTCMonth()+monthOffset);
  const month=monthDate.toISOString().slice(0,7);
  const load=useCallback(async()=>{
    const response=await fetch(api,{cache:'no-store'});const data=await response.json();
    if(!response.ok)throw new Error(errors[data.error]??'로컬 수신함을 불러오지 못했습니다.');
    setItems(data.items);setIsAdmin(data.isAdmin===true);
  },[]);
  useEffect(()=>{let active=true;
    // Polling refreshes incoming/edited webhook posts. Revision checks protect an open review form.
    const refresh=()=>{if(active)load().then(()=>{if(active)setNotice('로컬 수신함 연결됨 · 10초마다 갱신');}).catch(e=>{if(active)setNotice(e.message);});};
    refresh();const timer=setInterval(refresh,10000);return()=>{active=false;clearInterval(timer);};
  },[load]);
  const approved=items.filter(i=>i.approved).map(i=>({id:i.id,...i.approved!}));
  const first=month+'-01';const start=shiftDay(first,-new Date(first+'T00:00:00Z').getUTCDay());
  const days=Array.from({length:42},(_,i)=>shiftDay(start,i));
  const warning=review?scheduleWarnings(review.fields,approved.filter(a=>a.id!==review.item.id)):[];
  async function send(method:string,body:unknown){
    setBusy(true);try{const r=await fetch(api,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const result=await r.json();if(!r.ok)throw new Error(errors[result.error]??'요청 실패 · 연결 상태와 입력을 확인하세요.');
      await load();setNotice(method==='PUT'?'합성 텔레그램 수신·분석 완료':'검토 승인 완료 · 달력과 브리핑에 반영');
      if(method==='POST')setReview(null);
    }catch(e){setNotice(e instanceof Error?e.message:'요청 실패');}finally{setBusy(false);}
  }
  const moveMonth=(delta:number)=>{setMonthOffset(value=>value+delta);setSelected('');};
  return <section className="space-y-5" aria-label="일정관리 V1">
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4"><h2 className="font-bold">일정관리 V1 · 로컬 DB 연결</h2>
      <p className="mt-2 text-sm">합성 텔레그램 수신 → 정보 추출 → 관리자 검토 → 승인 달력 → 일일 브리핑</p>
      <p className="mt-1 text-xs">실제 고객정보 입력 금지. 승인 기록은 로컬 DB에 저장됩니다. 위 실험용 직원 화면과 데이터는 별도입니다.</p></div>
    <p role="status" aria-live="polite" className="text-sm text-blue-800">{notice}</p>
    <p className="text-sm">{isAdmin?'관리자 · 최종 승인/반려 가능':'일반 사용자 · 읽기 전용'} · 신규 검토 {items.filter(i=>!i.approved&&i.status!=='ignored').length}건 · 변경 대기 {items.filter(i=>i.pendingChange).length}건</p>
    {!briefingOnly&&<><div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <div className="rounded-xl border bg-white p-4"><h3 className="font-semibold">합성 텔레그램 일정 접수</h3>
        <label className="mt-3 block text-sm">메시지 원문<textarea aria-label="V1 합성 메시지" rows={9} maxLength={10000} value={text} onChange={e=>setText(e.target.value)} className="mt-2 w-full rounded-lg border p-3"/></label>
        <button className={button+' mt-3'} disabled={busy||!isAdmin} onClick={()=>send('PUT',{text})}>합성 메시지 수신</button>
        <button className={button+' ml-2 mt-3'} disabled={busy} onClick={()=>load().catch(e=>setNotice(e.message))}>새로고침</button>
        <p className="mt-3 text-xs text-slate-600">PR #1의 동일한 수신 처리와 RPC를 사용합니다. 날짜는 원문 수신 시점의 한국 날짜를 기준으로 해석합니다.</p></div>
      <div className="rounded-xl border bg-white p-4"><h3 className="font-semibold">관리자 검토함 · {items.filter(i=>!i.approved&&i.status!=='ignored').length}건</h3>
        <div className="mt-3 max-h-96 space-y-3 overflow-y-auto">{items.filter(i=>i.status!=='ignored').map(item=><article key={item.id} className="rounded-lg border p-3">
          <p className="break-words font-medium">{item.approved?.site||item.review.fields.site||'현장 미확인'} · {item.pendingChange?'변경 승인 대기':item.decision==='reject'?'변경 반려 · 기존 유지':item.approved?'승인됨':'관리자 확인 필요'}</p>
          {!item.approved&&<p className="mt-1 text-xs text-amber-800">{item.review.issues.join(' · ')}</p>}
          {(!item.approved||item.pendingChange)&&scheduleWarnings(item.review.fields,items.filter(i=>i.id!==item.id&&i.status!=='ignored').map(i=>i.approved??i.review.fields)).map(w=><p key={w} className="text-xs text-red-700">{w} · 다른 검토 대기 일정 포함</p>)}
          <button className={button+' mt-2'} disabled={busy||!isAdmin} onClick={()=>setReview({item,fields:{...(item.pendingChange?item.review.fields:item.approved??item.review.fields)}})}>정보 검토·보완</button>
          {item.link&&<p className="mt-2 break-words text-sm text-blue-800"><a href={'/jobs/'+item.link.job_id} className="underline">연결된 CRM 작업 보기</a>
            {item.pendingChange||!item.approved||JSON.stringify(item.link.fields)!==JSON.stringify(item.approved)?' · 변경 내용 재검토 필요 · 기존 작업 유지':' · 작업 연결됨'}</p>}
          {isAdmin&&item.approved&&!item.pendingChange&&!item.link&&<CrmReview key={item.id+item.revision_at+JSON.stringify(item.approved)} id={item.id} onLinked={load}/>}
        </article>)}{!items.length&&<p className="text-sm">수신된 합성 일정이 없습니다.</p>}</div></div>
    </div>
    {review&&<section className="rounded-xl border-2 border-blue-300 bg-white p-4" aria-label="관리자 일정 검토">
      <h3 className="font-bold">원문과 대조 후 승인</h3><pre className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">{review.item.message_text}</pre>
      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();send('POST',{id:review.item.id,revision:review.item.revision_at,fields:review.fields});}}>
        {(Object.keys(labels) as (keyof ScheduleFields)[]).map(key=><label key={key} className="text-sm">{labels[key]}
          <input required={key!=='scope'} aria-label={labels[key]} type={key==='date'?'date':key==='time'?'time':key==='amount'||key==='duration'?'number':'text'}
            min={key==='duration'?1:0} max={key==='duration'?1440:key==='amount'?1e9:undefined} step={1} maxLength={300}
            value={review.fields[key]??''} onChange={e=>{const value=e.target.value;setReview({...review,fields:{...review.fields,[key]:key==='amount'||key==='duration'?(value===''?null:Number(value)):value}});}}
            className="mt-1 min-h-11 w-full rounded-lg border p-2"/></label>)}
        <p className="text-sm text-red-700 sm:col-span-2">{[...validateFields(review.fields),...warning].join(' · ')}</p>
        {!review.item.link&&!review.item.pendingChange&&<button className={button} disabled={!isAdmin||busy||validateFields(review.fields).length>0||warning.length>0}>검토 완료·달력 승인</button>}
        <button type="button" className={button} onClick={()=>setReview(null)}>검토 닫기</button>
        {isAdmin&&<ChangeDecision id={review.item.id} revision={review.item.revision_at} baseRevision={review.item.baseRevision}
          before={review.item.approved} after={review.fields} hasJob={Boolean(review.item.link)} disabled={validateFields(review.fields).length>0||warning.length>0}
          onDone={async()=>{await load();setReview(null);setNotice('검토 처리 완료 · 승인본/CRM 작업을 확인하세요.');}}/>}
      </form></section>}
    <section className="rounded-xl border bg-white p-4" aria-label="승인 일정 달력"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">승인 달력 · {month}</h3>
      <div className="flex gap-2"><button className={button} onClick={()=>moveMonth(-1)} aria-label="이전 달">이전</button><button className={button} onClick={()=>moveMonth(1)} aria-label="다음 달">다음</button></div></div>
      <div className="mt-3 grid grid-cols-7 text-center text-xs">{'일월화수목금토'.split('').map(d=><span key={d}>{d}</span>)}</div>
      <div className="mt-2 grid grid-cols-7 gap-1">{days.map(date=>{const count=approved.filter(a=>a.date===date).length;return <button key={date}
        aria-label={`${date} 승인 일정 ${count}건`} aria-pressed={selected===date} onClick={()=>setSelected(date)}
        className={`min-h-14 rounded border p-1 text-sm ${selected===date?'border-blue-600 bg-blue-50':'border-slate-200'} ${date.startsWith(month)?'':'text-slate-400'}`}>
        {Number(date.slice(-2))}<span className="block text-xs">{count?`${count}건`:''}</span></button>;})}</div>
      <button className="mt-3 min-h-11 text-sm text-blue-700" onClick={()=>setSelected('')}>전체 승인 일정 보기</button>
      {approved.filter(a=>!selected||a.date===selected).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).map(a=><div key={a.id} className="mt-3 break-words rounded-lg bg-slate-50 p-3 text-sm">
        <b>{a.date} {a.time} · {a.site}</b><p>{a.customer} · {a.address}</p><p>{a.service} · {a.duration}분 · {a.amount?.toLocaleString('ko-KR')}원</p></div>)}
    </section></>}
    <section className="rounded-xl border bg-white p-4" aria-label="V1 일일 브리핑"><h3 className="font-bold">총괄실장 · 일일 브리핑</h3>
      {[['오늘',day],['내일',shiftDay(day,1)]].map(([label,date])=>{const list=approved.filter(a=>a.date===date).sort((a,b)=>a.time.localeCompare(b.time));return <div key={date} className="mt-3 text-sm">
        <b>{label} ({date}) · {list.length}건 · 예상 {list.reduce((sum,a)=>sum+(a.amount??0),0).toLocaleString('ko-KR')}원</b>
        {list.map(a=><p key={a.id} className="mt-1 break-words">{a.time} · {a.site} · {a.customer} · {a.service}</p>)}</div>;})}
      <p className="mt-4 text-sm text-amber-800">관리자 검토 대기 {items.filter(i=>(!i.approved&&i.status!=='ignored')||i.pendingChange).length}건 · 예상 금액은 확정 매출·수납이 아닙니다.</p>
    </section>
  </section>;
}
