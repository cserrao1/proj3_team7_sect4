// Turns the text a scanner read ("$1,299.50", "12%", "Mar 5, 2024") into real numbers and
// dates so a table can be charted. Pure functions, no database or network.

const CURRENCY = "$€£¥";

// -> { value, unit } or null. Understands $1,299.50  (1,200)  -5  12%  1.234,50  1 234.5
// Leading zeros (007, 00123) are treated as IDs, not quantities, and stay text.
export function parseNumber(input) {
  let s = String(input ?? "").replace(/[\u00a0\u202f\s]+/g, " ").trim();
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/^[−–]/, "-");
  if (s.startsWith("-")) { negative = true; s = s.slice(1).trim(); }
  else if (s.startsWith("+")) s = s.slice(1).trim();

  let unit = "";
  if (CURRENCY.includes(s[0] || "?")) { unit = s[0]; s = s.slice(1).trim(); }
  if (s.startsWith("-")) { negative = true; s = s.slice(1).trim(); }
  if (s.endsWith("%")) { unit = "%"; s = s.slice(0, -1).trim(); }
  else if (CURRENCY.includes(s[s.length - 1] || "?")) { unit = s[s.length - 1]; s = s.slice(0, -1).trim(); }
  if (!s) return null;

  let body;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) body = s.replace(/,/g, "");                       // 1,234.50
  else if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) body = s.replace(/\./g, "").replace(",", ".");  // 1.234,50
  else if (/^\d{1,3}( \d{3})+(\.\d+)?$/.test(s)) body = s.replace(/ /g, "");                  // 1 234.50
  else if (/^\d+,\d{1,2}$/.test(s)) body = s.replace(",", ".");                                // 12,5
  else if (/^(\d+(\.\d+)?|\.\d+)$/.test(s)) body = s;
  else return null;

  if (/^0\d/.test(body)) return null;
  if (body.replace(/\D/g, "").length > 17) return null;
  const n = Number(body);
  if (!Number.isFinite(n)) return null;
  return { value: negative ? -n : n, unit };
}

const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
const monthIndex = (name) => MONTHS.indexOf(name.slice(0, 3).toLowerCase());

function validDate(y, m, d) {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// -> "YYYY-MM-DD" or null. Slash dates are read US-style (month first) unless that's impossible.
export function parseDate(input) {
  const s = String(input ?? "").trim();
  if (!s) return null;
  let m;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s))) return validDate(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s))) {
    let a = +m[1], b = +m[2], y = +m[3];
    if (m[3].length === 2) y += y < 70 ? 2000 : 1900;
    return a > 12 && b <= 12 ? validDate(y, b, a) : validDate(y, a, b);
  }
  if ((m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(s)) && monthIndex(m[1]) >= 0) {
    return validDate(+m[3], monthIndex(m[1]) + 1, +m[2]);
  }
  if ((m = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(s)) && monthIndex(m[2]) >= 0) {
    return validDate(+m[3], monthIndex(m[2]) + 1, +m[1]);
  }
  return null;
}

const cleanCell = (v) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 2000);
const MOSTLY = 0.8; // a few unreadable cells (OCR slips) shouldn't stop a column counting as numeric
// "No value here" markers: they don't count for or against a column's type.
const PLACEHOLDER = /^(n\/?a|null|none|nil|tbd|\?+|[-–—_.]+)$/i;

// A column is "mostly" a type if 80% of its cells are, or if at least 3 are and only one isn't
// (small tables: one misread cell must not hide the column from charts).
const mostly = (hits, total) => total > 0 && (hits / total >= MOSTLY || (hits >= 3 && total - hits <= 1));

// Input:  { title, columns: [names], rows: [[text]], warnings }
// Output: columns get a type; every cell gets { text, num, date } (num/date null when not applicable)
export function formatTable({ title, columns, rows, warnings = [] }) {
  const width = columns.length;
  const grid = rows.map((r) => Array.from({ length: width }, (_, c) => cleanCell(r?.[c])));

  const cols = columns.map((rawName, c) => {
    const name = cleanCell(rawName).slice(0, 255) || `Column ${c + 1}`;
    const filled = grid.map((r) => r[c]).filter((t) => t !== "" && !PLACEHOLDER.test(t));
    if (filled.length === 0) return { name, type: "text", unit: null };

    const nums = filled.map(parseNumber).filter(Boolean);
    if (mostly(nums.length, filled.length)) {
      const counts = {};
      for (const n of nums) if (n.unit) counts[n.unit] = (counts[n.unit] || 0) + 1;
      const [top, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [null, 0];
      return { name, type: "number", unit: top && n / nums.length >= 0.5 ? top : null };
    }
    const dates = filled.filter((t) => parseDate(t)).length;
    if (mostly(dates, filled.length)) return { name, type: "date", unit: null };
    return { name, type: "text", unit: null };
  });

  const cells = grid.map((r) =>
    r.map((text, c) => ({
      text,
      num: cols[c].type === "number" ? parseNumber(text)?.value ?? null : null,
      date: cols[c].type === "date" ? parseDate(text) : null,
    }))
  );
  return { title, warnings, columns: cols, rows: cells };
}
