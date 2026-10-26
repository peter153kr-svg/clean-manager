import test from "node:test";
import assert from "node:assert/strict";
import { parseSchedulePost } from "./schedule.ts";

const date = 1_784_000_000;
const basePost = {
  update_id: 42,
  channel_post: {
    message_id: 11,
    chat: { id: -1001234567890, type: "channel" },
    date,
    text: "10월 26일 김포 현장\n견적 45만원",
  },
};

test("normal channel post is parsed without inventing a booking", () => {
  const result = parseSchedulePost(basePost);
  assert.equal(result?.channel_id, -1001234567890);
  assert.equal(result?.message_id, 11);
  assert.equal(result?.message_text, basePost.channel_post.text);
  assert.equal(result?.edited_at, null);
  assert.deepEqual(result?.attachments, []);
});

test("edited post takes edit date and keeps photo metadata", () => {
  const result = parseSchedulePost({
    edited_channel_post: {
      ...basePost.channel_post,
      text: undefined,
      caption: "수정된 작업 일정",
      edit_date: date + 120,
      photo: [{ file_id: "small" }, { file_id: "large" }],
    },
  });
  assert.equal(result?.message_text, "수정된 작업 일정");
  assert.equal(result?.revision_at, new Date((date + 120) * 1000).toISOString());
  assert.deepEqual(result?.attachments, [{ type: "photo", file_id: "large" }]);
});

test("ignores direct messages and invalid update payloads", () => {
  assert.equal(parseSchedulePost({ message: basePost.channel_post }), null);
  assert.equal(parseSchedulePost({ channel_post: { ...basePost.channel_post, chat: { id: 1, type: "private" } } }), null);
  assert.equal(parseSchedulePost({ channel_post: { ...basePost.channel_post, message_id: 1.4 } }), null);
  assert.equal(parseSchedulePost({ channel_post: { ...basePost.channel_post, date: "invalid" } }), null);
  assert.equal(parseSchedulePost(null), null);
});
