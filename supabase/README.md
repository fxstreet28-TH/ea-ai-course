# Supabase — EA / AI course

Project: `ea-ai-course` (ap-southeast-1) — แยกจากฐาน AURUM Live (`hknvooaqgpufrbdxtzxf`) ห้ามรันไฟล์เหล่านี้ที่นั่น

## ติดตั้งครั้งแรก
1. Supabase → SQL Editor → วางเนื้อหา `migrations/0001_profiles.sql` → Run
2. ใส่ Project URL + anon/publishable key ใน `assets/config.js`

## เปิดสิทธิ์เรียนให้ลูกค้าหลังจ่ายเงิน (SQL Editor)
```sql
update public.profiles set has_access = true, access_granted_at = now() where email = 'ลูกค้า@example.com';
```
ลูกค้ากด "ตรวจสอบสถานะอีกครั้ง" ในหน้า `/learn.html` หรือรีเฟรช ก็จะเห็นปุ่มเข้าเรียน

ปิดสิทธิ์: `update public.profiles set has_access = false, access_granted_at = null where email = '...';`
ดูรายชื่อที่ยังไม่มีสิทธิ์: `select email, full_name, created_at from public.profiles where not has_access order by created_at desc;`

## Email templates (ภาษาไทย)
`email-templates/*.html` → Authentication → Email Templates (วางใน "Message body")

| ไฟล์ | Template | Subject แนะนำ |
|---|---|---|
| `confirm-signup.html` | Confirm signup | ยืนยันอีเมลของคุณ — EA / AI |
| `reset-password.html` | Reset Password | ตั้งรหัสผ่านใหม่ — EA / AI |
| `magic-link.html` | Magic Link | ลิงก์เข้าสู่ระบบ — EA / AI |

Template ใช้ลิงก์แบบ `token_hash` (`{{ .SiteURL }}/learn.html?token_hash=...&type=email`) ซึ่งกดจากอุปกรณ์/เบราว์เซอร์ไหนก็ได้ —
ต่างจากลิงก์ default (`{{ .ConfirmationURL }}` + PKCE) ที่ต้องเปิดในเบราว์เซอร์เดียวกับที่สมัคร
`{{ .SiteURL }}` = ค่า Site URL ใน Authentication → URL Configuration (ต้องเป็น `https://ea-ai-course.vercel.app`)
