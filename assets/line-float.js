// LINE floating chat button — longlearndo.com
// สร้างปุ่มแชท LINE ลอยมุมขวาล่าง อัตโนมัติทุกหน้าที่โหลดไฟล์นี้
// แก้ลิงก์ได้ที่ assets/config.js → LINE_URL (ถ้าไม่มี config จะใช้ค่า fallback ด้านล่าง)
(function () {
  "use strict";

  // อ่านลิงก์จาก config.js; ใช้ fallback เฉพาะเมื่อ "ไม่ได้ตั้งค่า" (undefined) เท่านั้น
  // ถ้าตั้ง LINE_URL เป็นค่าว่าง ("") แปลว่าตั้งใจปิดปุ่ม — ต้องเคารพค่านั้น
  var cfg = window.EA_CONFIG || {};
  var LINE_URL =
    cfg.LINE_URL !== undefined ? cfg.LINE_URL : "https://lin.ee/w4GwfxT";

  // เว้นว่าง = ไม่ต้องแสดงปุ่ม
  if (!LINE_URL) return;

  function mount() {
    if (document.getElementById("line-float-btn")) return; // กันซ้ำ

    // ----- CSS -----
    var style = document.createElement("style");
    style.id = "line-float-style";
    style.textContent =
      "#line-float-btn{position:fixed;right:20px;bottom:20px;z-index:2147483000;" +
      "display:flex;align-items:center;gap:8px;height:56px;padding:0 18px 0 13px;" +
      "background:#06C755;border-radius:28px;box-shadow:0 6px 18px rgba(6,199,85,.45);" +
      "text-decoration:none;color:#fff;font-family:inherit;font-size:15px;font-weight:600;" +
      "line-height:1;transition:transform .2s ease,box-shadow .2s ease;" +
      "-webkit-tap-highlight-color:transparent;}" +
      "#line-float-btn:hover{transform:translateY(-3px);box-shadow:0 10px 24px rgba(6,199,85,.6);}" +
      "#line-float-btn svg{flex:0 0 auto;display:block;}" +
      "#line-float-btn .line-float-text{white-space:nowrap;}" +
      "@media (max-width:600px){#line-float-btn{right:16px;bottom:92px;width:56px;" +
      "padding:0;justify-content:center;}#line-float-btn .line-float-text{display:none;}}" +
      "@media print{#line-float-btn{display:none !important;}}";
    document.head.appendChild(style);

    // ----- ปุ่ม -----
    var a = document.createElement("a");
    a.id = "line-float-btn";
    a.href = LINE_URL;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute("aria-label", "ติดต่อผ่าน LINE");
    a.innerHTML =
      '<svg viewBox="0 0 24 24" width="30" height="30" fill="#fff" aria-hidden="true">' +
      '<path d="M12 2C6.48 2 2 5.74 2 10.35c0 4.12 3.56 7.57 8.37 8.22.33.07.77.22.88.5.1.26.07.66.03.92l-.14.85c-.04.26-.2 1.02.9.56 1.1-.46 5.9-3.47 8.05-5.95C21.6 13.78 22 12.12 22 10.35 22 5.74 17.52 2 12 2zM8.09 13.3H6.1a.53.53 0 0 1-.53-.53V8.8a.53.53 0 0 1 1.06 0v3.44h1.46a.53.53 0 0 1 0 1.06zm2.08-.53a.53.53 0 0 1-1.06 0V8.8a.53.53 0 0 1 1.06 0v3.97zm4.78 0a.53.53 0 0 1-.36.5.56.56 0 0 1-.17.03.52.52 0 0 1-.43-.21l-2.03-2.77v2.45a.53.53 0 0 1-1.06 0V8.8a.53.53 0 0 1 .36-.5.53.53 0 0 1 .6.18l2.03 2.77V8.8a.53.53 0 0 1 1.06 0v3.97zm3.3-2.5a.53.53 0 0 1 0 1.06h-1.46v.93h1.46a.53.53 0 0 1 0 1.07h-1.99a.53.53 0 0 1-.53-.53V8.8a.53.53 0 0 1 .53-.53h1.99a.53.53 0 0 1 0 1.06h-1.46v.94h1.46z"/>' +
      "</svg>" +
      '<span class="line-float-text">แชทผ่าน LINE</span>';
    document.body.appendChild(a);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
