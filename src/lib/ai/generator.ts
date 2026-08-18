import { getOpenAI, model } from "@/lib/ai/client";
import { outputFormat } from "@/lib/ai/schemas";
import { style } from "@/lib/ai/prompts";
import type { ContentType, GeneratedContent } from "@/lib/ai/types";

function readableError(error: unknown): Error {
  const e = error as { status?: number; code?: string };
  if (e.status === 401) return new Error("OpenAI API 키가 올바르지 않거나 사용할 수 없습니다.");
  if (e.status === 429) return new Error("OpenAI API 결제 또는 사용 한도를 확인해 주세요.");
  if (e.status === 404 || e.code === "model_not_found") return new Error("지정한 AI 모델을 사용할 수 없습니다. OPENAI_MODEL을 확인해 주세요.");
  return new Error("AI 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.");
}

const rules: Record<ContentType, string> = {
  blog: "네이버 블로그 현장 후기입니다. 엄격한 BlogContent 스키마를 따르세요. 제목 후보는 정확히 10개이며 서로 다른 관점이어야 합니다. 첫 두 문장은 현장의 가장 강한 문제나 특징으로 시작하세요. 현장 정보가 충분할 때만 2,500~4,000자 수준으로 쓰되, 반복으로 분량을 채우지 마세요. seo_checklist에는 실제 현장 경험 반영, 전문성, 신뢰성, 검색 의도, 현장 데이터 활용, 사진 활용, 키워드 자연스러움, 허구 정보 여부, CTA 자연스러움, 반복·상투 표현 점검을 모두 포함하세요.",
  website_case: "홈페이지 시공후기입니다. 엄격한 WebsiteCaseContent 스키마를 따르세요. 블로그식 이야기 복제가 아니라 문제·점검·해결·결과·전문정보 중심의 간결한 사례 페이지로 작성하세요.",
  threads: "posts 배열 3개를 반환하세요. 각 항목은 hook, body, ending을 포함하며 서로 다른 현장 관점을 사용하세요.",
  reels: "hook, cuts 배열, captions 배열, narration, cta, recommended_duration을 포함하세요. 30~45초 흐름으로 작성하세요.",
  full_package: "blog, threads 배열 3개, reels, social, captions 배열, cta를 포함하세요.",
};

export async function generate(type: ContentType, input: unknown): Promise<GeneratedContent> {
  let output = "";
  const format = outputFormat(type);
  try {
    const response = await getOpenAI().responses.create({
      model: model(),
      input: [
        { role: "system", content: style },
        {
          role: "user",
          content: `아래의 사실만 사용해 콘텐츠를 생성하세요. ${rules[type]}\n\n빈 정보는 추측하거나 '정보가 없다'고 쓰지 말고 자연스럽게 생략하세요. 고객 발언·반응, 금액, 소요시간, 오염 종류, 장비, 작업 방식, 결과, 전후 변화, 사진 내용을 절대로 지어내지 마세요. 사진은 제공된 설명과 분류에 근거할 때만 언급하세요. 시스템·메타데이터·입력 정보 같은 내부 표현은 최종 콘텐츠에 넣지 마세요. SEO 상위 노출이나 성과를 보장하지 마세요.\n\n현장 사실:\n${JSON.stringify(input)}`,
        },
      ],
      text: format
        ? { format: { type: "json_schema", name: format.name, strict: true, schema: format.schema } as any }
        : { format: { type: "json_object" } },
    });
    output = response.output_text;
  } catch (error) {
    throw readableError(error);
  }

  try {
    const parsed: unknown = JSON.parse(output);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as GeneratedContent;
  } catch {
    throw new Error("AI 응답 형식을 처리하지 못했습니다. 다시 시도해 주세요.");
  }
}
