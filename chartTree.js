// Works out a bar or line chart as a plain tree of { tag, attrs, children }.
// ChartPanel turns the tree into React elements (which escape all text), so labels that came
// from a scanned PDF can never inject markup. Colours live in CSS (the chart__* classes).

const el = (tag, attrs = {}, ...children) => ({ tag, attrs, children: children.flat().filter((c) => c != null) });

function niceNum(range, round) {
  const exp = Math.floor(Math.log10(range));
  const f = range / 10 ** exp;
  const nf = round ? (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) : f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * 10 ** exp;
}

// Round-number axis steps that always include zero.
export function niceTicks(lo, hi, target = 5) {
  lo = Math.min(lo, 0);
  hi = Math.max(hi, 0);
  if (lo === hi) hi = lo + 1;
  const step = niceNum(niceNum(hi - lo, false) / (target - 1), true);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function formatValue(n, unit, short = false) {
  const body = (short ? compact : full).format(Math.abs(n));
  const sign = n < 0 ? "-" : "";
  if (unit === "%") return `${sign}${body}%`;
  return `${sign}${unit || ""}${body}`;
}

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function buildChart(points, { kind = "bar", unit = null, title = "Chart", width = 680, height = 320 } = {}) {
  const n = points.length;
  const rotate = n > 6;
  const m = { top: 16, right: 16, bottom: rotate ? 84 : 44, left: 62 };
  const plotW = width - m.left - m.right;
  const plotH = height - m.top - m.bottom;

  const ticks = niceTicks(Math.min(...points.map((p) => p.value)), Math.max(...points.map((p) => p.value)));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const y = (v) => m.top + plotH * (1 - (v - lo) / (hi - lo));
  const band = plotW / n;
  const cx = (i) => m.left + band * (i + 0.5);
  const tip = (p) => el("title", {}, `${p.label}: ${formatValue(p.value, unit)}`);

  const grid = ticks.flatMap((t) => [
    el("line", { class: t === 0 ? "chart__zero" : "chart__grid", x1: m.left, x2: m.left + plotW, y1: y(t), y2: y(t) }),
    el("text", { class: "chart__tick", x: m.left - 8, y: y(t), dy: "0.32em" }, formatValue(t, unit, true)),
  ]);

  let marks;
  if (kind === "line") {
    const pts = points.map((p, i) => `${cx(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
    marks = [
      n > 1 ? el("polyline", { class: "chart__line", points: pts }) : null,
      ...points.map((p, i) => el("circle", { class: "chart__dot", cx: cx(i), cy: y(p.value), r: 4 }, tip(p))),
    ];
  } else {
    const bw = Math.min(56, band * 0.72);
    marks = points.map((p, i) => {
      const top = Math.min(y(p.value), y(0));
      return el("rect", { class: "chart__bar", x: cx(i) - bw / 2, y: top, width: bw, height: Math.max(1, Math.abs(y(p.value) - y(0))) }, tip(p));
    });
  }

  const every = Math.max(1, Math.ceil(n / 24)); // never more than ~24 labels along the bottom
  const labels = points.flatMap((p, i) => {
    if (i % every) return [];
    const ly = m.top + plotH + (rotate ? 12 : 20);
    return [
      el(
        "text",
        { class: rotate ? "chart__xl chart__xl--rot" : "chart__xl", x: cx(i), y: ly, ...(rotate ? { transform: `rotate(-35 ${cx(i)} ${ly})` } : {}) },
        clip(p.label, 16)
      ),
    ];
  });

  return el("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": title }, el("title", {}, title), ...grid, ...marks, ...labels);
}
