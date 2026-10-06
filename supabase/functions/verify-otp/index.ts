// LongLearnDo — verify-otp (public, verify_jwt=false)
// Verifies the SMS OTP, then creates the (unconfirmed) account with the
// collected name/phone, and emails the normal email-confirmation link.
// No valid OTP = no account. Secrets: RESEND_API_KEY, EMAIL_FROM.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const LEARN_URL = "https://longlearndo.com/learn.html";

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

function normPhone(raw: string): string {
  let p = String(raw || "").replace(/[^\d+]/g, "");
  if (p.startsWith("+66")) { /* ok */ }
  else if (p.startsWith("66")) p = "+" + p;
  else if (p.startsWith("0")) p = "+66" + p.slice(1);
  else return "";
  return /^\+66[689]\d{8}$/.test(p) ? p : "";
}
async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function emailConfirm(to: string, link: string) {
  const KEY = Deno.env.get("RESEND_API_KEY");
  const FROM = Deno.env.get("EMAIL_FROM") || "LongLearnDo Academy <noreply@longlearndo.com>";
  if (!KEY) return;
  const html =
    `<div style="font-family:Arial,sans-serif;background:#050610;padding:32px;color:#f3f4ff">` +
    `<div style="max-width:520px;margin:0 auto;background:#101125;border:1px solid #282b49;border-radius:16px;padding:32px">` +
    `<h1 style="color:#61e9ff;font-size:22px;margin:0 0 8px">ยืนยันอีเมล — LongLearnDo Academy</h1>` +
    `<p style="color:#a3a7c3;line-height:1.8;margin:0 0 20px">ยืนยันเบอร์โทรเรียบร้อยแล้ว เหลืออีกขั้นเดียว — กดปุ่มด้านล่างเพื่อยืนยันอีเมลและเปิดใช้บัญชี</p>` +
    `<a href="${link}" style="display:block;text-align:center;background:#61e9ff;color:#05202a;text-decoration:none;font-weight:700;padding:14px;border-radius:10px">ยืนยันอีเมล →</a>` +
    `<p style="color:#5a5e7e;font-size:12px;margin:18px 0 0">ถ้าปุ่มกดไม่ได้ ก๊อปลิงก์นี้ไปเปิดในเบราว์เซอร์:<br>${link}</p>` +
    `</div></div>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject: "ยืนยันอีเมล — LongLearnDo Academy", html }),
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  let body: any = {};
  try { body = await req.json(); } catch (_) {}

  const phone = normPhone(body.phone || "");
  const code = String(body.code || "").replace(/\D/g, "");
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const first_name = String(body.first_name || "").trim().slice(0, 60);
  const last_name = String(body.last_name || "").trim().slice(0, 60);

  if (!phone) return json({ error: "bad_phone" }, 200, origin);
  if (!/^\d{6}$/.test(code)) return json({ error: "bad_code" }, 200, origin);
  if (!EMAIL_RE.test(email)) return json({ error: "bad_email" }, 200, origin);
  if (password.length < 8) return json({ error: "bad_password" }, 200, origin);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // --- find the latest usable OTP for this phone ---
  const { data: rows } = await admin.from("phone_otps")
    .select("id,code_hash,expires_at,attempts,consumed")
    .eq("phone", phone).eq("consumed", false)
    .order("created_at", { ascending: false }).limit(1);
  const otp = rows && rows[0];
  if (!otp) return json({ error: "otp_not_found" }, 200, origin);
  if (new Date(otp.expires_at).getTime() < Date.now())
    return json({ error: "otp_expired" }, 200, origin);
  if ((otp.attempts || 0) >= 5)
    return json({ error: "otp_locked" }, 200, origin);

  await admin.from("phone_otps").update({ attempts: (otp.attempts || 0) + 1 }).eq("id", otp.id);

  const expected = await sha256(phone + ":" + code);
  if (expected !== otp.code_hash)
    return json({ error: "otp_invalid", remaining: Math.max(0, 5 - ((otp.attempts || 0) + 1)) }, 200, origin);

  // OTP correct → consume it
  await admin.from("phone_otps").update({ consumed: true }).eq("id", otp.id);

  // --- create the unconfirmed account + get the email-confirmation link ---
  const full_name = (first_name + " " + last_name).trim();
  const { data: gl, error: glErr } = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: {
      data: { first_name, last_name, phone, full_name, phone_verified: true },
      redirectTo: LEARN_URL,
    },
  });

  if (glErr) {
    const m = String(glErr.message || "").toLowerCase();
    if (m.includes("already") || m.includes("registered") || m.includes("exists"))
      return json({ error: "email_exists" }, 200, origin);
    return json({ error: "signup_failed" }, 200, origin);
  }

  const link = gl?.properties?.action_link;
  if (link) await emailConfirm(email, link);

  return json({ ok: true }, 200, origin);
});
