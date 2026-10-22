"use client";
import { useEffect, useState } from "react";
import { api, useToast, Card, Badge, Banner, Btn, Field, Check } from "@/components/ui";

const MODES = [["online", "Online (from files)"], ["physical", "Physical (artwork in the room)"], ["mixed", "Mixed: physical subpathways in the room, the rest online"]];

export default function RoundEditor({ r, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(null); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  useEffect(() => { setF({ ...r, rule: r.pass_rule?.min_score != null ? "score" : "grade", min: r.pass_rule?.min_score ?? 75, grades: r.pass_rule?.grades || ["A", "B"], identity: !!r.pass_rule?.identity }); }, [r]);
  if (!f) return null;
  const started = r.status !== "setup" || r.locked;
  const set = (k, v) => setF({ ...f, [k]: v });
  async function save() {
    setBusy(true); setErr(null);
    const pass_rule = f.rule === "score" ? { min_score: Number(f.min) } : { grades: f.grades, ...(f.identity ? { identity: true } : {}) };
    try { await api(`/api/rounds/${r.id}`, { method: "PATCH", body: { opens_on: f.opens_on || "", closes_on: f.closes_on || "", mode: f.mode, pass_rule, evaluators_per_entry: Number(f.evaluators_per_entry), flag_margin: Number(f.flag_margin), spread_limit: Number(f.spread_limit), review_hours: Number(f.review_hours), reason } }); toast("Round saved"); setReason(""); onSaved(); }
    catch (e) { setErr(e.message); } setBusy(false);
  }
  return <Card title={`Round ${r.round_no}`} sub={r.name} right={<Badge tone={r.status === "open" ? "info" : r.status === "closed" ? "ok" : ""}>{r.status}{r.locked ? " · locked" : ""}</Badge>}>
    {err && <Banner tone="bad" title={err} />}
    <div className="grid g2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
      <Field label="Opens"><input type="date" className="input" value={f.opens_on || ""} onChange={e => set("opens_on", e.target.value)} /></Field>
      <Field label="Closes"><input type="date" className="input" value={f.closes_on || ""} onChange={e => set("closes_on", e.target.value)} /></Field>
      <Field label="How entries are judged"><select className="select" value={f.mode} onChange={e => set("mode", e.target.value)}>{MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Evaluators per entry"><input className="input" type="number" min="1" max="6" value={f.evaluators_per_entry} onChange={e => set("evaluators_per_entry", e.target.value)} /></Field>
    </div>
    <Field label="Who goes through">
      <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
        <label className="check radio"><input type="radio" checked={f.rule === "score"} onChange={() => set("rule", "score")} /><span className="box" /><span>Score of at least</span></label>
        <input className="input" style={{ width: 80 }} type="number" value={f.min} disabled={f.rule !== "score"} onChange={e => set("min", e.target.value)} />
        <label className="check radio"><input type="radio" checked={f.rule === "grade"} onChange={() => set("rule", "grade")} /><span className="box" /><span>Grade</span></label>
        {["A", "B", "C"].map(g => <Check key={g} label={g} disabled={f.rule !== "grade"} checked={f.grades.includes(g)} onChange={v => set("grades", v ? [...f.grades, g].sort() : f.grades.filter(x => x !== g))} />)}
        <Check label="and national identity = yes" disabled={f.rule !== "grade"} checked={f.identity} onChange={v => set("identity", v)} />
      </div>
    </Field>
    <div className="grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
      <Field label="Flag when within (points of pass mark)" help="Sent to management automatically"><input className="input" type="number" value={f.flag_margin} onChange={e => set("flag_margin", e.target.value)} /></Field>
      <Field label="Flag when evaluators differ by more than"><input className="input" type="number" value={f.spread_limit} onChange={e => set("spread_limit", e.target.value)} /></Field>
      <Field label="Review time (hours)"><input className="input" type="number" value={f.review_hours} onChange={e => set("review_hours", e.target.value)} /></Field>
    </div>
    {started && <Field label="Reason for the change" help="This round has started, so changes are recorded in the audit log."><input className="input" value={reason} onChange={e => setReason(e.target.value)} /></Field>}
    <div className="row" style={{ justifyContent: "flex-end" }}><Btn v="primary" busy={busy} disabled={started && !reason.trim()} onClick={save}>Save round</Btn></div>
  </Card>;
}

