import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { koreaDateTime, scheduleStatusLabels } from "@/lib/telegram/display";

export default async function TelegramSchedulesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("telegram_schedule_messages")
    .select("id,message_id,message_text,attachments,posted_at,edited_at,status")
    .order("posted_at", { ascending: false })
    .limit(100);

  if (error) {
    return <div className="page"><h1 className="page-title">텔레그램 일정</h1>
      <p className="mt-4 text-sm text-red-600">일정 수신함을 불러오지 못했습니다. 데이터베이스 마이그레이션과 권한 설정을 확인해 주세요.</p>
    </div>;
  }

  const pending = (data ?? []).filter((item) => item.status === "pending_review").length;
  return <div className="page">
    <header className="page-header">
      <div><p className="eyebrow">TELEGRAM INBOX</p><h1 className="page-title">텔레그램 일정 수신함</h1>
        <p className="page-description">채널 글을 원문 그대로 보관합니다. 현장 예약·매출에 자동 반영되지는 않습니다.</p></div>
      <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">확인 대기 {pending}건</div>
    </header>
    {!data?.length
      ? <div className="ui-card empty-state">아직 수신된 채널 글이 없습니다. 봇 권한·웹훅 설정 후 새 글을 등록해 보세요.</div>
      : <section className="space-y-3">{data.map((item) =>
        <Link key={item.id} href={`/telegram-schedules/${item.id}`} className="ui-card ui-card-hover block p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-700">{koreaDateTime(item.posted_at)} · 메시지 #{item.message_id}</p>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.status === "pending_review" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{scheduleStatusLabels[item.status] ?? item.status}</span>
          </div>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-700">{item.message_text?.slice(0, 400) || "(텍스트 없음)"}</p>
          <p className="mt-3 text-xs text-slate-400">{item.edited_at ? "수정된 글 · " : ""}첨부 {Array.isArray(item.attachments) ? item.attachments.length : 0}개 · 상세 및 수정 이력 보기</p>
        </Link>)}</section>}
  </div>;
}
