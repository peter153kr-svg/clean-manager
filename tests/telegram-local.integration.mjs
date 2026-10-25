import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { randomBytes } from "node:crypto";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
import { parseSchedulePost } from "../src/lib/telegram/schedule.ts";

const endpoint = process.env.CLEAN_MANAGER_LOCAL_API_URL;
assert.equal(endpoint, "http://127.0.0.1:55321", "Integration tests require the isolated local API");
const service = createClient(endpoint, process.env.CLEAN_MANAGER_LOCAL_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(endpoint, process.env.CLEAN_MANAGER_LOCAL_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const channel = -1009876543210;
const secret = "synthetic-local-webhook-secret";
const messageId = Math.floor(Date.now() / 1000);
const posted = Math.floor(Date.now() / 1000) - 600;
const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(new URL("../src/app/api/telegram/schedule/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
vm.runInNewContext(compiled, {
  exports, Buffer, Response, console,
  process: { env: { TELEGRAM_SCHEDULE_WEBHOOK_SECRET: secret, TELEGRAM_SCHEDULE_CHANNEL_ID: String(channel) } },
  require(name) {
    if (name === "node:crypto") return require(name);
    if (name === "@/lib/telegram/schedule") return { parseSchedulePost };
    if (name === "@/lib/supabase/admin") return { createAdminClient: () => service };
    throw new Error(`Unexpected dependency: ${name}`);
  },
});
async function send({ text = "synthetic original", edited = 0, channelId = channel, suppliedSecret = secret } = {}) {
  const message = { message_id: messageId, date: posted, chat: { id: channelId, type: "channel" }, text,
    ...(edited ? { edit_date: posted + edited } : {}) };
  return exports.POST(new Request("http://127.0.0.1:3100/api/telegram/schedule", {
    method: "POST", headers: { "x-telegram-bot-api-secret-token": suppliedSecret },
    body: JSON.stringify({ [edited ? "edited_channel_post" : "channel_post"]: message }),
  }));
}
async function rows(table) {
  const result = await service.from(table).select("*").eq("channel_id", channel).eq("message_id", messageId);
  assert.equal(result.error, null);
  return result.data;
}

test("actual handler and local PostgREST: receive, edit, retry, stale delivery, access denial", async (t) => {
  t.after(async () => {
    for (const table of ["telegram_schedule_revisions", "telegram_schedule_messages"]) {
      const result = await service.from(table).delete().eq("channel_id", channel).eq("message_id", messageId);
      assert.equal(result.error, null, "Synthetic fixture cleanup failed");
    }
  });
  const before = {};
  for (const table of ["customers", "inquiries", "jobs", "sales"]) {
    const result = await service.from(table).select("id", { count: "exact", head: true });
    assert.equal(result.error, null);
    before[table] = result.count;
  }
  await t.test("channel post persists through the real RPC", async () => {
    assert.equal((await send()).status, 200);
    assert.equal((await rows("telegram_schedule_messages"))[0].message_text, "synthetic original");
    assert.equal((await rows("telegram_schedule_revisions")).length, 1);
  });
  await t.test("edit replaces latest text and preserves original", async () => {
    assert.equal((await send({ text: "synthetic edited", edited: 120 })).status, 200);
    assert.equal((await rows("telegram_schedule_messages"))[0].message_text, "synthetic edited");
    assert.equal((await rows("telegram_schedule_revisions")).length, 2);
  });
  await t.test("concurrent retries stay idempotent", async () => {
    const replies = await Promise.all(Array.from({ length: 5 }, () => send({ text: "synthetic edited", edited: 120 })));
    assert.ok(replies.every((reply) => reply.status === 200));
    assert.equal((await rows("telegram_schedule_messages")).length, 1);
    assert.equal((await rows("telegram_schedule_revisions")).length, 2);
  });
  await t.test("stale edit is archived without overwriting current text", async () => {
    assert.equal((await send({ text: "synthetic stale", edited: 60 })).status, 200);
    assert.equal((await rows("telegram_schedule_messages"))[0].message_text, "synthetic edited");
    assert.equal((await rows("telegram_schedule_revisions")).length, 3);
  });
  await t.test("invalid webhook secret and other channels never reach storage", async () => {
    assert.equal((await send({ suppliedSecret: "wrong" })).status, 401);
    assert.equal((await send({ channelId: channel - 1 })).status, 200);
    assert.equal((await rows("telegram_schedule_revisions")).length, 3);
  });
  await t.test("anonymous table reads and RPC calls are blocked by real DB privileges", async () => {
    const read = await anon.from("telegram_schedule_messages").select("id");
    assert.ok(read.error);
    const call = await anon.rpc("ingest_telegram_schedule_message", {
      p_channel_id: channel, p_message_id: messageId, p_revision_at: new Date().toISOString(),
      p_posted_at: new Date().toISOString(), p_edited_at: null, p_message_text: "blocked", p_attachments: [],
    });
    assert.ok(call.error);
  });
  await t.test("signed-in test user can read but cannot write or invoke ingestion", async () => {
    const email = `local-inbox-${randomBytes(8).toString("hex")}@example.invalid`;
    const password = randomBytes(24).toString("base64url");
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(created.error, null);
    assert.ok(created.data.user);
    t.after(async () => {
      const result = await service.auth.admin.deleteUser(created.data.user.id);
      assert.equal(result.error, null, "Local test user cleanup failed");
    });
    const signedIn = createClient(endpoint, process.env.CLEAN_MANAGER_LOCAL_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = await signedIn.auth.signInWithPassword({ email, password });
    assert.equal(login.error, null);
    const read = await signedIn.from("telegram_schedule_messages").select("id").eq("channel_id", channel).eq("message_id", messageId);
    assert.equal(read.error, null);
    assert.equal(read.data.length, 1);
    const update = await signedIn.from("telegram_schedule_messages").update({ message_text: "denied" }).eq("channel_id", channel);
    assert.ok(update.error);
    const call = await signedIn.rpc("ingest_telegram_schedule_message", {
      p_channel_id: channel, p_message_id: messageId, p_revision_at: new Date().toISOString(),
      p_posted_at: new Date().toISOString(), p_edited_at: null, p_message_text: "denied", p_attachments: [],
    });
    assert.ok(call.error);
    assert.equal((await rows("telegram_schedule_messages"))[0].message_text, "synthetic edited");
  });
  await t.test("existing CRM table row counts are unchanged", async () => {
    for (const table of Object.keys(before)) {
      const result = await service.from(table).select("id", { count: "exact", head: true });
      assert.equal(result.error, null);
      assert.equal(result.count, before[table]);
    }
  });
});
