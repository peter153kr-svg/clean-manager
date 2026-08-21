export function getSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!value) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  }

  try {
    return new URL(value.trim()).origin;
  } catch {
    throw new Error("Supabase URL 형식이 올바르지 않습니다.");
  }
}
