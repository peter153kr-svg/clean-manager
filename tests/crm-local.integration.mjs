import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomBytes, createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const endpoint = process.env.CLEAN_MANAGER_LOCAL_API_URL;
assert.equal(endpoint, "http://127.0.0.1:56321", "Only the isolated security-test database is allowed");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(endpoint, process.env.CLEAN_MANAGER_LOCAL_SERVICE_KEY, options);
const client = createClient(endpoint, process.env.CLEAN_MANAGER_LOCAL_ANON_KEY, options);
const anonymous = createClient(endpoint, process.env.CLEAN_MANAGER_LOCAL_ANON_KEY, options);
const require = createRequire(import.meta.url);
class Redirect extends Error { constructor(location) { super(location); this.location = location; } }
const invalidated = [];
function loadActions() {
  const source = readFileSync(new URL("../src/app/actions.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, FormData, require(name) {
    if (name === "@/lib/supabase/server") return { createClient: async () => client };
    if (name === "next/cache") return { revalidatePath: (path) => invalidated.push(path) };
    if (name === "next/navigation") return { redirect: (path) => { throw new Redirect(path); } };
    return require(name);
  } });
  return exports;
}
const actions = loadActions();
function form(values) { const data = new FormData(); for (const [k,v] of Object.entries(values)) if (v !== null) data.set(k, String(v)); return data; }
async function action(name, values) { await assert.rejects(actions[name](form(values)), (e) => e instanceof Redirect); }
async function one(table, id) { const r = await client.from(table).select("*").eq("id",id).single(); assert.equal(r.error,null); return r.data; }

// Real action code + real local Auth/PostgREST. Only framework navigation/cache
// side effects are replaced. HTTP tests below additionally exercise Next itself.
test("CRM regression against an isolated local database", async (t) => {
  const tag = "SECURITY-SYNTHETIC-" + randomBytes(8).toString("hex");
  const email = `security-${randomBytes(8).toString("hex")}@example.invalid`;
  const password = randomBytes(24).toString("base64url");
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(created.error, null);
  assert.equal((await admin.from('dev_ai_office_admins').insert({user_id:created.data.user.id})).error,null);
  let customer, inquiry, job, sale, secondJob;
  t.after(async () => {
    if (customer) {
      for (const table of ["sales","jobs","inquiries"]) {
        const r=await admin.from(table).delete().eq("customer_id",customer.id); assert.equal(r.error,null);
      }
      const r=await admin.from("customers").delete().eq("id",customer.id);assert.equal(r.error,null);
    }
    const r=await admin.auth.admin.deleteUser(created.data.user.id);assert.equal(r.error,null);
  });
  const login = await client.auth.signInWithPassword({ email, password }); assert.equal(login.error,null);

  await t.test("create customer through the existing server action",async()=>{
    await action("saveCustomer",{name:tag,phone:"010-0000-0000",area_pyeong:32,memo:tag});
    const r=await client.from("customers").select("*").eq("name",tag).single();assert.equal(r.error,null);customer=r.data;assert.equal(customer.area_pyeong,32);
  });
  await t.test("edit customer and invalidate customer list",async()=>{
    await action("saveCustomer",{id:customer.id,name:tag,phone:"010-0000-0000",address:"SYNTHETIC ADDRESS",area_pyeong:34});
    assert.equal((await one("customers",customer.id)).address,"SYNTHETIC ADDRESS");assert.ok(invalidated.includes("/customers"));
  });
  await t.test("create inquiry and change its status",async()=>{
    const values={customer_id:customer.id,inquiry_date:"2026-10-25",source:"홈페이지",status:"new",estimated_amount:450000};
    await action("saveInquiry",values);
    const r=await client.from("inquiries").select("*").eq("customer_id",customer.id).single();assert.equal(r.error,null);inquiry=r.data;
    await action("saveInquiry",{...values,id:inquiry.id,status:"quote_sent"});assert.equal((await one("inquiries",inquiry.id)).status,"quote_sent");
  });
  await t.test("schedule job with inquiry relation and no premature sale",async()=>{
    await action("saveJob",{customer_id:customer.id,inquiry_id:inquiry.id,job_date:"2026-10-25",status:"scheduled",expected_amount:450000,final_amount:500000});
    const r=await client.from("jobs").select("*").eq("customer_id",customer.id).single();assert.equal(r.error,null);job=r.data;
    const sales=await client.from("sales").select("id").eq("job_id",job.id);assert.equal(sales.error,null);assert.equal(sales.data.length,0);
  });
  await t.test("edit job status to in progress",async()=>{
    await action("saveJob",{id:job.id,customer_id:customer.id,inquiry_id:inquiry.id,job_date:"2026-10-25",status:"in_progress",expected_amount:450000,final_amount:500000});
    assert.equal((await one("jobs",job.id)).status,"in_progress");
  });
  await t.test("completion creates one sale from final amount",async()=>{
    await action("completeJob",{id:job.id});
    const r=await client.from("sales").select("*").eq("job_id",job.id).single();assert.equal(r.error,null);sale=r.data;assert.equal(sale.revenue,500000);assert.equal(sale.profit,500000);
  });
  await t.test("sales edits preserve generated profit and payment status",async()=>{
    await action("saveSale",{id:sale.id,revenue:510000,expense:70000,payment_status:"paid",memo:tag});
    sale=await one("sales",sale.id);assert.equal(sale.profit,440000);assert.equal(sale.payment_status,"paid");
  });
  await t.test("repeated completion does not duplicate or reset the paid sale",async()=>{
    await action("completeJob",{id:job.id});
    const r=await client.from("sales").select("*").eq("job_id",job.id);assert.equal(r.error,null);assert.equal(r.data.length,1);assert.equal(r.data[0].revenue,510000);assert.equal(r.data[0].expense,70000);assert.equal(r.data[0].payment_status,"paid");
  });
  await t.test("saving a completed job uses expected amount when final is absent",async()=>{
    await action("saveJob",{customer_id:customer.id,job_date:"2026-10-26",status:"completed",expected_amount:250000});
    const r=await client.from("jobs").select("id,sales(revenue)").eq("customer_id",customer.id).neq("id",job.id).single();assert.equal(r.error,null);secondJob=r.data;assert.equal(secondJob.sales.revenue,250000);
  });
  await t.test("referenced customer deletion is prevented",async()=>{
    await assert.rejects(actions.deleteCustomer(form({id:customer.id})),/문의 이력이/);assert.equal((await one("customers",customer.id)).id,customer.id);
  });
  await t.test("negative expense and anonymous reads are blocked",async()=>{
    const bad=await client.from("sales").update({expense:-1}).eq("id",sale.id);assert.ok(bad.error);
    for(const table of ["customers","inquiries","jobs","sales"]){const r=await anonymous.from(table).select("id");assert.ok(r.error);}
  });
  await t.test("production Next server protects routes and renders signed-in CRM pages",async()=>{
    const cookies=[];
    const ssr=createServerClient(endpoint,process.env.CLEAN_MANAGER_LOCAL_ANON_KEY,{cookies:{getAll:()=>cookies,setAll:(items)=>{for(const item of items){const old=cookies.findIndex(x=>x.name===item.name);if(old>=0)cookies[old]=item;else cookies.push(item);}}}});
    const auth=await ssr.auth.signInWithPassword({email,password});assert.equal(auth.error,null);
    const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p","3160"],{env:{...process.env,EXTERNAL_INQUIRY_WEBHOOK_SECRET:"synthetic-local-inquiry-secret"},stdio:"ignore",windowsHide:true});
    try {
      let ready=false;
      for(let i=0;i<100;i++){try{await fetch("http://127.0.0.1:3160/login");ready=true;break;}catch{await delay(200);}}
      assert.ok(ready,"Production Next server did not start");
      for(const path of ["/dashboard","/customers","/inquiries","/jobs","/sales"]){
        const unauth=await fetch("http://127.0.0.1:3160"+path,{redirect:"manual"});assert.equal(unauth.status,307);assert.match(unauth.headers.get("location"),/\/login/);
      }
      const headers={cookie:cookies.map(x=>`${x.name}=${x.value}`).join("; ")};
      for(const path of ["/dashboard","/customers","/customers/"+customer.id,"/inquiries","/jobs","/jobs/"+job.id,"/sales","/sales/"+sale.id+"/edit"]){
        const r=await fetch("http://127.0.0.1:3160"+path,{headers,redirect:"manual"});assert.equal(r.status,200,path);assert.match(await r.text(),/<html/);
      }
      for(const path of ["/login","/forgot-password","/update-password"]){assert.equal((await fetch("http://127.0.0.1:3160"+path)).status,200);}
      const callback=await fetch("http://127.0.0.1:3160/auth/callback?next=https://untrusted.invalid",{redirect:"manual"});assert.equal(callback.status,307);assert.match(callback.headers.get("location"),/\/forgot-password/);
      const webhook=await fetch("http://127.0.0.1:3160/api/external-inquiry",{method:"POST",body:"{}",headers:{"content-type":"application/json"},redirect:"manual"});assert.equal(webhook.status,401);
      const body=JSON.stringify({name:tag,phone:"01000000000",content:tag,source:"홈페이지"});
      const timestamp=String(Math.floor(Date.now()/1000));
      const signature="sha256="+createHmac("sha256","synthetic-local-inquiry-secret").update(timestamp+"."+body).digest("hex");
      for(let i=0;i<2;i++){
        const incoming=await fetch("http://127.0.0.1:3160/api/external-inquiry",{method:"POST",body,headers:{"content-type":"application/json","x-webhook-timestamp":timestamp,"x-webhook-signature":signature}});
        assert.equal(incoming.status,200);assert.equal((await incoming.json()).success,true);
      }
      const received=await client.from("inquiries").select("id").eq("customer_id",customer.id).eq("content",tag);assert.equal(received.error,null);assert.equal(received.data.length,1);
    } finally {server.kill(); await new Promise(resolve=>server.once("exit",resolve));}
  });
  await t.test("local sign out invalidates the current session",async()=>{
    assert.equal((await client.auth.signOut()).error,null);assert.equal((await client.auth.getSession()).data.session,null);
  });
});
