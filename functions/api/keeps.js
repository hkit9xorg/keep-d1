function normalizeCode(value) {
  return String(value ?? "").trim();
}

function jsonError(message, status = 400) {
  return Response.json({ error: message }, { status });
}

const MAX_IMAGE_LENGTH = 1800000;
const IMAGE_DATA_URL_PATTERN = /^data:image\/(?:gif|jpeg|jpg|png|webp);base64,[a-z0-9+/=]+$/i;

function normalizeImage(value) {
  const image = String(value ?? "").trim();

  if (!image) {
    return "";
  }

  if (image.length > MAX_IMAGE_LENGTH || !IMAGE_DATA_URL_PATTERN.test(image)) {
    return null;
  }

  return image;
}

async function ensureSchema(env) {
  await env.DB
    .prepare(`
      CREATE TABLE IF NOT EXISTS keeps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        image TEXT NOT NULL DEFAULT '',
        code TEXT NOT NULL DEFAULT '',
        completed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    .run();

  try {
    await env.DB.prepare("SELECT code FROM keeps LIMIT 1").first();
  } catch (error) {
    try {
      await env.DB
        .prepare("ALTER TABLE keeps ADD COLUMN code TEXT NOT NULL DEFAULT ''")
        .run();
    } catch (alterError) {
      if (!String(alterError?.message).includes("duplicate column name")) {
        throw alterError;
      }
    }
  }

  try {
    await env.DB.prepare("SELECT image FROM keeps LIMIT 1").first();
  } catch (error) {
    try {
      await env.DB
        .prepare("ALTER TABLE keeps ADD COLUMN image TEXT NOT NULL DEFAULT ''")
        .run();
    } catch (alterError) {
      if (!String(alterError?.message).includes("duplicate column name")) {
        throw alterError;
      }
    }
  }

  await env.DB
    .prepare("CREATE INDEX IF NOT EXISTS idx_keeps_code_id ON keeps (code, id DESC)")
    .run();
}

export async function onRequestGet({ request, env }) {
  await ensureSchema(env);

  const url = new URL(request.url);
  const code = normalizeCode(url.searchParams.get("code"));

  if (!code) {
    return jsonError("Code is required");
  }

  const { results } = await env.DB
    .prepare("SELECT id, title, image, code, created_at FROM keeps WHERE code = ? ORDER BY id DESC")
    .bind(code)
    .all();

  return Response.json(results);
}

export async function onRequestPost({ request, env }) {
  await ensureSchema(env);

  const body = await request.json();
  const url = new URL(request.url);
  const title = String(body.title ?? "").trim();
  const image = normalizeImage(body.image);
  const code = normalizeCode(body.code || url.searchParams.get("code"));

  if (image === null) {
    return jsonError("Image is invalid or too large");
  }

  if (!title && !image) {
    return Response.json({ error: "Content is required" }, { status: 400 });
  }

  if (!code) {
    return jsonError("Code is required");
  }

  const result = await env.DB
    .prepare("INSERT INTO keeps (title, image, code) VALUES (?, ?, ?)")
    .bind(title, image, code)
    .run();

  return Response.json({ id: result.meta.last_row_id, title, image, code });
}
