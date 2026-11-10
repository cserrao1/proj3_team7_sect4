import { createElement, useEffect, useState } from "react";
import { api } from "../lib/api";
import { buildChart } from "../lib/chartTree";

const MAX_POINTS = 60;

// { tag, attrs, children } -> React elements (React escapes every string)
function toReact(node, key) {
  if (typeof node === "string") return node;
  const { class: className, ...attrs } = node.attrs;
  return createElement(node.tag, { ...attrs, className, key }, ...node.children.map((c, i) => toReact(c, i)));
}

// Pick two columns of a table and chart them. The numbers come straight from the database,
// where they were stored as real numbers (and can be summed or averaged there).
export default function ChartPanel({ table, stamp }) {
  const types = table.columnTypes;
  const numeric = types.map((c, i) => (c.type === "number" ? i : -1)).filter((i) => i >= 0);
  const firstLabel = Math.max(0, types.findIndex((c) => c.type !== "number"));

  const [x, setX] = useState(firstLabel);
  const [y, setY] = useState(numeric.find((i) => i !== firstLabel) ?? numeric[0] ?? -1);
  const [agg, setAgg] = useState("none");
  const [kind, setKind] = useState("bar");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (y < 0) return;
    let live = true;
    api
      .get(`/api/tables/${table.id}/series?x=${x}&y=${y}&agg=${agg}`)
      .then((d) => {
        if (!live) return;
        setData(d);
        setError("");
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [table.id, x, y, agg, stamp]);

  if (y < 0) {
    return (
      <p className="users__note">
        No numeric columns were detected in this table, so there's nothing to chart. If numbers were read as
        text, fix them in the Data tab and they'll be picked up.
      </p>
    );
  }

  const shown = data ? data.points.slice(0, MAX_POINTS) : [];
  const caption = data ? `${data.yName} by ${data.xName}` : "";

  return (
    <div className="chart">
      <div className="docs__bar">
        <label className="docs__scan">
          Labels{" "}
          <select value={x} onChange={(e) => setX(Number(e.target.value))}>
            {table.columns.map((c, i) => <option key={i} value={i}>{c}</option>)}
          </select>
        </label>
        <label className="docs__scan">
          Values{" "}
          <select value={y} onChange={(e) => setY(Number(e.target.value))}>
            {numeric.map((i) => <option key={i} value={i}>{table.columns[i]}</option>)}
          </select>
        </label>
        <label className="docs__scan">
          Repeated labels{" "}
          <select value={agg} onChange={(e) => setAgg(e.target.value)}>
            <option value="none">Show each row</option>
            <option value="sum">Add them up</option>
            <option value="avg">Average them</option>
          </select>
        </label>
        <label className="docs__scan">
          Style{" "}
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="bar">Bars</option>
            <option value="line">Line</option>
          </select>
        </label>
      </div>

      {error && <p className="docs__warn">{error}</p>}
      {!error && data === null && <p className="users__note">Loading…</p>}
      {!error && data && shown.length === 0 && (
        <p className="users__note">None of the rows had a readable number in "{data.yName}".</p>
      )}
      {!error && shown.length > 0 && (
        <>
          <h3 className="chart__title">{caption}{data.agg !== "none" ? ` (${data.agg === "sum" ? "totals" : "averages"})` : ""}</h3>
          {toReact(buildChart(shown, { kind, unit: data.unit, title: caption }), "chart")}
          {data.points.length > MAX_POINTS && (
            <p className="users__note">Showing the first {MAX_POINTS} of {data.points.length} points.</p>
          )}
        </>
      )}
    </div>
  );
}
