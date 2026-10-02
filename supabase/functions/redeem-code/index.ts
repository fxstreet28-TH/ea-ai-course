// LongLearnDo — redeem an 8-char access code and bind it to the logged-in user.
// verify_jwt = true. 1 code = 1 user forever (enforced by the SQL redeem RPC).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://longlearndo.com",
  "https://www.longlearndo.com",
  "https://ea-ai-course.vercel.app",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];
function isAllowed(o: string): boolean {
  return ALLOWED_ORIGINS.includes(o) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(o) || /^https:\/\/([a-z0-9-]+\.)?longlearndo\.com$/.test(o);
}
function cors(origin: string) {
  const allow = isAllowed(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const json = (b: unknown, status: number, origin: string) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  // Identify the caller.
  const authHeader = req.headers.get("Authorization") || "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401, origin);
  const user = userData.user;

  // Read + normalize the submitted code (strip spaces/dashes, uppercase).
  let body: { code?: string } = {};
  try { body = await req.json(); } catch (_) { /* ok */ }
  const code = String(body.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 8) return json({ result: "invalid" }, 200, origin);

  // Atomic redeem via SECURITY DEFINER RPC (service role not needed here —
  // the function self-guards; but run it with service role to be safe).
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await admin.rpc("redeem_access_code", { p_code: code, p_user: user.id });
  if (error) { console.error("redeem rpc error", error); return json({ result: "error" }, 200, origin); }

  // On successful activation, email a confirmation to the user.
  if (data === "ok" && user.email) {
    const KEY = Deno.env.get("RESEND_API_KEY");
    const FROM = Deno.env.get("EMAIL_FROM") || "LongLearnDo Academy <noreply@longlearndo.com>";
    if (KEY) {
      const html = `<div style="font-family:Arial,sans-serif;background:#050610;padding:32px;color:#f3f4ff"><div style="max-width:520px;margin:0 auto;background:#101125;border:1px solid #282b49;border-radius:16px;padding:32px"><h1 style="color:#7ee0a8;font-size:22px;margin:0 0 8px">✓ เปิดสิทธิ์เรียนแล้ว — LongLearnDo Academy</h1><p style="color:#a3a7c3;line-height:1.8;margin:0 0 20px">ยืนยันการเปิดสิทธิ์เรียนเรียบร้อย! รหัสของคุณถูกใช้งานและผูกกับบัญชีนี้แล้ว เข้าเรียนคอร์สได้เต็มรูปแบบเลยทันที</p><a href="https://longlearndo.com/learn.html" style="display:block;text-align:center;background:#61e9ff;color:#05202a;text-decoration:none;font-weight:700;padding:14px;border-radius:10px">เข้าห้องเรียน →</a></div></div>`;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [user.email], subject: "เปิดสิทธิ์เรียนแล้ว — LongLearnDo Academy", html }),
      });
    }
  }

  // data is one of: ok | used | invalid | revoked
  return json({ result: data }, 200, origin);
});
