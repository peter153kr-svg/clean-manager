import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function run(file, args = [], overrides = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("TELEGRAM_TEST_")) delete env[key];
  return spawnSync(process.execPath, [file, ...args], {
    env: { ...env, ...overrides }, encoding: "utf8", timeout: 10_000, windowsHide: true,
  });
}

test("preview sender refuses to send without isolated test configuration", () => {
  const result = run("scripts/test-preview-webhook.mjs");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing request/);
});

test("preview sender refuses the production hostname even with test confirmations", () => {
  const result = run("scripts/test-preview-webhook.mjs", [], {
    TELEGRAM_TEST_PREVIEW_ORIGIN: "https://clean-manager-kappa.vercel.app",
    TELEGRAM_TEST_PREVIEW_DB_CONFIRMED: "isolated-test-db",
    TELEGRAM_TEST_PREVIEW_WEBHOOK_SECRET: "synthetic-test-secret",
    TELEGRAM_TEST_PREVIEW_BYPASS: "synthetic-bypass",
    TELEGRAM_TEST_PREVIEW_CHANNEL_ID: "-1009876543210",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing request/);
  assert.doesNotMatch(result.stderr, /synthetic-bypass/);
});

test("local database wrapper rejects remote command arguments", () => {
  for (const args of [["push"], ["reset", "--linked"], ["test", "--db-url", "postgresql://remote.invalid/db"]]) {
    const result = run("scripts/local-supabase.mjs", args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage:/);
  }
});
