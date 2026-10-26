"use client";
// Small chart kit for the insights pages. One brand hue (deep teal) for magnitude; grades use a light-to-dark
// ramp of the same hue (C light, A dark). Every chart has a hover/focus tooltip and a table view.
import { useRef, useState } from "react";
import { Card, Seg, fmt } from "@/components/ui";

export const RAMP = { A: "#1C3E3B", B: "#5E8A80", C: "#B2C7C0" };
const BAR = "#1C3E3B";

function useTip() {
  const box = useRef(null); const [tip, setTip] = useState(null);
  const show = (ev, lines) => { const r = box.current?.getBoundingClientRect(); if (!r) return; const p = ev.touches?.[0] || ev; const x = (p.clientX ?? (ev.currentTarget.getBoundingClientRect().left + 10)) - r.left, y = (p.clientY ?? ev.currentTarget.getBoundingClientRect().top) - r.top; setTip({ x: Math.min(Math.max(x, 70), r.width - 70), y, lines }); };
  const el = tip ? <div className="ch-tip" style={{ left: tip.x, top: tip.y }}>{tip.lines.map((l, i) => <div key={i} className="r">{l.key && <i style={{ background: l.key }} />}<b>{l.v}</b><span>{l.t}</span></div>)}</div> : null;
  return { box, show, hide: () => setTip(null), el };
}
const hov = (t, lines) => ({ onPointerMove: e => t.show(e, lines), onPointerLeave: t.hide, onFocus: e => t.show(e, lines), onBlur: t.hide, tabIndex: 0 });

// A card that switches between the chart and a plain table of the same numbers.
export function ChartCard({ title, sub, table, children, right }) {
  const [v, setV] = useState("chart");
  return <Card title={title} sub={sub} right={<div className="row nowrap" style={{ gap: 8 }}>{right}{table && <Seg value={v} onChange={setV} items={[["chart", "Chart"], ["table", "Table"]]} />}</div>}>
    {v === "chart" || !table ? children : <div className="tw"><table className="tbl ch-table"><thead><tr>{table.cols.map((c, i) => <th key={i} className={i ? "r" : ""}>{c}</th>)}</tr></thead><tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j ? "r num" : ""}>{c}</td>)}</tr>)}</tbody></table></div>}
  </Card>;
}

// Horizontal bars: label, bar, value. sub(row) adds a muted note after the value (e.g. a percentage).
export function HBars({ rows, sub, max, empty = "No data yet." }) {
  const t = useTip(); const m = max || Math.max(1, ...rows.map(r => r.n));
  if (!rows.length) return <p className="muted">{empty}</p>;
  return <div className="ch-hbars" ref={t.box}>{rows.map(r => <div key={r.label} className="ch-hrow" {...hov(t, [{ v: fmt(r.n), t: r.label + (sub ? ` · ${sub(r)}` : "") }])}>
    <span className="lb" title={r.label}>{r.label}</span>
    <span className="tr"><span className="b" style={{ width: `${(r.n / m) * 100}%`, background: r.color || BAR }} /></span>
    <span className="v">{fmt(r.n)}{sub && <em>{sub(r)}</em>}</span></div>)}{t.el}</div>;
}

// One horizontal stacked bar per row (grades A/B/C). 2px gaps between segments; labels inside when they fit.
export function StackBars({ rows, keys = ["A", "B", "C"], colors = RAMP, names = { A: "Grade A", B: "Grade B", C: "Grade C" } }) {
  const t = useTip();
  const tot = r => keys.reduce((a, k) => a + (r[k] || 0), 0);
  if (!rows.some(tot)) return <p className="muted">No completed results yet.</p>;
  return <div ref={t.box} className="ch-stack">
    <div className="ch-legend">{keys.map(k => <span key={k}><i style={{ background: colors[k] }} />{names[k]}</span>)}</div>
    {rows.map(r => { const n = tot(r); return <div key={r.label} className="ch-hrow">
      <span className="lb" title={r.label}>{r.label}</span>
      <span className="tr seg">{n ? keys.map(k => r[k] ? <span key={k} className="s" style={{ flexGrow: r[k], background: colors[k], color: k === "C" ? "var(--ink)" : "#fff" }} {...hov(t, [{ key: colors[k], v: `${fmt(r[k])} (${Math.round(r[k] / n * 100)}%)`, t: `${names[k]} · ${r.label}` }])}>{r[k] / n > 0.12 ? r[k] : ""}</span> : null) : <span className="faint small" style={{ paddingLeft: 4 }}>No results yet</span>}</span>
      <span className="v">{n ? fmt(n) : ""}</span></div>; })}
    {t.el}
  </div>;
}

// Vertical bars over fixed bins (score distribution). mark: a vertical reference line at a value (e.g. a pass mark).
export function Histogram({ bins, labels, mark }) {
  const t = useTip(); const m = Math.max(1, ...bins); const total = bins.reduce((a, b) => a + b, 0);
  if (!total) return <p className="muted">No completed results yet.</p>;
  return <div ref={t.box} className="ch-hist">
    <div className="cols">{bins.map((n, i) => <div key={i} className="c" {...hov(t, [{ v: fmt(n), t: `Team result ${labels[i]}` }])}>
      <span className="n">{n || ""}</span><span className="b" style={{ height: `${(n / m) * 100}%` }} /></div>)}
      {mark != null && <span className="mk" style={{ left: `${mark}%` }}><em>{mark}</em></span>}</div>
    <div className="xs">{labels.map((l, i) => <span key={i}>{l}</span>)}</div>
    {t.el}
  </div>;
}

// A single-series line over days, with a crosshair that snaps to the nearest day.
export function DayLine({ points }) {
  const t = useTip(); const [hi, setHi] = useState(null);
  const W = 600, H = 160, P = 6; const m = Math.max(1, ...points.map(p => p.n));
  const x = i => P + (i * (W - 2 * P)) / Math.max(1, points.length - 1), y = n => H - P - (n / m) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.n).toFixed(1)}`).join(" ");
  const lab = s => { const [, mo, da] = s.split("-"); return `${+da} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+mo - 1]}`; };
  function move(e) { const r = e.currentTarget.getBoundingClientRect(); const i = Math.round(((e.clientX - r.left) / r.width) * (points.length - 1)); const k = Math.max(0, Math.min(points.length - 1, i)); setHi(k); t.show(e, [{ key: BAR, v: fmt(points[k].n), t: `scores · ${lab(points[k].day)}` }]); }
  return <div ref={t.box} className="ch-line">
    <div className="ch-ymax">{fmt(m)}</div>
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onPointerMove={move} onPointerLeave={() => { setHi(null); t.hide(); }} role="img" aria-label="Scores submitted per day">
      <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="var(--rule)" vectorEffect="non-scaling-stroke" />
      <path d={`${d} L${x(points.length - 1)},${H - P} L${x(0)},${H - P} Z`} fill="#1C3E3B" opacity=".08" />
      <path d={d} fill="none" stroke={BAR} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {hi != null && <line x1={x(hi)} x2={x(hi)} y1={P} y2={H - P} stroke="var(--ink3)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
    </svg>
    {hi != null && <span className="dot" style={{ left: `${(x(hi) / W) * 100}%`, top: `${(y(points[hi].n) / H) * 100}%` }} />}
    <div className="xs"><span>{lab(points[0].day)}</span><span>{lab(points[Math.floor(points.length / 2)].day)}</span><span>{lab(points[points.length - 1].day)}</span></div>
    {t.el}
  </div>;
}

// Stages of a pathway (entries → scored → through → …), each as a share of the first stage.
export function Funnel({ stages }) {
  const first = stages[0]?.[1] || 0;
  return <HBars rows={stages.map(([label, n]) => ({ label, n }))} max={Math.max(1, first)} sub={r => first ? `${Math.round(r.n / first * 100)}%` : ""} />;
}
