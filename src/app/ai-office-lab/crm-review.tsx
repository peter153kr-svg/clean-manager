'use client';
import {useState} from 'react';
import type {ScheduleFields} from '@/lib/ai-office/schedule-v1';
type Candidate={id:string;name:string;phone:string;address:string|null};
type Lookup={candidates:Candidate[];approval:{fields:ScheduleFields;revision_at:string};link:{job_id:string}|null};
const errors:Record<string,string>={review_required:'최신 일정을 먼저 재검토·승인하세요.',stale_approval:'승인 정보가 변경됐습니다. 다시 조회하세요.',
  linked_job_review_required:'기존 작업이 있습니다. 변경 내용을 CRM에서 직접 검토하세요. 기존 작업은 유지됩니다.',
  customer_duplicate_review:'같은 고객명·주소 또는 연락처가 있습니다. 고객을 다시 검색·선택하세요.',
  existing_job_candidate:'같은 고객·날짜·시간·주소의 작업이 이미 있습니다. CRM에서 확인하세요.',
  customer_selection_required:'고객을 다시 검색하고 직접 선택하세요.',phone_required:'신규 고객 연락처를 확인하세요.'};
export default function CrmReview({id,onLinked}:{id:string;onLinked:()=>Promise<void>}){
  const [lookup,setLookup]=useState<Lookup|null>(null);const [selected,setSelected]=useState('');
  const [phone,setPhone]=useState('');const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
  async function search(){setBusy(true);setLookup(null);setSelected('');setConfirmed(false);
    try{const r=await fetch('/api/ai-office/crm?id='+id,{cache:'no-store'});const data=await r.json();
      if(!r.ok)throw Error(errors[data.error]??'고객 검색 실패');setLookup(data);setPhone('');
      setNotice(data.candidates.length>1?'여러 고객이 검색됐습니다. 이름·주소·연락처를 비교해 직접 선택하세요.':data.candidates.length?'고객을 직접 선택하세요.':'일치 고객 없음 · 신규 고객 등록 초안을 확인하세요.');
    }catch(e){setNotice(e instanceof Error?e.message:'검색 실패');}finally{setBusy(false);}}
  async function link(){if(!lookup)return;setBusy(true);
    try{const r=await fetch('/api/ai-office/crm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      id,revision:lookup.approval.revision_at,fields:lookup.approval.fields,customerId:selected==='new'?null:selected,phone,confirmed})});
      const data=await r.json();if(!r.ok)throw Error(errors[data.error]??'작업 생성 실패');
      setNotice('CRM 작업 연결 완료 · 매출·수납은 생성하지 않았습니다.');setLookup(null);await onLinked();
    }catch(e){setNotice(e instanceof Error?e.message:'연결 실패');}finally{setBusy(false);}}
  const button='min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-40';
  return <div className="mt-3 space-y-3 border-t pt-3">
    <button className={button} disabled={busy} onClick={search}>CRM 고객 검색·작업 연결</button>
    <p role="status" className="break-words text-sm text-blue-800">{notice}</p>
    {lookup&&<fieldset disabled={busy} className="min-w-0 space-y-3"><legend className="text-sm font-semibold">관리자 고객·작업 확인</legend>
      {lookup.candidates.map(c=><label key={c.id} className="flex min-h-11 items-start gap-2 rounded border p-3 text-sm">
        <input type="radio" name={'customer-'+id} value={c.id} checked={selected===c.id} onChange={()=>{setSelected(c.id);setConfirmed(false);}} className="mt-1"/>
        <span className="min-w-0 break-words">{c.name} · {c.phone}<span className="block">{c.address??'주소 미등록'}</span></span></label>)}
      {!lookup.candidates.length&&<><label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name={'customer-'+id} checked={selected==='new'} onChange={()=>{setSelected('new');setConfirmed(false);}}/>신규 고객 등록 초안 선택</label>
        <p className="break-words text-sm">{lookup.approval.fields.customer} · {lookup.approval.fields.address}</p>
        <label className="block text-sm">신규 고객 연락처<input aria-label="신규 고객 연락처" type="tel" autoComplete="off" value={phone} maxLength={40} onChange={e=>{setPhone(e.target.value);setConfirmed(false);}} className="mt-1 min-h-11 w-full rounded border p-2"/></label></>}
      <p className="break-words text-sm">작업 초안: {lookup.approval.fields.date} {lookup.approval.fields.time} · {lookup.approval.fields.service} · 예상 {lookup.approval.fields.amount?.toLocaleString('ko-KR')}원</p>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>고객·주소·작업 초안을 확인했습니다.</label>
      <button className={button} disabled={!confirmed||!selected||(selected==='new'&&!/^[0-9+() -]{7,40}$/.test(phone))} onClick={link}>확인 후 CRM 작업 생성</button>
    </fieldset>}
  </div>;
}
