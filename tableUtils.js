// Pure helpers (no browser APIs) for turning messy input into clean tables and back out.
// Everything here is deliberately forgiving: ragged rows get padded, broken JSON gets
// a repair attempt, half-formed OCR tables still produce something you can fix by hand.

// A table is { title, columns: string[], rows: string[][], warnings: string[] }.
// All cell values are kept as strings; numbers are recognised again when exporting JSON.

const NUMERIC = /^-?(0|[1-9]\d*)(\.\d+)?$/;
export const isNumeric = (s) => NUMERIC.test(String(s).trim());

// ---------- cell cleaning ----------

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s) {
  return s.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos|nbsp));/gi,
    (match, dec, hex, name) => {
      if (name) return NAMED[name.toLowerCase()];
      const cp = dec ? parseInt(dec, 10) : parseInt(hex, 16);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : match;
    }
  );
}

// OCR cells: strip tags / markdown bold, decode entities, collapse whitespace.
export function cleanOcrCell(s) {
  const noTags = String(s ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1");
  return decodeEntities(noTags).replace(/\s+/g, " ").trim();
}

function toCell(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v).trim();
}

// Unique, non-empty column names: "" -> "Column 3", repeats -> "Name (2)".
function makeColumns(names, width) {
  const seen = new Set();
  const out = [];
  for (let i = 0; i < width; i++) {
    const base = toCell(names[i] ?? "") || `Column ${i + 1}`;
    let name = base;
    let n = 1;
    while (seen.has(name.toLowerCase())) {
      n += 1;
      name = `${base} (${n})`;
    }
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

// ---------- matrix -> table ----------

// header: true  = first row is the header
//         false = no header row
//         "auto" = guess: the first row looks like a header if at least half of it is
//                  filled in and it isn't all numbers (so "Region, 2023, 2024" counts).
export function buildTable(matrix, { title = "Table", header = "auto" } = {}) {
  const warnings = [];
  let rows = (matrix || []).map((r) => (Array.isArray(r) ? r : [r]).map(toCell));
  rows = rows.filter((r) => r.some((c) => c !== ""));
  if (rows.length === 0) {
    return { title, columns: [], rows: [], warnings: ["Nothing readable was found here."] };
  }

  let width = 0;
  for (const r of rows) if (r.length > width) width = r.length;

  let useHeader = header === true;
  if (header === "auto") {
    const filled = rows[0].filter((c) => c !== "");
    useHeader =
      rows.length > 1 &&
      filled.length >= Math.ceil(width / 2) &&
      filled.some((c) => !isNumeric(c));
  }

  const names = useHeader ? rows[0] : [];
  const data = useHeader ? rows.slice(1) : rows;
  const columns = makeColumns(names, width);

  const ragged = data.filter((r) => r.length !== width).length;
  if (ragged) {
    warnings.push(
      `${ragged} row${ragged === 1 ? "" : "s"} had a different number of columns than the widest row and ` +
        `${ragged === 1 ? "was" : "were"} padded with blanks. Worth a quick check.`
    );
  }
  if (useHeader && names.length < width) {
    warnings.push("The header row is shorter than the data, so some columns got generic names.");
  }

  const padded = data.map((r) => (r.length < width ? [...r, ...Array(width - r.length).fill("")] : r));
  return { title, columns, rows: padded, warnings };
}

// ---------- CSV / TSV ----------

function sniffDelimiter(text) {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim() && !/^sep=.$/i.test(l))
    .slice(0, 6);
  let best = ",";
  let bestScore = 0;
  for (const d of [",", ";", "\t", "|"]) {
    const counts = lines.map((l) => l.split(d).length - 1);
    if (counts.length === 0 || counts.some((c) => c === 0)) continue;
    const score = Math.min(...counts);
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

// Returns { rows, delimiter, unclosedQuote }. A quote only opens a quoted cell at the start
// of a cell, so a stray 5" in the middle of a value stays literal.
export function parseCSV(input) {
  let text = String(input ?? "").replace(/^\uFEFF/, "");
  text = text.replace(/^sep=.\r?\n/i, "");
  const delimiter = sniffDelimiter(text);

  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return { rows, delimiter, unclosedQuote: inQuotes };
}

// ---------- JSON ----------

// Strict parse first, then gentle repairs: BOM, trailing commas, JSON Lines.
export function parseJSONLoose(input) {
  const text = String(input ?? "").replace(/^\uFEFF/, "").trim();
  try {
    return { value: JSON.parse(text), repaired: false };
  } catch {}
  try {
    return { value: JSON.parse(text.replace(/,\s*([}\]])/g, "$1")), repaired: true };
  } catch {}
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    try {
      return { value: lines.map((l) => JSON.parse(l.replace(/,$/, ""))), repaired: true };
    } catch {}
  }
  return null;
}

const isRecord = (v) => v && typeof v === "object" && !Array.isArray(v);

function jsonToTables(value, title) {
  if (Array.isArray(value)) {
    if (value.length && value.every(isRecord)) {
      const keys = [];
      const seen = new Set();
      for (const o of value) {
        for (const k of Object.keys(o)) {
          if (!seen.has(k)) {
            seen.add(k);
            keys.push(k);
          }
        }
      }
      return [buildTable([keys, ...value.map((o) => keys.map((k) => o[k]))], { title, header: true })];
    }
    if (value.length && value.every(Array.isArray)) {
      return [buildTable(value, { title, header: "auto" })];
    }
    return [buildTable([["value"], ...value.map((v) => [v])], { title, header: true })];
  }

  if (isRecord(value)) {
    // Common wrapper shape: { "data": [ {...}, {...} ], "total": 2 }
    const lists = Object.entries(value).filter(
      ([, v]) => Array.isArray(v) && v.length && v.every(isRecord)
    );
    if (lists.length) {
      return lists.flatMap(([k, v]) =>
        jsonToTables(v, lists.length > 1 || title ? `${title} · ${k}` : k)
      );
    }
    return [buildTable([["key", "value"], ...Object.entries(value)], { title, header: true })];
  }

  return [buildTable([["value"], [value]], { title, header: true })];
}

// Returns { tables, warnings } or null if the text can't be read as JSON at all.
export function tablesFromJSON(text, title = "Data") {
  const parsed = parseJSONLoose(text);
  if (!parsed) return null;
  const warnings = parsed.repaired
    ? ["This JSON had small formatting problems (like trailing commas) that were fixed automatically."]
    : [];
  return { tables: jsonToTables(parsed.value, title), warnings };
}

// ---------- OCR output (Markdown and HTML tables) ----------

function parseHtmlTable(html) {
  const chunks = html.split(/<tr\b[^>]*>/i).slice(1);
  const spans = []; // spans[col] = { text, left } for cells carried down by rowspan
  const matrix = [];
  let firstRowHasTh = false;

  chunks.forEach((chunk, rowIndex) => {
    const row = [];
    let c = 0;
    const carry = () => {
      while (spans[c] && spans[c].left > 0) {
        row[c] = spans[c].text;
        spans[c].left--;
        c++;
      }
    };
    // Cells end at the next cell or row, so missing </td> tags don't break anything.
    const cellRe = /<t([dh])\b([^>]*)>([\s\S]*?)(?=<t[dh]\b|<\/tr|$)/gi;
    let m;
    while ((m = cellRe.exec(chunk))) {
      carry();
      if (m[1].toLowerCase() === "h" && rowIndex === 0) firstRowHasTh = true;
      const text = cleanOcrCell(m[3]);
      const colspan = Math.min(50, Math.max(1, parseInt(/colspan\s*=\s*["']?(\d+)/i.exec(m[2])?.[1] ?? "1", 10)));
      const rowspan = Math.min(200, Math.max(1, parseInt(/rowspan\s*=\s*["']?(\d+)/i.exec(m[2])?.[1] ?? "1", 10)));
      for (let k = 0; k < colspan; k++) {
        row[c] = k === 0 ? text : "";
        if (rowspan > 1) spans[c] = { text: k === 0 ? text : "", left: rowspan - 1 };
        c++;
      }
    }
    for (let k = c; k < spans.length; k++) {
      if (spans[k] && spans[k].left > 0) {
        row[k] = spans[k].text;
        spans[k].left--;
      }
    }
    matrix.push(Array.from(row, (v) => v ?? ""));
  });

  return { matrix, header: firstRowHasTh ? true : "auto" };
}

const isSeparator = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const isTableLine = (l) => l.includes("|") && l.trim().length > 1;

function splitMarkdownRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => cleanOcrCell(c.replace(/\\\|/g, "|")));
}

const stripMarkdown = (l) => l.replace(/^\s*#{1,6}\s+/, "").replace(/\*\*(.+?)\*\*/g, "$1").trim();

// Finds every table in a page of OCR text. Never returns an empty list: if no table is
// found, the recognised lines come back as a one-column "Text" table so nothing is lost.
export function tablesFromOcrText(text, title, { includeText = false } = {}) {
  const found = []; // { matrix, header } in the order they appear
  const work = String(text || "").replace(/<table[\s\S]*?(<\/table>|$)/gi, (m) => {
    found.push(parseHtmlTable(m));
    return `\n@@TABLE${found.length - 1}@@\n`;
  });

  const lines = work.split(/\r?\n/);
  const leftover = [];
  for (let i = 0; i < lines.length; ) {
    if (/^@@TABLE\d+@@$/.test(lines[i].trim())) {
      i++;
    } else if (isTableLine(lines[i])) {
      let j = i;
      while (j < lines.length && isTableLine(lines[j])) j++;
      const block = lines.slice(i, j);
      if (block.length >= 2) {
        const hasSep = isSeparator(block[1]);
        found.push({ matrix: block.filter((l) => !isSeparator(l)).map(splitMarkdownRow), header: hasSep ? true : "auto" });
      } else {
        leftover.push(stripMarkdown(block[0]));
      }
      i = j;
    } else {
      if (lines[i].trim()) leftover.push(stripMarkdown(lines[i]));
      i++;
    }
  }

  const tables = found.map((f, n) =>
    buildTable(f.matrix, { title: found.length > 1 ? `${title} · Table ${n + 1}` : title, header: f.header })
  );

  const textTable = (t) => buildTable([["Text"], ...leftover.map((l) => [l])], { title: t, header: true });

  if (tables.length === 0) {
    if (leftover.length === 0) return [];
    const t = textTable(title);
    t.warnings.unshift("No table was detected here, so the recognised text is shown line by line.");
    return [t];
  }
  if (includeText && leftover.length) tables.push(textTable(`${title} · Text`));
  return tables;
}

// ---------- export ----------

export function toCSV(columns, rows, delimiter = ",") {
  const esc = (v) => {
    let s = String(v ?? "");
    // Stop spreadsheet apps from running a cell as a formula (CSV injection).
    if (/^[=+\-@\t\r]/.test(s) && !isNumeric(s)) s = "'" + s;
    const needsQuotes = /["\n\r]/.test(s) || s.includes(delimiter) || s !== s.trim();
    return needsQuotes ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns, ...rows].map((r) => r.map(esc).join(delimiter)).join("\r\n");
}

// Array of objects keyed by column name. Plain numbers become numbers, blanks become null.
export function toJSON(columns, rows, infer = true) {
  const keys = makeColumns(columns, columns.length);
  const value = (s) => {
    if (s === "" || s === undefined) return null;
    return infer && isNumeric(s) && s.length <= 15 ? Number(s) : s;
  };
  return JSON.stringify(
    rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, value(r[i])]))),
    null,
    2
  );
}
