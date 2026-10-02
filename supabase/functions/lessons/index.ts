// LongLearnDo — student lesson feed. verify_jwt = true.
// Returns published lessons with short-lived signed playback URLs,
// but ONLY to users whose profile has_access = true. Video paths in the
// private 'lessons' bucket are never exposed — only time-limited URLs.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://longlearndo.com", "https://www.longlearndo.com",
  "https://ea-ai-course.vercel.app", "http://localhost:8080", "http://127.0.0.1:8080",
];
function isAllowed(o: string) { return ALLOWED_ORIGINS.includes(o) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(o) || /^https:\/\/([a-z0-9-]+\.)?longlearndo\.com$/.test(o); }
function cors(o: string) {
  return {
    "Access-Control-Allow-Origin": isAllowed(o) ? o : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
  };
}
const json = (b: unknown, s: number, o: string) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors(o) } });

const PLAYBACK_TTL = 60 * 60 * 6; // 6 hours

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  // Identify the caller.
  const authHeader = req.headers.get("Authorization") || "";
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } });
  const { data: ud, error: ue } = await supa.auth.getUser();
  if (ue || !ud?.user) return json({ error: "unauthorized" }, 401, origin);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } });

  // Gate on paid access.
  const { data: prof } = await admin.from("profiles").select("has_access").eq("id", ud.user.id).single();
  if (!prof || !prof.has_access) return json({ error: "no_access", lessons: [] }, 403, origin);

  // Published lessons, ordered.
  const { data: rows } = await admin.from("lessons")
    .select("id,position,title,title_en,description,storage_path,external_url,poster_url,kind,content,is_intro")
    .eq("is_published", true)
    .order("position", { ascending: true }).order("created_at", { ascending: true });

  const { data: atts } = await admin.from("lesson_attachments")
    .select("*").order("position", { ascending: true }).order("created_at", { ascending: true });

  const lessons: any[] = [];
  for (const l of rows || []) {
    let url = l.external_url || null;
    if (!url && l.storage_path) {
      const s = await admin.storage.from("lessons").createSignedUrl(l.storage_path, PLAYBACK_TTL);
      url = s.data?.signedUrl || null;
    }
    const myAtts: any[] = [];
    for (const a of (atts || []).filter((x: any) => x.lesson_id === l.id)) {
      const sa = await admin.storage.from("attachments").createSignedUrl(a.storage_path, PLAYBACK_TTL);
      myAtts.push({ title: a.title, mime: a.mime, size_bytes: a.size_bytes, url: sa.data?.signedUrl || null });
    }
    lessons.push({
      id: l.id, position: l.position, title: l.title,
      title_en: l.title_en, description: l.description,
      kind: l.kind || "video", content: l.content || null, is_intro: !!l.is_intro,
      poster_url: l.poster_url, url, attachments: myAtts,
    });
  }

  return json({ lessons }, 200, origin);
});
