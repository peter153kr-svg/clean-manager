/** Telegram's webhook payload is untrusted, even after the shared secret check. */
type UnknownRecord = Record<string, unknown>;

const record = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;

const safeInteger = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) ? value : null;

function timestamp(value: unknown): string | null {
  const seconds = safeInteger(value);
  if (seconds === null || seconds < 1_420_070_400 || seconds > Date.now() / 1000 + 86_400) return null;
  return new Date(seconds * 1000).toISOString();
}

const boundedString = (value: unknown, max = 4096): string | null =>
  typeof value === "string" ? value.slice(0, max) : null;

export type ScheduleAttachment = {
  type: "photo" | "video" | "document" | "voice" | "audio" | "video_note";
  file_id: string;
  file_name?: string;
};

export type SchedulePost = {
  channel_id: number;
  message_id: number;
  revision_at: string;
  posted_at: string;
  edited_at: string | null;
  message_text: string | null;
  attachments: ScheduleAttachment[];
};

function mediaEntry(type: ScheduleAttachment["type"], raw: unknown): ScheduleAttachment | null {
  const item = record(raw);
  const fileId = boundedString(item?.file_id, 500);
  if (!fileId) return null;
  const fileName = boundedString(item?.file_name, 255);
  return { type, file_id: fileId, ...(fileName ? { file_name: fileName } : {}) };
}

export function parseSchedulePost(update: unknown): SchedulePost | null {
  const body = record(update);
  if (!body) return null;
  const message = record(body.edited_channel_post ?? body.channel_post);
  const chat = record(message?.chat);
  if (!message || !chat || chat.type !== "channel") return null;

  const channelId = safeInteger(chat.id);
  const messageId = safeInteger(message.message_id);
  const postedAt = timestamp(message.date);
  const editedAt = message.edit_date === undefined ? null : timestamp(message.edit_date);
  if (channelId === null || messageId === null || messageId <= 0 || !postedAt ||
      (message.edit_date !== undefined && !editedAt)) return null;

  const attachments: ScheduleAttachment[] = [];
  const photos = Array.isArray(message.photo) ? message.photo : [];
  if (photos.length) {
    // Telegram includes several resolutions of the same photo. Save only the largest.
    const photo = photos[photos.length - 1];
    const entry = mediaEntry("photo", photo);
    if (entry) attachments.push(entry);
  }
  for (const type of ["video", "document", "voice", "audio", "video_note"] as const) {
    const entry = mediaEntry(type, message[type]);
    if (entry) attachments.push(entry);
  }

  return {
    channel_id: channelId,
    message_id: messageId,
    revision_at: editedAt ?? postedAt,
    posted_at: postedAt,
    edited_at: editedAt,
    message_text: boundedString(message.text ?? message.caption, 20_000),
    attachments,
  };
}
