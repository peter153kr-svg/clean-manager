import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ContentGenerator } from "@/components/content-generator";
import { ContentHistory } from "@/components/content-history";
import { ContentBriefForm } from "@/components/content-brief-form";

type Brief = Record<string, unknown>;
const checkItems = [
  ["지역/현장", (job: Record<string, unknown>) => Boolean(job.address || job.apartment_name)],
  ["서비스", (job: Record<string, unknown>) => Boolean(job.service_type)],
  ["고객 고민", (_: Record<string, unknown>, brief: Brief) => Boolean(brief.customer_concern)],
  ["오염 상태", (_: Record<string, unknown>, brief: Brief) => Boolean(brief.contamination_condition)],
  ["작업 전 상태", (_: Record<string, unknown>, brief: Brief) => Boolean(brief.before_condition)],
  ["작업 방식", (_: Record<string, unknown>, brief: Brief) => Boolean(brief.work_method)],
  ["작업자 판단", (_: Record<string, unknown>, brief: Brief) => Boolean(brief.worker_judgment)],
  ["작업 후 변화", (_: Record<string, unknown>, brief: Brief) => Boolean(brief.after_change)],
] as const;

export default async function Content({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const supabase = await createClient();
  const [{ data: job }, { count }, { data: project }, { data: generations }] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", id).single(),
    supabase.from("media_assets").select("*", { count: "exact", head: true }).eq("job_id", id),
    supabase.from("content_projects").select("id,content_brief").eq("job_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("content_generations").select("id,content_type,status,output_data,edited_output,created_at,content_projects!inner(job_id)").eq("content_projects.job_id", id).order("created_at", { ascending: false }),
  ]);
  if (!job) notFound();
  const brief = (project?.content_brief || {}) as Brief;
  const facts = checkItems.map(([label, present]) => ({ label, present: present(job as Record<string, unknown>, brief) }));
  const presentCount = facts.filter((item) => item.present).length + (count ? 1 : 0);
  const path = `/jobs/${id}/content`;

  return <div className="page max-w-5xl space-y-6">
    <div className="ui-card overflow-hidden bg-gradient-to-br from-white via-white to-blue-50/70 p-6 sm:p-8"><Link href={`/jobs/${id}`} className="text-sm font-semibold text-blue-600">← 작업 상세</Link><p className="eyebrow mt-6">AI CONTENT STUDIO</p><h1 className="page-title">AI 콘텐츠 스튜디오</h1><p className="page-description">{[job.address, job.apartment_name].filter(Boolean).join(" ") || "현장 정보"} · {job.service_type || "서비스 미입력"} · 사진 {count || 0}장</p><div className="mt-6 flex flex-wrap gap-2 text-sm font-semibold text-slate-500"><span className="rounded-full bg-white px-3 py-2 shadow-sm">네이버 블로그</span><span className="rounded-full bg-white px-3 py-2 shadow-sm">홈페이지 시공후기</span><span className="rounded-full bg-white px-3 py-2 shadow-sm">스레드</span><span className="rounded-full bg-white px-3 py-2 shadow-sm">릴스</span></div></div>
    <ContentBriefForm jobId={id} initial={brief} />
    <section className="ui-card p-5 sm:p-6"><h2 className="font-bold">현장정보 보완 체크</h2><div className="mt-4 grid gap-2 sm:grid-cols-3">{facts.map(({ label, present }) => <p key={label} className="rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{label}</span><b className={present ? "float-right text-emerald-700" : "float-right text-slate-400"}>{present ? (label === "지역/현장" || label === "서비스" ? "충분" : "있음") : "없음"}</b></p>)}<p className="rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>사진</span><b className={count ? "float-right text-emerald-700" : "float-right text-slate-400"}>{count ? "있음" : "없음"}</b></p></div><p className="mt-4 text-sm text-slate-600">{presentCount >= 6 ? "현재 정보로 생성 가능" : "현장 정보를 조금 더 입력하면 글 품질이 좋아집니다."}</p></section>
    <ContentGenerator jobId={id} />
    <section><div className="mb-3"><p className="eyebrow">LIBRARY</p><h2 className="mt-1 font-bold">생성 이력</h2></div><ContentHistory items={generations || []} path={path} /></section>
  </div>;
}
