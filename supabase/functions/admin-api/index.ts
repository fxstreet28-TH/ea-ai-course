// LongLearnDo — admin CRM API. Admin-only (caller email must be in ADMIN_EMAILS).
// verify_jwt = true. Actions: stats | list_customers | grant_access | revoke_access | resend_code
// Secrets: ADMIN_EMAILS (comma-separated), RESEND_API_KEY, EMAIL_FROM
// Auto-injected: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://longlearndo.com", "https://www.longlearndo.com",
  "https://ea-ai-course.vercel.app", "http://localhost:8080", "http://127.0.0.1:8080",
];
function isAllowed(o: string) { return ALLOWED_ORIGINS.includes(o) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(o); }
function cors(o: string) {
  return {
    "Access-Control-Allow-Origin": isAllowed(o) ? o : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
  };
}
const json = (b: unknown, s: number, o: string) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors(o) } });

function adminEmails(): string[] {
  const raw = Deno.env.get("ADMIN_EMAILS") || "porforex599@gmail.com";
  return raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genCode(): string {
  const b = new Uint8Array(8); crypto.getRandomValues(b);
  let s = ""; for (let i = 0; i < 8; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return s;
}
const pretty = (c: string) => c.slice(0, 4) + "-" + c.slice(4);

async function emailCode(to: string, code: string) {
  const KEY = Deno.env.get("RESEND_API_KEY");
  const FROM = Deno.env.get("EMAIL_FROM") || "LongLearnDo Academy <noreply@longlearndo.com>";
  if (!KEY) return;
  const html = `<div style="font-family:Arial,sans-serif;background:#050610;padding:32px;color:#f3f4ff"><div style="max-width:520px;margin:0 auto;background:#101125;border:1px solid #282b49;border-radius:16px;padding:32px"><h1 style="color:#61e9ff;font-size:22px;margin:0 0 8px">รหัสเปิดสิทธิ์เรียน — LongLearnDo Academy</h1><p style="color:#a3a7c3;line-height:1.8;margin:0 0 20px">นี่คือรหัสเปิดสิทธิ์เรียนของคุณ นำไปกรอกในหน้าห้องเรียนเพื่อปลดล็อกคอร์ส</p><div style="background:#0b0c1c;border:1px solid #61e9ff55;border-radius:12px;padding:20px;text-align:center;margin:0 0 20px"><div style="font-size:12px;letter-spacing:2px;color:#a3a7c3;margin-bottom:8px">YOUR ACCESS CODE</div><div style="font-size:34px;font-weight:800;letter-spacing:6px;color:#f3f4ff;font-family:monospace">${pretty(code)}</div></div><a href="https://longlearndo.com/learn.html" style="display:block;text-align:center;background:#61e9ff;color:#05202a;text-decoration:none;font-weight:700;padding:14px;border-radius:10px">เปิดห้องเรียน → กรอกรหัส</a></div></div>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject: "รหัสเปิดสิทธิ์เรียน — LongLearnDo Academy", html }),
  });
}

async function emailActivated(to: string) {
  const KEY = Deno.env.get("RESEND_API_KEY");
  const FROM = Deno.env.get("EMAIL_FROM") || "LongLearnDo Academy <noreply@longlearndo.com>";
  if (!KEY) return;
  const html = `<div style="font-family:Arial,sans-serif;background:#050610;padding:32px;color:#f3f4ff"><div style="max-width:520px;margin:0 auto;background:#101125;border:1px solid #282b49;border-radius:16px;padding:32px"><h1 style="color:#7ee0a8;font-size:22px;margin:0 0 8px">✓ เปิดสิทธิ์เรียนแล้ว — LongLearnDo Academy</h1><p style="color:#a3a7c3;line-height:1.8;margin:0 0 20px">ยืนยันการเปิดสิทธิ์เรียนเรียบร้อย! บัญชีของคุณสามารถเข้าเรียนคอร์สได้เต็มรูปแบบแล้ว เข้าห้องเรียนได้เลยทันที</p><a href="https://longlearndo.com/learn.html" style="display:block;text-align:center;background:#61e9ff;color:#05202a;text-decoration:none;font-weight:700;padding:14px;border-radius:10px;margin:0 0 8px">เข้าห้องเรียน →</a><p style="color:#5a5e7e;font-size:12px;margin:14px 0 0">หากมีปัญหาการเข้าเรียน ตอบกลับอีเมลนี้ได้เลย</p></div></div>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject: "เปิดสิทธิ์เรียนแล้ว — LongLearnDo Academy", html }),
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  // Authenticate caller.
  const authHeader = req.headers.get("Authorization") || "";
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } });
  const { data: ud, error: ue } = await supa.auth.getUser();
  if (ue || !ud?.user) return json({ error: "unauthorized" }, 401, origin);
  const callerEmail = (ud.user.email || "").toLowerCase();
  if (!adminEmails().includes(callerEmail)) return json({ error: "forbidden" }, 403, origin);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } });

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const action = body.action || "";

  if (action === "stats") {
    const [pAll, pPaid, oPaid, codes] = await Promise.all([
      admin.from("profiles").select("id", { count: "exact", head: true }),
      admin.from("profiles").select("id", { count: "exact", head: true }).eq("has_access", true),
      admin.from("course_orders").select("amount_total", { count: "exact" }).eq("status", "paid"),
      admin.from("access_codes").select("code", { count: "exact", head: true }),
    ]);
    const revenue = (oPaid.data || []).reduce((s: number, r: any) => s + (r.amount_total || 0), 0) / 100;
    return json({
      total_users: pAll.count || 0,
      paid_users: pPaid.count || 0,
      unpaid_users: (pAll.count || 0) - (pPaid.count || 0),
      paid_orders: oPaid.count || 0,
      revenue_thb: revenue,
      codes_issued: codes.count || 0,
    }, 200, origin);
  }

  if (action === "list_customers") {
    const { data: profs } = await admin.from("profiles")
      .select("id,email,full_name,has_access,access_granted_at,created_at")
      .order("created_at", { ascending: false }).limit(500);
    const { data: codes } = await admin.from("access_codes")
      .select("code,email,redeemed_by,status,created_at");
    const { data: orders } = await admin.from("course_orders")
      .select("user_id,email,amount_total,currency,status,stripe_payment_intent,stripe_session_id,created_at")
      .eq("status", "paid");
    const byUser: Record<string, any> = {};
    for (const c of codes || []) { if (c.redeemed_by) byUser[c.redeemed_by] = c; }
    // Map latest paid order by user_id and by lowercased email.
    const payByUser: Record<string, any> = {};
    const payByEmail: Record<string, any> = {};
    for (const o of orders || []) {
      if (o.user_id && !payByUser[o.user_id]) payByUser[o.user_id] = o;
      const em = (o.email || "").toLowerCase();
      if (em && !payByEmail[em]) payByEmail[em] = o;
    }
    const rows = (profs || []).map((p: any) => {
      const pay = payByUser[p.id] || payByEmail[(p.email || "").toLowerCase()] || null;
      return {
        email: p.email, name: p.full_name, has_access: p.has_access,
        created_at: p.created_at, access_granted_at: p.access_granted_at,
        code: byUser[p.id] ? pretty(byUser[p.id].code) : null,
        payment: pay ? {
          amount_thb: (pay.amount_total || 0) / 100,
          currency: pay.currency || "thb",
          payment_intent: pay.stripe_payment_intent || null,
          session_id: pay.stripe_session_id || null,
          paid_at: pay.created_at,
        } : null,
      };
    });
    return json({ customers: rows }, 200, origin);
  }

  if (action === "grant_access") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return json({ result: "no_email" }, 200, origin);
    const { data: prof } = await admin.from("profiles").select("id,email").ilike("email", email).limit(1);
    if (!prof || prof.length === 0) return json({ result: "no_user" }, 200, origin);
    await admin.from("profiles").update({ has_access: true, access_granted_at: new Date().toISOString() })
      .eq("id", prof[0].id);
    if (prof[0].email) await emailActivated(prof[0].email);
    return json({ result: "ok", email: prof[0].email }, 200, origin);
  }

  if (action === "revoke_access") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return json({ result: "no_email" }, 200, origin);
    const { data: prof } = await admin.from("profiles").select("id").ilike("email", email).limit(1);
    if (!prof || prof.length === 0) return json({ result: "no_user" }, 200, origin);
    await admin.from("profiles").update({ has_access: false }).eq("id", prof[0].id);
    return json({ result: "ok" }, 200, origin);
  }

  if (action === "resend_code") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return json({ result: "no_email" }, 200, origin);
    // Reuse an existing code for this email, else make a new standalone one.
    const { data: existing } = await admin.from("access_codes").select("code").ilike("email", email).limit(1);
    let code = existing && existing.length ? existing[0].code : "";
    if (!code) {
      for (let i = 0; i < 6; i++) {
        code = genCode();
        const { error } = await admin.from("access_codes").insert({ code, email, stripe_session_id: "MANUAL-" + Date.now(), status: "active" });
        if (!error) break; if (error.code !== "23505") return json({ result: "error" }, 200, origin);
      }
    }
    await emailCode(email, code);
    return json({ result: "ok", code: pretty(code) }, 200, origin);
  }

  return json({ error: "unknown_action" }, 400, origin);
});
