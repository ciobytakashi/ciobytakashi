import { jwtVerify, createRemoteJWKSet } from "jose";

const CATEGORIES = ["Beauty & Care", "Home & Living", "Tech & Essentials"];
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const slugify = (s) => String(s || "").toLowerCase().trim()
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const escapeHtml = (s) => String(s || "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));

async function requireAdmin(request, env) {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return false;
  try {
    const team = env.CF_ACCESS_TEAM_DOMAIN;
    const aud = env.CF_ACCESS_AUD;
    if (!team || !aud) return false;
    const JWKS = createRemoteJWKSet(new URL(`${team.replace(/\/$/, "")}/cdn-cgi/access/certs`));
    const { payload } = await jwtVerify(token, JWKS, { audience: aud, issuer: team });
    return String(payload.email || "").toLowerCase() === String(env.ADMIN_EMAIL || "").toLowerCase();
  } catch {
    return false;
  }
}

async function handleApi(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/posts" && request.method === "GET") {
    const category = url.searchParams.get("category");
    let query = "SELECT id, slug, title, excerpt, body, category, image_url, affiliate_url, published_at FROM posts WHERE status='published'";
    const values = [];
    if (category && CATEGORIES.includes(category)) { query += " AND category=?"; values.push(category); }
    query += " ORDER BY published_at DESC LIMIT 100";
    const { results } = await env.DB.prepare(query).bind(...values).all();
    return json({ posts: results });
  }

  if (path.startsWith("/api/admin/")) {
    if (!(await requireAdmin(request, env))) return json({ error: "Unauthorized" }, 401);
  }

  if (path === "/api/admin/posts" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT * FROM posts ORDER BY updated_at DESC LIMIT 200"
    ).all();
    return json({ posts: results });
  }

  if (path === "/api/admin/posts" && request.method === "POST") {
    const data = await request.json();
    const title = String(data.title || "").trim();
    const category = String(data.category || "");
    if (!title || !CATEGORIES.includes(category)) return json({ error: "A title and valid category are required." }, 400);
    const id = crypto.randomUUID();
    const base = slugify(title) || id.slice(0, 8);
    let slug = base;
    const exists = await env.DB.prepare("SELECT id FROM posts WHERE slug=?").bind(slug).first();
    if (exists) slug = `${base}-${id.slice(0, 6)}`;
    const now = new Date().toISOString();
    const status = data.status === "published" ? "published" : "draft";
    await env.DB.prepare(`INSERT INTO posts
      (id, slug, title, excerpt, body, category, image_url, affiliate_url, status, created_at, updated_at, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, slug, title, String(data.excerpt || ""), String(data.body || ""), category,
        String(data.image_url || ""), String(data.affiliate_url || ""), status, now, now,
        status === "published" ? now : null).run();
    return json({ ok: true, id, slug });
  }

  const postMatch = path.match(/^\/api\/admin\/posts\/([a-zA-Z0-9-]+)$/);
  if (postMatch && request.method === "PUT") {
    const data = await request.json();
    const status = data.status === "published" ? "published" : "draft";
    const now = new Date().toISOString();
    await env.DB.prepare(`UPDATE posts SET title=?, excerpt=?, body=?, category=?, image_url=?,
      affiliate_url=?, status=?, updated_at=?, published_at=CASE WHEN ?='published' THEN COALESCE(published_at, ?) ELSE NULL END
      WHERE id=?`)
      .bind(String(data.title || "").trim(), String(data.excerpt || ""), String(data.body || ""),
        String(data.category || ""), String(data.image_url || ""), String(data.affiliate_url || ""),
        status, now, status, now, postMatch[1]).run();
    return json({ ok: true });
  }
  if (postMatch && request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM posts WHERE id=?").bind(postMatch[1]).run();
    return json({ ok: true });
  }

  if (path === "/api/admin/upload" && request.method === "POST") {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) return json({ error: "Choose an image first." }, 400);
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type) || file.size > 5 * 1024 * 1024)
      return json({ error: "Use JPG, PNG, WEBP or GIF up to 5 MB." }, 400);
    const ext = ({ "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "image/gif":"gif" })[file.type];
    const key = `${crypto.randomUUID()}.${ext}`;
    await env.IMAGES.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    return json({ ok: true, url: `/media/${key}` });
  }

  if (path.startsWith("/media/") && request.method === "GET") {
    const key = path.slice("/media/".length);
    if (!/^[a-f0-9-]+\.(jpg|png|webp|gif)$/i.test(key)) return new Response("Not found", { status: 404 });
    const object = await env.IMAGES.get(key);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "public, max-age=31536000, immutable");
    return new Response(object.body, { headers });
  }

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/")) {
      return handleApi(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  }
};
