// LongLearnDo — Stripe webhook: on paid checkout, generate an access code,
// email it to the buyer, and (for direct web purchases) also grant access.
// verify_jwt = false (Stripe calls this without a Supabase JWT; auth = Stripe signature).
// Secrets: STRIPE_WEBHOOK_SECRET, RESEND_API_KEY, EMAIL_FROM
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function verifyStripe(secret: string, payload: string, sig: string): Promise<boolean> {
  const parts = sig.split(",").map((p) => p.trim());
  let t = "";
  const v1: string[] = [];
  for (const p of parts) {
    const i = p.indexOf("=");
    const k = p.slice(0, i), v = p.slice(i + 1);
    if (k === "t") t = v;
    else if (k === "v1") v1.push(v);
  }
  if (!t || v1.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = hex(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`)));
  return v1.some((s) => safeEq(mac, s));
}

// Unambiguous 8-char code (no O/0/I/1) e.g. A7K9-3F2M shown, stored without dash.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}
function pretty(code: string): string {
  return code.slice(0, 4) + "-" + code.slice(4);
}

async function insertUniqueCode(admin: any, email: string | null, sessionId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = genCode();
    const { error } = await admin.from("access_codes").insert({
      code, email, stripe_session_id: sessionId, status: "active",
    });
    if (!error) return code;
    // 23505 = unique_violation on the code PK → retry with a new code.
    if (error.code !== "23505") return null;
  }
  return null;
}

async function sendCodeEmail(to: string, code: string): Promise<void> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const FROM = Deno.env.get("EMAIL_FROM") || "LongLearnDo Academy <noreply@longlearndo.com>";
  if (!RESEND_API_KEY) { console.error("RESEND_API_KEY not set"); return; }

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#050610;padding:32px;color:#f3f4ff">
    <div style="max-width:520px;margin:0 auto;background:#101125;border:1px solid #282b49;border-radius:16px;padding:32px">
      <h1 style="color:#61e9ff;font-size:22px;margin:0 0 8px">ยินดีต้อนรับสู่ LongLearnDo Academy 🎉</h1>
      <p style="color:#a3a7c3;line-height:1.8;margin:0 0 20px">ขอบคุณที่สมัครคอร์ส! นี่คือรหัสเปิดสิทธิ์เรียนของคุณ — นำไปกรอกในหน้าห้องเรียนเพื่อปลดล็อกคอร์ส</p>
      <div style="background:#0b0c1c;border:1px solid #61e9ff55;border-radius:12px;padding:20px;text-align:center;margin:0 0 20px">
        <div style="font-size:12px;letter-spacing:2px;color:#a3a7c3;margin-bottom:8px">YOUR ACCESS CODE</div>
        <div style="font-size:34px;font-weight:800;letter-spacing:6px;color:#f3f4ff;font-family:monospace">${pretty(code)}</div>
      </div>
      <a href="https://longlearndo.com/learn.html" style="display:block;text-align:center;background:#61e9ff;color:#05202a;text-decoration:none;font-weight:700;padding:14px;border-radius:10px;margin:0 0 20px">เปิดห้องเรียน → กรอกรหัส</a>
      <p style="color:#8388a8;font-size:12.5px;line-height:1.7;margin:0">⚠️ รหัสนี้ใช้ได้กับ <b style="color:#f3f4ff">1 บัญชีเท่านั้น</b> เมื่อกรอกครั้งแรกจะผูกกับบัญชีของคุณถาวร โปรดอย่าเปิดเผยรหัสนี้กับผู้อื่น</p>
    </div>
    <p style="text-align:center;color:#5a5e7e;font-size:11px;margin:16px 0 0">LongLearnDo Academy · longlearndo.com</p>
  </div>`;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM, to: [to],
      subject: "รหัสเปิดสิทธิ์เรียน — LongLearnDo Academy",
      html,
    }),
  });
  if (!resp.ok) console.error("Resend send failed", resp.status, await resp.text());
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return new Response("not_configured", { status: 500 });

  const sig = req.headers.get("stripe-signature") || "";
  const raw = await req.text();
  if (!(await verifyStripe(secret, raw, sig))) return new Response("bad_signature", { status: 400 });

  let event: any;
  try { event = JSON.parse(raw); } catch (_) { return new Response("bad_json", { status: 400 }); }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const s = event.data?.object || {};
    const paid = s.payment_status === "paid" || s.status === "complete";
    const userId = s.client_reference_id || s.metadata?.user_id || null;
    const email = s.customer_details?.email || s.customer_email || s.metadata?.email || null;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Log the order (idempotent on stripe_session_id).
    await admin.from("course_orders").upsert({
      user_id: userId,
      email,
      stripe_session_id: s.id,
      stripe_payment_intent: s.payment_intent || null,
      amount_total: s.amount_total ?? null,
      currency: s.currency || "thb",
      status: paid ? "paid" : "pending",
      updated_at: new Date().toISOString(),
    }, { onConflict: "stripe_session_id" });

    if (paid) {
      // One code per order: only create + email if this session has none yet.
      const { data: existing } = await admin.from("access_codes")
        .select("code").eq("stripe_session_id", s.id).limit(1);
      if (!existing || existing.length === 0) {
        const code = await insertUniqueCode(admin, email, s.id);
        if (code && email) await sendCodeEmail(email, code);
      }
      // Direct web purchase: buyer was logged in → grant access immediately too.
      if (userId) {
        await admin.from("profiles")
          .update({ has_access: true, access_granted_at: new Date().toISOString() })
          .eq("id", userId);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
