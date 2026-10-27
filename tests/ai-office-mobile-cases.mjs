import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
export async function mobileCases(t,{admin,base,cookies,ids}){
  // Use the preinstalled automation runtime and Edge; no downloads or installs.
  const require=createRequire(import.meta.url);
  const {chromium}=require(process.env.CLEAN_MANAGER_PLAYWRIGHT_MODULE??path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{for(const [index,width,height] of [[1,360,800],[2,390,844],[3,768,1024],[4,1440,1000]]){
    await t.test(`real Edge ${width}px: touch/input/review/edit/calendar/briefing/reload without clipping`,async()=>{
      const context=await browser.newContext({viewport:{width,height},isMobile:width<600,hasTouch:width<=768});
      const text=`2093-02-0${index} 09:00\n고객명: 합성 모바일 ${width}\n주소: 합성시 모바일 테스트로 ${width}\n현장: 합성 모바일 ${width}\n작업 종류: 입주청소\n소요시간: 60분\n금액: 35만원`;
      try{
        await context.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)?route.continue():route.abort();});
        await context.addCookies(cookies.map(c=>({name:c.name,value:c.value,url:base,sameSite:'Lax'})));
        const page=await context.newPage();const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
        const click=async locator=>{await locator.scrollIntoViewIfNeeded();if(width<=768)await locator.tap();else await locator.click();};
        await page.goto(base+'/ai-office-lab');await page.getByRole('heading',{name:'일정관리 V1 · 로컬 DB 연결',exact:true}).waitFor();
        await page.getByLabel('보고 기준일',{exact:true}).fill(`2093-02-0${index}`);
        await page.getByLabel('V1 합성 메시지',{exact:true}).fill(text);
        const received=page.waitForResponse(r=>r.url().endsWith('/api/ai-office/schedules')&&r.request().method()==='PUT');
        await click(page.getByRole('button',{name:'합성 메시지 수신',exact:true}));assert.equal((await received).status(),200);
        const article=page.locator('article').filter({hasText:`합성 모바일 ${width}`});
        await article.getByRole('button',{name:'정보 검토·보완'}).waitFor();
        await click(article.getByRole('button',{name:'정보 검토·보완'}));
        await page.getByLabel('시작 시간',{exact:true}).fill('10:00');
        const approved=page.waitForResponse(r=>r.url().endsWith('/api/ai-office/schedules')&&r.request().method()==='POST');
        await click(page.getByRole('button',{name:'검토 완료·달력 승인',exact:true}));assert.equal((await approved).status(),200);
        await article.getByRole('button',{name:'CRM 고객 검색·작업 연결'}).waitFor();
        const calendar=page.getByRole('region',{name:'승인 일정 달력'});
        const before=await calendar.getByRole('heading').innerText();
        assert.ok(before.includes('2093-02'),'calendar follows reporting month');
        await click(calendar.getByRole('button',{name:'다음 달',exact:true}));assert.notEqual(await calendar.getByRole('heading').innerText(),before);
        await click(calendar.getByRole('button',{name:'이전 달',exact:true}));assert.equal(await calendar.getByRole('heading').innerText(),before);
        await click(calendar.locator('button[aria-label*="승인 일정"]').first());
        await click(calendar.getByRole('button',{name:'전체 승인 일정 보기'}));
        await click(page.getByRole('button',{name:'AI 총괄실장',exact:true}));
        const briefing=page.getByRole('region',{name:'V1 일일 브리핑'});await briefing.getByText(new RegExp(`10:00.*합성 모바일 ${width}`)).waitFor();
        assert.ok((await briefing.innerText()).includes('350,000원'));
        const dimensions=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
        assert.ok(dimensions.document<=width+1,JSON.stringify(dimensions));assert.equal(dimensions.viewport,width);
        await click(page.getByRole('button',{name:'일정관리 직원',exact:true}));
        await article.getByRole('button',{name:'정보 검토·보완'}).waitFor();
        await click(article.getByRole('button',{name:'정보 검토·보완'}));
        await page.getByLabel('예상 금액(원)',{exact:true}).fill('360000');
        const edited=page.waitForResponse(r=>r.url().endsWith('/api/ai-office/schedules')&&r.request().method()==='POST');
        await click(page.getByRole('button',{name:'검토 완료·달력 승인',exact:true}));assert.equal((await edited).status(),200);
        await page.reload();await article.getByRole('button',{name:'CRM 고객 검색·작업 연결'}).waitFor();
        await click(article.getByRole('button',{name:'CRM 고객 검색·작업 연결'}));
        await article.getByText('신규 고객 등록 초안 선택',{exact:true}).waitFor();
        assert.equal(await article.locator('input[type=radio]:checked').count(),0);
        await click(article.getByText('신규 고객 등록 초안 선택',{exact:true}));
        await article.getByLabel('신규 고객 연락처').fill(`010-0000-${width}`);
        await click(article.getByText('고객·주소·작업 초안을 확인했습니다.',{exact:true}));
        const linked=page.waitForResponse(r=>r.url().endsWith('/api/ai-office/crm')&&r.request().method()==='POST');
        await click(article.getByRole('button',{name:'확인 후 CRM 작업 생성'}));assert.equal((await linked).status(),200);
        await article.getByRole('link',{name:'연결된 CRM 작업 보기'}).waitFor();
        const finalWidth=await page.evaluate(()=>document.documentElement.scrollWidth);assert.ok(finalWidth<=width+1);
        await mkdir('.security-local/mobile-artifacts',{recursive:true});
        await page.screenshot({path:`.security-local/mobile-artifacts/${width}.png`,fullPage:true});
        assert.deepEqual(pageErrors,[]);
      }finally{
        const source=await admin.from('telegram_schedule_messages').select('id').eq('message_text',text);
        ids.push(...(source.data??[]).map(i=>i.id));await context.close();
      }
    });
  }}finally{await browser.close();}
}
