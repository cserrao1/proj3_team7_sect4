import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import { ACCEPT, processFile } from "../lib/processFile";
import { checkOcr, ocrInfo } from "../lib/ocr";
import { api } from "../lib/api";
import DocumentViewer from "./DocumentViewer";

const TYPE_LABEL = { pdf: "PDF", csv: "CSV", xlsx: "Excel", json: "JSON" };

export default function DocumentsPanel({ onToast }) {
  const { can } = useAuth();
  const canEdit = can("edit");

  const [docs, setDocs] = useState(null); // null = still loading
  const [loadError, setLoadError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [scan, setScan] = useState("tables");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [errors, setErrors] = useState([]);
  const [drag, setDrag] = useState(false);
  const [ocr, setOcr] = useState(null); // null = checking
  const inputRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      setDocs((await api.get("/api/documents")).documents);
      setLoadError("");
    } catch (e) {
      setLoadError(e.message);
      setDocs((d) => d ?? []);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  function recheck() {
    setOcr(null);
    checkOcr().then(setOcr);
  }
  useEffect(() => {
    if (canEdit) recheck();
  }, [canEdit]);

  async function handleFiles(fileList) {
    const files = [...fileList];
    if (!canEdit || busy || files.length === 0) return;
    setBusy(true);
    setErrors([]);
    const failed = [];

    for (const file of files) {
      try {
        setProgress(`${file.name}: starting…`);
        const result = await processFile(file, { scan, onProgress: (m) => setProgress(`${file.name}: ${m}`) });
        setProgress(`${file.name}: saving to the database…`);
        await api.post("/api/documents", {
          name: file.name,
          type: result.type,
          size: file.size,
          scan: result.type === "pdf" ? { mode: scan, model: ocrInfo.model } : null,
          warnings: result.warnings,
          tables: result.tables.map(({ title, columns, rows, warnings }) => ({ title, columns, rows, warnings })),
          raw: result.raw.map(({ label, text, ms }) => ({ label, text, ms: ms || 0 })),
        });
        onToast(`${file.name} added`);
        await refresh();
      } catch (e) {
        failed.push(`${file.name}: ${e.message || "Something went wrong."}`);
      }
    }

    setErrors(failed);
    setProgress("");
    setBusy(false);
  }

  async function handleDelete(doc) {
    if (!window.confirm(`Delete "${doc.name}"? This can't be undone.`)) return;
    try {
      await api.del(`/api/documents/${doc.id}`);
      onToast(`${doc.name} deleted`);
      await refresh();
    } catch (e) {
      onToast(e.message);
    }
  }

  if (openId) {
    return (
      <DocumentViewer
        docId={openId}
        onBack={() => {
          setOpenId(null);
          refresh();
        }}
        onToast={onToast}
      />
    );
  }

  return (
    <div className="card">
      <div className="card__head">
        <h2>Documents</h2>
        <span className="pill pill--shipped">{docs ? docs.length : "…"} total</span>
      </div>

      {loadError && <p className="docs__warn">{loadError}</p>}

      {canEdit ? (
        <>
          <div
            className={`docs__drop ${drag ? "is-drag" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
          >
            <p>
              <strong>Drop files here</strong> or{" "}
              <button className="link" disabled={busy} onClick={() => inputRef.current?.click()}>browse</button>
            </p>
            <small>PDF (scanned), CSV, Excel or JSON · up to 25 MB each</small>
            <input
              ref={inputRef}
              type="file"
              hidden
              multiple
              accept={ACCEPT}
              onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
            />
          </div>

          <div className="docs__bar">
            <label className="docs__scan">
              Scanned PDFs:{" "}
              <select value={scan} onChange={(e) => setScan(e.target.value)} disabled={busy}>
                <option value="tables">Read as tables</option>
                <option value="text">Read as text</option>
              </select>
            </label>
            <span className={`docs__status ${ocr === null ? "" : ocr.ok ? "docs__status--ok" : "docs__status--bad"}`}>
              {ocr === null ? "Checking OCR…" : ocr.message}
            </span>
            <button className="link" onClick={recheck} disabled={busy}>Recheck</button>
          </div>

          {ocr && !ocr.ok && (
            <details className="docs__help">
              <summary>How to start GLM-OCR</summary>
              <p>CSV, Excel and JSON files work without it. PDFs are read by the GLM-OCR model, so it has to be running for those:</p>
              <pre className="raw">{`ollama pull glm-ocr      # one time, ~2 GB (update Ollama first if it refuses)
ollama serve             # if it isn't already running`}</pre>
              <p>Using vLLM or SGLang instead? Put <code>OCR_URL</code>, <code>VITE_OCR_MODE=openai</code> and <code>VITE_OCR_MODEL</code> in <code>.env</code> (see <code>.env.example</code>) and restart <code>npm run dev</code>.</p>
            </details>
          )}

          {busy && <p className="docs__progress" role="status">⏳ {progress}</p>}
          {errors.length > 0 && (
            <ul className="docs__errors" role="alert">
              {errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
        </>
      ) : (
        <p className="users__note">Your role can view, chart and download documents, but not upload or change them.</p>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Name</th><th>Type</th><th>Contents</th><th>Uploaded by</th><th>Date</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {docs === null && <tr><td colSpan="6" className="none">Loading…</td></tr>}
            {(docs || []).map((d) => (
              <tr key={d.id}>
                <td>
                  <button className="link docs__name" onClick={() => setOpenId(d.id)}>{d.name}</button>
                  {d.warnings.length > 0 && <span className="pill pill--pending" title={d.warnings.join("\n")}>check</span>}
                </td>
                <td><span className="pill pill--shipped">{TYPE_LABEL[d.type] || d.type}</span></td>
                <td>{d.tableCount} table{d.tableCount === 1 ? "" : "s"} · {d.rowCount.toLocaleString()} rows</td>
                <td>{d.uploadedBy || <span className="users__muted">removed user</span>}</td>
                <td>{new Date(d.uploadedAt).toLocaleDateString()}</td>
                <td>
                  <button className="link" onClick={() => setOpenId(d.id)}>Open</button>
                  {canEdit && <> · <button className="link" onClick={() => handleDelete(d)}>Delete</button></>}
                </td>
              </tr>
            ))}
            {docs && docs.length === 0 && (
              <tr><td colSpan="6" className="none">
                No documents yet.{canEdit ? " Drop a file above to get started." : " Ask an editor or admin to upload one."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
