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

export async function onRequestPut({ request, env, params }) {
  await ensureSchema(env);

  const id = Number(params.id);
  const body = await request.json();
  const url = new URL(request.url);
  const code = normalizeCode(body.code || url.searchParams.get("code"));
  const title = String(body.title ?? "").trim();
  const image = normalizeImage(body.image);

  if (!Number.isInteger(id) || id <= 0) {
    return jsonError("Invalid note id");
  }

  if (image === null) {
    return jsonError("Image is invalid or too large");
  }

  if (!title && !image) {
    return jsonError("Content is required");
  }

  if (!code) {
    return jsonError("Code is required");
  }

  await env.DB
    .prepare("UPDATE keeps SET title = ?, image = ?, completed = ? WHERE id = ? AND code = ?")
    .bind(title, image, body.completed ? 1 : 0, id, code)
    .run();

  return Response.json({ ok: true });
}

export async function onRequestDelete({ request, env, params }) {
  await ensureSchema(env);

  const id = Number(params.id);
  const url = new URL(request.url);
  const code = normalizeCode(url.searchParams.get("code"));

  if (!Number.isInteger(id) || id <= 0) {
    return jsonError("Invalid note id");
  }

  if (!code) {
    return jsonError("Code is required");
  }

  await env.DB
    .prepare("DELETE FROM keeps WHERE id = ? AND code = ?")
    .bind(id, code)
    .run();

  return Response.json({ ok: true });
}
