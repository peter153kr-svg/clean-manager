import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source=readFileSync(new URL('./schedule-v1.ts',import.meta.url),'utf8')
  .replace("'./engine'",JSON.stringify(new URL('./engine.ts',import.meta.url).href));
const { extractSchedule,koreanDay,scheduleWarnings,validateFields }=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const text='내일 오전 9시\n고객명: 합성 고객\n주소: 합성시 테스트로 1\n현장: 합성 A\n작업 종류: 입주청소\n금액: 45만원\n소요시간: 2시간';
test('V1 separates all fields and requires explicit human approval',()=>{
  const result=extractSchedule(text,'2026-10-27');assert.deepEqual(result.issues,[]);
  assert.deepEqual(result.fields,{date:'2026-10-28',time:'09:00',customer:'합성 고객',address:'합성시 테스트로 1',site:'합성 A',service:'입주청소',amount:450000,duration:120});
});
test('relative date uses original posted Korean day, not date of review',()=>{
  assert.equal(koreanDay('2026-10-27T15:01:00Z'),'2026-10-28');
  assert.equal(extractSchedule(text,koreanDay('2026-10-27T15:01:00Z')).fields.date,'2026-10-29');
});
test('missing or conflicting customer/address/service/duration requires review',()=>{
  assert.ok(extractSchedule('내일 3시 금액: 30','2026-10-27').issues.length>=6);
  for(const addition of ['고객명: 다른 고객','주소: 다른 주소','작업: 다른 작업','소요시간: 3시간']){
    assert.ok(extractSchedule(text+'\n'+addition,'2026-10-27').issues.length>0);
  }
  const blank=extractSchedule(text.replace('고객명: 합성 고객','고객명:'),'2026-10-27');
  assert.equal(blank.fields.customer,'');assert.ok(blank.issues.includes('고객명 확인 필요'));
  assert.ok(extractSchedule(text+'\n아마 내일? 취소 확인 필요','2026-10-27').issues.some(i=>i.includes('불확실')));
});
test('numeric validation rejects NaN fractions negative and unknown duration',()=>{
  const f=extractSchedule(text,'2026-10-27').fields;
  for(const amount of [null,-1,NaN,1.1,1e10])assert.ok(validateFields({...f,amount}).length);
  for(const duration of [null,0,-1,1.5,1441])assert.ok(validateFields({...f,duration}).length);
});
test('work scope is separate from service and never parsed as the start time',()=>{
  const result=extractSchedule(text+'\n작업 범위: 2시간 창틀 작업','2026-10-27');
  assert.equal(result.fields.scope,'2시간 창틀 작업');assert.equal(result.fields.service,'입주청소');assert.deepEqual(result.issues,[]);
});
test('overlap and semantic duplicates detected across separate message IDs',()=>{
  const f=extractSchedule(text,'2026-10-27').fields;
  assert.deepEqual(scheduleWarnings(f,[f]),['중복 일정 후보','작업 시간 충돌']);
  assert.deepEqual(scheduleWarnings({...f,time:'10:59'},[f]),['작업 시간 충돌']);
  assert.deepEqual(scheduleWarnings({...f,time:'11:00'},[f]),[]);
  assert.deepEqual(scheduleWarnings({...f,date:'2026-10-29',time:'00:30'},[{...f,time:'23:30'}]),['작업 시간 충돌']);
});
