"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, useApi, useMeta, useToast, PageHead, Card, Table, Btn, Badge, Banner, Loading, Modal, Field, Check, Two, Prog, dshort } from "@/components/ui";

export default function Sessions() {
  const d = useApi("/api/sessions"); const meta = useMeta(); const toast = useToast(); const router = useRouter();
  const [f, setF] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  if (!d.data) return <Loading error={d.error} />;
  const x = d.data; const me = meta?.data?.me;
  const canCreate = ["admin", "coordinator"].includes(me?.role);
  const rd = x.rounds.find(r => r.id === f?.round_id);
  const evs = (meta?.data?.evaluators || []).filter(e => !rd || (e.pathways || []).includes(rd.pathway_code));
  async function create() { setBusy(true); setErr(null); try { const r = await api("/api/sessions", { body: f }); toast(`Session created with ${r.count} entries. The storage team has the pull list.`); router.push(`/sessions/${r.id}`); } catch (e) { setErr(e.message); } setBusy(false); }
  return <>
    <PageHead title="Scoring sessions" sub="Physical Round 2 entries are scored in the room. The coordinator enters each evaluator's scores; the storage team gets a pull list sorted by shelf." actions={canCreate && <Btn v="primary" onClick={() => { setErr(null); setF({ round_id: x.rounds[0]?.id || "", session_date: "", time_text: "09:00 to 13:00", venue: "Evaluation Hall 2", evaluator_ids: [], count: 9 }); }}>New session</Btn>} />
    {x.ready > 0 && <Banner title={`${x.ready} collected entries are waiting for a session`}>New sessions pick them automatically, grouped by school.</Banner>}
    <Card flush><Table minw={860} cols={["Session", "When", "Coordinator", "Team", "Progress", "Status"]} onRow={i => router.push(`/sessions/${x.sessions[i].id}`)} empty="No sessions yet."
      rows={x.sessions.map(s => [<Two key="t" a={s.title} b={s.pathway} />, <Two key="w" a={s.session_date ? dshort(s.session_date) : "Date not set"} b={[s.time_text, s.venue].filter(Boolean).join(" · ")} />, s.coordinator || "", <span key="e" className="small">{s.team.map(t => t.name).join(", ")}</span>, <Prog key="p" pct={s.count ? s.scored / s.count * 100 : 0} label={`${s.scored}/${s.count}`} />, <Badge key="s" tone={s.status === "live" ? "info" : s.status === "done" ? "ok" : ""}>{s.status === "live" ? "In progress" : s.status === "done" ? "Done" : "Planned"}</Badge>])} /></Card>
    <Modal open={!!f} title="New scoring session" onClose={() => setF(null)} footer={<><Btn onClick={() => setF(null)}>Cancel</Btn><Btn v="primary" busy={busy} onClick={create}>Create session</Btn></>}>
      {err && <Banner tone="bad" title={err} />}
      {f && <>
        <Field label="Round"><select className="select" value={f.round_id} onChange={e => setF({ ...f, round_id: e.target.value, evaluator_ids: [] })}>{x.rounds.map(r => <option key={r.id} value={r.id}>{r.pathway} · Round 2 ({r.status})</option>)}</select></Field>
        <div className="row" style={{ gap: 12 }}><Field label="Date"><input type="date" className="input" value={f.session_date} onChange={e => setF({ ...f, session_date: e.target.value })} /></Field><Field label="Time"><input className="input" value={f.time_text} onChange={e => setF({ ...f, time_text: e.target.value })} /></Field></div>
        <Field label="Venue"><input className="input" value={f.venue} onChange={e => setF({ ...f, venue: e.target.value })} /></Field>
        <Field label="Number of entries" help="Picked from collected entries in storage, grouped by school"><input className="input num" style={{ width: 100 }} value={f.count} onChange={e => setF({ ...f, count: e.target.value.replace(/\D/g, "") })} /></Field>
        <Field label="Evaluator team"><div className="stack s8">{evs.map(e => <Check key={e.id} label={`${e.name}${e.account_id ? "" : " (no login)"}`} checked={f.evaluator_ids.includes(e.id)} onChange={v => setF({ ...f, evaluator_ids: v ? [...f.evaluator_ids, e.id] : f.evaluator_ids.filter(k => k !== e.id) })} />)}{!evs.length && <span className="muted">No evaluators on this pathway's panel.</span>}</div></Field>
      </>}
    </Modal>
  </>;
}
