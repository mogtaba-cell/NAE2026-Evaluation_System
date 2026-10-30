"use client";
import { useState } from "react";
import { api, useMeta, useToast, PageHead, Card, Btn, Badge, Banner, Loading, Modal, Field, dshort, fmt, Table } from "@/components/ui";
import Readiness from "@/components/Readiness";

const ST = [["not_open", "Not open"], ["to_score", "To score"], ["in_progress", "In progress"], ["review", "In review"], ["through", "Shortlisted"], ["not_through", "Not shortlisted"], ["final", "Round 2 done"], ["not_scored", "Not scored"]];
const UNFINISHED = ["to_score", "in_progress", "review", "not_open"];

export default function Rounds() {
  const meta = useMeta(); const toast = useToast();
  const [act, setAct] = useState(null); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  if (!meta?.data) return <Loading error={meta?.error} />;
  const pws = meta.data.pathways;
  const today = new Date().toISOString().slice(0, 10);
  async function go(action = act.action) { setBusy(true); setErr(null); try { const r = await api(`/api/rounds/${act.r.id}`, { body: { action, reason } }); toast(r.note); setAct(action === "not_scored" ? { ...act, action: "close" } : null); setReason(""); meta.reload(); } catch (e) { setErr(e.message); } setBusy(false); }
  const unfinished = (p, r) => UNFINISHED.reduce((a, k) => a + (p.byStatus[`${r.round_no}:${k}`] || 0), 0);
  const rd = act?.r?.readiness;
  const label = { open: "Open", close: "Close", assign: "Rebalance", unlock: "Unlock" };
  return <>
    <PageHead title="Rounds and results" sub="Opening a round gives every waiting online artwork to the round's evaluator panel. When an artwork's scores are in, it moves on automatically: through, not through, or to management review. Results become final when the round is closed." />
    {pws.map(p => <Card key={p.code} title={p.name} sub={`${fmt(p.entries)} artworks · ${p.evaluators} evaluators with a login`} right={<Btn sm v="ghost" href={`/setup/${p.code}#rounds`}>Settings</Btn>}>
      <Table minw={940} cols={["Round", "Dates", "Pass rule", ...ST.map(([, l]) => ({ h: l, cls: "r" })), ""]} rows={p.rounds.map(r => [
        <div key="r" className="stack s4"><span className="strong">Round {r.round_no}</span><Badge tone={r.status === "open" ? "info" : r.status === "closed" ? "ok" : ""}>{r.status}{r.locked ? " · final" : ""}</Badge></div>,
        <span key="d" className="small">{r.opens_on ? `${dshort(r.opens_on)} to ${dshort(r.closes_on)}` : <span className="faint">Not set</span>}{r.status === "open" && r.closes_on && r.closes_on < today && <><br /><span style={{ color: "var(--warn)" }}>Past its closing date</span></>}</span>,
        <span key="p" className="small">{r.pass_rule?.min_score != null ? `≥ ${r.pass_rule.min_score}` : `Grade ${(r.pass_rule?.grades || []).join("/")}`}{r.pass_rule?.identity ? " + identity" : ""}</span>,
        ...ST.map(([k]) => { const n = p.byStatus[`${r.round_no}:${k}`] || 0; return n ? <a key={k} className="num link" href={`/entries?pathway=${p.code}&status=${r.round_no}:${k}`}>{n}</a> : <span key={k} className="faint">·</span>; }),
        <span key="a" className="row nowrap" style={{ gap: 4 }}>{r.status === "setup" && <Btn sm v={r.readiness?.ready ? "primary" : "secondary"} onClick={() => { setErr(null); setReason(""); setAct({ r, p, action: "open" }); }}>Open</Btn>}{r.status === "open" && <Btn sm v="ghost" title="Give missing evaluators to artworks and take artworks away from evaluators no longer on the panel" onClick={() => { setErr(null); setAct({ r, p, action: "assign" }); }}>Rebalance</Btn>}{r.status === "open" && <Btn sm onClick={() => { setErr(null); setReason(""); setAct({ r, p, action: "close" }); }}>Close</Btn>}{r.status === "closed" && <Btn sm v="ghost" onClick={() => { setErr(null); setReason(""); setAct({ r, p, action: "unlock" }); }}>Unlock</Btn>}</span>])} />
    </Card>)}
    <Modal open={!!act} wide={act?.action === "open"} title={act ? `${label[act.action]} ${act.p.name} Round ${act.r.round_no}?` : ""} onClose={() => setAct(null)} footer={act && <><Btn onClick={() => setAct(null)}>Cancel</Btn>
      {act.action === "open" && <Btn v="primary" busy={busy} disabled={!rd?.hardOk || (!rd?.ready && !reason.trim())} onClick={() => go()}>{rd?.ready ? "Open round" : "Open anyway"}</Btn>}
      {act.action === "close" && <Btn v="primary" busy={busy} disabled={unfinished(act.p, act.r) > 0} onClick={() => go()}>Close round</Btn>}
      {act.action === "assign" && <Btn v="primary" busy={busy} onClick={() => go()}>Rebalance</Btn>}
      {act.action === "unlock" && <Btn v="primary" busy={busy} disabled={!reason.trim()} onClick={() => go()}>Unlock</Btn>}</>}>
      {err && <Banner tone="bad" title={err} />}
      {act?.action === "open" && <>
        {rd && <Readiness checks={rd.checks} />}
        {rd && !rd.hardOk && <Banner tone="bad" title="This round can't open yet">Fix the items marked “Must fix” first.</Banner>}
        {rd && rd.hardOk && !rd.ready && <Field label="Reason to open anyway" help="Recorded in the audit log."><input className="input" value={reason} onChange={e => setReason(e.target.value)} /></Field>}
        <p className="muted">Online artworks waiting in Round {act.r.round_no} go to {act.r.evaluators_per_entry} evaluators each from the round's panel, balanced by workload.{act.r.round_no === 2 ? " Physical artworks go on the collection list instead." : ""}</p>
      </>}
      {act?.action === "assign" && <p>Artworks still being scored get any missing evaluators from the panel. Artworks held by evaluators who are no longer on the panel, were switched off or have no login (and haven't submitted) are moved to others, and the artworks are recalculated. Submitted scores are never touched.</p>}
      {act?.action === "close" && (unfinished(act.p, act.r) > 0 ? <>
        <Banner tone="warn" title={`${unfinished(act.p, act.r)} artworks are not finished`}>Score them (an admin can enter a missing score from the artwork page), reassign them, or mark them “not scored”. <a className="link" href={`/entries?pathway=${act.p.code}&status=${act.r.round_no}:in_progress`}>See unfinished artworks</a></Banner>
        <Field label="Mark every unfinished artwork as not scored" help="They stop here and are shown as not scored. Open reviews on them are closed."><input className="input" placeholder="Reason" value={reason} onChange={e => setReason(e.target.value)} /></Field>
        <Btn busy={busy} disabled={!reason.trim()} onClick={() => go("not_scored")}>Mark {unfinished(act.p, act.r)} as not scored</Btn>
      </> : <p>Every artwork is finished. Closing makes the results final and locked; admins can unlock one result or the whole round with a reason.</p>)}
      {act?.action === "unlock" && <><p className="muted">The round opens again and every result in it is unlocked. To fix one artwork, unlock just its result from the artwork page instead.</p><Field label="Reason (kept in the audit log)"><input className="input" value={reason} onChange={e => setReason(e.target.value)} /></Field></>}
    </Modal>
  </>;
}
