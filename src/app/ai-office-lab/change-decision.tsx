'use client';
import {useState} from 'react';
import Link from 'next/link';
import type {ScheduleFields} from '@/lib/ai-office/schedule-v1';
const names={date:'날짜',time:'시간',customer:'고객',address:'주소',service:'작업 종류',scope:'작업 범위',amount:'금액',duration:'소요시간'};
const errorText:Record<string,string>={admin_required:'관리자만 처리할 수 있습니다.',stale_revision:'새 수정본이 있습니다. 다시 검토하세요.',
 stale_approval:'기존 승인본이 변경됐습니다. 다시 검토하세요.',already_decided:'이미 처리된 요청입니다. 최신 상태를 확인하세요.',
 schedule_conflict:'승인 일정과 시간이 겹칩니다.',crm_time_conflict:'CRM 작업과 시간이 겹치거나 소요시간 확인이 필요합니다.',
 crm_changed_review_required:'CRM에서 이미 변경·진행·매출 처리된 작업입니다. 자동 변경을 중단했습니다.',customer_selection_required:'변경할 고객을 직접 선택하세요.'};
export default function ChangeDecision({id,revision,baseRevision,before,after,hasJob,disabled,onDone}:{id:string;revision:string;baseRevision:string|null;
 before:ScheduleFields|null;after:ScheduleFields;hasJob:boolean;disabled:boolean;onDone:()=>Promise<void>}){
 const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
 const [confirmed,setConfirmed]=useState('');const fingerprint=JSON.stringify(after);
 const [lookup,setLookup]=useState<{name:string;items:{id:string;name:string;address:string;phone:string}[]}|null>(null);
 const [selected,setSelected]=useState({name:'',id:''});
 const customerChanged=Boolean(hasJob&&before&&before.customer!==after.customer);
 async function search(){setBusy(true);try{const r=await fetch('/api/ai-office/changes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'lookup',customer:after.customer})});
   const result=await r.json();if(!r.ok)throw Error('고객 검색 실패');setLookup({name:after.customer,items:result.candidates});setSelected({name:'',id:''});
 }catch(e){setNotice(e instanceof Error?e.message:'검색 실패');}finally{setBusy(false);}}
 async function decide(action:'approve'|'reject'){setBusy(true);try{
  const r=await fetch('/api/ai-office/changes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
   id,revision,baseRevision,baseFields:before,fields:after,action,confirmed:confirmed===fingerprint,
   customerId:customerChanged&&selected.name===after.customer?selected.id||null:null})});
  const result=await r.json();if(!r.ok)throw Error(errorText[result.error]??'처리 실패 · 최신 정보를 확인하세요.');
  await onDone();
 }catch(e){setNotice(e instanceof Error?e.message:'처리 실패');}finally{setBusy(false);}}
 const button='min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-40';
 return <section className="space-y-3 sm:col-span-2" aria-label="일정 변경 비교">
  {before&&<><h4 className="font-semibold">기존 승인본 → 변경안</h4><div className="grid gap-2 sm:grid-cols-2">{(Object.keys(names) as (keyof typeof names)[]).map(key=><div key={key} className={`min-w-0 break-words rounded border p-3 text-sm ${before[key]!==after[key]?'border-amber-300 bg-amber-50':''}`}>
    <b>{names[key]}</b><p>변경 전: {String(before[key]??'미등록')}</p><p>변경 후: {String(after[key]??'미등록')}</p></div>)}</div></>}
  {customerChanged&&<div className="space-y-2 text-sm"><button type="button" className={button} disabled={busy} onClick={search}>변경 고객 검색</button>
    {lookup?.name===after.customer&&lookup.items.map(c=><label key={c.id} className="flex min-h-11 items-center gap-2 rounded border p-2"><input type="radio" name="change-customer" checked={selected.name===after.customer&&selected.id===c.id} onChange={()=>setSelected({name:after.customer,id:c.id})}/><span className="min-w-0 break-words">{c.name} · {c.address} · {c.phone}</span></label>)}
    {lookup?.name===after.customer&&!lookup.items.length&&<p>고객 후보가 없습니다. <Link href="/customers/new" className="underline">관리자 고객 등록</Link> 후 다시 검색하세요.</p>}</div>}
  <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={confirmed===fingerprint} onChange={e=>setConfirmed(e.target.checked?fingerprint:'')}/>변경 전후와 처리 대상을 확인했습니다.</label>
  <div className="flex flex-wrap gap-2">{before&&<button type="button" className={button} disabled={busy||disabled||confirmed!==fingerprint||(customerChanged&&(!selected.id||selected.name!==after.customer))} onClick={()=>decide('approve')}>변경 승인·작업 반영</button>}
    <button type="button" className={button} disabled={busy||confirmed!==fingerprint} onClick={()=>decide('reject')}>요청 반려·기존 유지</button></div>
  <p role="status" className="text-sm text-red-700">{notice}</p>
 </section>;
}
