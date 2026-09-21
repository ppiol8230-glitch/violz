/**
 * VIOLZ Worker — static assets + gallery admin API
 *
 * Bindings (wrangler.toml / dashboard):
 *   ASSETS          : static assets (public/)
 *   GALLERY_KV      : KV namespace  — posts metadata + image blobs
 *   ADMIN_PASSWORD  : secret        — admin login password
 *   CONTACT_EMAIL   : Email Sending binding
 *   CONTACT_TO      : secret        — private contact recipient
 *
 * API:
 *   GET    /api/posts        public   → { posts:[{id,title,body,images[],created}] }
 *   GET    /api/img/<key>    public   → image bytes
 *   POST   /api/contact      public   → send a workshop enquiry
 *   POST   /api/login        public   → { token }   (body: {password})
 *   GET    /api/whoami       auth     → { ok }
 *   POST   /api/posts        auth     → { ok, id }  (body: {title, body, images:[dataURL]})
 *   PATCH  /api/posts/<id>   auth     → { ok }      (edit text and image order)
 *   DELETE /api/posts/<id>   auth     → { ok }
 */

const enc = new TextEncoder();

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function makeToken(secret) {
  const exp = Date.now() + 7 * 86400 * 1000; // 7 days
  return exp + "." + (await hmacHex(secret, "violz-admin." + exp));
}

async function checkToken(secret, token) {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Date.now() > +exp) return false;
  return sig === (await hmacHex(secret, "violz-admin." + exp));
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function cleanLine(value, max) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function contactRateLimited(req, kv) {
  if (!kv) return false;
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  const hash = await crypto.subtle.digest("SHA-256", enc.encode("violz-contact:" + ip));
  const key = "contact-rate:" + [...new Uint8Array(hash)]
    .slice(0, 12)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  const count = Number((await kv.get(key)) || "0");
  if (count >= 5) return true;
  await kv.put(key, String(count + 1), { expirationTtl: 3600 });
  return false;
}

async function sendContact(req, env, kv) {
  const origin = req.headers.get("origin");
  if (origin) {
    let host = "";
    try { host = new URL(origin).hostname; } catch (_) { return json({ error: "invalid_origin" }, 403); }
    if (host !== "violz.org" && host !== "www.violz.org" && host !== "localhost" && host !== "127.0.0.1")
      return json({ error: "invalid_origin" }, 403);
  }

  const length = Number(req.headers.get("content-length") || "0");
  if (length > 32 * 1024) return json({ error: "too_large" }, 413);

  let data;
  try { data = await req.json(); } catch (_) { return json({ error: "invalid_request" }, 400); }

  // Hidden field: bots usually fill it, people never see it.
  if (cleanLine(data.company, 100)) return json({ ok: true });

  const name = cleanLine(data.name, 80);
  const email = cleanLine(data.email, 254).toLowerCase();
  const phone = cleanLine(data.phone, 50);
  const topic = cleanLine(data.topic, 100);
  const message = String(data.message || "").trim().slice(0, 5000);
  const language = ["ko", "en", "zh"].includes(data.language) ? data.language : "ko";

  if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return json({ error: "invalid_fields" }, 400);
  if (await contactRateLimited(req, kv)) return json({ error: "rate_limited" }, 429);
  if (!env.CONTACT_EMAIL || !env.CONTACT_TO)
    return json({ error: "mail_unavailable" }, 503);

  const sentAt = new Date().toISOString();
  const subject = `[VIOLZ 웹사이트 문의] ${topic || "일반 문의"} — ${name}`;
  const text = [
    "VIOLZ 웹사이트에서 새 문의가 도착했습니다.",
    "이 메일에 답장하면 문의자의 이메일로 바로 전송됩니다.",
    "",
    `이름: ${name}`,
    `이메일: ${email}`,
    `전화번호: ${phone || "미입력"}`,
    `문의 유형: ${topic || "일반 문의"}`,
    `페이지 언어: ${language}`,
    `접수 시각: ${sentAt}`,
    "",
    "문의 내용",
    message,
  ].join("\n");
  const html = `
    <div style="font-family:Arial,'Noto Sans KR',sans-serif;color:#29241e;line-height:1.7;max-width:680px;margin:auto">
      <p style="font-size:12px;letter-spacing:.22em;color:#9c6a38">VIOLZ WEBSITE ENQUIRY</p>
      <h1 style="font-family:Georgia,serif;font-size:26px;font-weight:normal">새 문의가 도착했습니다</h1>
      <p style="color:#756d62">이 메일에 답장하면 문의자의 이메일로 바로 전송됩니다.</p>
      <table style="width:100%;border-collapse:collapse;margin:28px 0">
        <tr><td style="padding:10px 0;border-top:1px solid #e9e3d8;color:#9c6a38;width:120px">이름</td><td style="padding:10px 0;border-top:1px solid #e9e3d8">${escapeHtml(name)}</td></tr>
        <tr><td style="padding:10px 0;border-top:1px solid #e9e3d8;color:#9c6a38">이메일</td><td style="padding:10px 0;border-top:1px solid #e9e3d8">${escapeHtml(email)}</td></tr>
        <tr><td style="padding:10px 0;border-top:1px solid #e9e3d8;color:#9c6a38">전화번호</td><td style="padding:10px 0;border-top:1px solid #e9e3d8">${escapeHtml(phone || "미입력")}</td></tr>
        <tr><td style="padding:10px 0;border-top:1px solid #e9e3d8;color:#9c6a38">문의 유형</td><td style="padding:10px 0;border-top:1px solid #e9e3d8">${escapeHtml(topic || "일반 문의")}</td></tr>
        <tr><td style="padding:10px 0;border-top:1px solid #e9e3d8;color:#9c6a38">페이지 언어</td><td style="padding:10px 0;border-top:1px solid #e9e3d8">${escapeHtml(language)}</td></tr>
      </table>
      <div style="padding:22px;background:#faf8f4;border-left:2px solid #c3a06a;white-space:pre-wrap">${escapeHtml(message)}</div>
      <p style="margin-top:24px;font-size:12px;color:#857c6f">접수 시각: ${escapeHtml(sentAt)}</p>
    </div>`;

  await env.CONTACT_EMAIL.send({
    from: { email: "contact@violz.org", name: "VIOLZ Website" },
    to: env.CONTACT_TO,
    replyTo: email,
    subject,
    text,
    html,
  });
  return json({ ok: true });
}

async function storeGalleryImage(kv, item) {
  const dataUrl = typeof item === "string" ? item : item && item.dataUrl;
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/s.exec(dataUrl || "");
  if (!m) return null;
  const bin = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
  if (bin.byteLength > 8 * 1024 * 1024) return null;
  const key = crypto.randomUUID();
  await kv.put("img:" + key, bin.buffer, { metadata: { ct: m[1] } });
  return key;
}

async function api(req, env, url) {
  const kv = env.GALLERY_KV;
  const secret = env.ADMIN_PASSWORD;
  const p = url.pathname;

  /* ---- public ---- */
  if (p === "/api/posts" && req.method === "GET") {
    if (!kv) return json({ posts: [] });
    const posts = JSON.parse((await kv.get("posts")) || "[]");
    return json({ posts });
  }

  if (p.startsWith("/api/img/") && req.method === "GET") {
    if (!kv) return new Response("no store", { status: 404 });
    const key = "img:" + p.slice("/api/img/".length);
    const { value, metadata } = await kv.getWithMetadata(key, { type: "arrayBuffer" });
    if (!value) return new Response("not found", { status: 404 });
    return new Response(value, {
      headers: {
        "content-type": (metadata && metadata.ct) || "image/jpeg",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  }

  if (p === "/api/geo" && req.method === "GET") {
    return json({
      country: detectCountry(req),
      cfCountry: (req.cf && req.cf.country) || null,
      header: req.headers.get("cf-ipcountry"),
      lang: pickLang(req),
    });
  }

  if (p === "/api/contact" && req.method === "POST") {
    return sendContact(req, env, kv);
  }

  if (p === "/api/login" && req.method === "POST") {
    if (!secret) return json({ error: "ADMIN_PASSWORD 시크릿이 아직 설정되지 않았습니다. Cloudflare 대시보드에서 설정해 주세요." }, 503);
    const { password } = await req.json();
    if (typeof password !== "string" || password !== secret)
      return json({ error: "비밀번호가 올바르지 않습니다." }, 401);
    return json({ token: await makeToken(secret) });
  }

  /* ---- auth required ---- */
  if (!secret || !kv)
    return json({ error: "저장소(KV) 또는 ADMIN_PASSWORD가 아직 연결되지 않았습니다. wrangler.toml의 KV 설정과 대시보드 시크릿을 확인해 주세요." }, 503);

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!(await checkToken(secret, token))) return json({ error: "로그인이 필요합니다." }, 401);

  if (p === "/api/whoami" && req.method === "GET") return json({ ok: true });

  if (p === "/api/posts" && req.method === "POST") {
    const { title, body, images } = await req.json();
    const id = crypto.randomUUID();
    const imgKeys = [];
    for (const item of (Array.isArray(images) ? images : []).slice(0, 12)) {
      const key = await storeGalleryImage(kv, item);
      if (key) imgKeys.push(key);
    }
    if (!imgKeys.length && !(body || "").trim() && !(title || "").trim())
      return json({ error: "내용이 비어 있습니다." }, 400);
    const posts = JSON.parse((await kv.get("posts")) || "[]");
    posts.unshift({
      id,
      title: String(title || "").slice(0, 200),
      body: String(body || "").slice(0, 8000),
      images: imgKeys,
      created: new Date().toISOString(),
    });
    await kv.put("posts", JSON.stringify(posts));
    return json({ ok: true, id });
  }

  const postMatch = /^\/api\/posts\/([\w-]+)$/.exec(p);
  if (postMatch && req.method === "PATCH") {
    const posts = JSON.parse((await kv.get("posts")) || "[]");
    const idx = posts.findIndex(x => x.id === postMatch[1]);
    if (idx < 0) return json({ error: "게시물을 찾을 수 없습니다." }, 404);

    const { title, body, images } = await req.json();
    const oldKeys = Array.isArray(posts[idx].images) ? posts[idx].images : [];
    const allowed = new Set(oldKeys);
    const imgKeys = [];

    for (const item of (Array.isArray(images) ? images : []).slice(0, 12)) {
      const existingKey = item && typeof item === "object" ? String(item.key || "") : "";
      if (existingKey && allowed.has(existingKey) && !imgKeys.includes(existingKey)) {
        imgKeys.push(existingKey);
        continue;
      }
      const newKey = await storeGalleryImage(kv, item);
      if (newKey) imgKeys.push(newKey);
    }

    const nextTitle = String(title || "").trim().slice(0, 200);
    const nextBody = String(body || "").trim().slice(0, 8000);
    if (!imgKeys.length && !nextBody && !nextTitle)
      return json({ error: "내용이 비어 있습니다." }, 400);

    posts[idx] = {
      ...posts[idx],
      title: nextTitle,
      body: nextBody,
      images: imgKeys,
      updated: new Date().toISOString(),
    };
    await kv.put("posts", JSON.stringify(posts));

    for (const key of oldKeys) {
      if (!imgKeys.includes(key)) await kv.delete("img:" + key);
    }
    return json({ ok: true });
  }

  if (postMatch && req.method === "DELETE") {
    const posts = JSON.parse((await kv.get("posts")) || "[]");
    const idx = posts.findIndex(x => x.id === postMatch[1]);
    if (idx < 0) return json({ error: "게시물을 찾을 수 없습니다." }, 404);
    for (const k of posts[idx].images || []) await kv.delete("img:" + k);
    posts.splice(idx, 1);
    await kv.put("posts", JSON.stringify(posts));
    return json({ ok: true });
  }

  return json({ error: "not found" }, 404);
}

/* ─────────────── language routing ───────────────
   ko = /  ·  en = /en/  ·  zh = /zh/
   First visit: decide by visitor country (KR→ko, Chinese-speaking→zh, else→en).
   Once the visitor picks a language in the header, the violz_lang cookie wins. */

const PAGES = new Set(["", "maker", "special", "instruments", "repair", "gallery", "contact"]);
const ZH_COUNTRIES = new Set(["CN", "HK", "MO", "TW", "SG"]);

/* 검색·SNS 크롤러는 국가 분기에서 제외한다.
   Googlebot은 대부분 미국에서 크롤링하므로 리다이렉트를 걸면 한국어·중문판이
   수집되지 않는다. 크롤러에게는 요청한 URL을 그대로 주고, 언어판 관계는
   각 페이지의 hreflang으로 알린다. */
const CRAWLER = /(googlebot|google-inspectiontool|bingbot|yeti|daum|duckduckbot|baiduspider|yandex|slurp|applebot|petalbot|bytespider|facebookexternalhit|twitterbot|kakaotalk|telegrambot|whatsapp|linkedinbot|discordbot|gptbot|oai-searchbot|perplexitybot|claudebot|ccbot|amazonbot)/i;

function isCrawler(req) {
  return CRAWLER.test(req.headers.get("user-agent") || "");
}

function detectCountry(req) {
  return req.headers.get("cf-ipcountry") || (req.cf && req.cf.country) || "";
}

function pickLang(req) {
  const m = /(?:^|;\s*)violz_lang=(ko|en|zh)/.exec(req.headers.get("cookie") || "");
  if (m) return m[1];
  const c = detectCountry(req);
  if (!c || c === "KR" || c === "T1" || c === "XX") return "ko";
  if (ZH_COUNTRIES.has(c)) return "zh";
  return "en";
}

function langRedirect(req, url) {
  const p = url.pathname;
  if (p.startsWith("/api/") || p.startsWith("/admin")) return null;
  if (p === "/en" || p === "/zh" || p.startsWith("/en/") || p.startsWith("/zh/")) return null;
  if (!(req.headers.get("accept") || "").includes("text/html")) return null;
  if (isCrawler(req)) return null;

  let slug = p.replace(/^\/+|\/+$/g, "");
  if (slug.endsWith(".html")) slug = slug.slice(0, -5);
  if (slug === "index") slug = "";
  if (!PAGES.has(slug)) return null;

  const lang = pickLang(req);
  if (lang === "ko") return null;

  return new Response(null, {
    status: 302,
    headers: {
      location: url.origin + "/" + lang + "/" + slug + url.search,
      "cache-control": "no-store",
      vary: "Cookie",
    },
  });
}

const ADMIN_ALIAS = /^\/(?:ko\/|en\/|zh\/)?admin(?:\.html)?\/?$/i;

async function adminPage(req, env, url) {
  if (!ADMIN_ALIAS.test(url.pathname)) return null;

  if (url.pathname !== "/admin") {
    const target = new URL("/admin", url.origin);
    target.search = url.search;
    return new Response(null, {
      status: 308,
      headers: {
        location: target.toString(),
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  }

  const response = await env.ASSETS.fetch(req);
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-robots-tag", "noindex, nofollow");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await api(req, env, url);
      } catch (e) {
        return json({ error: "서버 오류: " + (e && e.message ? e.message : String(e)) }, 500);
      }
    }
    const admin = await adminPage(req, env, url);
    if (admin) return admin;
    const redirect = langRedirect(req, url);
    if (redirect) return redirect;
    return env.ASSETS.fetch(req);
  },
};
