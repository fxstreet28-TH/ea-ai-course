// LongLearnDo — Stripe webhook: on paid checkout, grant course access.
// verify_jwt = false (Stripe calls this without a Supabase JWT; auth = Stripe signature).
// Secrets required (set in Supabase dashboard): STRIPE_WEBHOOK_SECRET
// Auto-injected by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
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
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // 5-min tolerance
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = hex(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`)));
  return v1.some((s) => safeEq(mac, s));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return new Response("not_configured", { status: 500 });

  const sig = req.headers.get("stripe-signature") || "";
  const raw = await req.text();
  if (!(await verifyStripe(secret, raw, sig))) {
    return new Response("bad_signature", { status: 400 });
  }

  let event: any;
  try { event = JSON.parse(raw); } catch (_) { return new Response("bad_json", { status: 400 }); }

  // "completed" fires for card + synchronous methods; "async_payment_succeeded"
  // fires when a delayed method like PromptPay QR settles.
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const s = event.data?.object || {};
    const paid = s.payment_status === "paid" || s.status === "complete";
    const userId = s.client_reference_id || s.metadata?.user_id || null;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Log the order (idempotent on stripe_session_id).
    await admin.from("course_orders").upsert({
      user_id: userId,
      email: s.customer_details?.email || s.customer_email || null,
      stripe_session_id: s.id,
      stripe_payment_intent: s.payment_intent || null,
      amount_total: s.amount_total ?? null,
      currency: s.currency || "thb",
      status: paid ? "paid" : "pending",
      updated_at: new Date().toISOString(),
    }, { onConflict: "stripe_session_id" });

    // Grant access.
    if (paid && userId) {
      await admin.from("profiles")
        .update({ has_access: true, access_granted_at: new Date().toISOString() })
        .eq("id", userId);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
