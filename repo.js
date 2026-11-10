// Every SQL statement in the app lives here. All values go in as ? parameters (never pasted into
// the SQL text), so uploaded text can't change what a query does. Works with a mysql2 pool.

const BATCH = 1000; // cells inserted per statement

export function createRepo(pool) {
  const q = async (sql, params = []) => (await pool.query(sql, params))[0];

  // Runs fn(query) inside one transaction: everything saves, or nothing does.
  async function tx(fn) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const out = await fn(async (sql, params = []) => (await conn.query(sql, params))[0]);
      await conn.commit();
      return out;
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
  }

  async function insertColumnsAndCells(t, tableId, table) {
    for (const [c, col] of table.columns.entries()) {
      await t(
        "INSERT INTO doc_columns (table_id, col_index, name, data_type, unit) VALUES (?, ?, ?, ?, ?)",
        [tableId, c, col.name, col.type, col.unit || null]
      );
    }
    let batch = [];
    const flush = async () => {
      if (!batch.length) return;
      await t("INSERT INTO doc_cells (table_id, row_index, col_index, value_text, value_num, value_date) VALUES ?", [batch]);
      batch = [];
    };
    for (const [r, row] of table.rows.entries()) {
      for (const [c, cell] of row.entries()) {
        batch.push([tableId, r, c, cell.text, cell.num, cell.date]);
        if (batch.length >= BATCH) await flush();
      }
    }
    await flush();
  }

  return {
    ping: () => q("SELECT 1 AS ok"),

    // ---------- users and sessions ----------
    async countUsers() {
      return Number((await q("SELECT COUNT(*) AS n FROM users"))[0].n);
    },
    async createUser({ name, key, hash, role }) {
      try {
        const r = await q(
          "INSERT INTO users (username, username_key, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
          [name, key, hash, role, new Date()]
        );
        return r.insertId;
      } catch (err) {
        if (err.code === "ER_DUP_ENTRY") return null; // username already taken
        throw err;
      }
    },
    async findUserByKey(key) {
      const r = await q("SELECT id, username AS name, role, password_hash AS hash FROM users WHERE username_key = ?", [key]);
      return r[0] || null;
    },
    listUsers: () => q("SELECT id, username AS name, role FROM users ORDER BY username_key"),
    async setRole(key, role) {
      await q("UPDATE users SET role = ? WHERE username_key = ?", [role, key]);
    },
    async deleteUserByKey(key) {
      await q("DELETE FROM users WHERE username_key = ?", [key]);
    },
    async createSession(tokenHash, userId, expiresAt) {
      await q("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [tokenHash, userId, expiresAt]);
    },
    async findSession(tokenHash) {
      const r = await q(
        "SELECT u.id, u.username AS name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
        [tokenHash, new Date()]
      );
      return r[0] || null;
    },
    async deleteSession(tokenHash) {
      await q("DELETE FROM sessions WHERE token_hash = ?", [tokenHash]);
    },
    async purgeSessions() {
      await q("DELETE FROM sessions WHERE expires_at <= ?", [new Date()]);
    },

    // ---------- documents ----------
    listDocuments: () =>
      q(`SELECT d.id, d.name, d.file_type, d.size_bytes, d.scan_mode, d.scan_model, d.warnings,
                d.uploaded_at, d.edited_at, u.username AS uploaded_by, e.username AS edited_by,
                (SELECT COUNT(*) FROM doc_tables t WHERE t.document_id = d.id) AS table_count,
                (SELECT COALESCE(SUM(t.row_count), 0) FROM doc_tables t WHERE t.document_id = d.id) AS row_count
           FROM documents d
           LEFT JOIN users u ON u.id = d.uploaded_by
           LEFT JOIN users e ON e.id = d.edited_by
          ORDER BY d.uploaded_at DESC, d.id DESC`),

    async getDocument(id) {
      const r = await q(
        `SELECT d.id, d.name, d.file_type, d.size_bytes, d.scan_mode, d.scan_model, d.warnings,
                d.uploaded_at, d.edited_at, u.username AS uploaded_by, e.username AS edited_by
           FROM documents d
           LEFT JOIN users u ON u.id = d.uploaded_by
           LEFT JOIN users e ON e.id = d.edited_by
          WHERE d.id = ?`,
        [id]
      );
      return r[0] || null;
    },

    insertDocument(doc, userId) {
      return tx(async (t) => {
        const d = await t(
          `INSERT INTO documents (name, file_type, size_bytes, scan_mode, scan_model, warnings, uploaded_by, uploaded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [doc.name, doc.type, doc.size, doc.scan?.mode || null, doc.scan?.model || null, JSON.stringify(doc.warnings), userId, new Date()]
        );
        for (const [i, r] of doc.raw.entries()) {
          await t("INSERT INTO doc_raw (document_id, position, label, ms, content) VALUES (?, ?, ?, ?, ?)", [d.insertId, i, r.label, r.ms, r.text]);
        }
        for (const [i, table] of doc.tables.entries()) {
          const tr = await t(
            "INSERT INTO doc_tables (document_id, position, title, row_count, warnings) VALUES (?, ?, ?, ?, ?)",
            [d.insertId, i, table.title, table.rows.length, JSON.stringify(table.warnings)]
          );
          await insertColumnsAndCells(t, tr.insertId, table);
        }
        return d.insertId;
      });
    },

    deleteDocument: async (id) => {
      await q("DELETE FROM documents WHERE id = ?", [id]);
    },

    getRaw: (docId) => q("SELECT label, ms, content AS text FROM doc_raw WHERE document_id = ? ORDER BY position", [docId]),

    listTables: (docId) =>
      q("SELECT id, title, row_count, warnings FROM doc_tables WHERE document_id = ? ORDER BY position", [docId]),

    getColumns: (tableId) =>
      q("SELECT col_index, name, data_type AS type, unit FROM doc_columns WHERE table_id = ? ORDER BY col_index", [tableId]),

    // The grid as text, ready to show. Typed values stay in the database for charts.
    async getRows(tableId, rowCount, width) {
      const rows = Array.from({ length: rowCount }, () => Array(width).fill(""));
      const cells = await q("SELECT row_index, col_index, value_text FROM doc_cells WHERE table_id = ? ORDER BY row_index, col_index", [tableId]);
      for (const c of cells) if (rows[c.row_index] && c.col_index < width) rows[c.row_index][c.col_index] = c.value_text;
      return rows;
    },

    // Replace one table's contents (an edit). Returns false if the table isn't in that document.
    replaceTable(docId, tableId, table, userId) {
      return tx(async (t) => {
        const own = await t("SELECT id FROM doc_tables WHERE id = ? AND document_id = ?", [tableId, docId]);
        if (!own.length) return false;
        await t("DELETE FROM doc_cells WHERE table_id = ?", [tableId]);
        await t("DELETE FROM doc_columns WHERE table_id = ?", [tableId]);
        await t("UPDATE doc_tables SET row_count = ? WHERE id = ?", [table.rows.length, tableId]);
        await insertColumnsAndCells(t, tableId, table);
        await t("UPDATE documents SET edited_by = ?, edited_at = ? WHERE id = ?", [userId, new Date(), docId]);
        return true;
      });
    },

    // ---------- chart data, computed in SQL ----------
    // agg: "none" keeps one point per row; "sum" / "avg" combine rows that share a label.
    series(tableId, xCol, yCol, agg) {
      const join = `FROM doc_cells xc
                    JOIN doc_cells yc ON yc.table_id = xc.table_id AND yc.row_index = xc.row_index AND yc.col_index = ?
                   WHERE xc.table_id = ? AND xc.col_index = ? AND yc.value_num IS NOT NULL`;
      const fn = { sum: "SUM", avg: "AVG" }[agg]; // whitelisted, never user text
      if (!fn) {
        return q(`SELECT xc.value_text AS label, yc.value_num AS value ${join} ORDER BY xc.row_index LIMIT 500`, [yCol, tableId, xCol]);
      }
      return q(
        `SELECT xc.value_text AS label, ${fn}(yc.value_num) AS value, MIN(xc.row_index) AS first_row ${join}
          GROUP BY xc.value_text ORDER BY first_row LIMIT 500`,
        [yCol, tableId, xCol]
      );
    },
  };
}
