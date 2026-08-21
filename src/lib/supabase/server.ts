import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseUrl } from "@/lib/supabase/config";

export async function createClient() {
  const cookieStore = await cookies();
  const url = getSupabaseUrl();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  return createServerClient(url, key, { cookies: { getAll: () => cookieStore.getAll(), setAll: (items) => { try { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} } } });
}
