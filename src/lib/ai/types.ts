export type ContentType = "blog" | "website_case" | "threads" | "reels" | "full_package";

export type QualityResult = "좋음" | "보완 필요" | "정보 부족";
export type GeneratedContent = Record<string, unknown>;

export type BlogContent = GeneratedContent & {
  search_strategy: {
    search_intent: string;
    primary_keyword: string;
    secondary_keywords: string[];
    long_tail_keywords: string[];
    related_questions: string[];
    recommended_internal_links: Array<{ anchor_text: string; target_hint: string; reason: string }>;
  };
  title_candidates: Array<{ title: string; angle: string }>;
  recommended_title: string;
  title_reason: string;
  outline: Array<{ heading: string; purpose: string }>;
  full_article: string;
  field_expert_box: { title: string; items: string[] } | null;
  photo_placements: Array<{ photo_order: number; category: string; placement: string; caption: string; key_point: string; alt_text_candidates: string[] }>;
  cta: string;
  tags: string[];
  seo_checklist: Array<{ item: string; result: QualityResult; note: string }>;
};

export type WebsiteCaseContent = GeneratedContent & {
  page_title: string;
  meta_title: string;
  meta_description: string;
  slug_suggestion: string;
  primary_keyword: string;
  secondary_keywords: string[];
  hero_summary: string;
  project_overview: Record<string, string>;
  problem: string;
  inspection: string;
  work_process: Array<{ heading: string; body: string }>;
  result: string;
  expert_note: string;
  maintenance_tip: string;
  photo_sections: Array<{ heading: string; photo_order: number; caption: string; alt_text: string }>;
  faq: Array<{ question: string; answer: string }>;
  cta: string;
  related_case_suggestions: Array<{ anchor_text: string; target_hint: string }>;
  schema_data_suggestion: { page_type: string; fields: Array<{ name: string; value: string }> };
  quality_check: Array<{ item: string; result: QualityResult; note: string }>;
};
