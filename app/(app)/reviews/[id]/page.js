"use client";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { api, useApi, useMeta, useToast, PageHead, Card, Btn, Badge, Banner, Loading, Field, Seg, dueTxt, when } from "@/components/ui";
import FileViewer from "@/components/FileViewer";
import EntryAbout from "@/components/EntryAbout";

export default function Review({ params }) {
  const { id } = use(params);
  const d = useApi(`/api/reviews/${id}`); const meta = useMeta(); const toast = useToast(); const router = useRouter();
  const [mode, setMode] = useState("confirm"); const [val, setVal] = useState(""); const [outcome, setOutcome] = useState(""); const [note, setNote] = useState(""); const [mgr, setMgr] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  if (!d.data) return <Loading error={d.error} />;
  const { review: rv, entry: e, round, criteria, scores, result } = d.data;
  const open = rv.status === "open"; const me = meta?.data?.me;
  const canDecide = open && (me?.role === "admin" || rv.manager_id === me?.sub);
  const totals = scores.map(s => s.total); const spread = totals.length > 1 ? Math.max(...totals) - Math.min(...totals) : 0;
  async function decide() {
    setBusy(true); setErr(null);
    try { const r = await api(`/api/reviews/${id}`, { body: mode === "delegate" ? { action: "delegate", manager_id: mgr, note } : mode === "override" ? { action: "override", outcome, new_result: val, note } : { action: "confirm", note } }); toast(r.note); if (r.next) router.push(`/reviews/${r.next}`); else router.push(me?.role === "management" ? "/reviews?mine=1" : "/reviews"); }
    catch (x) { setErr(x.message); } setBusy(false);
  }
  const [due, tone] = dueTxt(rv.due_at);
  return <>
    <PageHead back={["Reviews", me?.role === "management" ? "/reviews?mine=1" : "/reviews"]} title={<span className="code" style={{ fontSize: 22 }}>{e.code}</span>} badges={open ? <Badge tone={tone}>{due}</Badge> : <Badge tone="ok">{rv.status}</Badge>}
      sub={`${e.pathway} · ${e.sub || ""} · ${e.school?.name} · Round ${rv.round_no} · pass: ${round.pass_text}`} />
    <Banner tone="warn" title={rv.reason}>{`Flagged by ${rv.flagged_by_name} ${when(rv.flagged_at)}${rv.note ? ` · "${rv.note}"` : ""}. Assigned to ${rv.manager || "management"}.`}</Banner>
    <div className="x-side x-rec">
      <div className="stack sticky-view" style={{ gap: 16, minWidth: 0 }}>
        <section className="card"><FileViewer files={d.data.files || []} tall /></section>
      </div>
      <div className="stack" style={{ gap: 16, minWidth: 0 }}>
        <EntryAbout e={e} compact />
        <Card title="Scores" sub={`Pass mark ${round.threshold}${round.flag_line_kind === "A" ? ` · grade A line ${round.flag_line}` : ""} · evaluators differ by ${spread}${spread > round.spread_limit ? ` (over ${round.spread_limit})` : ""}${d.data.rubric ? ` · rubric ${d.data.rubric.code} v${d.data.rubric.version}` : ""}`}>
          <div className="tw"><table className="x-cmp"><thead><tr><th>Criterion</th>{scores.map((s, i) => <th key={i}>{s.evaluator}</th>)}</tr></thead><tbody>
            {criteria.map(c => { const v = scores.map(s => s.scores?.[c.key]); const hi = v.length > 1 && Math.max(...v) - Math.min(...v) >= 20; return <tr key={c.key}><td>{c.label} <span className="faint small">{c.weight}%</span></td>{v.map((x, i) => <td key={i} className={hi ? "hi" : ""}>{x}</td>)}</tr>; })}
            {scores.some(s => s.national_identity != null) && <tr><td>National identity</td>{scores.map((s, i) => <td key={i}>{s.national_identity == null ? "–" : s.national_identity ? "Yes" : "No"}</td>)}</tr>}
            <tr className="tot"><td>Total</td>{scores.map((s, i) => <td key={i}>{s.total}</td>)}</tr></tbody></table></div>
          {scores.filter(s => s.comment).map((s, i) => <div key={i} className="x-quote small"><b>{s.evaluator}:</b> {s.comment}</div>)}
          {result && <div className="x-tot"><div className="stack s4"><span className="s">Team result</span><span className="v">{result.team}</span></div><div className="stack s4"><span className="s">Grade</span><span style={{ fontSize: 18, fontWeight: 600 }}>{result.grade}</span></div>{result.final != null && result.final !== result.team && <div className="stack s4"><span className="s">Final</span><span style={{ fontSize: 18, fontWeight: 600 }}>{result.final}</span></div>}</div>}
        </Card>
        {canDecide ? <Card title="Your decision">
          {err && <Banner tone="bad" title={err} />}
          <Seg value={mode} onChange={setMode} items={[["confirm", `Confirm ${result?.team ?? ""}`], ["override", "Override"], ["delegate", "Delegate"]]} />
          {mode === "override" && <><Field label="Outcome"><Seg value={outcome} onChange={setOutcome} items={[["pass", rv.round_no === 1 ? "Goes through to Round 2" : "Passes Round 2"], ["fail", rv.round_no === 1 ? "Does not go through" : "Does not pass"]]} /></Field>
            <Field label="Adjusted result (optional, 0 to 100)" help="Leave empty to keep the team result."><input className="input num" style={{ width: 120 }} inputMode="numeric" value={val} onChange={x => setVal(x.target.value.replace(/\D/g, "").slice(0, 3))} /></Field></>}
          {mode === "delegate" && <Field label="Give to"><select className="select" value={mgr} onChange={x => setMgr(x.target.value)}><option value="">Choose…</option>{(meta?.data?.accounts || []).filter(a => a.role === "management" && a.id !== rv.manager_id).map(a => <option key={a.id} value={a.id}>{a.display_name}</option>)}</select></Field>}
          <Field label={mode === "override" ? "Reason (required)" : "Note (optional)"}><textarea className="textarea" rows={3} value={note} onChange={x => setNote(x.target.value)} /></Field>
          <div className="row" style={{ justifyContent: "flex-end" }}><Btn v="primary" busy={busy} disabled={(mode === "override" && (!outcome || !note.trim())) || (mode === "delegate" && !mgr)} onClick={decide}>{mode === "confirm" ? "Confirm result" : mode === "override" ? "Override result" : "Delegate"}</Btn></div>
          <p className="x-note">The artwork moves on as soon as you decide (if its scores are complete). If the scores change later, it comes back for review. Then the next review in your queue opens.</p>
        </Card> : !open ? <Card title="Decision"><p>{rv.status === "overridden" ? `Overridden: ${rv.new_passed === true ? "goes through" : rv.new_passed === false ? "does not go through" : `result ${rv.new_result}`}${rv.new_passed != null && rv.new_result != null ? `, result ${rv.new_result}` : ""}` : "Confirmed"} by {rv.decided_by_name} · {when(rv.decided_at)}</p>{rv.decision_note && <p className="muted">{rv.decision_note}</p>}</Card> : null}
      </div>
    </div>
  </>;
}
