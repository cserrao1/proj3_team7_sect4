// Turns an uploaded file into { type, tables, raw, warnings }.
//   PDF            -> each page is drawn to an image and sent to GLM-OCR, the text is parsed into tables
//   CSV / TSV      -> read directly
//   Excel (.xlsx, .xls) -> one table per sheet
//   JSON / JSONL   -> read directly
// pdf.js and SheetJS are only downloaded when a file actually needs them.

import { buildTable, parseCSV, tablesFromJSON, tablesFromOcrText } from "./tableUtils";
import { recognise, OcrError } from "./ocr";

export const ACCEPT = ".pdf,.csv,.tsv,.xlsx,.xls,.json,.jsonl,.ndjson";
export const NOT_SUPPORTED = "This file type isn't supported. Use a PDF, CSV, Excel or JSON file.";

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_PDF_PAGES = 30;
const RAW_CAP = 200_000; // keep the stored raw text reasonable
const MAX_ROWS = 20_000; // per table; the server has the same limits
const MAX_COLS = 200;

const KINDS = {
  pdf: "pdf",
  csv: "csv", tsv: "csv",
  xlsx: "xlsx", xls: "xlsx",
  json: "json", jsonl: "json", ndjson: "json",
};

export const fileKind = (name) => KINDS[(name.split(".").pop() || "").toLowerCase()] || null;

const cap = (text) =>
  text.length > RAW_CAP ? text.slice(0, RAW_CAP) + "\n\n[... cut off here to save space ...]" : text;

// Excel often saves CSV as Windows-1252 rather than UTF-8; reading that as UTF-8 garbles accents.
function decodeText(buffer) {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(buffer), note: null };
  } catch {
    return {
      text: new TextDecoder("windows-1252").decode(buffer),
      note: "This file wasn't UTF-8, so it was read as Windows-1252. Check accented letters look right.",
    };
  }
}

// Very long tables are trimmed (with a note) instead of being rejected.
function clampTable(table) {
  const out = { ...table, warnings: [...table.warnings] };
  if (out.columns.length > MAX_COLS) {
    out.warnings.push(`Only the first ${MAX_COLS} of ${out.columns.length} columns were kept.`);
    out.columns = out.columns.slice(0, MAX_COLS);
    out.rows = out.rows.map((r) => r.slice(0, MAX_COLS));
  }
  if (out.rows.length > MAX_ROWS) {
    out.warnings.push(`Only the first ${MAX_ROWS.toLocaleString("en-US")} of ${out.rows.length.toLocaleString("en-US")} rows were kept.`);
    out.rows = out.rows.slice(0, MAX_ROWS);
  }
  return out;
}

async function renderPdfPage(page, maxSide = 1800) {
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2.5, maxSide / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // JPEG has no transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.9);
}

// pages: [{ label, getImage: () => Promise<dataUrl> }]
export async function scanPages(pages, scan, onProgress) {
  const tables = [];
  const raw = [];
  const warnings = [];
  let failures = 0;

  for (let i = 0; i < pages.length; i++) {
    const { label, getImage } = pages[i];
    onProgress(pages.length > 1 ? `Scanning ${label} of ${pages.length}…` : "Scanning…");
    try {
      const started = Date.now();
      const text = await recognise(await getImage(), scan);
      raw.push({ label, text: cap(text), ms: Date.now() - started });

      const found = tablesFromOcrText(text, label, { includeText: scan === "text" });
      if (found.length === 0) warnings.push(`${label}: the scanner returned nothing readable.`);
      tables.push(...found);
    } catch (e) {
      if (e instanceof OcrError && e.fatal) throw e; // server down / model missing: stop now
      failures++;
      warnings.push(`${label} couldn't be scanned: ${e.message}`);
      raw.push({ label, text: `[scan failed] ${e.message}`, ms: 0 });
    }
  }

  if (tables.length === 0) {
    throw new Error(
      failures ? "None of the pages could be scanned. " + warnings[0] : "The scanner didn't find any readable content."
    );
  }
  return { tables, raw, warnings };
}

export async function processFile(file, { scan = "tables", onProgress = () => {} } = {}) {
  const type = fileKind(file.name);
  if (!type) throw new Error(NOT_SUPPORTED);
  if (file.size === 0) throw new Error("This file is empty.");
  if (file.size > MAX_BYTES) throw new Error("This file is larger than 25 MB.");

  // ---------- CSV / TSV ----------
  if (type === "csv") {
    onProgress("Reading…");
    const { text, note } = decodeText(await file.arrayBuffer());
    const { rows, unclosedQuote } = parseCSV(text);
    const table = buildTable(rows, { title: file.name, header: "auto" });
    if (table.columns.length === 0) throw new Error("No data found in this file.");
    const warnings = [];
    if (note) warnings.push(note);
    if (unclosedQuote) warnings.push("A quote was never closed, so the end of the file may be merged into one cell.");
    return { type, tables: [clampTable(table)], raw: [{ label: "File contents", text: cap(text), ms: 0 }], warnings };
  }

  // ---------- JSON ----------
  if (type === "json") {
    onProgress("Reading…");
    const { text, note } = decodeText(await file.arrayBuffer());
    const result = tablesFromJSON(text, file.name);
    if (!result) throw new Error("This doesn't look like valid JSON, and it couldn't be repaired.");
    const tables = result.tables.filter((t) => t.columns.length > 0 && t.rows.length > 0).map(clampTable);
    if (tables.length === 0) throw new Error("No data found in this file.");
    return {
      type,
      tables,
      raw: [{ label: "File contents", text: cap(text), ms: 0 }],
      warnings: note ? [note, ...result.warnings] : result.warnings,
    };
  }

  // ---------- Excel: one table per sheet ----------
  if (type === "xlsx") {
    onProgress("Reading spreadsheet…");
    let wb, XLSX;
    try {
      const mod = await import("xlsx");
      XLSX = mod.read ? mod : mod.default;
      wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    } catch {
      throw new Error("This spreadsheet couldn't be opened. It may be damaged or password-protected.");
    }
    const tables = [];
    const raw = [];
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      // raw:false = the text as Excel shows it ("$1,299.50", "3/5/2024"), which the server then types
      const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false, blankrows: false });
      const table = buildTable(matrix, { title: wb.SheetNames.length > 1 ? name : file.name, header: "auto" });
      if (table.columns.length === 0) continue; // skip empty sheets
      tables.push(clampTable(table));
      raw.push({ label: `Sheet: ${name}`, text: cap(XLSX.utils.sheet_to_csv(ws)), ms: 0 });
    }
    if (tables.length === 0) throw new Error("No data found in this spreadsheet.");
    return { type, tables, raw, warnings: [] };
  }

  // ---------- PDF ----------
  // Check the contents too, not just the name: a real PDF says "%PDF-" near the start.
  const head = new TextDecoder("latin1").decode(await file.slice(0, 1024).arrayBuffer());
  if (!head.includes("%PDF-")) throw new Error("This doesn't look like a valid PDF.");

  onProgress("Opening PDF…");
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch {
    throw new Error("This PDF couldn't be opened. It may be damaged or password-protected.");
  }

  const total = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const pages = Array.from({ length: total }, (_, i) => ({
    label: `Page ${i + 1}`,
    getImage: async () => renderPdfPage(await pdf.getPage(i + 1)),
  }));

  const result = await scanPages(pages, scan, onProgress);
  if (pdf.numPages > MAX_PDF_PAGES) {
    result.warnings.unshift(`Only the first ${MAX_PDF_PAGES} of ${pdf.numPages} pages were scanned.`);
  }
  return { type: "pdf", ...result };
}
