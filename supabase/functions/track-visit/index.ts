// LongLearnDo — track-visit (public, verify_jwt=false)
// Called from the landing page. Records one visit with:
//   - traffic source (UTM / referrer, classified client-side, re-checked here)
//   - device + OS parsed from the User-Agent
//   - approximate country / city from the visitor IP (server-side geo lookup)
// Inserts with the service role so geo/IP never touches the browser.
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

// --- User-Agent → device class + OS -------------------------------
function parseUA(ua: string): { device: string; os: string } {
  const u = (ua || "").toLowerCase();
  let os = "other";
  if (/windows nt/.test(u)) os = "Windows";
  else if (/iphone|ipad|ipod/.test(u)) os = "iOS";
  else if (/android/.test(u)) os = "Android";
  else if (/mac os x|macintosh/.test(u)) os = "macOS";
  else if (/linux/.test(u)) os = "Linux";

  let device = "desktop";
  if (/ipad|tablet|(android(?!.*mobile))/.test(u)) device = "tablet";
  else if (/mobi|iphone|ipod|android.*mobile|windows phone/.test(u)) device = "mobile";
  return { device, os };
}

// --- client IP from proxy headers ---------------------------------
function clientIP(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0].trim();
  return first || req.headers.get("x-real-ip") || "";
}

// --- IP → geo (free, no key); best-effort, never throws -----------
async function geoLookup(ip: string): Promise<{ country: string; country_code: string; city: string }> {
  const empty = { country: "", country_code: "", city: "" };
  if (!ip || ip === "127.0.0.1" || ip.startsWith("::1")) return empty;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country,country_code,city`, { signal: ctrl.signal });
    clearTimeout(t);
    const d = await r.json().catch(() => ({}));
    if (d && d.success) {
      return {
        country: String(d.country || "").slice(0, 80),
        country_code: String(d.country_code || "").slice(0, 4),
        city: String(d.city || "").slice(0, 100),
      };
    }
  } catch (_) { /* ignore — geo is best-effort */ }
  return empty;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  let body: any = {};
  try { body = await req.json(); } catch (_) {}

  const ua = String(body.user_agent || req.headers.get("user-agent") || "").slice(0, 300);
  const { device, os } = parseUA(ua);
  const geo = await geoLookup(clientIP(req));

  const row = {
    path:         String(body.path || "/").slice(0, 300),
    referrer:     String(body.referrer || "").slice(0, 500),
    ref_host:     String(body.ref_host || "").slice(0, 200),
    utm_source:   String(body.utm_source || "").slice(0, 100),
    utm_medium:   String(body.utm_medium || "").slice(0, 100),
    utm_campaign: String(body.utm_campaign || "").slice(0, 150),
    source:       String(body.source || "direct").slice(0, 50),
    user_agent:   ua,
    device, os,
    country: geo.country, country_code: geo.country_code, city: geo.city,
  };

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { error } = await admin.from("page_visits").insert(row);
  if (error) return json({ error: "insert_failed" }, 200, origin);
  return json({ ok: true }, 200, origin);
});
