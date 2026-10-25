import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

// This helper never calls Telegram and never registers or alters a webhook.
// Run only after this exact Preview is connected to a separate test database.
const origin = process.env.TELEGRAM_TEST_PREVIEW_ORIGIN;
const secret = process.env.TELEGRAM_TEST_PREVIEW_WEBHOOK_SECRET;
const bypass = process.env.TELEGRAM_TEST_PREVIEW_BYPASS;
const channel = Number(process.env.TELEGRAM_TEST_PREVIEW_CHANNEL_ID);
const target = origin ? new URL(origin) : null;
if (process.env.TELEGRAM_TEST_PREVIEW_DB_CONFIRMED !== "isolated-test-db" || !target ||
    target.protocol !== "https:" || !target.hostname.endsWith(".vercel.app") ||
    target.hostname === "clean-manager-kappa.vercel.app" || target.pathname !== "/" ||
    target.search || target.hash || target.username || target.password ||
    !secret || !bypass || !Number.isSafeInteger(channel) || channel >= 0) {
  console.error("Refusing request: require an exact Preview origin, separate test DB confirmation and test-only secrets/channel ID.");
  process.exit(1);
}
if (process.argv.length !== 2) {
  console.error("No command arguments are accepted. Supply test-only values in an ignored env file.");
  process.exit(1);
}
const template = JSON.parse(readFileSync(new URL("../tests/fixtures/telegram-post.json", import.meta.url), "utf8"));
const now = Math.floor(Date.now() / 1000);
const runId = randomBytes(6).toString("hex");
template.channel_post.chat.id = channel;
template.channel_post.message_id = now;
template.channel_post.date = now;
template.channel_post.text = `SYNTHETIC PREVIEW TEST ${runId} — not a real booking`;

try {
  const response = await fetch(new URL("/api/telegram/schedule", target), {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
    headers: { "content-type": "application/json", "x-vercel-protection-bypass": bypass,
      "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify(template),
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (response.status !== 200 || !contentType.includes("application/json")) {
    console.error(`Preview webhook test failed (HTTP ${response.status}); check deployment protection and test-only configuration.`);
    process.exitCode = 1;
  } else {
    const result = await response.json();
    if (result.ok !== true) throw new Error("Unexpected acknowledgment");
    console.log(`Synthetic post acknowledged. Verify test DB inbox/history manually. Test run: ${runId}`);
  }
} catch {
  // Never print request headers, redirect URLs, bot tokens or remote response bodies.
  console.error("Preview webhook test failed; no credentials or response body were logged.");
  process.exitCode = 1;
}
