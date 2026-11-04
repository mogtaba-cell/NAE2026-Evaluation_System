"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, useApi, useMeta, useToast, PageHead, Card, Btn, Badge, Banner, Loading, Field, Seg, Kpis, dueTxt, when } from "@/components/ui";
import FileViewer from "@/components/FileViewer";
import EntryAbout from "@/components/EntryAbout";
import { answerOf, choiceOf } from "@/lib/questions";

// Artworks to be reviewed: the same workspace as a scoring session. The list of artworks on the left, the artwork's
// files in the middle, the scores and the decision on the right. Every manager can open and decide any of them;
// each shows who it is with and who reviewed it.
const outcomeTxt = r => r.status === "overridden" ? `Overridden: ${r.new_passed === true ? (r.round_no === 2 ? "selected" : "shortlisted") : r.new_passed === false ? (r.round_no === 2 ? "not selected" : "not shortlisted") : `result ${r.new_result}`}${r.new_passed != null && r.new_result != null ? `, result ${r.new_result}` : ""}` : "Confirmed";

export default function Reviews() {
  const sp = useSearchParams(); const router = useRouter(); const meta = useMeta();
  const status = sp.get("status") || "open"; const sel = sp.get("id"); const pw = sp.get("pathway") || "";
  const d = useApi(`/api/reviews?scope=all&status=${status}`, [], { live: true });
  const setQ = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== "id") n.delete("id"); router.replace(`/reviews?${n}`, { scroll: false }); };
  const me = meta?.data?.me;
  const rows = (d.data?.rows || []).filter(r => !pw || r.entry.pathway_code === pw);
  const id = sel || rows[0]?.id || null;
  useEffect(() => { if (!sel && rows[0]?.id) router.replace(`/reviews?${new URLSearchParams({ ...Object.fromEntries(sp), id: rows[0].id })}`, { scroll: false }); }, [sel, rows[0]?.id]); // eslint-disable-line
  if (!d.data) return <Loading error={d.error} />;
  const x = d.data;
  const pws = [...new Set((x.rows || []).map(r => r.entry.pathway_code))];
  return <>
    <PageHead title="Artworks to be reviewed" sub="Flagged automatically (close to the pass mark or grade A line, evaluators far apart or disagreeing on a yes/no question), sent to review during scoring, or flagged by a coordinator. Any manager can review any artwork; each is due within the round's review time." />
    <Kpis dense items={[["To review", x.totals.open], ["Overdue", x.totals.overdue, "", x.totals.overdue ? "warn" : "ok"], ["Reviewed", x.totals.decided], ["Overridden", x.totals.overridden]]} />
    <div className="f3-sc f3-sess rv-ws">
      <section className="card f3-queue">
        <div className="qh"><Seg value={status} onChange={v => setQ("status", v)} items={[["open", `To review ${x.totals.open}`], ["decided", "Reviewed"], ["all", "All"]]} />
          {pws.length > 1 && <select className="select" value={pw} onChange={e => setQ("pathway", e.target.value)} aria-label="Pathway"><option value="">All pathways</option>{pws.map(p => <option key={p} value={p}>{(meta?.data?.pathways || []).find(k => k.code === p)?.name || p}</option>)}</select>}</div>
        <div className="qb">{rows.map(r => { const [t, tone] = dueTxt(r.due_at); return <div key={r.id} role="button" tabIndex={0} className={`f3-qi${r.id === id ? " on" : ""}`} onClick={() => setQ("id", r.id)} onKeyDown={k => k.key === "Enter" && setQ("id", r.id)}>
          <div className="t tf"><b dir="auto">{r.entry.title_en || r.entry.title_ar || r.entry.group_name || "Untitled"}</b><span className="cd">{r.entry.code} · R{r.round_no}</span>
            <span className="rv-who">{r.status === "open" ? <><Badge tone={tone}>{t}</Badge> <span>with {r.manager || "management"}</span></> : <span>{outcomeTxt(r)} · {r.decided_by_name || "management"}</span>}</span></div>
          <span className="s">{r.team_at_flag ?? ""}</span></div>; })}
          {!rows.length && <p className="small faint" style={{ padding: 12 }}>{status === "open" ? "Nothing to review right now." : "Nothing reviewed yet."}</p>}</div>
      </section>
      {id ? <Detail key={id} id={id} me={me} rows={rows} onDone={next => { d.reload(); if (next) setQ("id", next); }} /> : <><div /><div /></>}
    </div>
  </>;
}

function Detail({ id, me, rows, onDone }) {
  const d = useApi(`/api/reviews/${id}`); const meta = useMeta(); const toast = useToast();
  const [mode, setMode] = useState("confirm"); const [val, setVal] = useState(""); const [outcome, setOutcome] = useState(""); const [note, setNote] = useState(""); const [mgr, setMgr] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  if (!d.data) return <><div className="stack" style={{ minWidth: 0 }}><Loading error={d.error} /></div><div /></>;
  const { review: rv, entry: e, round, criteria, scores, result } = d.data;
  const qs = d.data.rubric?.questions || [];
  const open = rv.status === "open";
  const totals = scores.map(s => s.total); const spread = totals.length > 1 ? Math.max(...totals) - Math.min(...totals) : 0;
  const nextId = () => { const i = rows.findIndex(r => r.id === id); return (rows.slice(i + 1).find(r => r.status === "open") || rows.find(r => r.status === "open" && r.id !== id))?.id || null; };
  async function decide() {
    setBusy(true); setErr(null);
    try { const r = await api(`/api/reviews/${id}`, { body: mode === "delegate" ? { action: "delegate", manager_id: mgr, note } : mode === "override" ? { action: "override", outcome, new_result: val, note } : { action: "confirm", note } }); toast(r.note); setNote(""); setVal(""); setOutcome(""); onDone(mode === "delegate" ? null : nextId()); d.reload(); }
    catch (x) { setErr(x.message); } setBusy(false);
  }
  const [due, tone] = dueTxt(rv.due_at);
  return <>
    <div className="stack sticky-view" style={{ gap: 12, minWidth: 0 }}>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><span className="code" style={{ fontSize: 15, fontWeight: 600 }}>{e.code}</span><Badge>{e.sub}</Badge><Badge>Round {rv.round_no}</Badge>{e.pod && <Badge tone="info">POD</Badge>}{open ? <Badge tone={tone}>{due}</Badge> : <Badge tone="ok">{outcomeTxt(rv)}</Badge>}<Btn sm v="ghost" href={`/entries/${encodeURIComponent(e.code)}`} style={{ marginLeft: "auto" }}>Open artwork</Btn></div>
      <FileViewer files={d.data.files || []} tall />
      <EntryAbout e={e} compact />
    </div>
    <div className="stack" style={{ gap: 16, minWidth: 0 }}>
      <Banner tone={open ? "warn" : ""} title={rv.reason}>{`Flagged by ${rv.flagged_by_name} ${when(rv.flagged_at)}${rv.note ? ` · “${rv.note}”` : ""}. ${open ? `With ${rv.manager || "management"}.` : `Reviewed by ${rv.decided_by_name || "management"} ${when(rv.decided_at)}.`}`}</Banner>
      <Card title="Scores" sub={`${e.school?.name || ""} · pass: ${round.pass_text} · pass mark ${round.threshold}${round.flag_line_kind === "A" ? ` · grade A line ${round.flag_line}` : ""} · evaluators differ by ${spread}${spread > round.spread_limit ? ` (over ${round.spread_limit})` : ""}`}>
        <div className="tw"><table className="x-cmp sess-mx"><thead><tr><th>Criterion</th>{scores.map((s, i) => <th key={i}>{s.evaluator}</th>)}</tr></thead><tbody>
          {criteria.map(c => { const v = scores.map(s => s.scores?.[c.key]); const hi = v.length > 1 && Math.max(...v) - Math.min(...v) >= 20; return <tr key={c.key}><td><div className="cl"><b>{c.label} <span className="w">{c.weight}%</span></b></div></td>{v.map((x, i) => <td key={i} className={hi ? "hi" : ""}>{x}</td>)}</tr>; })}
          {qs.map(x => { const a = scores.map(s => answerOf(s, x.key)); const ch = scores.map(s => choiceOf(s, x.key)); const split = (a.includes(true) && a.includes(false)) || (x.options?.length && new Set(ch.filter((c, i) => a[i] === true).map(c => c || "")).size > 1); return <tr key={x.key}><td><div className="cl"><b>{x.label}</b></div></td>{a.map((v, i) => <td key={i} className={split ? "hi" : ""}>{v == null ? "–" : v ? "Yes" : "No"}{ch[i] && <span className="d-choice" dir="auto">{ch[i]}</span>}</td>)}</tr>; })}
          <tr className="tot"><td>Total</td>{scores.map((s, i) => <td key={i}>{s.total}</td>)}</tr></tbody></table></div>
        {!scores.length && <p className="muted" style={{ margin: 0 }}>No saved scores yet.</p>}
        {scores.filter(s => s.comment).map((s, i) => <div key={i} className="x-quote small"><b>{s.evaluator}:</b> <span dir="auto">{s.comment}</span></div>)}
        {scores.some(s => s.to_review) && <p className="small" style={{ margin: 0, color: "var(--warn)" }}>Sent to review during scoring by {scores.filter(s => s.to_review).map(s => s.evaluator).join(", ")}.</p>}
        {d.data.coordComment && <div className="cc-box"><b className="small">Coordinator comment · {d.data.coordComment.author || "Coordinator"}</b><span className="small" dir="auto">{d.data.coordComment.comment}</span></div>}
        {result && <div className="x-tot"><div className="stack s4"><span className="s">Team result</span><span className="v">{result.team ?? "–"}</span></div><div className="stack s4"><span className="s">Grade</span><span style={{ fontSize: 18, fontWeight: 600 }}>{result.grade || "–"}</span></div>{result.final != null && result.final !== result.team && <div className="stack s4"><span className="s">Final</span><span style={{ fontSize: 18, fontWeight: 600 }}>{result.final}</span></div>}</div>}
      </Card>
      {d.data.canDecide ? <Card title="Your decision" sub={rv.manager_id && rv.manager_id !== me?.sub ? `Assigned to ${rv.manager || "another manager"}; you can still decide it.` : null}>
        {err && <Banner tone="bad" title={err} />}
        <Seg value={mode} onChange={setMode} items={[["confirm", `Confirm ${result?.team ?? ""}`], ["override", "Override"], ["delegate", "Give to"]]} />
        {mode === "override" && <><Field label="Outcome"><Seg value={outcome} onChange={setOutcome} items={[["pass", rv.round_no === 1 ? "Shortlisted" : "Selected"], ["fail", rv.round_no === 1 ? "Not shortlisted" : "Not selected"]]} /></Field>
          <Field label="Adjusted result (optional, 0 to 100)" help="Leave empty to keep the team result."><input className="input num" style={{ width: 120 }} inputMode="numeric" value={val} onChange={x => setVal(x.target.value.replace(/\D/g, "").slice(0, 3))} /></Field></>}
        {mode === "delegate" && <Field label="Give to"><select className="select" value={mgr} onChange={x => setMgr(x.target.value)}><option value="">Choose…</option>{(meta?.data?.accounts || []).filter(a => a.role === "management" && a.id !== rv.manager_id).map(a => <option key={a.id} value={a.id}>{a.display_name}</option>)}</select></Field>}
        <Field label={mode === "override" ? "Reason (required)" : "Note (optional)"}><textarea className="textarea" rows={3} value={note} onChange={x => setNote(x.target.value)} /></Field>
        <div className="row" style={{ justifyContent: "flex-end" }}><Btn v="primary" busy={busy} disabled={(mode === "override" && (!outcome || !note.trim())) || (mode === "delegate" && !mgr)} onClick={decide}>{mode === "confirm" ? "Confirm and go to next" : mode === "override" ? "Override and go to next" : "Give to manager"}</Btn></div>
        <p className="x-note">The artwork moves on as soon as you decide (if its scores are complete). If the scores change later, it comes back for review.</p>
      </Card> : !open ? <Card title="Decision"><p style={{ margin: 0 }}>{outcomeTxt(rv)} by <b>{rv.decided_by_name || "management"}</b> · {when(rv.decided_at)}</p>{rv.decision_note && <p className="muted">{rv.decision_note}</p>}</Card> : null}
      {d.data.history?.length > 0 && <Card title="Earlier reviews of this artwork">{d.data.history.map(h => <div key={h.id} className="stack s4" style={{ padding: "6px 0", borderTop: "1px solid var(--rule)" }}><span className="small strong">{h.reason}</span><span className="small faint">{h.status === "open" ? `Open · with ${h.manager || "management"}` : `${outcomeTxt(h)} · ${h.decided_by_name || "management"} · ${when(h.decided_at)}`}</span></div>)}</Card>}
    </div>
  </>;
}
