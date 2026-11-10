import { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import { api } from "../lib/api";
import { toCSV, toJSON } from "../lib/tableUtils";
import ChartPanel from "./ChartPanel";

const PAGE = 100; // rows drawn at a time

function download(filename, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stem = (name) => name.replace(/\.[^.]+$/, "");
const safe = (s) => s.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "data";
const typeLabel = (c) => (c.type === "number" && c.unit ? `number · ${c.unit}` : c.type);

export default function DocumentViewer({ docId, onBack, onToast }) {
  const { can } = useAuth();
  const editable = can("edit");
  const showRaw = can("view_raw"); // admins only

  const [doc, setDoc] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("data");
  const [ti, setTi] = useState(0);
  const [limit, setLimit] = useState(PAGE);
  const [raw, setRaw] = useState(null);
  const [rev, setRev] = useState(0); // bumped after a failed save so the boxes snap back
  const latest = useRef(null); // the newest copy of the document, for the save queue
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    let live = true;
    api
      .get(`/api/documents/${docId}`)
      .then((d) => {
        if (!live) return;
        latest.current = d;
        setDoc(d);
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [docId]);

  useEffect(() => {
    if (tab !== "raw" || !showRaw || raw !== null) return;
    let live = true;
    api
      .get(`/api/documents/${docId}/raw`)
      .then((d) => live && setRaw(d.raw))
      .catch((e) => live && onToast(e.message));
    return () => {
      live = false;
    };
  }, [tab, showRaw, raw, docId]);

  if (error) {
    return (
      <div className="card">
        <p className="docs__warn">{error}</p>
        <button className="link" onClick={onBack}>← Back to documents</button>
      </div>
    );
  }
  if (!doc) return <div className="card"><p className="users__note">Loading…</p></div>;

  const index = Math.min(ti, doc.tables.length - 1);
  const table = doc.tables[index];
  const activeTab = tab === "raw" && !showRaw ? "data" : tab;
  const warnings = [...(table?.warnings || []), ...(doc.warnings || [])];

  // ---------- editing: each change is saved to the database, one at a time and in order ----------
  function edit(tableId, change) {
    queue.current = queue.current.then(async () => {
      try {
        const cur = latest.current;
        const next = change(cur.tables.find((t) => t.id === tableId));
        const saved = await api.put(`/api/documents/${docId}/tables/${tableId}`, { columns: next.columns, rows: next.rows });
        const updated = {
          ...cur,
          editedBy: saved.editedBy,
          editedAt: saved.editedAt,
          tables: cur.tables.map((t) => (t.id === tableId ? saved.table : t)),
        };
        latest.current = updated;
        setDoc(updated);
      } catch (e) {
        onToast(e.message || "That change couldn't be saved.");
        setRev((n) => n + 1);
      }
    });
  }
  const setCell = (r, c, v) => {
    if (table.rows[r][c] === v) return;
    edit(table.id, (t) => ({ ...t, rows: t.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) }));
  };
  const setHeader = (c, v) => {
    const name = v.trim() || `Column ${c + 1}`;
    if (table.columns[c] === name) return;
    edit(table.id, (t) => ({ ...t, columns: t.columns.map((x, j) => (j === c ? name : x)) }));
  };
  const delRow = (r) => edit(table.id, (t) => ({ ...t, rows: t.rows.filter((_, i) => i !== r) }));
  const addRow = () => edit(table.id, (t) => ({ ...t, rows: [...t.rows, t.columns.map(() => "")] }));

  // ---------- downloads ----------
  const fileBase = () => (doc.tables.length > 1 ? `${safe(stem(doc.name))}-${safe(table.title)}` : safe(stem(doc.name)));
  const downloadCSV = () => download(`${fileBase()}.csv`, "\uFEFF" + toCSV(table.columns, table.rows), "text/csv;charset=utf-8");
  const downloadJSON = () => download(`${fileBase()}.json`, toJSON(table.columns, table.rows), "application/json");
  const downloadRaw = () =>
    download(`${safe(stem(doc.name))}-raw.txt`, (raw || []).map((r) => `===== ${r.label} =====\n${r.text}`).join("\n\n"), "text/plain;charset=utf-8");
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      onToast("Copied");
    } catch {
      onToast("Couldn't copy. Select the text and copy it manually.");
    }
  };

  const scanLabel = doc.scan
    ? `Scanned with ${doc.scan.model} (${doc.scan.mode === "tables" ? "Table" : "Text"} Recognition)`
    : "Read directly from the file (no OCR)";
  const tableSelect = doc.tables.length > 1 && (
    <select value={index} onChange={(e) => { setTi(Number(e.target.value)); setLimit(PAGE); }} aria-label="Choose table">
      {doc.tables.map((t, i) => <option key={t.id} value={i}>{t.title} ({t.rows.length} rows)</option>)}
    </select>
  );

  return (
    <div className="card">
      <div className="card__head">
        <h2>{doc.name}</h2>
        <button className="link" onClick={onBack}>← Back to documents</button>
      </div>
      <p className="users__note">
        Uploaded by {doc.uploadedBy || "a removed user"} on {new Date(doc.uploadedAt).toLocaleString()}
        {doc.editedAt && <> · last edited by {doc.editedBy || "a removed user"} on {new Date(doc.editedAt).toLocaleString()}</>}
      </p>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={activeTab === "data"} className={`tab ${activeTab === "data" ? "is-active" : ""}`} onClick={() => setTab("data")}>Data</button>
        <button role="tab" aria-selected={activeTab === "chart"} className={`tab ${activeTab === "chart" ? "is-active" : ""}`} onClick={() => setTab("chart")}>Chart</button>
        {showRaw && (
          <button role="tab" aria-selected={activeTab === "raw"} className={`tab ${activeTab === "raw" ? "is-active" : ""}`} onClick={() => setTab("raw")}>Raw data (admin)</button>
        )}
      </div>

      {activeTab === "data" && table && (
        <>
          <div className="docs__bar">
            {tableSelect}
            <button className="btn-ghost" onClick={downloadCSV}>Download CSV</button>
            <button className="btn-ghost" onClick={downloadJSON}>Download JSON</button>
            {editable && <button className="btn-ghost" onClick={addRow}>+ Add row</button>}
          </div>

          {warnings.length > 0 && <ul className="docs__warn">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
          {doc.scan && (
            <p className="users__note">
              Scanned text can contain small mistakes, so give the numbers a quick look.
              {editable ? " Click any cell to fix it. Each change is saved to the database." : ""}
            </p>
          )}

          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  {table.columns.map((c, ci) => (
                    <th key={`${rev}-${ci}-${c}`}>
                      {editable ? (
                        <input className="cell" defaultValue={c} aria-label={`Column ${ci + 1} name`} onBlur={(e) => setHeader(ci, e.target.value)} />
                      ) : c}
                    </th>
                  ))}
                  {editable && <th aria-label="Row actions" />}
                </tr>
                <tr className="data__types">
                  {table.columnTypes.map((c, ci) => <th key={ci}>{typeLabel(c)}</th>)}
                  {editable && <th />}
                </tr>
              </thead>
              <tbody>
                {table.rows.slice(0, limit).map((row, r) => (
                  <tr key={r}>
                    {row.map((v, c) => (
                      <td key={`${rev}-${c}-${v}`}>
                        {editable ? (
                          <input className="cell" defaultValue={v} aria-label={`Row ${r + 1}, ${table.columns[c]}`} onBlur={(e) => setCell(r, c, e.target.value)} />
                        ) : v}
                      </td>
                    ))}
                    {editable && <td><button className="link" onClick={() => delRow(r)} aria-label={`Delete row ${r + 1}`}>✕</button></td>}
                  </tr>
                ))}
                {table.rows.length === 0 && (
                  <tr><td colSpan={table.columns.length + 1} className="none">This table has no rows.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {table.rows.length > limit && (
            <p className="users__note">
              Showing {limit} of {table.rows.length.toLocaleString()} rows.{" "}
              <button className="link" onClick={() => setLimit(limit + PAGE)}>Show {PAGE} more</button>
              {" · "}the downloads always include every row.
            </p>
          )}
        </>
      )}

      {activeTab === "chart" && table && (
        <>
          {tableSelect && <div className="docs__bar">{tableSelect}</div>}
          <ChartPanel key={table.id} table={table} stamp={doc.editedAt} />
        </>
      )}

      {activeTab === "raw" && (
        <>
          <p className="users__note">
            {scanLabel}. This is exactly what the scanner returned, before any cleanup. If a value on the Data
            tab looks wrong, compare it here.
          </p>
          {raw === null && <p className="users__note">Loading…</p>}
          {raw && (
            <>
              <div className="docs__bar"><button className="btn-ghost" onClick={downloadRaw}>Download raw (.txt)</button></div>
              {raw.map((r, i) => (
                <div key={i}>
                  <div className="card__head">
                    <strong>{r.label}{r.ms ? <small className="users__muted"> · {(r.ms / 1000).toFixed(1)}s</small> : null}</strong>
                    <button className="link" onClick={() => copy(r.text)}>Copy</button>
                  </div>
                  <pre className="raw">{r.text || "(empty)"}</pre>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
