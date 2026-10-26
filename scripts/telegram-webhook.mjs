/**
 * Safe setup helper. Keep the bot token in ignored .env.local, never in command
 * arguments, Git, chat, or logs. Uses Node 24: node --env-file=.env.local ...
 */
const command = process.argv[2];
const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token || !["discover", "register", "info"].includes(command)) {
  console.error("Usage: node --env-file=.env.local scripts/telegram-webhook.mjs discover|register|info");
  console.error("Provide TELEGRAM_BOT_TOKEN in the git-ignored .env.local file.");
  process.exit(1);
}

async function callTelegram(method, parameters = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(parameters),
    redirect: "error",
  });
  const result = await res.json();
  if (!res.ok || !result.ok) {
    // Do not echo remote errors: they may contain sensitive endpoint information.
    throw new Error(`Telegram ${method} failed (HTTP ${res.status})`);
  }
  return result.result;
}

try {
  const me = await callTelegram("getMe");
  if (me.username !== "skyclean_schedule_bot") {
    throw new Error("Configured bot token does not belong to @skyclean_schedule_bot.");
  }

  if (command === "discover") {
    const webhook = await callTelegram("getWebhookInfo");
    if (webhook.url) throw new Error("Webhook is already configured. getUpdates cannot run until it is removed.");
    const updates = await callTelegram("getUpdates", {
      limit: 100,
      timeout: 0,
      allowed_updates: ["channel_post", "edited_channel_post"],
    });
    const channels = [...new Set(updates.map((item) => item.channel_post?.chat?.id ?? item.edited_channel_post?.chat?.id).filter(Number.isSafeInteger))];
    if (!channels.length) console.log("No channel post in the pending updates. Post a new test message in the channel and rerun discover.");
    else console.log("Candidate channel IDs:", channels.join(", "));
  } else if (command === "register") {
    const url = process.env.TELEGRAM_SCHEDULE_WEBHOOK_URL;
    const secret = process.env.TELEGRAM_SCHEDULE_WEBHOOK_SECRET;
    const channelId = process.env.TELEGRAM_SCHEDULE_CHANNEL_ID;
    if (!url || !url.startsWith("https://") || !url.endsWith("/api/telegram/schedule") ||
        !secret || !/^[A-Za-z0-9_-]{16,256}$/.test(secret) ||
        !channelId || !/^-?\d+$/.test(channelId)) {
      throw new Error("Set valid TELEGRAM_SCHEDULE_WEBHOOK_URL, TELEGRAM_SCHEDULE_WEBHOOK_SECRET (16-256 characters), and TELEGRAM_SCHEDULE_CHANNEL_ID.");
    }
    await callTelegram("setWebhook", {
      url,
      secret_token: secret,
      allowed_updates: ["channel_post", "edited_channel_post"],
      drop_pending_updates: false,
      max_connections: 10,
    });
    console.log("Webhook registered. Verify your deployment and post a NEW test message.");
  } else {
    const info = await callTelegram("getWebhookInfo");
    console.log(JSON.stringify({
      configured: Boolean(info.url),
      pending_update_count: info.pending_update_count,
      last_error_date: info.last_error_date,
      // Intentionally omit webhook URL, certificates, and token.
    }, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Telegram setup failed.");
  process.exitCode = 1;
}
