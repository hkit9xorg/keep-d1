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

export async function onRequestPut({ request, env, params }) {
  await ensureSchema(env);

  const id = Number(params.id);
  const body = await request.json();
  const url = new URL(request.url);
  const code = normalizeCode(body.code || url.searchParams.get("code"));
  const title = String(body.title ?? "").trim();

  if (!Number.isInteger(id) || id <= 0) {
    return jsonError("Invalid note id");
  }

  if (!title) {
    return jsonError("Title is required");
  }

  if (!code) {
    return jsonError("Code is required");
  }

  await env.DB
    .prepare("UPDATE keeps SET title = ?, completed = ? WHERE id = ? AND code = ?")
    .bind(title, body.completed ? 1 : 0, id, code)
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
