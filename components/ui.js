"use client";
import { useEffect, useState, useCallback, useRef, createContext, useContext } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";

// ---------- data ----------
export async function api(url, opts = {}) {
  const init = { method: opts.method || (opts.body ? "POST" : "GET"), headers: {} };
  if (opts.body !== undefined) { init.headers["content-type"] = "application/json"; init.body = JSON.stringify(opts.body); }
  const r = await fetch(url, init);
  if (r.status === 401) { window.location.href = "/login"; throw new Error("Please sign in again."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}
export function useApi(url, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(async () => {
    if (!url) { setState({ data: null, error: null, loading: false }); return; }
    setState(s => ({ ...s, loading: true }));
    try { const d = await api(url); setState({ data: d, error: null, loading: false }); }
    catch (e) { setState({ data: null, error: e.message, loading: false }); }
  }, [url]);
  useEffect(() => { load(); }, [load, ...deps]);
  return { ...state, reload: load };
}
const MetaCtx = createContext(null);
export function MetaProvider({ children }) {
  const m = useApi("/api/meta");
  return <MetaCtx.Provider value={m}>{children}</MetaCtx.Provider>;
}
export const useMeta = () => useContext(MetaCtx);

// ---------- toast ----------
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [list, setList] = useState([]);
  const push = useCallback((msg, kind = "") => { const id = Math.random(); setList(l => [...l, { id, msg, kind }]); setTimeout(() => setList(l => l.filter(x => x.id !== id)), kind === "err" ? 6000 : 3200); }, []);
  return <ToastCtx.Provider value={push}>{children}<div className="toast-wrap" role="status">{list.map(t => <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>)}</div></ToastCtx.Provider>;
}
export const useToast = () => useContext(ToastCtx);

// ---------- primitives ----------
export function Btn({ children, v = "secondary", sm, href, onClick, disabled, type = "button", title, className = "", busy, ...rest }) {
  const cls = `btn ${v}${sm ? " sm" : ""}${!children ? " icon" : ""} ${className}`;
  if (href && !disabled) return <Link className={cls} href={href} title={title} {...rest}>{children}</Link>;
  return <button type={type} className={cls} onClick={onClick} disabled={disabled || busy} title={title} aria-label={!children ? title : undefined} {...rest}>{busy ? "Working…" : children}</button>;
}
export const Badge = ({ children, tone = "" }) => <span className={`badge ${tone}`}>{children}</span>;
export const Dot = ({ tone = "" }) => <span className={`dot ${tone}`} />;
export function Card({ title, sub, right, children, flush, className = "", id }) {
  return <section className={`card${flush ? " flush" : ""} ${className}`} id={id}>{title || right ? <div className="card-h"><div className="tt">{title && <h3>{title}</h3>}{sub && <span className="sub">{sub}</span>}</div>{right}</div> : null}{children}</section>;
}
export function PageHead({ title, sub, actions, back, badges }) {
  return <div className="stack s8">{back && <Link className="crumb" href={back[1]}>{back[0]}</Link>}<div className="ph"><div className="t"><div className="titlerow"><h1>{title}</h1>{badges}</div>{sub && <p className="sub">{sub}</p>}</div>{actions && <div className="acts">{actions}</div>}</div></div>;
}
export function Kpis({ items }) {
  return <div className="strip">{items.map((k, i) => <div key={i} className={`cell${k[3] === "badv" ? " bad" : ""}`}><span className="lb">{k[0]}</span><span className="v">{k[1]}</span>{k[2] && <span className={`d ${k[3] === "badv" ? "bad" : k[3] || ""}`}>{k[2]}</span>}</div>)}</div>;
}
export function Tabs({ items, value, onChange }) {
  return <div className="tabs" role="tablist">{items.map(([k, l, n]) => <button key={k} type="button" role="tab" className={k === value ? "on" : ""} onClick={() => onChange(k)}>{l}{n !== undefined && n !== null && <span className="n">{n}</span>}</button>)}</div>;
}
export function Seg({ items, value, onChange }) {
  return <div><div className="seg">{items.map(([k, l]) => <button key={k} type="button" className={k === value ? "on" : ""} onClick={() => onChange(k)}>{l}</button>)}</div></div>;
}
export function Chips({ items, value, onChange }) {
  return <div className="row" style={{ gap: 8 }}>{items.map(([k, l, n]) => <button key={k} type="button" className={`chip ${k === value ? "on" : ""}`} onClick={() => onChange(k)}>{l}{n !== undefined && <span className="n"> {n}</span>}</button>)}</div>;
}
export function Prog({ pct, tone = "", label }) {
  return <div className="row nowrap" style={{ gap: 8, minWidth: 120, flex: 1 }}><div className={`prog-bar ${tone}`}><i style={{ width: `${Math.max(0, Math.min(100, pct || 0))}%` }} /></div>{label !== false && <span className="small faint num" style={{ minWidth: 34, textAlign: "right" }}>{label ?? `${Math.round(pct || 0)}%`}</span>}</div>;
}
export function Banner({ tone = "", title, children, action }) {
  return <div className={`banner ${tone}`}><div className="bt"><b>{title}</b>{children && <span>{children}</span>}</div>{action}</div>;
}
export function Empty({ title, children, action }) {
  return <div className="empty"><b className="strong">{title}</b>{children && <span className="small">{children}</span>}{action}</div>;
}
export function Loading({ error, text = "Loading…" }) {
  return error ? <Banner tone="bad" title="Could not load this page">{error}</Banner> : <div className="loading">{text}</div>;
}
export const initials = n => String(n || "?").replace(/^Dr\.\s*/, "").split(/\s+/).filter(w => !/^(al|bin)$/i.test(w)).map(w => w[0]).join("").slice(0, 2).toUpperCase();
export function Av({ name, size = "" }) { const c = ["", "c2", "c3", "c4", "c5"][[...String(name || "")].reduce((a, x) => a + x.charCodeAt(0), 0) % 5]; return <span className={`av ${size} ${c}`} title={name}>{initials(name)}</span>; }
export function Person({ name, sub }) { return <div className="cellp"><Av name={name} /><div style={{ minWidth: 0 }}><b>{name}</b>{sub && <span>{sub}</span>}</div></div>; }
export function Two({ a, b, wrap }) { return <div className="stack s4" style={{ minWidth: 0 }}><span className="strong" style={wrap ? {} : { whiteSpace: "nowrap" }}>{a}</span>{b && <span className="small faint" style={wrap ? {} : { whiteSpace: "nowrap" }}>{b}</span>}</div>; }
export function Field({ label, help, err, children }) { return <div className="field"><label>{label}</label>{children}{help && <span className={`help${err ? " err" : ""}`}>{help}</span>}</div>; }
export function Check({ label, checked, onChange, disabled }) {
  return <label className="check"><input type="checkbox" checked={!!checked} disabled={disabled} onChange={e => onChange && onChange(e.target.checked)} /><span className="box"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>{label && <span>{label}</span>}</label>;
}
export function Radio({ name, label, checked, onChange }) {
  return <label className="check radio"><input type="radio" name={name} checked={!!checked} onChange={() => onChange && onChange()} /><span className="box" />{label && <span>{label}</span>}</label>;
}
export function Switch({ checked, onChange, label }) {
  return <label className="switch"><input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} /><span className="tr" />{label && <span>{label}</span>}</label>;
}
export function Table({ cols, rows, onRow, minw, empty = "Nothing here", sel, footer }) {
  return <div className="tw"><table className="t" style={minw ? { minWidth: minw } : undefined}><thead><tr>{cols.map((c, i) => { const C = typeof c === "string" ? { h: c } : c; return <th key={i} className={C.cls || ""}>{C.h}</th>; })}</tr></thead>
    <tbody>{rows.length ? rows.map((r, i) => <tr key={i} className={`${onRow ? "clickable" : ""}${sel === i ? " selrow" : ""}`} onClick={onRow ? () => onRow(i) : undefined}>{r.map((cell, j) => { const C = typeof cols[j] === "string" ? {} : cols[j] || {}; return <td key={j} className={C.cls || ""}>{cell}</td>; })}</tr>) : <tr><td colSpan={cols.length} style={{ textAlign: "center", color: "var(--ink3)", height: 72 }}>{empty}</td></tr>}</tbody></table>{footer}</div>;
}
export function Pager({ page, per, count, onPage }) {
  const from = count ? page * per + 1 : 0, to = Math.min(count, (page + 1) * per);
  return <div className="pager"><span>{from} to {to} of {count.toLocaleString("en-US")}</span><span className="row" style={{ gap: 6 }}><Btn sm title="Previous page" disabled={page === 0} onClick={() => onPage(page - 1)}>‹</Btn><Btn sm title="Next page" disabled={to >= count} onClick={() => onPage(page + 1)}>›</Btn></span></div>;
}
export function Modal({ open, title, sub, onClose, children, footer, wide }) {
  const ref = useRef(null);
  // Keep the latest onClose without re-running the effect: pages pass a new function on every render,
  // and re-running it on each keystroke used to pull the cursor out of the field being typed in.
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const k = e => { if (e.key === "Escape") closeRef.current?.(); };
    document.addEventListener("keydown", k);
    // Focus the dialog once when it opens, unless a field inside it already has the cursor (autoFocus).
    if (ref.current && !ref.current.contains(document.activeElement)) ref.current.focus();
    return () => document.removeEventListener("keydown", k);
  }, [open]);
  if (!open) return null;
  // Rendered on <body> so a sticky or blurred parent (like the top bar) can't trap the fixed-position overlay.
  const node = <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className={`modal ${wide ? "w720" : ""}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} style={{ outline: "none" }}>
    <div className="mh"><div className="tt"><h2>{title}</h2>{sub && <p className="sub">{sub}</p>}</div><Btn v="ghost" title="Close" onClick={onClose}>×</Btn></div>
    <div className="mb">{children}</div>{footer && <div className="mf">{footer}</div>}</div></div>;
  return typeof document === "undefined" ? node : createPortal(node, document.body);
}
export const Search = ({ value, onChange, placeholder, onEnter, autoFocus }) => <div className="search" style={{ flex: 1, minWidth: 220 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="faint"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg><input className="input" value={value} placeholder={placeholder} aria-label={placeholder} autoFocus={autoFocus} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && onEnter) onEnter(e.target.value); }} /></div>;

// ---------- formatting ----------
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmt = n => (n == null ? "" : Number(n).toLocaleString("en-US"));
export function when(iso) {
  if (!iso) return ""; const d = new Date(iso); const now = new Date();
  const t = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" });
  const day = x => x.toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
  if (day(d) === day(now)) return `Today ${t}`;
  const y = new Date(now.getTime() - 864e5); if (day(d) === day(y)) return `Yesterday ${t}`;
  const [Y, M, D] = day(d).split("-");
  return `${+D} ${MON[+M - 1]}${Y !== day(now).slice(0, 4) ? " " + Y : ""}, ${t}`;
}
export function dshort(dateStr) { if (!dateStr) return ""; const [Y, M, D] = String(dateStr).slice(0, 10).split("-"); return `${+D} ${MON[+M - 1]}`; }
export function dueTxt(due) { const h = Math.round((Date.parse(due) - Date.now()) / 36e5); return h < 0 ? [`Overdue by ${-h} h`, "bad"] : h < 12 ? [`Due in ${h} h`, "warn"] : [`Due in ${h} h`, ""]; }
export const STATUS = {
  not_open: ["Round not open", ""], to_score: ["To score", ""], in_progress: ["In progress", "info"], review: ["Needs review", "warn"],
  through: ["Through", "ok"], not_through: ["Not through", ""], final: ["Round 2 done", "ok"], withdrawn: ["Withdrawn", "bad"], not_scored: ["Not scored", "bad"]
};
export function statusBadge(e) {
  if (e.current_round === 2 && e.status === "not_open") return <Badge tone="ok">Through · Round 2 not open</Badge>;
  if (e.status === "final") { const r2 = (e.results || []).find(r => r.round_no === 2); if (r2 && r2.passed != null) return <Badge tone={r2.passed ? "ok" : ""}>{r2.passed ? (r2.grade === "A" ? "Passed Round 2 · grade A" : "Passed Round 2") : "Did not pass Round 2"}</Badge>; }
  const s = STATUS[e.status] || [e.status, ""];
  return <Badge tone={s[1]}>{e.current_round === 2 && !["final", "withdrawn", "not_scored"].includes(e.status) ? `Round 2 · ${s[0].toLowerCase()}` : s[0]}</Badge>;
}
// grade from the rubric's grade lines (default A 80, B 50)
export const gradeOf = (t, bands) => { const b = [...(bands || [{ grade: "A", min: 80 }, { grade: "B", min: 50 }, { grade: "C", min: 0 }])].sort((x, y) => y.min - x.min).find(x => t >= x.min); return b ? b.grade : ""; };
export function Art({ seed = 0, w = 40, h = 40 }) { return <div className={`art a${Math.abs(seed) % 6}`} style={{ width: w, height: h, maxWidth: "100%" }} role="img" aria-label="Entry" />; }
export const seedOf = s => [...String(s || "")].reduce((a, c) => a + c.charCodeAt(0), 0);
export function EntryCell({ e, sub }) {
  return <div className="cellp">{e.thumb ? <img src={e.thumb} alt="" width="40" height="40" style={{ borderRadius: 6, objectFit: "cover" }} /> : <Art seed={seedOf(e.code)} />}<div style={{ minWidth: 0 }}><b className="code">{e.code}</b><span style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{sub ?? e.title_en ?? "Untitled"}</span></div></div>;
}
export async function download(url) {
  const r = await fetch(url); if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || "Export failed"); }
  const blob = await r.blob(); const cd = r.headers.get("content-disposition") || ""; const m = cd.match(/filename="?([^"]+)"?/);
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = m ? m[1] : "export.xlsx"; document.body.appendChild(a); a.click(); a.remove();
}
