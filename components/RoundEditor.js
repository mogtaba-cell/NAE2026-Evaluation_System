"use client";
import { useEffect, useState } from "react";
import { api, useMeta, useToast, Card, Badge, Banner, Btn, Field, Check, Switch, Modal } from "@/components/ui";

// Round settings: dates, who goes through, who evaluates, which automatic flags.
export default function RoundEditor({ r, p, onSaved }) {
  const toast = useToast(); const meta = useMeta();
  const [f, setF] = useState(null); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const [impact, setImpact] = useState(null); const [rcReason, setRcReason] = useState("");
  const init = () => setF({ ...r, rule: r.pass_rule?.min_score != null ? "score" : "grade", min: r.pass_rule?.min_score ?? 75, grades: r.pass_rule?.grades || ["A", "B"], identity: !!r.pass_rule?.identity, panelMode: r.evaluator_ids?.length ? "pick" : "all", panel: r.evaluator_ids || [] });
  useEffect(init, [r]); // eslint-disable-line
  if (!f) return null;
  const started = r.status !== "setup" || r.locked;
  const set = (k, v) => setF({ ...f, [k]: v });
  const evs = (meta?.data?.evaluators || []).filter(e => e.active && e.account_id);
  const inPath = evs.filter(e => (e.pathways || []).includes(r.pathway_code));
  const others = evs.filter(e => !(e.pathways || []).includes(r.pathway_code));
  const panelCount = f.panelMode === "all" ? inPath.length : f.panel.filter(id => evs.some(e => e.id === id)).length;
  const physicalSubs = r.round_no === 2 ? (p?.subs || []).filter(s => s.is_physical) : [];
  const ruleBad = f.rule === "score" ? !(Number.isInteger(Number(f.min)) && f.min >= 1 && f.min <= 100) : !f.grades.length || (f.grades.length === 3 && !f.identity);
  async function save() {
    setBusy(true); setErr(null);
    const pass_rule = f.rule === "score" ? { min_score: Number(f.min), ...(f.identity ? { identity: true } : {}) } : { grades: f.grades, ...(f.identity ? { identity: true } : {}) };
    try {
      const res = await api(`/api/rounds/${r.id}`, { method: "PATCH", body: { opens_on: f.opens_on || "", closes_on: f.closes_on || "", pass_rule, evaluators_per_entry: Number(f.evaluators_per_entry), flag_near: !!f.flag_near, flag_margin: Number(f.flag_margin), flag_line: f.flag_line, flag_spread: !!f.flag_spread, spread_limit: Number(f.spread_limit), flag_identity: !!f.flag_identity, review_hours: Number(f.review_hours), evaluator_ids: f.panelMode === "all" ? null : f.panel, reason } });
      toast("Round saved"); setReason(""); onSaved();
      if (res.impact > 0 || res.flagsChanged) setImpact(res);
    } catch (e) { setErr(e.message); } setBusy(false);
  }
  async function recompute() { setBusy(true); try { const x = await api(`/api/rounds/${r.id}`, { body: { action: "recompute", reason: rcReason } }); toast(x.note); setImpact(null); setRcReason(""); onSaved(); } catch (e) { toast(e.message, "err"); } setBusy(false); }
  const num = (k, w = 90) => <input className="input num" style={{ width: w }} inputMode="numeric" value={f[k] ?? ""} onChange={e => set(k, e.target.value.replace(/\D/g, "").slice(0, 3))} />;
  return <Card title={`Round ${r.round_no}`} sub={r.round_no === 1 ? "Online, scored from the submitted files" : physicalSubs.length ? `Online, except physical subpathways (${physicalSubs.map(s => s.name).join(", ")}), which are scored in the room` : "Online (no subpathway is set to Physical)"} right={<Badge tone={r.status === "open" ? "info" : r.status === "closed" ? "ok" : ""}>{r.status}{r.locked ? " · locked" : ""}</Badge>}>
    {err && <Banner tone="bad" title={err} />}
    <div className="grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
      <Field label="Opens"><input type="date" className="input" value={f.opens_on || ""} onChange={e => set("opens_on", e.target.value)} /></Field>
      <Field label="Closes" help="For planning; the round closes when an admin closes it" err={f.opens_on && f.closes_on && f.closes_on < f.opens_on}><input type="date" className="input" value={f.closes_on || ""} onChange={e => set("closes_on", e.target.value)} /></Field>
      <Field label="Evaluators per entry (online)">{num("evaluators_per_entry", 80)}</Field>
      <Field label="Management review time (hours)">{num("review_hours", 80)}</Field>
    </div>
    <Field label="Who goes through" help={ruleBad ? "Tick at least one grade (not all three), or set a minimum score from 1 to 100." : null} err={ruleBad}>
      <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
        <label className="check radio"><input type="radio" checked={f.rule === "score"} onChange={() => set("rule", "score")} /><span className="box" /><span>Score of at least</span></label>
        <input className="input num" style={{ width: 80 }} value={f.min} disabled={f.rule !== "score"} onChange={e => set("min", e.target.value.replace(/\D/g, "").slice(0, 3))} />
        <label className="check radio"><input type="radio" checked={f.rule === "grade"} onChange={() => set("rule", "grade")} /><span className="box" /><span>Grade</span></label>
        {["A", "B", "C"].map(g => <Check key={g} label={g} disabled={f.rule !== "grade"} checked={f.grades.includes(g)} onChange={v => set("grades", v ? [...f.grades, g].sort() : f.grades.filter(x => x !== g))} />)}
        <Check label="and national identity = yes" checked={f.identity} onChange={v => set("identity", v)} />
      </div>
    </Field>
    {f.identity && <p className="small faint" style={{ marginTop: -8 }}>Every rubric used in this round must ask the national identity question; opening is blocked otherwise. Grade lines come from each rubric.</p>}
    <Field label={`Round ${r.round_no} evaluator panel`} help={`${panelCount} evaluator${panelCount === 1 ? "" : "s"} with a login will get online entries. Each entry needs ${f.evaluators_per_entry || 2}.${r.round_no === 2 ? " Round 1 evaluators are only used for an entry they already judged when nobody else is free." : ""}`} err={panelCount < Number(f.evaluators_per_entry || 2)}>
      <div className="stack s8">
        <label className="check radio"><input type="radio" checked={f.panelMode === "all"} onChange={() => set("panelMode", "all")} /><span className="box" /><span>Everyone with a login in {p?.name || r.pathway_code} ({inPath.length})</span></label>
        <label className="check radio"><input type="radio" checked={f.panelMode === "pick"} onChange={() => set("panelMode", "pick")} /><span className="box" /><span>Choose the evaluators for this round</span></label>
        {f.panelMode === "pick" && <div className="stack s4" style={{ paddingLeft: 26 }}>
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>{inPath.map(e => <Check key={e.id} label={e.name} checked={f.panel.includes(e.id)} onChange={v => set("panel", v ? [...f.panel, e.id] : f.panel.filter(x => x !== e.id))} />)}{!inPath.length && <span className="muted small">No evaluators with a login in this pathway yet.</span>}</div>
          {others.length > 0 && <details><summary className="small faint" style={{ cursor: "pointer" }}>Evaluators from other pathways ({others.length})</summary><div className="row" style={{ gap: 12, flexWrap: "wrap", marginTop: 8 }}>{others.map(e => <Check key={e.id} label={e.name} checked={f.panel.includes(e.id)} onChange={v => set("panel", v ? [...f.panel, e.id] : f.panel.filter(x => x !== e.id))} />)}</div></details>}
        </div>}
      </div>
    </Field>
    <Field label="Automatic management review" help="Each check can be switched off for this round.">
      <div className="stack s8">
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><Switch checked={!!f.flag_near} onChange={v => set("flag_near", v)} label="When the team result is within" />{num("flag_margin", 64)}<span>points of the</span>
          <select className="select" style={{ width: 170 }} value={f.flag_line} disabled={!f.flag_near} onChange={e => set("flag_line", e.target.value)}><option value="pass">pass mark</option><option value="A">grade A line</option></select></div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><Switch checked={!!f.flag_spread} onChange={v => set("flag_spread", v)} label="When evaluators differ by more than" />{num("spread_limit", 64)}<span>points</span></div>
        <Switch checked={!!f.flag_identity} onChange={v => set("flag_identity", v)} label="When evaluators disagree on national identity" />
      </div>
    </Field>
    {started && <Field label="Reason for the change" help="This round has started, so changes are recorded in the audit log with the old values."><input className="input" value={reason} onChange={e => setReason(e.target.value)} /></Field>}
    <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}><Btn v="ghost" onClick={init}>Undo changes</Btn><Btn v="primary" busy={busy} disabled={(started && !reason.trim()) || ruleBad} onClick={save}>Save round</Btn></div>
    <Modal open={!!impact} title="Apply the new settings to decided results?" onClose={() => setImpact(null)} footer={<><Btn onClick={() => setImpact(null)}>Leave them</Btn><Btn v="primary" busy={busy} disabled={!rcReason.trim()} onClick={recompute}>Recalculate results</Btn></>}>
      <p>{impact?.impact > 0 ? `${impact.impact} result${impact.impact === 1 ? "" : "s"} already decided would change outcome under the new rule.` : ""}{impact?.flagsChanged ? " The flag settings changed too, which may send some decided results to management review." : ""}</p>
      <p className="muted">Recalculating updates every unlocked result in this round. Locked results (closed rounds) are left alone.</p>
      <Field label="Reason"><input className="input" value={rcReason} onChange={e => setRcReason(e.target.value)} /></Field>
    </Modal>
  </Card>;
}
