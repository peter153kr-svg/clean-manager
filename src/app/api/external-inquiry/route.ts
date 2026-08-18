import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const WINDOW_MS = 10 * 60 * 1000;
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 10;
const requests = new Map<string, number[]>();

type IncomingInquiry = {
  name?: unknown; phone?: unknown; region?: unknown; address?: unknown; apartment_name?: unknown;
  area_pyeong?: unknown; service_type?: unknown; content?: unknown; preferred_date?: unknown;
  website_source?: unknown; consent?: unknown; memo?: unknown;
};

const string = (value: unknown, max = 200) => typeof value === "string" ? value.trim().slice(0, max) : "";
const phoneDigits = (value: string) => value.replace(/\D/g, "");
const formattedPhone = (value: string) => value.length === 11 && value.startsWith("01") ? `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7)}` : value;
const normalizeContent = (value: string) => value.toLowerCase().replace(/\s+/g, " ").replace(/[^0-9a-z가-힣 ]/g, "").trim();

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.EXTERNAL_INQUIRY_ALLOWED_ORIGIN || "https://skyclean.kr",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Webhook-Timestamp, X-Webhook-Signature",
    "Vary": "Origin",
  };
}

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders() });
}

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === (process.env.EXTERNAL_INQUIRY_ALLOWED_ORIGIN || "https://skyclean.kr");
}

function verifySignature(raw: string, timestamp: string | null, signature: string | null) {
  const secret = process.env.EXTERNAL_INQUIRY_WEBHOOK_SECRET;
  if (!secret || !timestamp || !signature) return false;
  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > TIMESTAMP_TOLERANCE_MS) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex")}`;
  const supplied = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return supplied.length === expectedBuffer.length && timingSafeEqual(supplied, expectedBuffer);
}

function allowed(ip: string) {
  const now = Date.now();
  const recent = (requests.get(ip) || []).filter((time) => now - time < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) return false;
  recent.push(now); requests.set(ip, recent);
  if (requests.size > 500) for (const [key, values] of requests) if (!values.some((time) => now - time < RATE_WINDOW_MS)) requests.delete(key);
  return true;
}

function metadata(data: Required<Pick<IncomingInquiry, "service_type" | "preferred_date" | "website_source" | "consent" | "memo">>) {
  const rows = [["서비스", string(data.service_type, 100)], ["희망 날짜", string(data.preferred_date, 50)], ["홈페이지 출처", string(data.website_source, 200)], ["선택 동의", typeof data.consent === "boolean" ? (data.consent ? "동의" : "미동의") : string(data.consent, 50)], ["추가 메모", string(data.memo, 2000)]];
  return rows.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join("\n");
}

export function OPTIONS() { return new NextResponse(null, { status: 204, headers: corsHeaders() }); }

export async function POST(request: Request) {
  try {
    if (!validOrigin(request)) return response({ success: false, error: "요청을 처리하지 못했습니다." }, 403);
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 50_000) return response({ success: false, error: "요청을 처리하지 못했습니다." }, 413);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!allowed(ip)) return response({ success: false, error: "잠시 후 다시 시도해 주세요." }, 429);

    const raw = await request.text();
    if (!verifySignature(raw, request.headers.get("x-webhook-timestamp"), request.headers.get("x-webhook-signature"))) return response({ success: false, error: "요청을 처리하지 못했습니다." }, 401);
    let body: IncomingInquiry;
    try { body = JSON.parse(raw); } catch { return response({ success: false, error: "요청 형식이 올바르지 않습니다." }, 400); }

    const name = string(body.name, 100);
    const phone = phoneDigits(string(body.phone, 40));
    const content = string(body.content, 5000);
    if (!name || phone.length < 7 || phone.length > 15) return response({ success: false, error: "필수 입력값을 확인해 주세요." }, 400);

    const address = string(body.address, 300), apartmentName = string(body.apartment_name, 200), region = string(body.region, 100);
    const areaRaw = string(body.area_pyeong, 30); const area = areaRaw === "" ? null : Number(areaRaw);
    if (area !== null && (!Number.isFinite(area) || area < 0 || area > 10000)) return response({ success: false, error: "요청 형식이 올바르지 않습니다." }, 400);

    const admin = createAdminClient();
    const variants = [...new Set([phone, formattedPhone(phone)])];
    const existing = await admin.from("customers").select("id,name,phone,address,apartment_name,area_pyeong").in("phone", variants).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (existing.error) throw existing.error;
    const existingCustomer = existing.data;
    let customerId = existingCustomer?.id;
    if (existingCustomer && customerId) {
      const update = { name: name || existingCustomer.name, address: address || existingCustomer.address, apartment_name: apartmentName || existingCustomer.apartment_name, area_pyeong: area ?? existingCustomer.area_pyeong };
      const updated = await admin.from("customers").update(update).eq("id", customerId);
      if (updated.error) throw updated.error;
    } else {
      const created = await admin.from("customers").insert({ name, phone: formattedPhone(phone), address: address || null, apartment_name: apartmentName || null, area_pyeong: area }).select("id").single();
      if (created.error || !created.data) throw created.error || new Error("Customer creation failed");
      customerId = created.data.id;
    }

    const recent = await admin.from("inquiries").select("content").eq("customer_id", customerId).eq("source", "홈페이지").gte("created_at", new Date(Date.now() - WINDOW_MS).toISOString()).order("created_at", { ascending: false }).limit(10);
    if (recent.error) throw recent.error;
    const normalized = normalizeContent(content);
    const duplicate = (recent.data || []).some((item) => normalized && normalizeContent(item.content || "") === normalized);
    if (duplicate) return response({ success: true });

    const inserted = await admin.from("inquiries").insert({ customer_id: customerId, inquiry_date: new Date().toISOString().slice(0, 10), source: "홈페이지", status: "new", region: region || null, apartment_name: apartmentName || null, area_pyeong: area, content: content || null, memo: metadata(body as Required<Pick<IncomingInquiry, "service_type" | "preferred_date" | "website_source" | "consent" | "memo">>) || null });
    if (inserted.error) throw inserted.error;
    return response({ success: true });
  } catch {
    return response({ success: false, error: "문의 접수 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요." }, 500);
  }
}
