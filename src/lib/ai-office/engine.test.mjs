import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSchedule,approveDraft,receiveSchedule,approvedJobs,reportingPeriod,revenueReport,chiefBriefing,contentBrief } from './engine.ts';
const day='2026-12-31';
const text='내일 오후 2시 30분\n현장: 합성 아파트 A\n예상 금액: 35.5만원';
test('relative Korean date crosses year boundary; time and won are normalized',()=>{
  const d=analyzeSchedule(text,day);assert.equal(d.date,'2027-01-01');assert.equal(d.time,'14:30');
  assert.equal(d.expectedAmount,355000);assert.equal(d.status,'draft');assert.equal(d.issues.length,0);
});
test('explicit date, midnight/noon and zero money remain distinct from missing data',()=>{
  for(const [time,expected] of [['오전 12시','00:00'],['오후 12시','12:00']]){
    const d=analyzeSchedule(`2027-01-01 ${time}\n현장: 합성\n금액: 0원`,day);
    assert.equal(d.time,expected);assert.equal(d.expectedAmount,0);
  }
});
test('invalid dates, ambiguous times and missing money units cannot be approved',()=>{
  for(const raw of ['2027-02-30 14:00\n현장: 합성\n금액: 3만원',
    '내일 3시\n현장: 합성\n금액: 3만원','내일 14:00\n현장: 합성\n금액: 30000']){
    const d=analyzeSchedule(raw,day);assert.ok(d.issues.length);assert.throws(()=>approveDraft(d));
  }
});
test('multiple dates and multiple prices require review, deposits are not expected revenue',()=>{
  const d=analyzeSchedule('2027-01-01 2027-01-02 14:00\n현장: 합성\n금액: 30만원\n견적: 40만원',day);
  assert.equal(d.date,null);assert.equal(d.expectedAmount,null);
  const single=analyzeSchedule(text+'\n예약금: 5만원',day);assert.equal(single.expectedAmount,355000);
});
test('contradictory date wording and malformed thousands separators are not silently corrected',()=>{
  assert.equal(analyzeSchedule('2027-01-02 오늘 14:00\n현장: 합성\n금액: 30만원',day).date,null);
  assert.equal(analyzeSchedule('내일 14:00\n현장: 합성\n금액: 3,5만원',day).expectedAmount,null);
});
test('duplicate/stale Telegram revisions preserve approval; newer edit resets review',()=>{
  const post={channel_id:-100,message_id:1,revision_at:'2026-12-31T01:00:00Z',message_text:text};
  let drafts=receiveSchedule([],post,day);drafts=[approveDraft(drafts[0])];
  assert.equal(receiveSchedule(drafts,post,day),drafts);
  assert.equal(receiveSchedule(drafts,{...post,revision_at:'2026-12-30T01:00:00Z'},day),drafts);
  const updated=receiveSchedule(drafts,{...post,revision_at:'2026-12-31T02:00:00Z',message_text:text.replace('35.5','40')},day);
  assert.equal(updated.length,1);assert.equal(updated[0].status,'draft');assert.equal(updated[0].history.length,2);
});
test('only approved schedules become job-shaped drafts',()=>{
  const draft=analyzeSchedule(text,day);assert.equal(approvedJobs([draft]).length,0);
  assert.equal(approvedJobs([approveDraft(draft)])[0].expected_amount,355000);
});
test('week starts Monday and month boundaries handle leap years',()=>{
  assert.deepEqual(reportingPeriod('2026-12-31','week'),{start:'2026-12-28',end:'2027-01-03'});
  assert.deepEqual(reportingPeriod('2028-02-10','month'),{start:'2028-02-01',end:'2028-02-29'});
});
test('forecast, confirmed sales and cash receipts are separate; partial unknown is not guessed',()=>{
  const jobs=[{id:'j',job_date:day,status:'scheduled',expected_amount:300000},
    {id:'done',job_date:day,status:'completed',expected_amount:500000}];
  const sales=[{id:'s',job_id:'done',sale_date:day,revenue:500000,payment_status:'partial'}];
  const r=revenueReport(jobs,sales,day,day);assert.equal(r.expected,300000);assert.equal(r.confirmed,500000);
  assert.equal(r.unknownCollections,1);assert.equal(r.receivable,null);
  const known=revenueReport(jobs,[{...sales[0],collected_amount:100000}],day,day);
  assert.equal(known.collected,100000);assert.equal(known.receivable,400000);
  assert.throws(()=>revenueReport(jobs,[{...sales[0],collected_amount:600000}],day,day));
});
test('chief reports today/tomorrow and same-start conflicts without double counting drafts',()=>{
  const job={id:'1',job_date:day,start_time:'09:00',site:'합성 A',status:'scheduled',expected_amount:1};
  const b=chiefBriefing([analyzeSchedule(text,day)],[job,{...job,id:'2',site:'합성 B'},
    {...job,id:'3',job_date:'2027-01-01'}],day);
  assert.equal(b.today.length,2);assert.equal(b.tomorrow.length,1);assert.equal(b.pending,1);assert.equal(b.conflicts.length,1);
});
test('content generation produces an approval-required plan, not invented completion claims',()=>{
  const brief=contentBrief({site:'합성 A',job_date:day});
  assert.equal(brief.status,'approval_required');assert.equal(brief.reels.length,4);
  assert.ok(brief.blog.some(line=>line.includes('실제 작업 사실')));
});
