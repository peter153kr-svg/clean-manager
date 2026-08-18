"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generate } from "@/lib/ai/generator";
import type { ContentType } from "@/lib/ai/types";

type Diagnostic = { stage?: string; code?: string; message?: string; details?: string; hint?: string };
export type State = { error?: string; diagnostic?: Diagnostic; result?: Record<string, unknown> };

const briefFields = [
  "site_features", "contamination_condition", "customer_concern", "before_condition",
  "work_method", "equipment_tools", "notable_issues", "worker_judgment", "after_change",
  "customer_feedback", "precautions", "maintenance_recommendations", "work_duration",
] as const;

function failure(stage: string, error: unknown, userMessage: string): State {
  const e = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  return { error: userMessage, diagnostic: { stage, code: e?.code, message: e?.message, details: e?.details, hint: e?.hint } };
}

function cleanBrief(formData: FormData) {
  return Object.fromEntries(
    briefFields.map((field) => [field, String(formData.get(field) || "").trim()]).filter(([, value]) => value),
  );
}

async function currentProject(jobId: string) {
  const supabase = await createClient();
  return supabase.from("content_projects").select("id,content_brief").eq("job_id", jobId).order("created_at", { ascending: false }).limit(1).maybeSingle();
}

export async function saveContentBrief(_: State | null, formData: FormData): Promise<State> {
  const jobId = String(formData.get("job_id") || "");
  if (!jobId) return { error: "작업 정보를 확인할 수 없습니다." };
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return failure("auth", authError, "로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");

  const { data: job, error: jobError } = await supabase.from("jobs").select("apartment_name,service_type").eq("id", jobId).single();
  if (jobError || !job) return failure("job", jobError, "작업 정보를 불러오지 못했습니다.");

  const brief = cleanBrief(formData);
  const { data: project, error: lookupError } = await currentProject(jobId);
  if (lookupError) return failure("project_lookup", lookupError, "콘텐츠 프로젝트를 조회하지 못했습니다.");

  const result = project
    ? await supabase.from("content_projects").update({ content_brief: brief }).eq("id", project.id)
    : await supabase.from("content_projects").insert({ job_id: jobId, title: job.apartment_name || job.service_type || "콘텐츠 프로젝트", content_brief: brief });
  if (result.error) return failure("project_save", result.error, "현장 콘텐츠 정보를 저장하지 못했습니다.");

  revalidatePath(`/jobs/${jobId}/content`);
  return { result: { saved: true } };
}

export async function generateContent(_: State | null, formData: FormData): Promise<State> {
  const jobId = String(formData.get("job_id") || "");
  const type = String(formData.get("content_type") || "") as ContentType;
  if (!(["blog", "website_case", "threads", "reels", "full_package"] as string[]).includes(type)) return { error: "지원하지 않는 콘텐츠 형식입니다." };

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return failure("auth", authError, "로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");

    const { data: job, error: jobError } = await supabase.from("jobs").select("*").eq("id", jobId).single();
    if (jobError || !job) return failure("job", jobError, "작업 정보를 불러오지 못했습니다.");

    let inquiry = null;
    if (job.inquiry_id) {
      const inquiryResult = await supabase.from("inquiries").select("source,region,content,memo").eq("id", job.inquiry_id).maybeSingle();
      if (inquiryResult.error) return failure("inquiry", inquiryResult.error, "연결된 문의 정보를 불러오지 못했습니다.");
      inquiry = inquiryResult.data;
    }

    const { data: media, error: mediaError } = await supabase.from("media_assets").select("category,description,display_name,sort_order").eq("job_id", jobId).order("sort_order");
    if (mediaError) return failure("media", mediaError, "현장 사진 정보를 불러오지 못했습니다.");

    const { data: existingProject, error: projectError } = await currentProject(jobId);
    if (projectError) return failure("project_lookup", projectError, "콘텐츠 프로젝트를 조회하지 못했습니다.");
    let project = existingProject;
    if (!project) {
      const created = await supabase.from("content_projects").insert({ job_id: jobId, title: job.apartment_name || job.service_type || "콘텐츠 프로젝트", content_brief: {} }).select("id,content_brief").single();
      if (created.error || !created.data) return failure("project_insert", created.error, "콘텐츠 프로젝트 생성에 실패했습니다.");
      project = created.data;
    }

    const input = {
      location: [job.address, job.apartment_name].filter(Boolean).join(" "),
      area_pyeong: job.area_pyeong,
      service_type: job.service_type,
      work_scope: job.work_scope,
      job_memo: job.memo,
      amount: job.final_amount ?? job.expected_amount,
      inquiry,
      content_brief: project.content_brief || {},
      photos: media || [],
    };
    let output: Record<string, unknown>;
    try {
      output = await generate(type, input);
    } catch (error) {
      return failure("openai", error, error instanceof Error ? error.message : "AI 콘텐츠 생성에 실패했습니다.");
    }

    const saved = await supabase.from("content_generations").insert({ content_project_id: project.id, content_type: type, model: process.env.OPENAI_MODEL || "gpt-5.4", prompt_version: "v2-eeat", input_snapshot: input, output_data: output });
    if (saved.error) return failure("generation_insert", saved.error, "AI 결과 저장에 실패했습니다.");
    revalidatePath(`/jobs/${jobId}/content`);
    return { result: output };
  } catch (error) {
    return failure("unexpected", error, "콘텐츠 생성 중 예기치 않은 오류가 발생했습니다.");
  }
}
