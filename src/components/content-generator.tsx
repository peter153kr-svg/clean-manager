"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { generateContent } from "@/app/content-actions";

const buttons = [
  ["blog", "네이버 블로그 생성"], ["website_case", "홈페이지 시공후기 생성"],
  ["threads", "스레드 생성"], ["reels", "릴스 대본 생성"], ["full_package", "전체 콘텐츠 생성"],
] as const;

export function ContentGenerator({ jobId }: { jobId: string }) {
  const [state, action, pending] = useActionState(generateContent, null);
  const router = useRouter();
  useEffect(() => { if (state?.result) router.refresh(); }, [state?.result, router]);
  const diagnostic = state?.diagnostic as { stage?: string; code?: string; message?: string } | undefined;
  return <section className="ui-card border-blue-100 bg-gradient-to-br from-white to-blue-50/50 p-5 sm:p-6">
    <p className="eyebrow">GENERATE</p><h2 className="mt-1 font-bold">AI 콘텐츠 생성</h2><p className="mt-1 text-sm text-slate-500">저장된 현장 정보와 실제 작업·사진 정보만 사용합니다.</p>
    <div className="mt-5 flex flex-wrap gap-2">{buttons.map(([value, label]) => <form action={action} key={value}><input type="hidden" name="job_id" value={jobId} /><button disabled={pending} name="content_type" value={value} className={value === "blog" ? "ui-button ui-button-primary" : "ui-button"}>{pending ? "생성 중…" : value === "blog" ? `✦ ${label}` : label}</button></form>)}</div>
    {state?.error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"><p>{String(state.error)}</p>{process.env.NODE_ENV === "development" && diagnostic && <p className="mt-1 text-xs">단계: {diagnostic.stage || "-"}{diagnostic.code ? ` · 코드: ${diagnostic.code}` : ""}{diagnostic.message ? ` · ${diagnostic.message}` : ""}</p>}</div>}
    {state?.result && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">콘텐츠를 생성해 이력에 저장했습니다. 아래 생성 이력에서 확인하고 편집할 수 있습니다.</p>}
  </section>;
}
