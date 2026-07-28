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
    return env.ASSETS.fetch(req);
  },
};
