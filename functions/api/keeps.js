function normalizeCode(value) {
  return String(value ?? "").trim();
}

function jsonError(message, status = 400) {
  return Response.json({ error: message }, { status });
}

async function ensureSchema(env) {
  await env.DB
    .prepare(`
      CREATE TABLE IF NOT EXISTS keeps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
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
    .prepare("SELECT id, title, code, created_at FROM keeps WHERE code = ? ORDER BY id DESC")
    .bind(code)
    .all();

  return Response.json(results);
}

export async function onRequestPost({ request, env }) {
  await ensureSchema(env);

  const body = await request.json();
  const url = new URL(request.url);
  const title = String(body.title ?? "").trim();
  const code = normalizeCode(body.code || url.searchParams.get("code"));

  if (!title) {
    return Response.json({ error: "Title is required" }, { status: 400 });
  }

  if (!code) {
    return jsonError("Code is required");
  }

  const result = await env.DB
    .prepare("INSERT INTO keeps (title, code) VALUES (?, ?)")
    .bind(title, code)
    .run();

  return Response.json({ id: result.meta.last_row_id, title, code });
}
