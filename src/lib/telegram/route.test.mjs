import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { parseSchedulePost } from "./schedule.ts";

// Compile the actual route and isolate only the database and process environment.
// No production keys, network requests, or database writes are used by these tests.
const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../../app/api/telegram/schedule/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const secret = "test_only_webhook_secret_12345678";
const channelId = -1001234567890;
const post = {
  channel_post: {
    message_id: 11,
    chat: { id: channelId, type: "channel" },
    date: 1_784_000_000,
    text: "10월 26일 김포 현장",
  },
};

function route({ env = {}, storageError = false } = {}) {
  const calls = [];
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, Buffer, Response,
    process: { env: {
      TELEGRAM_SCHEDULE_WEBHOOK_SECRET: secret,
      TELEGRAM_SCHEDULE_CHANNEL_ID: String(channelId),
      ...env,
    } },
    console: { error() {} },
    require(name) {
      if (name === "@/lib/telegram/schedule") return { parseSchedulePost };
      if (name === "@/lib/supabase/admin") return {
        createAdminClient() {
          return { async rpc(name, args) {
            calls.push({ name, args });
            return { error: storageError ? new Error("test database unavailable") : null };
          } };
        },
      };
      if (name === "node:crypto") return require(name);
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { POST: exports.POST, calls };
}

function request(body = JSON.stringify(post), headers = {}) {
  return new Request("https://example.test/api/telegram/schedule", {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": secret, ...headers },
    body,
  });
}

test("missing or invalid server configuration fails closed without storage", async () => {
  for (const env of [
    { TELEGRAM_SCHEDULE_WEBHOOK_SECRET: "" },
    { TELEGRAM_SCHEDULE_CHANNEL_ID: "" },
    { TELEGRAM_SCHEDULE_CHANNEL_ID: "not-a-channel" },
    { TELEGRAM_SCHEDULE_CHANNEL_ID: "9007199254740992" },
  ]) {
    const api = route({ env });
    assert.equal((await api.POST(request())).status, 503);
    assert.equal(api.calls.length, 0);
  }
});

test("missing, incorrect and equal-length incorrect secrets are rejected", async () => {
  const api = route();
  for (const supplied of ["", "wrong", "x".repeat(secret.length)]) {
    assert.equal((await api.POST(request(undefined, {
      "x-telegram-bot-api-secret-token": supplied,
    }))).status, 401);
  }
  assert.equal(api.calls.length, 0);
});

test("malformed JSON and oversized declared or streamed bodies never reach storage", async () => {
  const api = route();
  assert.equal((await api.POST(request("{"))).status, 400);
  assert.equal((await api.POST(request("{}", { "content-length": "131073" }))).status, 413);
  assert.equal((await api.POST(request("{}", { "content-length": "invalid" }))).status, 413);
  assert.equal((await api.POST(request("한".repeat(50_000)))).status, 413);
  assert.equal(api.calls.length, 0);
});

test("other channels, private messages and invalid posts are acknowledged without storage", async () => {
  const api = route();
  for (const payload of [
    { channel_post: { ...post.channel_post, chat: { id: -100999, type: "channel" } } },
    { message: post.channel_post },
    { channel_post: { ...post.channel_post, date: "invalid" } },
    null,
  ]) {
    const response = await api.POST(request(JSON.stringify(payload)));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  }
  assert.equal(api.calls.length, 0);
});

test("authorized posts and edits use only the atomic inbox RPC", async () => {
  const api = route();
  assert.equal((await api.POST(request())).status, 200);
  const edited = { edited_channel_post: { ...post.channel_post, edit_date: post.channel_post.date + 60, text: "수정 일정" } };
  assert.equal((await api.POST(request(JSON.stringify(edited)))).status, 200);
  assert.equal(api.calls.length, 2);
  for (const call of api.calls) {
    assert.equal(call.name, "ingest_telegram_schedule_message");
    assert.equal(call.args.p_channel_id, channelId);
    assert.equal(call.args.p_message_id, 11);
  }
  assert.equal(api.calls[1].args.p_message_text, "수정 일정");
  assert.equal(api.calls[1].args.p_edited_at, new Date((post.channel_post.date + 60) * 1000).toISOString());
});

test("storage failure returns a retryable error without exposing database details", async () => {
  const api = route({ storageError: true });
  const response = await api.POST(request());
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { ok: false });
});
