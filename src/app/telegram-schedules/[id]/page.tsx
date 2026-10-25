import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { koreaDateTime, scheduleStatusLabels } from "@/lib/telegram/display";

export default async function TelegramScheduleDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: message, error } = await supabase.from("telegram_schedule_messages")
    .select("id,channel_id,message_id,posted_at,edited_at,message_text,attachments,status")
    .eq("id", id).maybeSingle();
  if (error) throw new Error("일정 메시지를 불러오지 못했습니다.");
  if (!message) notFound();

  const { data: revisions, error: revisionsError } = await supabase.from("telegram_schedule_revisions")
    .select("id,revision_at,message_text,attachments")
    .eq("channel_id", message.channel_id).eq("message_id", message.message_id)
    .order("revision_at", { ascending: false }).limit(30);
  if (revisionsError) throw new Error("수정 이력을 불러오지 못했습니다.");

  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  return <div className="page max-w-4xl space-y-6">
    <Link href="/telegram-schedules" className="text-sm font-semibold text-blue-600">← 일정 수신함</Link>
    <header><p className="eyebrow">CHANNEL MESSAGE</p><h1 className="page-title">텔레그램 메시지 #{message.message_id}</h1>
      <p className="page-description">채널에 작성된 원문입니다. 확인 전에는 고객 예약이나 매출로 처리하지 않습니다.</p></header>
    <section className="ui-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">작성 {koreaDateTime(message.posted_at)}</p>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{scheduleStatusLabels[message.status] ?? message.status}</span>
      </div>
      {message.edited_at && <p className="mt-1 text-sm text-slate-400">최근 수정 {koreaDateTime(message.edited_at)}</p>}
      <p className="mt-5 whitespace-pre-wrap break-words text-base leading-7 text-slate-800">{message.message_text || "(텍스트 없음)"}</p>
      <div className="mt-5 border-t border-slate-100 pt-4">
        <h2 className="text-sm font-bold text-slate-700">첨부 {attachments.length}개</h2>
        <p className="mt-1 text-xs text-slate-400">현재는 첨부 종류와 파일 식별자만 안전하게 기록합니다. 파일 미리보기·다운로드는 다음 단계에서 연결합니다.</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">{attachments.map((attachment: { type?: string; file_name?: string }, index: number) =>
          <li key={index}>• {attachment.type ?? "파일"}{attachment.file_name ? ` · ${attachment.file_name}` : ""}</li>)}</ul>
      </div>
    </section>
    <section className="ui-card p-5 sm:p-6">
      <h2 className="font-bold">원문·수정 이력</h2>
      <p className="mt-1 text-sm text-slate-400">텔레그램에서 편집된 경우, 수신한 각 버전을 남깁니다. 최신 30개까지 표시합니다.</p>
      <div className="mt-4 space-y-3">{!revisions?.length ? <p className="text-sm text-slate-400">이력이 없습니다.</p> : revisions.map((version, index) =>
        <article key={version.id} className="rounded-xl border border-slate-100 p-4">
          <p className="text-xs font-semibold text-slate-500">{koreaDateTime(version.revision_at)}{index === 0 ? " · 최신 수신본" : ""}</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{version.message_text || "(텍스트 없음)"}</p>
        </article>)}</div>
    </section>
  </div>;
}
