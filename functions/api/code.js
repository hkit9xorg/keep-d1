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

export async function onRequestPost({ request, env }) {
  await ensureSchema(env);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const oldCode = normalizeCode(body.oldCode || body.fromCode || body.code);
  const newCode = normalizeCode(body.newCode || body.toCode);

  if (!oldCode) {
    return jsonError("Code hiện tại không hợp lệ");
  }

  if (!newCode) {
    return jsonError("Code mới không hợp lệ");
  }

  if (oldCode === newCode) {
    return jsonError("Code mới phải khác code hiện tại");
  }

  const result = await env.DB
    .prepare("UPDATE keeps SET code = ? WHERE code = ?")
    .bind(newCode, oldCode)
    .run();

  return Response.json({
    ok: true,
    oldCode,
    newCode,
    updatedCount: result.meta?.changes ?? 0
  });
}

export async function onRequestPut(context) {
  return onRequestPost(context);
}
