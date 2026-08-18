"use client";

import { useState } from "react";
import { saveEditedContent, approveContent } from "@/app/content-edit-actions";

const labels: Record<string, string> = { blog: "네이버 블로그", website_case: "홈페이지 시공후기", threads: "스레드", reels: "릴스", social: "SNS", captions: "사진 캡션", full_package: "전체 패키지", generated: "생성됨", edited: "수정됨", approved: "승인됨", discarded: "폐기" };
const record = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const list = (value: unknown): any[] => Array.isArray(value) ? value : [];
const text = (value: unknown) => typeof value === "string" ? value : "";

function caseArticle(data: Record<string, any>) {
  if (text(data.full_article)) return text(data.full_article);
  const process = list(data.work_process).map((item) => `## ${text(record(item).heading)}\n${text(record(item).body)}`).join("\n\n");
  const faq = list(data.faq).map((item) => `Q. ${text(record(item).question)}\n${text(record(item).answer)}`).join("\n\n");
  return [text(data.page_title), text(data.hero_summary), "## 청소 전 어떤 상태였나요?", text(data.problem), "## 현장에서 확인한 문제", text(data.inspection), "## 어떻게 작업했나요?", process, "## 작업 후 어떻게 달라졌나요?", text(data.result), "## 현장에서 확인한 핵심 포인트", text(data.expert_note), "## 관리 방법", text(data.maintenance_tip), "## 자주 묻는 질문", faq, text(data.cta)].filter(Boolean).join("\n\n");
}

function ListBlock({ title, values }: { title: string; values: unknown }) {
  const items = list(values).map((item) => typeof item === "string" ? item : text(record(item).title) || text(record(item).heading) || text(record(item).anchor_text) || JSON.stringify(item));
  if (!items.length) return null;
  return <section><h4 className="font-semibold">{title}</h4><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section>;
}

function Quality({ items }: { items: unknown }) {
  const rows = list(items); if (!rows.length) return null;
  return <section><h4 className="font-semibold">SEO/E-E-A-T 품질 체크</h4><div className="mt-2 grid gap-2 sm:grid-cols-2">{rows.map((raw, index) => { const item = record(raw); const result = text(item.result); return <p key={index} className="rounded bg-slate-50 p-2 text-sm"><b>{text(item.item)}</b><span className="ml-2 text-blue-700">{result}</span>{text(item.note) && <span className="block text-slate-600">{text(item.note)}</span>}</p>; })}</div></section>;
}

function BlogView({ data }: { data: Record<string, any> }) {
  const strategy = record(data.search_strategy);
  return <div className="space-y-5"><section><h3 className="text-xl font-bold">{text(data.recommended_title)}</h3><p className="mt-1 text-sm text-slate-600">{text(data.title_reason)}</p></section><section><h4 className="font-semibold">검색 전략</h4><p className="mt-1 text-sm">검색 의도: {text(strategy.search_intent) || "-"}</p><p className="text-sm">메인 키워드: {text(strategy.primary_keyword) || text(data.primary_keyword) || "-"}</p><ListBlock title="서브 키워드" values={strategy.secondary_keywords || data.secondary_keywords} /></section><ListBlock title="제목 후보 10개" values={list(data.title_candidates).map((item) => { const row = record(item); return `${text(row.angle)} · ${text(row.title)}`; })} /><ListBlock title="추천 소제목" values={list(data.outline).map((item) => text(record(item).heading))} />{record(data.field_expert_box).items && <section className="rounded-lg bg-blue-50 p-4"><h4 className="font-semibold">{text(record(data.field_expert_box).title) || "현장에서 확인한 포인트"}</h4><ListBlock title="" values={record(data.field_expert_box).items} /></section>}<PhotoPlan values={data.photo_placements} /><ListBlock title="추천 내부링크" values={strategy.recommended_internal_links} /><Quality items={data.seo_checklist} /></div>;
}

function PhotoPlan({ values }: { values: unknown }) { const items = list(values); if (!items.length) return null; return <section><h4 className="font-semibold">사진 배치</h4><div className="mt-2 space-y-2">{items.map((raw, index) => { const item = record(raw); return <div key={index} className="rounded bg-slate-50 p-3 text-sm"><b>사진 {item.photo_order} · {text(item.category)}</b><p>{text(item.placement)}</p><p className="text-slate-600">캡션: {text(item.caption)}</p><p className="text-slate-600">Alt: {list(item.alt_text_candidates).join(" / ") || text(item.alt_text)}</p></div>; })}</div></section>; }

function WebsiteView({ data }: { data: Record<string, any> }) { return <div className="space-y-5"><section><h3 className="text-xl font-bold">{text(data.page_title)}</h3><p className="mt-2 text-slate-700">{text(data.hero_summary)}</p></section><section className="grid gap-2 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">{list(data.project_overview).map((raw, index) => { const item = record(raw); return <p key={index} className="text-sm"><b>{text(item.label)}</b><span className="ml-2">{text(item.value)}</span></p>; })}</section><section><h4 className="font-semibold">현장 SEO 정보</h4><p className="text-sm">Meta title: {text(data.meta_title)}</p><p className="text-sm">Meta description: {text(data.meta_description)}</p><p className="text-sm">Slug: {text(data.slug_suggestion)}</p></section><PhotoPlan values={data.photo_sections} /><ListBlock title="FAQ" values={list(data.faq).map((item) => { const row = record(item); return `Q. ${text(row.question)} — ${text(row.answer)}`; })} /><ListBlock title="관련 시공후기·내부링크" values={data.related_case_suggestions} /><Quality items={data.quality_check} /></div>; }

export function ContentHistory({ items, path }: { items: any[]; path: string }) {
  const [open, setOpen] = useState<string | null>(null); const [drafts, setDrafts] = useState<Record<string, string>>({});
  if (!items.length) return <p className="mt-3 text-sm text-slate-500">아직 생성된 콘텐츠가 없습니다.</p>;
  return <div className="mt-3 space-y-3">{items.map((item) => { const data = record(item.edited_output || item.output_data); const isCase = item.content_type === "website_case"; const article = drafts[item.id] ?? (isCase ? caseArticle(data) : text(data.full_article) || text(data.body)); const edited = { ...data, full_article: article }; return <article className="rounded-2xl border bg-white p-4 sm:p-5" key={item.id}><button onClick={() => setOpen(open === item.id ? null : item.id)} className="w-full text-left font-semibold">{labels[item.content_type] || item.content_type} · <span className="text-blue-600">{labels[item.status] || item.status}</span></button>{open === item.id && <div className="mt-5 space-y-5">{item.content_type === "blog" ? <BlogView data={data} /> : isCase ? <WebsiteView data={data} /> : <pre className="overflow-auto rounded bg-slate-50 p-4 text-xs whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>}<section><h4 className="font-semibold">{isCase ? "홈페이지 본문" : "본문"}</h4><textarea value={article} onChange={(event) => setDrafts((value) => ({ ...value, [item.id]: event.target.value }))} className="mt-2 min-h-80 w-full rounded-lg border p-3 leading-7" /></section>{text(data.cta) && <p className="rounded bg-blue-50 p-3 text-sm">CTA: {text(data.cta)}</p>}<ListBlock title="태그" values={data.tags} /><div className="flex flex-wrap gap-2"><button onClick={() => navigator.clipboard.writeText(article || JSON.stringify(data, null, 2))} className="rounded border px-3 py-2 text-sm">전체 복사</button>{article && <button onClick={() => navigator.clipboard.writeText(article)} className="rounded border px-3 py-2 text-sm">본문 복사</button>}<form action={saveEditedContent}><input type="hidden" name="id" value={item.id} /><input type="hidden" name="path" value={path} /><input type="hidden" name="edited_output" value={JSON.stringify(edited)} /><button className="rounded border px-3 py-2 text-sm">수정 저장</button></form><form action={approveContent}><input type="hidden" name="id" value={item.id} /><input type="hidden" name="path" value={path} /><button className="rounded bg-blue-600 px-3 py-2 text-sm text-white">승인</button></form></div><details><summary className="cursor-pointer text-xs text-slate-500">원본 JSON 보기</summary><pre className="mt-2 overflow-auto text-xs">{JSON.stringify(item.output_data, null, 2)}</pre></details></div>}</article>; })}</div>;
}
