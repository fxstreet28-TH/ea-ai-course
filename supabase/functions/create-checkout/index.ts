// LongLearnDo — create Stripe Checkout Session for the logged-in user.
// verify_jwt = true (Supabase guarantees a valid user token before this runs).
// Secrets required (set in Supabase dashboard): STRIPE_SECRET_KEY
// Auto-injected by Supabase: SUPABASE_URL, SUPABASE_ANON_KEY
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const COURSE_NAME = "คอร์สเขียน EA ด้วย AI — LongLearnDo Academy";
const AMOUNT_SATANG = 290000; // 2,900.00 THB
const CURRENCY = "thb";

const ALLOWED_ORIGINS = [
  "https://longlearndo.com",
  "https://www.longlearndo.com",
  "https://ea-ai-course.vercel.app",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];
function isAllowed(o: string): boolean {
  return ALLOWED_ORIGINS.includes(o) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(o);
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

  const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
  if (!STRIPE_SECRET_KEY) return json({ error: "stripe_not_configured" }, 500, origin);

  // Identify the caller from their Supabase JWT.
  const authHeader = req.headers.get("Authorization") || "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401, origin);
  const user = userData.user;

  // Already paid? skip payment.
  const { data: prof } = await supabase.from("profiles").select("has_access").eq("id", user.id).single();
  if (prof?.has_access) return json({ already: true }, 200, origin);

  // Where to send the buyer back to.
  let body: { return_origin?: string } = {};
  try { body = await req.json(); } catch (_) { /* ok */ }
  const base = body.return_origin && isAllowed(body.return_origin)
    ? body.return_origin
    : (Deno.env.get("SITE_URL") || "https://longlearndo.com");

  // Build the Stripe Checkout Session (form-encoded REST call, no SDK needed).
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("client_reference_id", user.id);
  if (user.email) form.set("customer_email", user.email);
  form.set("metadata[user_id]", user.id);
  form.set("allow_promotion_codes", "true");
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", CURRENCY);
  form.set("line_items[0][price_data][unit_amount]", String(AMOUNT_SATANG));
  form.set("line_items[0][price_data][product_data][name]", COURSE_NAME);
  form.set("success_url", `${base}/learn.html?paid=1`);
  form.set("cancel_url", `${base}/#enroll`);

  const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const session = await resp.json();
  if (!resp.ok) {
    return json({ error: "stripe_error", detail: session?.error?.message || "unknown" }, 502, origin);
  }
  return json({ url: session.url }, 200, origin);
});
