// The HTTP API. Plain Node http (no framework). Roles are enforced HERE, on every request,
// not just hidden in the interface. SQL lives in repo.js; this file only validates and decides.
import { hashPassword, verifyPassword, newToken, hashToken, parseCookies } from "./auth.js";
import { formatTable } from "./format.js";

export const PERMISSIONS = {
  admin: ["view", "edit", "view_raw", "manage_users"],
  editor: ["view", "edit"],
  viewer: ["view"],
};
const ROLES = Object.keys(PERMISSIONS);
const COOKIE = "sid";
const LIMITS = { tables: 200, columns: 200, rows: 20000, cells: 400000, raw: 200, rawChars: 500000, warnings: 100 };

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (message) => new HttpError(400, message);
const keyOf = (name) => name.toLowerCase().slice(0, 64);

// A date from the database (a Date, or text in UTC) as an ISO string.
const toIso = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v).replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const parseList = (v) => {
  try {
    const list = JSON.parse(v);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};
const text = (v, max, what) => {
  if (typeof v !== "string") throw bad(`${what} must be text.`);
  return v.trim().slice(0, max);
};

function readJson(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size <= max) chunks.push(c); // keep draining an oversized body, but don't keep it
    });
    req.on("end", () => {
      if (size > max) return reject(new HttpError(413, "That upload is too large."));
      if (!size) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(bad("That wasn't valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, payload) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (status === 204) {
    res.writeHead(204, headers);
    return res.end();
  }
  res.writeHead(status, { ...headers, "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

// ---------- validation of what the browser sends ----------

function readTable(t, index) {
  if (!t || typeof t !== "object") throw bad("Each table must be an object.");
  if (!Array.isArray(t.columns) || t.columns.length < 1 || t.columns.length > LIMITS.columns) {
    throw bad(`A table needs between 1 and ${LIMITS.columns} columns.`);
  }
  if (!Array.isArray(t.rows) || t.rows.length > LIMITS.rows) {
    throw bad(`A table can have at most ${LIMITS.rows} rows.`);
  }
  const cell = (v) => {
    if (v !== null && typeof v === "object") throw bad("Cells must be plain text or numbers.");
    return String(v ?? "");
  };
  return {
    title: typeof t.title === "string" && t.title.trim() ? t.title.trim().slice(0, 255) : `Table ${index + 1}`,
    columns: t.columns.map((c) => cell(c).slice(0, 255)),
    rows: t.rows.map((r) => {
      if (!Array.isArray(r)) throw bad("Each row must be a list.");
      return r.map(cell);
    }),
    warnings: (Array.isArray(t.warnings) ? t.warnings : []).slice(0, LIMITS.warnings).map((w) => String(w).slice(0, 500)),
  };
}

const TYPE_NAMES = { pdf: "PDF", csv: "CSV", xlsx: "Excel", json: "JSON" };
const sayTypes = (types) => {
  const names = types.map((t) => TYPE_NAMES[t] || t.toUpperCase());
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : names[0];
};

function readUpload(body, cfg) {
  const type = typeof body.type === "string" ? body.type.toLowerCase() : "";
  if (!cfg.allowedUploads.includes(type)) {
    throw new HttpError(415, `Only ${sayTypes(cfg.allowedUploads)} files can be uploaded.`);
  }
  if (!Array.isArray(body.tables) || body.tables.length < 1 || body.tables.length > LIMITS.tables) {
    throw bad(`A document needs between 1 and ${LIMITS.tables} tables.`);
  }
  const tables = body.tables.map(readTable);
  if (tables.reduce((n, t) => n + t.rows.length * t.columns.length, 0) > LIMITS.cells) {
    throw new HttpError(413, `That document has too many cells (the limit is ${LIMITS.cells.toLocaleString("en-US")}).`);
  }
  const rawIn = Array.isArray(body.raw) ? body.raw.slice(0, LIMITS.raw) : [];
  return {
    name: text(body.name, 255, "The file name") || "Untitled",
    type,
    size: Math.min(1e12, Math.max(0, Math.floor(Number(body.size) || 0))),
    scan: body.scan && typeof body.scan === "object"
      ? { mode: String(body.scan.mode || "").slice(0, 16), model: String(body.scan.model || "").slice(0, 64) }
      : null,
    warnings: (Array.isArray(body.warnings) ? body.warnings : []).slice(0, LIMITS.warnings).map((w) => String(w).slice(0, 500)),
    raw: rawIn.map((r) => ({
      label: String(r?.label ?? "").slice(0, 255),
      ms: Math.max(0, Math.floor(Number(r?.ms) || 0)),
      text: String(r?.text ?? "").slice(0, LIMITS.rawChars),
    })),
    tables,
  };
}

// ---------- the app ----------

export function createApp({ repo, config = {} }) {
  const cfg = {
    allowedUploads: ["pdf", "csv", "xlsx", "json"],
    selfSelectRole: true,
    cookieSecure: false,
    maxBodyBytes: 30 * 1024 * 1024,
    sessionDays: 7,
    ...config,
  };
  const can = (user, permission) => !!user && PERMISSIONS[user.role]?.includes(permission);

  async function sessionUser(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    return token ? repo.findSession(hashToken(token)) : null;
  }

  function setCookie(res, value, maxAgeSeconds) {
    const parts = [`${COOKIE}=${encodeURIComponent(value)}`, "HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${maxAgeSeconds}`];
    if (cfg.cookieSecure) parts.push("Secure");
    res.setHeader("Set-Cookie", parts.join("; "));
  }

  async function startSession(res, userId) {
    const token = newToken();
    await repo.createSession(hashToken(token), userId, new Date(Date.now() + cfg.sessionDays * 86400000));
    setCookie(res, token, cfg.sessionDays * 86400);
  }

  const summary = (d) => ({
    id: d.id,
    name: d.name,
    type: d.file_type,
    size: Number(d.size_bytes),
    scan: d.scan_mode ? { mode: d.scan_mode, model: d.scan_model } : null,
    warnings: parseList(d.warnings),
    uploadedBy: d.uploaded_by || null,
    uploadedAt: toIso(d.uploaded_at),
    editedBy: d.edited_by || null,
    editedAt: toIso(d.edited_at),
  });

  async function loadTable(tr) {
    const cols = await repo.getColumns(tr.id);
    return {
      id: tr.id,
      title: tr.title,
      warnings: parseList(tr.warnings),
      columns: cols.map((c) => c.name),
      columnTypes: cols.map((c) => ({ type: c.type, unit: c.unit || null })),
      rows: await repo.getRows(tr.id, Number(tr.row_count), cols.length),
    };
  }

  // A dummy hash so "no such user" takes as long as "wrong password".
  const dummy = hashPassword("not-a-real-password");

  // ---- route table: [method, pattern, permission needed (null = anyone), handler] ----
  const routes = [
    ["GET", /^\/api\/health$/, null, async () => {
      await repo.ping();
      return { ok: true };
    }],

    ["GET", /^\/api\/auth\/me$/, null, async ({ user }) => ({
      user: user ? { name: user.name, role: user.role } : null,
      selfSelectRole: cfg.selfSelectRole,
    })],

    ["POST", /^\/api\/auth\/signup$/, null, async ({ res, body }) => {
      const name = typeof body.username === "string" ? body.username.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (name.length < 3) throw bad("Username must be at least 3 characters.");
      if (name.length > 64 || /[\u0000-\u001f]/.test(name)) throw bad("That username isn't allowed.");
      if (password.length < 8) throw bad("Password must be at least 8 characters.");
      if (password.length > 200) throw bad("That password is too long.");

      let role = ROLES.includes(body.role) ? body.role : "viewer";
      if (!cfg.selfSelectRole) role = (await repo.countUsers()) === 0 ? "admin" : "viewer";

      const id = await repo.createUser({ name, key: keyOf(name), hash: await hashPassword(password), role });
      if (!id) throw new HttpError(409, "That username is already taken. Try logging in instead.");
      await startSession(res, id);
      return [201, { user: { name, role } }];
    }],

    ["POST", /^\/api\/auth\/login$/, null, async ({ res, body }) => {
      const name = typeof body.username === "string" ? body.username.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!name || !password) throw bad("Enter your username and password.");
      const row = await repo.findUserByKey(keyOf(name));
      const ok = row ? await verifyPassword(password, row.hash) : (await verifyPassword(password, await dummy), false);
      if (!ok) throw new HttpError(401, "Incorrect username or password.");
      await startSession(res, row.id);
      return { user: { name: row.name, role: row.role } };
    }],

    ["POST", /^\/api\/auth\/logout$/, null, async ({ req, res }) => {
      const token = parseCookies(req.headers.cookie)[COOKIE];
      if (token) await repo.deleteSession(hashToken(token));
      setCookie(res, "", 0);
      return [204];
    }],

    // ---- admin: users ----
    ["GET", /^\/api\/users$/, "manage_users", async () => ({
      users: (await repo.listUsers()).map((u) => ({ name: u.name, role: u.role })),
    })],

    ["PATCH", /^\/api\/users\/([^/]+)$/, "manage_users", async ({ params, body, user }) => {
      const key = keyOf(params[0]);
      if (!ROLES.includes(body.role)) throw bad("Unknown role.");
      if (key === keyOf(user.name)) throw new HttpError(409, "You can't change your own role.");
      if (!(await repo.findUserByKey(key))) throw new HttpError(404, "User not found.");
      await repo.setRole(key, body.role);
      return { ok: true };
    }],

    ["DELETE", /^\/api\/users\/([^/]+)$/, "manage_users", async ({ params, user }) => {
      const key = keyOf(params[0]);
      if (key === keyOf(user.name)) throw new HttpError(409, "You can't remove your own account.");
      if (!(await repo.findUserByKey(key))) throw new HttpError(404, "User not found.");
      await repo.deleteUserByKey(key);
      return [204];
    }],

    // ---- documents ----
    ["GET", /^\/api\/documents$/, "view", async () => {
      const rows = await repo.listDocuments();
      return {
        documents: rows.map((d) => ({ ...summary(d), tableCount: Number(d.table_count), rowCount: Number(d.row_count) })),
      };
    }],

    ["POST", /^\/api\/documents$/, "edit", async ({ body, user }) => {
      const upload = readUpload(body, cfg);
      const formatted = { ...upload, tables: upload.tables.map((t) => formatTable(t)) };
      return [201, { id: await repo.insertDocument(formatted, user.id) }];
    }],

    ["GET", /^\/api\/documents\/(\d+)$/, "view", async ({ params }) => {
      const id = Number(params[0]);
      const doc = await repo.getDocument(id);
      if (!doc) throw new HttpError(404, "Document not found.");
      const tables = [];
      for (const tr of await repo.listTables(id)) tables.push(await loadTable(tr));
      return { ...summary(doc), tables };
    }],

    ["DELETE", /^\/api\/documents\/(\d+)$/, "edit", async ({ params }) => {
      const id = Number(params[0]);
      if (!(await repo.getDocument(id))) throw new HttpError(404, "Document not found.");
      await repo.deleteDocument(id);
      return [204];
    }],

    ["PUT", /^\/api\/documents\/(\d+)\/tables\/(\d+)$/, "edit", async ({ params, body, user }) => {
      const [docId, tableId] = params.map(Number);
      if (!(await repo.getDocument(docId))) throw new HttpError(404, "Document not found.");
      const input = readTable({ title: "x", columns: body.columns, rows: body.rows }, 0);
      const done = await repo.replaceTable(docId, tableId, formatTable(input), user.id);
      if (!done) throw new HttpError(404, "Table not found in that document.");
      const tr = (await repo.listTables(docId)).find((t) => t.id === tableId);
      const meta = await repo.getDocument(docId);
      return { table: await loadTable(tr), editedBy: meta.edited_by || null, editedAt: toIso(meta.edited_at) };
    }],

    // What the scanner returned before cleanup: admins only.
    ["GET", /^\/api\/documents\/(\d+)\/raw$/, "view_raw", async ({ params }) => {
      const id = Number(params[0]);
      if (!(await repo.getDocument(id))) throw new HttpError(404, "Document not found.");
      return { raw: (await repo.getRaw(id)).map((r) => ({ label: r.label, ms: Number(r.ms), text: r.text })) };
    }],

    // ---- chart data: one number column against one label column, summed in SQL ----
    ["GET", /^\/api\/tables\/(\d+)\/series$/, "view", async ({ params, url }) => {
      const tableId = Number(params[0]);
      const x = Number(url.searchParams.get("x"));
      const y = Number(url.searchParams.get("y"));
      const agg = ["sum", "avg"].includes(url.searchParams.get("agg")) ? url.searchParams.get("agg") : "none";
      const cols = await repo.getColumns(tableId);
      if (!cols.length) throw new HttpError(404, "Table not found.");
      if (!Number.isInteger(x) || !Number.isInteger(y) || !cols[x] || !cols[y]) throw bad("Pick two columns from this table.");
      if (cols[y].type !== "number") throw bad(`"${cols[y].name}" isn't a numeric column, so it can't be charted.`);
      const rows = await repo.series(tableId, x, y, agg);
      return {
        xName: cols[x].name,
        yName: cols[y].name,
        unit: cols[y].unit || null,
        agg,
        points: rows.map((r) => ({ label: String(r.label), value: Number(r.value) })),
      };
    }],
  ];

  return async function handler(req, res) {
    try {
      const url = new URL(req.url, "http://localhost");
      const route = routes.find(([m, re]) => m === req.method && re.test(url.pathname));
      if (!route) throw new HttpError(404, "Not found.");
      const [, re, need, run] = route;

      if (req.method !== "GET" && !/^application\/json/i.test(req.headers["content-type"] || "")) {
        throw new HttpError(415, "Requests must be JSON.");
      }
      const user = await sessionUser(req);
      if (need) {
        if (!user) throw new HttpError(401, "Please log in.");
        if (!can(user, need)) throw new HttpError(403, "Your role can't do that.");
      }
      const body = ["POST", "PUT", "PATCH"].includes(req.method) ? await readJson(req, cfg.maxBodyBytes) : {};
      if (body === null || typeof body !== "object" || Array.isArray(body)) throw bad("Expected a JSON object.");

      let params;
      try {
        params = re.exec(url.pathname).slice(1).map((p) => decodeURIComponent(p));
      } catch {
        throw bad("Bad address.");
      }
      const out = await run({ req, res, url, params, body, user });
      Array.isArray(out) ? send(res, out[0], out[1]) : send(res, 200, out);
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message });
      console.error(err);
      send(res, 500, { error: "Something went wrong on the server." });
    }
  };
}
