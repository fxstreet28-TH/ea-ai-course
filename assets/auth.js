/* EA / AI — shared auth module (Supabase Auth, supabase-js v2 UMD).
   Requires: assets/config.js + https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js
   Exposes window.EAAuth. Session storage is fully handled by supabase-js — never store tokens yourself. */
(function () {
  'use strict';

  var cfg = window.EA_CONFIG || {};
  var DEFAULT_NEXT = '/learn.html';
  var client = null;

  function isConfigured() {
    var url = cfg.SUPABASE_URL || '';
    var key = cfg.SUPABASE_ANON_KEY || '';
    return /^https:\/\/[^<>]+$/.test(url) && key.length > 20 && key.indexOf('<') === -1;
  }

  // Redirect base: the site we're on (prod, Vercel preview, localhost) — falls back to SITE_URL.
  function siteUrl() {
    if (/^https?:$/.test(location.protocol)) return location.origin;
    return (cfg.SITE_URL || '').replace(/\/+$/, '');
  }

  function getClient() {
    if (client) return client;
    if (!isConfigured()) return null;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') return null;
    client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
    });
    return client;
  }

  function need() {
    var c = getClient();
    if (!c) throw { code: 'not_configured', message: 'not configured' };
    return c;
  }

  // Only allow same-site paths: must start with "/" and never contain "//" or "\".
  function safeNext(next) {
    if (typeof next !== 'string' || !next) return DEFAULT_NEXT;
    if (next.charAt(0) !== '/' || next.indexOf('//') !== -1 || next.indexOf('\\') !== -1) return DEFAULT_NEXT;
    if (/[\u0000-\u001f]/.test(next)) return DEFAULT_NEXT;
    if (/^\/(login|reset)\.html/.test(next)) return DEFAULT_NEXT;
    return next;
  }

  function nextFromUrl() {
    return safeNext(new URLSearchParams(location.search).get('next'));
  }

  function mapAuthError(err) {
    if (!err) return 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';
    var code = String(err.code || err.error_code || err.error || '').toLowerCase();
    var msg = String(err.message || err.error_description || err.msg || (typeof err === 'string' ? err : '')).toLowerCase();
    var has = function (s) { return msg.indexOf(s) !== -1 || code.indexOf(s) !== -1; };

    if (code === 'not_configured') return 'ระบบสมาชิกยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง';
    if (has('invalid login credentials') || has('invalid_credentials')) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    if (has('email not confirmed') || has('email_not_confirmed')) return 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ (เช็คกล่องจดหมาย/สแปม)';
    if (has('user already registered') || has('user_already_exists') || has('email_exists')) return 'อีเมลนี้สมัครไว้แล้ว ลองเข้าสู่ระบบหรือกดลืมรหัสผ่าน';
    if (has('password should be at least') || has('weak_password')) return 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร';
    if (has('same_password') || has('should be different from the old')) return 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม';
    if (has('rate limit') || has('rate_limit') || has('over_email_send_rate_limit') || has('security purposes')) return 'ส่งอีเมลบ่อยเกินไป รอ 1 นาทีแล้วลองใหม่';
    if (has('unable to validate email') || has('email_address_invalid') || has('invalid format') || (has('email address') && has('invalid'))) return 'รูปแบบอีเมลไม่ถูกต้อง';
    if (has('otp_expired') || has('expired') || has('access_denied') || has('invalid or has expired') || has('flow_state') || has('code verifier')) return 'ลิงก์หมดอายุหรือถูกใช้แล้ว กรุณาขอใหม่';
    if (has('provider is not enabled') || has('provider_disabled') || has('unsupported provider')) return 'ยังไม่เปิดใช้การเข้าสู่ระบบด้วยช่องทางนี้ กรุณาใช้อีเมลแทน';
    if (has('signups not allowed') || has('signup_disabled')) return 'ขณะนี้ปิดรับสมัครสมาชิกชั่วคราว';
    if (has('failed to fetch') || has('networkerror') || has('network request failed') || has('load failed')) return 'เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
    if (has('auth session missing') || has('session_not_found')) return 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';
    return 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';
  }

  // Supabase returns link errors in the hash (#error=...) or query (?error=...).
  function getUrlAuthError() {
    var sources = [location.hash.replace(/^#/, ''), location.search.replace(/^\?/, '')];
    for (var i = 0; i < sources.length; i++) {
      var p = new URLSearchParams(sources[i]);
      if (p.get('error') || p.get('error_code')) {
        return { error: p.get('error'), code: p.get('error_code') || p.get('error'), error_description: p.get('error_description') || '' };
      }
    }
    return null;
  }

  function cleanUrl() {
    var p = new URLSearchParams(location.search);
    ['code', 'token_hash', 'type', 'error', 'error_code', 'error_description'].forEach(function (k) { p.delete(k); });
    var q = p.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : ''));
  }

  // Cross-device email links (templates in supabase/email-templates use ?token_hash=...&type=...).
  // PKCE ?code= links are exchanged automatically by detectSessionInUrl.
  async function handleEmailLink() {
    var p = new URLSearchParams(location.search);
    var tokenHash = p.get('token_hash');
    var type = p.get('type');
    if (!tokenHash || !type) return { handled: false };
    var res = await need().auth.verifyOtp({ token_hash: tokenHash, type: type });
    cleanUrl();
    if (res.error) return { handled: true, error: res.error };
    return { handled: true, session: res.data.session, type: type };
  }

  async function getSession() {
    var c = getClient();
    if (!c) return null;
    var res = await c.auth.getSession();
    if (/[?&](code|token_hash)=/.test(location.search)) cleanUrl();
    return (res.data && res.data.session) || null;
  }

  async function getUser() {
    var res = await need().auth.getUser();
    if (res.error) throw res.error;
    return res.data.user;
  }

  // No session → go to login, forwarding any link error so login.html can explain it.
  async function requireAuth(nextPath) {
    var linkErr = getUrlAuthError();
    var session = null;
    try {
      var link = await handleEmailLink();
      if (link.error) linkErr = link.error;
      session = await getSession();
    } catch (e) { session = null; }
    if (session) return session;
    var target = '/login.html?next=' + encodeURIComponent(safeNext(nextPath || location.pathname));
    if (linkErr) {
      target += '#error=' + encodeURIComponent(linkErr.error || 'access_denied') +
        '&error_code=' + encodeURIComponent(linkErr.code || '') +
        '&error_description=' + encodeURIComponent(linkErr.error_description || linkErr.message || '');
    }
    location.replace(target);
    return new Promise(function () {}); // halt callers while navigating
  }

  function redirectUrl(path) { return siteUrl() + path; }

  async function signInWithGoogle(nextPath) {
    var res = await need().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl(safeNext(nextPath || DEFAULT_NEXT)) }
    });
    if (res.error) throw res.error;
    return res.data;
  }

  async function signUpEmail(email, password) {
    var res = await need().auth.signUp({
      email: email,
      password: password,
      options: { emailRedirectTo: redirectUrl(DEFAULT_NEXT) }
    });
    if (res.error) throw res.error;
    // With "Confirm email" on, an existing address returns a user with no identities instead of an error.
    var u = res.data && res.data.user;
    if (u && Array.isArray(u.identities) && u.identities.length === 0) throw { code: 'user_already_exists', message: 'User already registered' };
    return res.data;
  }

  async function signInEmail(email, password) {
    var res = await need().auth.signInWithPassword({ email: email, password: password });
    if (res.error) throw res.error;
    return res.data;
  }

  async function resetPassword(email) {
    var res = await need().auth.resetPasswordForEmail(email, { redirectTo: redirectUrl('/reset.html') });
    if (res.error) throw res.error;
    return res.data;
  }

  async function updatePassword(newPw) {
    var res = await need().auth.updateUser({ password: newPw });
    if (res.error) throw res.error;
    return res.data;
  }

  async function resendConfirmation(email) {
    var res = await need().auth.resend({ type: 'signup', email: email, options: { emailRedirectTo: redirectUrl(DEFAULT_NEXT) } });
    if (res.error) throw res.error;
    return res.data;
  }

  async function signOut() {
    var c = getClient();
    if (c) { try { await c.auth.signOut(); } catch (e) { /* ignore — local session is cleared anyway */ } }
  }

  function onAuthStateChange(cb) {
    var c = getClient();
    if (!c) return function () {};
    var sub = c.auth.onAuthStateChange(function (event, session) { cb(event, session); });
    return function () { sub.data.subscription.unsubscribe(); };
  }

  // Nav on index.html: <a data-auth-nav> "เข้าสู่ระบบ" ↔ "ห้องเรียน →"
  function updateNav(session) {
    var els = document.querySelectorAll('[data-auth-nav]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (session) { el.textContent = 'ห้องเรียน →'; el.setAttribute('href', '/learn.html'); }
      else { el.textContent = 'เข้าสู่ระบบ'; el.setAttribute('href', '/login.html'); }
    }
  }

  function initNav() {
    if (!document.querySelector('[data-auth-nav]')) return;
    try {
      if (!getClient()) return; // not configured / CDN failed → keep static "เข้าสู่ระบบ"
      getSession().then(updateNav).catch(function () {});
      onAuthStateChange(function (_e, s) { updateNav(s); });
    } catch (e) { /* never break the host page */ }
  }

  window.EAAuth = {
    isConfigured: isConfigured,
    getClient: getClient,
    safeNext: safeNext,
    nextFromUrl: nextFromUrl,
    mapAuthError: mapAuthError,
    getUrlAuthError: getUrlAuthError,
    cleanUrl: cleanUrl,
    handleEmailLink: handleEmailLink,
    getSession: getSession,
    getUser: getUser,
    requireAuth: requireAuth,
    signInWithGoogle: signInWithGoogle,
    signUpEmail: signUpEmail,
    signInEmail: signInEmail,
    resetPassword: resetPassword,
    updatePassword: updatePassword,
    resendConfirmation: resendConfirmation,
    signOut: signOut,
    onAuthStateChange: onAuthStateChange,
    updateNav: updateNav
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initNav);
  else initNav();
})();
