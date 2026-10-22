"use client";
import { useState } from "react";
import { api, useMeta, useToast, PageHead, Card, Btn, Badge, Banner, Loading, Modal, Field, dshort, fmt, Table } from "@/components/ui";

const ST = [["not_open", "Not open"], ["to_score", "To score"], ["in_progress", "In progress"], ["review", "In review"], ["through", "Through"], ["not_through", "Not through"], ["final", "Final"]];

export default function Rounds() {
  const meta = useMeta(); const toast = useToast();
  const [act, setAct] = useState(null); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  if (!meta?.data) return <Loading error={meta?.error} />;
  const pws = meta.data.pathways;
  async function go() { setBusy(true); setErr(null); try { const r = await api(`/api/rounds/${act.r.id}`, { body: { action: act.action, reason } }); toast(r.note); setAct(null); setReason(""); meta.reload(); } catch (e) { setErr(e.message); } setBusy(false); }
  return <>
    <PageHead title="Rounds and results" sub="Opening a round assigns every waiting entry to evaluators. When an entry's scores are in, it moves on automatically: through to Round 2, not through, or to management review when it is close to the pass mark or evaluators disagree." />
    {pws.map(p => <Card key={p.code} title={p.name} sub={`${fmt(p.entries)} entries · ${p.evaluators} evaluators`} right={<Btn sm v="ghost" href={`/setup/${p.code}#rounds`}>Settings</Btn>}>
      <Table minw={860} cols={["Round", "Dates", "Pass rule", ...ST.map(([, l]) => ({ h: l, cls: "r" })), ""]} rows={p.rounds.map(r => [
        <div key="r" className="stack s4"><span className="strong">Round {r.round_no}</span><Badge tone={r.status === "open" ? "info" : r.status === "closed" ? "ok" : ""}>{r.status}{r.locked ? " · locked" : ""} · {r.mode}</Badge></div>,
        <span key="d" className="small">{r.opens_on ? `${dshort(r.opens_on)} to ${dshort(r.closes_on)}` : <span className="faint">Not set</span>}</span>,
        <span key="p" className="small">{r.pass_rule?.min_score != null ? `≥ ${r.pass_rule.min_score}` : `Grade ${(r.pass_rule?.grades || []).join("/")}${r.pass_rule?.identity ? " + identity" : ""}`}</span>,
        ...ST.map(([k]) => { const n = p.byStatus[`${r.round_no}:${k}`] || 0; return n ? <a key={k} className="num link" href={`/entries?pathway=${p.code}&status=${r.round_no}:${k}`}>{n}</a> : <span key={k} className="faint">·</span>; }),
        <span key="a" className="row nowrap" style={{ gap: 4 }}>{r.status === "setup" && <Btn sm v="primary" onClick={() => { setErr(null); setAct({ r, p, action: "open" }); }}>Open</Btn>}{r.status === "open" && <Btn sm v="ghost" title="Assign entries to evaluators added since the round opened" onClick={() => { setErr(null); setAct({ r, p, action: "assign" }); }}>Rebalance</Btn>}{r.status === "open" && <Btn sm onClick={() => { setErr(null); setAct({ r, p, action: "close" }); }}>Close</Btn>}{r.status === "closed" && <Btn sm v="ghost" onClick={() => { setErr(null); setAct({ r, p, action: "unlock" }); }}>Unlock</Btn>}</span>])} />
    </Card>)}
    <Modal open={!!act} title={act ? `${act.action === "open" ? "Open" : act.action === "close" ? "Close" : act.action === "assign" ? "Rebalance" : "Unlock"} ${act.p.name} Round ${act.r.round_no}?` : ""} onClose={() => setAct(null)} footer={<><Btn onClick={() => setAct(null)}>Cancel</Btn><Btn v="primary" busy={busy} disabled={act?.action === "unlock" && !reason.trim()} onClick={go}>{act?.action === "open" ? "Open round" : act?.action === "close" ? "Close round" : act?.action === "assign" ? "Rebalance" : "Unlock"}</Btn></>}>
      {err && <Banner tone="bad" title={err} />}
      {act?.action === "open" && <p>Entries waiting in Round {act.r.round_no} are assigned to {act.r.evaluators_per_entry} evaluators each, balanced by workload. Evaluators see them in their queue right away.</p>}
      {act?.action === "assign" && <p>Entries still being scored get any missing evaluators. Assignments held by evaluators who were switched off or have no login (and haven't scored yet) are moved to others. Submitted scores are never touched.</p>}
      {act?.action === "close" && <><p>Results are locked. Admins can still unlock with a reason.</p><Field label="Reason (needed if entries are unfinished)"><input className="input" value={reason} onChange={e => setReason(e.target.value)} /></Field></>}
      {act?.action === "unlock" && <Field label="Reason (kept in the audit log)"><input className="input" value={reason} onChange={e => setReason(e.target.value)} /></Field>}
    </Modal>
  </>;
}
