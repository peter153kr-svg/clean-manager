"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveContentBrief } from "@/app/content-actions";

const fields = [
  ["site_features", "현장 특징"], ["contamination_condition", "오염 상태"], ["customer_concern", "고객 고민"],
  ["before_condition", "작업 전 상태"], ["work_method", "작업 방법"], ["equipment_tools", "사용 장비/도구"],
  ["notable_issues", "작업 중 특이사항"], ["worker_judgment", "작업자가 판단한 핵심 포인트"],
  ["after_change", "작업 후 변화"], ["customer_feedback", "고객 반응"], ["precautions", "주의사항"],
  ["maintenance_recommendations", "추천 관리 방법"], ["work_duration", "실제 소요시간"],
] as const;

export function ContentBriefForm({ jobId, initial }: { jobId: string; initial: Record<string, unknown> }) {
  const [state, action, pending] = useActionState(saveContentBrief, null);
  const router = useRouter();
  useEffect(() => { if (state?.result) router.refresh(); }, [state?.result, router]);
  return <section className="rounded-2xl border bg-white p-5 sm:p-6">
    <div className="mb-4"><h2 className="font-bold">현장 콘텐츠 정보</h2><p className="mt-1 text-sm text-slate-500">선택 입력입니다. 실제로 확인한 내용만 기록하면 AI가 그 범위 안에서 활용합니다.</p></div>
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="job_id" value={jobId} />
      {fields.map(([name, label]) => <label key={name} className={name === "worker_judgment" || name === "maintenance_recommendations" ? "sm:col-span-2" : ""}>
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {name === "work_duration" ? <input name={name} defaultValue={String(initial[name] || "")} placeholder="예: 약 3시간 30분" className="mt-1 w-full rounded-lg border px-3 py-2" /> : <textarea name={name} defaultValue={String(initial[name] || "")} rows={3} className="mt-1 w-full resize-y rounded-lg border px-3 py-2" />}
      </label>)}
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3"><button disabled={pending} className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{pending ? "저장 중…" : "현장정보 저장"}</button>{state?.result && <p className="text-sm text-emerald-700">저장했습니다.</p>}{state?.error && <p className="text-sm text-red-700">{state.error}</p>}</div>
    </form>
  </section>;
}
