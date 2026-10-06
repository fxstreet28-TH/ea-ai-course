// LongLearnDo — admin-engagement
// Admin-only (caller email must be in ADMIN_EMAILS). verify_jwt = true.
// Returns traffic-source aggregates from public.page_visits.
// Auto-injected: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY. Secret: ADMIN_EMAILS.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://longlearndo.com", "https://www.longlearndo.com",
  "https://ea-ai-course.vercel.app", "http://localhost:8080", "http://127.0.0.1:8080",
];
function isAllowed(o: string) {
  return ALLOWED_ORIGINS.includes(o) ||
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(o) ||
    /^https:\/\/([a-z0-9-]+\.)?longlearndo\.com$/.test(o);
}
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

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  const authHeader = req.headers.get("Authorization") || "";
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } });
  const { data: ud, error: ue } = await supa.auth.getUser();
  if (ue || !ud?.user) return json({ error: "unauthorized" }, 401, origin);
  if (!adminEmails().includes((ud.user.email || "").toLowerCase()))
    return json({ error: "forbidden" }, 403, origin);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } });

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const days = Math.min(Math.max(parseInt(String(body.days || "30"), 10) || 30, 1), 365);
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { count: allTime } = await admin.from("page_visits")
    .select("id", { count: "exact", head: true });

  const { data: visits } = await admin.from("page_visits")
    .select("source,device,os,country,created_at").gte("created_at", since).limit(100000);

  const rows = visits || [];
  const bySrc: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  const byDev: Record<string, number> = {};
  const byCountry: Record<string, number> = {};
  // "Direct" slice broken down further, since direct is usually hidden social/app traffic.
  const directDev: Record<string, number> = {};
  const directCountry: Record<string, number> = {};
  let directTotal = 0;

  for (const v of rows) {
    const s = (v.source || "direct").toLowerCase();
    bySrc[s] = (bySrc[s] || 0) + 1;

    const d = String(v.created_at || "").slice(0, 10);
    if (d) byDay[d] = (byDay[d] || 0) + 1;

    const dev = (v.device || "unknown").toLowerCase();
    byDev[dev] = (byDev[dev] || 0) + 1;

    const ctry = v.country || "unknown";
    byCountry[ctry] = (byCountry[ctry] || 0) + 1;

    if (s === "direct") {
      directTotal++;
      directDev[dev] = (directDev[dev] || 0) + 1;
      directCountry[ctry] = (directCountry[ctry] || 0) + 1;
    }
  }

  const total = rows.length;
  const pct = (n: number, base: number) => (base ? Math.round((n / base) * 100) : 0);
  const toList = (obj: Record<string, number>, base: number, key: string) =>
    Object.keys(obj).map((k) => ({ [key]: k, count: obj[k], pct: pct(obj[k], base) }))
      .sort((a: any, b: any) => b.count - a.count);

  const sources   = toList(bySrc, total, "source");
  const devices   = toList(byDev, total, "device");
  const countries = toList(byCountry, total, "country");
  const daily = Object.keys(byDay).sort().map((k) => ({ day: k, count: byDay[k] }));

  const direct = {
    total: directTotal,
    devices:   toList(directDev, directTotal, "device"),
    countries: toList(directCountry, directTotal, "country"),
  };

  return json({ days, total, all_time: allTime || 0, sources, devices, countries, direct, daily }, 200, origin);
});
