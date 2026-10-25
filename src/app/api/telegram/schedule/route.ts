import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSchedulePost } from "@/lib/telegram/schedule";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 128 * 1024;

function secretMatches(received: string | null, expected: string): boolean {
  if (!received || !expected) return false;
  const receivedBytes = Buffer.from(received, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes);
}

async function readBounded(request: Request): Promise<string | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_SCHEDULE_WEBHOOK_SECRET;
  const allowedChannel = process.env.TELEGRAM_SCHEDULE_CHANNEL_ID;
  if (!secret || !allowedChannel || !/^[-]?\d+$/.test(allowedChannel) ||
      !Number.isSafeInteger(Number(allowedChannel))) {
    return Response.json({ ok: false }, { status: 503 });
  }

  if (!secretMatches(request.headers.get("x-telegram-bot-api-secret-token"), secret)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const length = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(length) || length > MAX_BODY_BYTES) {
    return Response.json({ ok: false }, { status: 413 });
  }

  const raw = await readBounded(request);
  if (raw === null) return Response.json({ ok: false }, { status: 413 });
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const post = parseSchedulePost(payload);
  if (!post || post.channel_id !== Number(allowedChannel)) {
    // ACK non-channel updates or posts from other channels without storing data.
    return Response.json({ ok: true });
  }

  try {
    const { error } = await createAdminClient().rpc("ingest_telegram_schedule_message", {
      p_channel_id: post.channel_id,
      p_message_id: post.message_id,
      p_revision_at: post.revision_at,
      p_posted_at: post.posted_at,
      p_edited_at: post.edited_at,
      p_message_text: post.message_text,
      p_attachments: post.attachments,
    });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch {
    // A non-2xx response lets Telegram retry transient storage failures.
    console.error("Telegram schedule inbox: failed to persist channel post");
    return Response.json({ ok: false }, { status: 500 });
  }
}
