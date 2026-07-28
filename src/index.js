/**
 * VIOLZ Worker — static assets + gallery admin API
 *
 * Bindings (wrangler.toml / dashboard):
 *   ASSETS          : static assets (public/)
 *   GALLERY_KV      : KV namespace  — posts metadata + image blobs
 *   ADMIN_PASSWORD  : secret        — admin login password
 *
 * API:
 *   GET    /api/posts        public   → { posts:[{id,title,body,images[],created}] }
 *   GET    /api/img/<key>    public   → image bytes
 *   POST   /api/login        public   → { token }   (body: {password})
 *   GET    /api/whoami       auth     → { ok }
 *   POST   /api/posts        auth     → { ok, id }  (body: {title, body, images:[dataURL]})
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
    for (const dataUrl of (Array.isArray(images) ? images : []).slice(0, 12)) {
      const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/s.exec(dataUrl || "");
      if (!m) continue;
      const bin = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
      if (bin.byteLength > 8 * 1024 * 1024) continue; // 8MB safety cap per image
      const key = crypto.randomUUID();
      await kv.put("img:" + key, bin.buffer, { metadata: { ct: m[1] } });
      imgKeys.push(key);
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

  const del = /^\/api\/posts\/([\w-]+)$/.exec(p);
  if (del && req.method === "DELETE") {
    const posts = JSON.parse((await kv.get("posts")) || "[]");
    const idx = posts.findIndex(x => x.id === del[1]);
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
    const redirect = langRedirect(req, url);
    if (redirect) return redirect;
    return env.ASSETS.fetch(req);
  },
};
