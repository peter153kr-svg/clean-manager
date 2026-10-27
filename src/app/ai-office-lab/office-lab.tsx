'use client';

import { useMemo, useState } from 'react';
import { analyzeSchedule,approveDraft,approvedJobs,chiefBriefing,contentBrief,receiveSchedule,
  reportingPeriod,revenueReport,shiftDay,validDay } from '@/lib/ai-office/engine';
import type { Draft,OfficeJob,OfficeSale } from '@/lib/ai-office/engine';
import { parseSchedulePost } from '@/lib/telegram/schedule';
import type { SchedulePost } from '@/lib/telegram/schedule';

const money=(value:number|null)=>value===null?'확인 필요':new Intl.NumberFormat('ko-KR').format(value)+'원';
const sampleText=(day:string)=>`${day} 오전 9시\n현장: 합성 아파트 A\n예상 금액: 45만원`;
const statusLabel={draft:'승인 대기',needs_review:'정보 확인',approved:'테스트 승인',ignored:'제외'};
function initialDrafts(day:string):Draft[]{
  return [approveDraft(analyzeSchedule(sampleText(day),day,'sample-a')),
    analyzeSchedule(`${shiftDay(day,1)} 오후 2시\n현장: 합성 오피스텔 B\n금액: 60만원`,day,'sample-b'),
    analyzeSchedule('내일 3시\n금액: 30',day,'sample-review')];
}
export default function OfficeLab({initialDay}:{initialDay:string}){
  const [day,setDay]=useState(initialDay);
  const [tab,setTab]=useState<'schedule'|'chief'|'revenue'|'content'>('schedule');
  const [drafts,setDrafts]=useState(()=>initialDrafts(initialDay));
  const [text,setText]=useState(sampleText(initialDay));
  const [calendar,setCalendar]=useState(false);
  const [selectedDate,setSelectedDate]=useState('');
  const [lastPost,setLastPost]=useState<SchedulePost|null>(null);
  const [messageId,setMessageId]=useState(1001);
  const [notice,setNotice]=useState('');
  const [period,setPeriod]=useState<'day'|'week'|'month'>('day');
  const [contentJob,setContentJob]=useState('sample-a');
  const [contentReviewed,setContentReviewed]=useState(false);
  const jobs=useMemo<OfficeJob[]>(()=>[...approvedJobs(drafts),{id:'sample-completed',job_date:day,
    start_time:'11:00',site:'합성 완료 현장 C',expected_amount:500000,status:'completed'}],[drafts,day]);
  const sales:OfficeSale[]=[{id:'sample-sale',job_id:'sample-completed',sale_date:day,revenue:500000,
    payment_status:'partial',collected_amount:200000}];
  const brief=chiefBriefing(drafts,jobs,day);
  const range=reportingPeriod(day,period);
  const revenue=revenueReport(jobs,sales,range.start,range.end);
  const chosenJob=jobs.find(job=>job.id===contentJob)??jobs[0];
  const content=chosenJob?contentBrief(chosenJob):null;
  const first=day.slice(0,7)+'-01';
  const start=shiftDay(first,-new Date(first+'T00:00:00Z').getUTCDay());
  const days=Array.from({length:42},(_,index)=>shiftDay(start,index));
  const list=drafts.filter(d=>!selectedDate||d.date===selectedDate).slice().sort((a,b)=>
    (a.date??'9999').localeCompare(b.date??'9999')||(a.time??'99').localeCompare(b.time??'99'));
  function intake(edit=false){
    const now=Math.floor(Date.now()/1000);
    const message={message_id:edit&&lastPost?lastPost.message_id:messageId,
      date:edit&&lastPost?Math.floor(new Date(lastPost.posted_at).getTime()/1000):now,
      ...(edit&&lastPost?{edit_date:Math.max(now,Math.floor(new Date(lastPost.revision_at).getTime()/1000)+1)}:{}),
      chat:{id:-1000000000001,type:'channel'},text};
    const parsed=parseSchedulePost({[edit?'edited_channel_post':'channel_post']:message});
    if(!parsed){setNotice('이벤트 형식을 확인해 주세요.');return;}
    setDrafts(current=>receiveSchedule(current,parsed,day));setLastPost(parsed);
    setContentReviewed(false);
    if(!edit)setMessageId(value=>value+1);
    setNotice(edit?'수정본 분석 완료 · 승인을 다시 확인합니다.':'합성 이벤트 수신·분석 완료');
  }
  function approve(key:string){
    try{setDrafts(current=>current.map(d=>d.key===key?approveDraft(d):d));setNotice('화면 안에서만 승인했습니다.');}
    catch{setNotice('확인할 정보를 먼저 보완해 주세요.');}
  }
  const card='rounded-2xl border border-slate-200 bg-white p-5';
  const button='rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';
  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-bold tracking-widest text-blue-600">SKYCLEAN AI OFFICE</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">AI 비서 개발실</h1>
        <p className="mt-2 text-sm text-slate-500">일정 접수부터 대표 보고, 매출 구분, 콘텐츠 기획까지 확인합니다.</p></div>
      <label className="text-sm text-slate-600">보고 기준일 (한국 시간)
        <input aria-label="보고 기준일" type="date" value={day} onChange={e=>{if(validDay(e.target.value)){setDay(e.target.value);setSelectedDate('');setContentReviewed(false);}}}
          className="ml-2 rounded-lg border border-slate-200 bg-white p-2"/></label>
    </header>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      합성 데이터 전용 · 새로고침하면 초기화됩니다. 실제 고객정보를 입력하지 마세요.
      <span className="mt-1 block text-xs">분석은 규칙 기반 개발 버전입니다. 실제 봇 수신·AI API·CRM 저장·외부 발송은 연결하지 않았습니다.</span>
    </div>
    <nav aria-label="AI 직원 선택" className="flex flex-wrap gap-2">
      {([['schedule','일정관리 직원'],['chief','AI 총괄실장'],['revenue','고객·매출 직원'],['content','블로그·릴스 직원']] as const).map(([value,label])=>
        <button key={value} onClick={()=>setTab(value)} aria-pressed={tab===value}
          className={`rounded-xl px-4 py-3 text-sm font-semibold ${tab===value?'bg-blue-600 text-white':'border border-slate-200 bg-white text-slate-600'}`}>{label}</button>)}
    </nav>
    {tab==='schedule'&&<>
      <section className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <div className={card}><h2 className="font-bold text-slate-900">텔레그램 합성 이벤트</h2>
          <p className="mt-2 text-xs text-slate-500">날짜·시간·현장·예상 금액을 분석합니다. 모호한 값은 추측하지 않습니다.</p>
          <label htmlFor="schedule-source" className="mt-4 block text-sm font-semibold">일정 원문</label>
          <textarea id="schedule-source" value={text} maxLength={20000} onChange={e=>setText(e.target.value)} rows={7}
            className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm"/>
          <div className="mt-3 flex flex-wrap gap-2"><button className={button} onClick={()=>intake()}>이벤트 수신·분석</button>
            <button className={button} disabled={!lastPost} onClick={()=>intake(true)}>수정 이벤트 처리</button>
            <button className={button} disabled={!lastPost} onClick={()=>{if(lastPost){setDrafts(current=>receiveSchedule(current,lastPost,day));setNotice('중복 재수신 처리 · 일정 수는 유지됩니다.');}}}>중복 재수신</button></div>
          <p className="mt-3 text-xs text-slate-500">정보가 부족하면 원문에 연도·오전/오후·현장·금액 단위를 명시해 새 이벤트로 확인해 주세요.</p>
        </div>
        <div className={card}><div className="flex items-center justify-between gap-2"><h2 className="font-bold">일정 {drafts.length}건</h2>
          <button className={button} onClick={()=>{setCalendar(v=>!v);setSelectedDate('');}}>{calendar?'목록 보기':'달력 보기'}</button></div>
          {calendar&&<div className="mt-4"><div className="grid grid-cols-7 text-center text-xs text-slate-500">{'일월화수목금토'.split('').map(d=><span key={d}>{d}</span>)}</div>
            <div className="mt-2 grid grid-cols-7 gap-1">{days.map(date=>{const count=drafts.filter(d=>d.date===date&&d.status!=='ignored').length;
              return <button key={date} onClick={()=>setSelectedDate(date)} aria-label={`${date} 일정 ${count}건`}
                className={`min-h-14 rounded-lg border p-1 text-sm ${selectedDate===date?'border-blue-500 bg-blue-50':'border-slate-100'} ${date.slice(0,7)===day.slice(0,7)?'text-slate-800':'text-slate-400'}`}>
                {Number(date.slice(-2))}{count>0&&<span className="block text-[10px] font-bold text-blue-600">{count}건</span>}</button>;})}</div>
            {selectedDate&&<button className="mt-2 text-xs text-blue-700" onClick={()=>setSelectedDate('')}>날짜 필터 해제</button>}</div>}
          <div className="mt-4 max-h-[480px] space-y-3 overflow-y-auto">{!list.length&&<p className="text-sm text-slate-500">이 날짜의 일정이 없습니다.</p>}
            {list.map(d=><article key={d.key} className="rounded-xl border border-slate-100 p-3">
              <div className="flex items-center justify-between gap-2"><b className="text-sm">{d.site??'현장 미확인'}</b><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{statusLabel[d.status]}</span></div>
              <p className="mt-2 text-sm">{d.date??'날짜 미확인'} · {d.time??'시간 미확인'} · {money(d.expectedAmount)}</p>
              {d.issues.length>0&&<p className="mt-2 text-xs text-amber-700">{d.issues.join(' · ')}</p>}
              <div className="mt-3 flex gap-2"><button className={button} disabled={d.issues.length>0||d.status==='approved'||d.status==='ignored'} onClick={()=>approve(d.key)}>테스트 승인</button>
                <button className={button} disabled={d.status==='ignored'} onClick={()=>setDrafts(current=>current.map(v=>v.key===d.key?{...v,status:'ignored'}:v))}>제외</button></div>
              <details className="mt-2 text-xs text-slate-500"><summary>원문·수정 이력 {d.history.length}개</summary>{d.history.map((source,i)=><pre key={i} className="mt-2 whitespace-pre-wrap break-words">{source}</pre>)}</details>
            </article>)}</div>
        </div>
      </section>
    </>}
    {tab==='chief'&&<section className="space-y-4"><div className="grid gap-4 sm:grid-cols-3">
      {[["오늘 예정",brief.today.length+'건'],['내일 예정',brief.tomorrow.length+'건'],['미처리 검토',brief.pending+'건']].map(([label,value])=><div className={card} key={label}><p className="text-sm text-slate-500">{label}</p><b className="mt-2 block text-3xl">{value}</b></div>)}</div>
      <div className={card}><h2 className="font-bold">대표 브리핑</h2><p className="mt-2 text-sm">기준일 {day} · 확인되지 않은 일정은 확정 일정에 포함하지 않습니다.</p>
        {[['오늘',brief.today],['내일',brief.tomorrow]] .map(([label,items])=><div key={String(label)} className="mt-4"><h3 className="text-sm font-semibold">{String(label)}</h3>
          {(items as OfficeJob[]).length?(items as OfficeJob[]).map(j=><p className="mt-1 text-sm text-slate-600" key={j.id}>{j.start_time??'시간 확인'} · {j.site}</p>):<p className="mt-1 text-sm text-slate-400">예정된 일정 없음</p>}</div>)}
        <p className="mt-4 text-sm text-amber-800">검토 대기 {brief.pending}건 · 시간 누락 {brief.missingTimes}건 · 동일 시작시각 {brief.conflicts.length}건</p>
        {brief.conflicts.map(c=><p key={c.at} className="mt-2 text-sm text-red-700">{c.at}: {c.sites.join(', ')} · 작업시간/이동시간을 확인해 주세요.</p>)}
      </div><div className={card}><h2 className="font-bold">직원 업무 상태</h2><ul className="mt-3 space-y-2 text-sm text-slate-600"><li>일정 직원: 검토 대기 {brief.pending}건</li><li>고객·매출 직원: 수납 원장 확인 {revenue.unknownCollections}건</li><li>콘텐츠 직원: 기획안 {contentReviewed?'검토 완료':'승인 대기'}</li></ul></div></section>}
    {tab==='revenue'&&<section className="space-y-4"><div className={card}><label className="text-sm font-semibold">보고 기간 <select aria-label="매출 보고 기간" value={period} onChange={e=>setPeriod(e.target.value as typeof period)} className="ml-3 rounded-lg border p-2"><option value="day">일간</option><option value="week">주간</option><option value="month">월간</option></select></label><p className="mt-3 text-sm text-slate-500">{range.start} ~ {range.end}</p></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['예약·진행 예상',revenue.expected],['확정 매출',revenue.confirmed],['확인된 수납',revenue.collected],['미수금',revenue.receivable]].map(([label,value])=><div className={card} key={String(label)}><p className="text-sm text-slate-500">{String(label)}</p><b className="mt-2 block text-xl">{money(value as number|null)}</b></div>)}</div>
      <div className={card}><h2 className="font-bold">합성 고객·현장 원장</h2><p className="mt-2 text-xs text-slate-500">예상 매출을 확정 매출이나 수납금에 더하지 않습니다. 일부 수납의 실제 금액을 모르면 미수금을 추정하지 않습니다.</p>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">현장</th><th className="p-2">작업일</th><th className="p-2">상태</th><th className="p-2">예상 금액</th></tr></thead><tbody>{jobs.map(j=><tr className="border-b border-slate-100" key={j.id}><td className="p-2">{j.site}</td><td className="p-2">{j.job_date}</td><td className="p-2">{j.status==='completed'?'완료':'예정'}</td><td className="p-2">{money(j.expected_amount)}</td></tr>)}</tbody></table></div></div>
    </section>}
    {tab==='content'&&<section className="space-y-4"><div className={card}><label className="text-sm font-semibold">기획할 현장 <select aria-label="콘텐츠 현장" value={chosenJob?.id??''} onChange={e=>{setContentJob(e.target.value);setContentReviewed(false);}} className="ml-3 rounded-lg border p-2">{jobs.map(j=><option key={j.id} value={j.id}>{j.site}</option>)}</select></label>
      <p className="mt-3 text-sm text-slate-500">실제 완료 사실이나 촬영 동의를 추정하지 않는 기획 초안입니다. 외부 게시 기능은 연결하지 않았습니다.</p></div>
      {content&&<div className="grid gap-4 lg:grid-cols-2"><div className={card}><h2 className="font-bold">블로그 기획 · {content.title}</h2><ol className="mt-4 list-inside list-decimal space-y-3 text-sm text-slate-600">{content.blog.map(line=><li key={line}>{line}</li>)}</ol></div>
        <div className={card}><h2 className="font-bold">릴스 촬영 구성</h2><div className="mt-4 space-y-3">{content.reels.map(beat=><p key={beat.seconds} className="text-sm"><b className="mr-3 text-blue-700">{beat.seconds}</b>{beat.text}</p>)}</div>
          <button className={button+' mt-5'} onClick={()=>setContentReviewed(true)}>{contentReviewed?'기획 검토 완료':'기획 검토 완료로 표시'}</button><p className="mt-2 text-xs text-slate-500">완료 표시를 해도 게시하거나 메시지를 발송하지 않습니다.</p></div></div>}
    </section>}
    <p role="status" aria-live="polite" className="text-sm font-medium text-blue-700">{notice}</p>
  </div>;
}
