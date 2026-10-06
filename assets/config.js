// EA / AI — public client config.
// ใส่ค่าจาก Supabase → Project Settings → API (Project URL + anon / publishable key)
// anon/publishable key ใส่ใน repo ได้ (ป้องกันด้วย RLS) — ห้ามใส่ secret key (sb_secret_… หรือ JWT role แอดมิน) เด็ดขาด
window.EA_CONFIG = {
  SUPABASE_URL: "https://ttzmnrrsueuqpvrgjyat.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_siffz1XzUELrjxTBZYd83g_f2gRuO7d",
  SITE_URL: "https://ea-ai-course.vercel.app",
  // Cloudflare Turnstile CAPTCHA (bot protection on login/signup/reset).
  // Leave empty = off. Paste the Turnstile SITE key here to turn it on,
  // then enable CAPTCHA in Supabase → Authentication → Attack Protection
  // with the matching Turnstile SECRET key.
  TURNSTILE_SITE_KEY: "",
};
