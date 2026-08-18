import type { ContentType } from "@/lib/ai/types";

const quality = {
  type: "object",
  additionalProperties: false,
  required: ["item", "result", "note"],
  properties: {
    item: { type: "string" },
    result: { type: "string", enum: ["좋음", "보완 필요", "정보 부족"] },
    note: { type: "string" },
  },
};

const photo = {
  type: "object",
  additionalProperties: false,
  required: ["photo_order", "category", "placement", "caption", "key_point", "alt_text_candidates"],
  properties: {
    photo_order: { type: "integer" },
    category: { type: "string" },
    placement: { type: "string" },
    caption: { type: "string" },
    key_point: { type: "string" },
    alt_text_candidates: { type: "array", items: { type: "string" } },
  },
};

const blogSchema = {
  type: "object",
  additionalProperties: false,
  required: ["search_strategy", "title_candidates", "recommended_title", "title_reason", "outline", "full_article", "field_expert_box", "photo_placements", "cta", "tags", "seo_checklist"],
  properties: {
    search_strategy: {
      type: "object", additionalProperties: false,
      required: ["search_intent", "primary_keyword", "secondary_keywords", "long_tail_keywords", "related_questions", "recommended_internal_links"],
      properties: {
        search_intent: { type: "string" }, primary_keyword: { type: "string" },
        secondary_keywords: { type: "array", items: { type: "string" } },
        long_tail_keywords: { type: "array", items: { type: "string" } },
        related_questions: { type: "array", items: { type: "string" } },
        recommended_internal_links: { type: "array", items: { type: "object", additionalProperties: false, required: ["anchor_text", "target_hint", "reason"], properties: { anchor_text: { type: "string" }, target_hint: { type: "string" }, reason: { type: "string" } } } },
      },
    },
    title_candidates: { type: "array", minItems: 10, maxItems: 10, items: { type: "object", additionalProperties: false, required: ["title", "angle"], properties: { title: { type: "string" }, angle: { type: "string" } } } },
    recommended_title: { type: "string" }, title_reason: { type: "string" },
    outline: { type: "array", items: { type: "object", additionalProperties: false, required: ["heading", "purpose"], properties: { heading: { type: "string" }, purpose: { type: "string" } } } },
    full_article: { type: "string" },
    field_expert_box: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["title", "items"], properties: { title: { type: "string" }, items: { type: "array", items: { type: "string" } } } }] },
    photo_placements: { type: "array", items: photo }, cta: { type: "string" }, tags: { type: "array", items: { type: "string" } }, seo_checklist: { type: "array", items: quality },
  },
};

const websiteCaseSchema = {
  type: "object", additionalProperties: false,
  required: ["page_title", "meta_title", "meta_description", "slug_suggestion", "primary_keyword", "secondary_keywords", "hero_summary", "project_overview", "problem", "inspection", "work_process", "result", "expert_note", "maintenance_tip", "photo_sections", "faq", "cta", "related_case_suggestions", "schema_data_suggestion", "quality_check"],
  properties: {
    page_title: { type: "string" }, meta_title: { type: "string" }, meta_description: { type: "string" }, slug_suggestion: { type: "string" }, primary_keyword: { type: "string" }, secondary_keywords: { type: "array", items: { type: "string" } }, hero_summary: { type: "string" },
    project_overview: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "value"], properties: { label: { type: "string" }, value: { type: "string" } } } },
    problem: { type: "string" }, inspection: { type: "string" },
    work_process: { type: "array", items: { type: "object", additionalProperties: false, required: ["heading", "body"], properties: { heading: { type: "string" }, body: { type: "string" } } } },
    result: { type: "string" }, expert_note: { type: "string" }, maintenance_tip: { type: "string" },
    photo_sections: { type: "array", items: { type: "object", additionalProperties: false, required: ["heading", "photo_order", "caption", "alt_text"], properties: { heading: { type: "string" }, photo_order: { type: "integer" }, caption: { type: "string" }, alt_text: { type: "string" } } } },
    faq: { type: "array", items: { type: "object", additionalProperties: false, required: ["question", "answer"], properties: { question: { type: "string" }, answer: { type: "string" } } } },
    cta: { type: "string" }, related_case_suggestions: { type: "array", items: { type: "object", additionalProperties: false, required: ["anchor_text", "target_hint"], properties: { anchor_text: { type: "string" }, target_hint: { type: "string" } } } },
    schema_data_suggestion: { type: "object", additionalProperties: false, required: ["page_type", "fields"], properties: { page_type: { type: "string" }, fields: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "value"], properties: { name: { type: "string" }, value: { type: "string" } } } } } },
    quality_check: { type: "array", items: quality },
  },
};

export function outputFormat(type: ContentType) {
  if (type === "blog") return { name: "naver_blog_content", schema: blogSchema };
  if (type === "website_case") return { name: "website_case_content", schema: websiteCaseSchema };
  return null;
}
