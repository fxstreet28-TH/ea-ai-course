// EA / AI — public client config.
// ใส่ค่าจาก Supabase → Project Settings → API (Project URL + anon / publishable key)
// anon/publishable key ใส่ใน repo ได้ (ป้องกันด้วย RLS) — ห้ามใส่ secret key (sb_secret_… หรือ JWT role แอดมิน) เด็ดขาด
window.EA_CONFIG = {
  SUPABASE_URL: "https://<PROJECT_REF>.supabase.co",
  SUPABASE_ANON_KEY: "<ANON_OR_PUBLISHABLE_KEY>",
  SITE_URL: "https://ea-ai-course.vercel.app",
};
