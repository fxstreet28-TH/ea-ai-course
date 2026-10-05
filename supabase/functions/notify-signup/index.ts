// LongLearnDo — notify-signup
// Called (fire-and-forget) by the handle_new_user DB trigger on auth.users insert.
// Emails the admin (porforex599@gmail.com) that a new user has registered.
// verify_jwt = false: the DB trigger calls this server-side with no JWT.
// Anti-abuse: only sends if the posted email actually exists in profiles.
// Secrets reused from the project: RESEND_API_KEY, EMAIL_FROM.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const NOTIFY_TO = "porforex599@gmail.com";
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const email = String(body.email || "").trim();
  if (!email) return json({ skip: "no_email" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Verify this is a real registered user before emailing (stops spoofed posts).
  const { data: prof } = await admin.from("profiles")
    .select("id,email,full_name,created_at").ilike("email", email).limit(1);
  if (!prof || prof.length === 0) return json({ skip: "no_profile" });
  const p = prof[0];

  const KEY = Deno.env.get("RESEND_API_KEY");
  const FROM = Deno.env.get("EMAIL_FROM") || "LongLearnDo Academy <noreply@longlearndo.com>";
  if (!KEY) return json({ skip: "no_resend_key" });

  // Total registered users, for quick context in the email.
  const { count } = await admin.from("profiles").select("id", { count: "exact", head: true });

  const name = (p.full_name || body.full_name || "").trim() || "—";
  const when = new Date(p.created_at || Date.now())
    .toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });

  const html =
    `<div style="font-family:Arial,sans-serif;background:#050610;padding:32px;color:#f3f4ff">` +
    `<div style="max-width:520px;margin:0 auto;background:#101125;border:1px solid #282b49;border-radius:16px;padding:32px">` +
    `<h1 style="color:#61e9ff;font-size:22px;margin:0 0 8px">🎉 มีผู้สมัครใหม่ — LongLearnDo Academy</h1>` +
    `<p style="color:#a3a7c3;line-height:1.8;margin:0 0 20px">มีคนสมัครบัญชีใหม่บน longlearndo.com</p>` +
    `<table style="width:100%;border-collapse:collapse;font-size:14px;color:#f3f4ff">` +
    `<tr><td style="padding:8px 0;color:#a3a7c3;width:120px">อีเมล</td><td style="padding:8px 0;font-weight:700">${esc(p.email || email)}</td></tr>` +
    `<tr><td style="padding:8px 0;color:#a3a7c3">ชื่อ</td><td style="padding:8px 0">${esc(name)}</td></tr>` +
    `<tr><td style="padding:8px 0;color:#a3a7c3">เวลาสมัคร</td><td style="padding:8px 0">${esc(when)}</td></tr>` +
    `<tr><td style="padding:8px 0;color:#a3a7c3">ผู้สมัครรวม</td><td style="padding:8px 0;color:#7ee0a8;font-weight:700">${count ?? "—"} คน</td></tr>` +
    `</table>` +
    `<a href="https://admin.longlearndo.com/admin.html" style="display:block;text-align:center;background:#61e9ff;color:#05202a;text-decoration:none;font-weight:700;padding:14px;border-radius:10px;margin:22px 0 0">เปิด Admin Console →</a>` +
    `</div></div>`;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM, to: [NOTIFY_TO],
      subject: `🎉 สมัครใหม่: ${p.email || email} — LongLearnDo`,
      html,
    }),
  });
  if (!r.ok) return json({ error: "resend_failed", status: r.status, detail: await r.text() }, 200);
  return json({ ok: true });
});

function esc(s: string): string {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
