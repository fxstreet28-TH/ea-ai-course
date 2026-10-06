// LongLearnDo — send-otp (public, verify_jwt=false)
// Generates a 6-digit OTP, stores its hash, and sends it by SMS via Movider.
// Rate-limited per phone to protect SMS spend. Thai mobile numbers only.
// Secrets: MOVIDER_API_KEY, MOVIDER_API_SECRET, MOVIDER_SENDER (optional).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED = [
  "https://longlearndo.com", "https://www.longlearndo.com",
  "https://ea-ai-course.vercel.app", "http://localhost:8080", "http://127.0.0.1:8080",
];
function isAllowed(o: string) {
  return ALLOWED.includes(o) ||
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(o) ||
    /^https:\/\/([a-z0-9-]+\.)?longlearndo\.com$/.test(o);
}
function cors(o: string) {
  return {
    "Access-Control-Allow-Origin": isAllowed(o) ? o : ALLOWED[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
  };
}
const json = (b: unknown, s: number, o: string) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors(o) } });

// Normalize to E.164 for Thailand (+66) or Laos (+856). "" if invalid.
function normPhone(raw: string): string {
  let p = String(raw || "").replace(/[^\d+]/g, "");
  if (p.startsWith("+")) { /* already E.164 */ }
  else if (p.startsWith("66")) p = "+" + p;
  else if (p.startsWith("856")) p = "+" + p;
  else return "";
  if (/^\+66[689]\d{8}$/.test(p)) return p;   // Thai mobile
  if (/^\+85620\d{8}$/.test(p)) return p;     // Lao mobile
  return "";
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

function clientIP(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "";
}

async function sendSms(to: string, text: string): Promise<{ ok: boolean; detail?: string }> {
  const KEY = Deno.env.get("MOVIDER_API_KEY");
  const SECRET = Deno.env.get("MOVIDER_API_SECRET");
  const SENDER = Deno.env.get("MOVIDER_SENDER") || "";
  if (!KEY || !SECRET) return { ok: false, detail: "movider_not_configured" };

  const form = new URLSearchParams();
  form.set("api_key", KEY);
  form.set("api_secret", SECRET);
  form.set("to", to);
  form.set("text", text);
  if (SENDER) form.set("from", SENDER);

  try {
    const r = await fetch("https://api.movider.co/v1/sms", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const body = await r.text();
    if (!r.ok) return { ok: false, detail: "movider_" + r.status + ":" + body.slice(0, 200) };
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: "movider_network" };
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const phone = normPhone(body.phone || "");
  if (!phone) return json({ error: "bad_phone" }, 200, origin);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // --- rate limits ---
  const now = Date.now();
  const since1m = new Date(now - 60 * 1000).toISOString();
  const since1h = new Date(now - 60 * 60 * 1000).toISOString();

  const { count: recent } = await admin.from("phone_otps")
    .select("id", { count: "exact", head: true })
    .eq("phone", phone).gte("created_at", since1m);
  if ((recent || 0) > 0) return json({ error: "too_soon", cooldown: 60 }, 200, origin);

  const { count: hourly } = await admin.from("phone_otps")
    .select("id", { count: "exact", head: true })
    .eq("phone", phone).gte("created_at", since1h);
  if ((hourly || 0) >= 5) return json({ error: "too_many", cooldown: 3600 }, 200, origin);

  // Per-IP cap: stops one bot from SMS-bombing many different numbers.
  const ip = clientIP(req);
  if (ip) {
    const { count: ipHourly } = await admin.from("phone_otps")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip).gte("created_at", since1h);
    if ((ipHourly || 0) >= 10) return json({ error: "too_many", cooldown: 3600 }, 200, origin);
  }

  // --- generate + store ---
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const code_hash = await sha256(phone + ":" + code);
  const expires_at = new Date(now + 5 * 60 * 1000).toISOString();

  const { error: insErr } = await admin.from("phone_otps")
    .insert({ phone, code_hash, expires_at, ip: clientIP(req) });
  if (insErr) return json({ error: "store_failed" }, 200, origin);

  // --- send ---
  const text = "รหัสยืนยัน LongLearnDo ของคุณคือ " + code + " (ใช้ได้ภายใน 5 นาที) อย่าบอกรหัสนี้กับผู้อื่น";
  const sent = await sendSms(phone, text);
  if (!sent.ok) return json({ error: "sms_failed", detail: sent.detail }, 200, origin);

  return json({ ok: true, cooldown: 60 }, 200, origin);
});
