"use client";
import { useState, use } from "react";
import { api, useApi, useMeta, useToast, PageHead, Card, Badge, Banner, Btn, Loading, Modal, Field, Check, statusBadge, when, dueTxt, Tabs, Two } from "@/components/ui";
import FileViewer from "@/components/FileViewer";
import EntryAbout from "@/components/EntryAbout";
import { total as wTotal } from "@/components/ScoreForm";
import { LG, MISSING } from "@/components/Logistics";
import { ArtworkDrawer } from "@/components/Movements";

const REASONS = ["Close to the pass mark", "Evaluators disagree", "Possible plagiarism or AI use", "Eligibility question", "Wrong pathway or subpathway", "Other"];
const yn = v => v == null ? "–" : v ? "Yes" : "No";

function RoundCard({ r, d, me, onChanged }) {
  const toast = useToast();
  const [edit, setEdit] = useState(null); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const [enter, setEnter] = useState(null); const [reas, setReas] = useState(null); const [stop, setStop] = useState(false); const [lock, setLock] = useState(null);
  const crit = r.rubric?.criteria || [];
  const res = r.result; const admin = d.can.admin; const e = d.entry;
  const openRv = r.reviews.find(v => v.status === "open");
  const lastRv = r.reviews.find(v => v.status !== "open");
  const assigned = r.evaluators || [];
  const missing = assigned.filter(a => !r.scores.find(s => s.evaluator_id === a.id && s.status === "submitted"));
  const unfinished = e.current_round === r.round_no && ["to_score", "in_progress", "review", "not_open"].includes(e.status);
  const badge = openRv ? <Badge tone="warn">With management</Badge> : res?.complete && lastRv?.status === "overridden" ? <Badge tone="info">Overridden by management</Badge> : res?.passed === true ? <Badge tone="ok">{r.round_no === 1 ? "Shortlisted" : "Selected"}</Badge> : res?.passed === false ? <Badge>{r.round_no === 1 ? "Not shortlisted" : "Did not pass"}</Badge> : <Badge>{r.status === "open" ? "Scoring" : r.status}</Badge>;
  async function run(fn, done) { setBusy(true); setErr(null); try { const x = await fn(); toast(x?.note || done); setEdit(null); setEnter(null); setReas(null); setStop(false); setLock(null); setReason(""); onChanged(); } catch (x) { setErr(x.message); } setBusy(false); }
  const saveEdit = () => run(() => api("/api/scores/edit", { body: { score_id: edit.id, scores: edit.scores, national_identity: edit.national_identity, reason } }), "Score changed");
  const saveEnter = () => run(() => api("/api/scores", { body: { entry_code: e.code, round_no: r.round_no, evaluator_id: enter.evaluator_id, scores: enter.scores, national_identity: enter.national_identity, submit: true, reason } }), "Score entered");
  const saveReas = () => run(() => api(`/api/entries/${e.code}`, { body: { action: "reassign", round_no: r.round_no, from: reas.from, to: reas.to, reason } }), "Reassigned");
  const saveStop = () => run(() => api(`/api/rounds/${r.id}`, { body: { action: "not_scored", codes: [e.code], reason } }), "Marked not scored");
  const saveLock = () => run(() => api("/api/results", { body: { entry_code: e.code, round_no: r.round_no, action: lock, reason } }), "Done");
  // a plain function (not a component), so the inputs keep focus while typing
  const scoreInputs = (v, set) => <>{crit.map(c => <div className="f3-crit" key={c.key}><div className="lab"><b>{c.label}</b><span>{c.weight}%</span></div><input className="sc-in" inputMode="numeric" value={v.scores[c.key] ?? ""} onChange={x => set({ ...v, scores: { ...v.scores, [c.key]: x.target.value.replace(/\D/g, "").slice(0, 3) } })} /></div>)}
    {r.rubric?.identity_required && <div className="f3-crit"><div className="lab"><b>National identity</b></div><span className="f3-yn lg"><button type="button" className={v.national_identity === true ? "on" : ""} onClick={() => set({ ...v, national_identity: true })}>Yes</button><button type="button" className={v.national_identity === false ? "on" : ""} onClick={() => set({ ...v, national_identity: false })}>No</button></span></div>}</>;
  if (r.limited) return <Card title={`Round ${r.round_no}${r.physical ? " · physical" : " · online"}`} sub={`Pass: ${r.pass_text}`}><p className="muted">Scores are shown only to the artwork's coordinator, admins and management.</p></Card>;
  return <Card title={`Round ${r.round_no}${r.physical ? " · physical" : " · online"}`} sub={`${r.rubric ? `Rubric ${r.rubric.code} v${r.rubric.version} · ` : ""}Pass: ${r.pass_text}`} right={badge}>
    {err && !edit && !enter && !reas && !stop && !lock && <Banner tone="bad" title={err} />}
    {res && res.team != null && <div className="x-tot"><div className="stack s4"><span className="s">{res.final != null && res.final !== res.team ? "Final (after review)" : res.complete ? "Team result" : "Provisional"}</span><span className="v">{res.final ?? res.team}</span></div><div className="stack s4"><span className="s">Grade</span><span style={{ fontSize: 18, fontWeight: 600 }}>{res.grade}</span></div>{r.rubric?.identity_required && <div className="stack s4"><span className="s">Identity</span><span>{yn(res.identity_yes)}</span></div>}<span className="s" style={{ marginLeft: "auto" }}>{res.scored} of {res.needed} scored{res.locked ? " · final (locked)" : res.complete ? " · not final until the round closes" : ""}</span></div>}
    {r.scores.length > 0 ? <div className="tw"><table className="x-cmp"><thead><tr><th>Evaluator</th>{crit.map(c => <th key={c.key} title={c.label}>{c.label.split(" ")[0]} {c.weight}%</th>)}{r.rubric?.identity_required && <th>ID</th>}<th>Total</th>{d.can.editScore && <th></th>}</tr></thead>
      <tbody>{r.scores.map(s => <tr key={s.id}><td><Two a={s.evaluator} b={s.status === "absent" ? "Absent" : s.status === "submitted" ? (s.self ? `Submitted ${when(s.submitted_at)}` : `Entered by ${s.entered_by || "coordinator"}`) : "Draft"} /></td>{crit.map(c => <td key={c.key}>{s.scores?.[c.key] ?? ""}</td>)}{r.rubric?.identity_required && <td>{s.status === "submitted" ? yn(s.national_identity) : ""}</td>}<td>{s.status === "submitted" ? s.total : "–"}</td>{d.can.editScore && <td>{s.status === "submitted" && !res?.locked && <Btn sm v="ghost" onClick={() => { setErr(null); setEdit({ ...s, scores: { ...s.scores } }); }}>Change</Btn>}</td>}</tr>)}</tbody></table></div>
      : <p className="muted">{assigned.length ? `Waiting for ${assigned.map(x => x.name).join(" and ")}.` : r.physical ? "Scored in a session in the room." : r.status === "open" ? "No evaluators assigned yet." : "Scoring has not started."}</p>}
    {r.scores.length > 0 && missing.length > 0 && !r.physical && <p className="x-note">Waiting for {missing.map(x => x.name).join(", ")}.</p>}
    {r.reviews.map(v => <Banner key={v.id} tone={v.status === "open" ? "warn" : ""} title={v.status === "open" ? `Review with ${v.manager || "management"} · ${dueTxt(v.due_at)[0]}` : v.status === "overridden" ? `Overridden by ${v.manager || "management"}: ${v.new_passed === true ? (v.round_no === 2 ? "selected" : "shortlisted") : v.new_passed === false ? (v.round_no === 2 ? "not selected" : "not shortlisted") : `result ${v.new_result}`}${v.new_passed != null && v.new_result != null ? `, result ${v.new_result}` : ""}` : `Confirmed by ${v.manager || "management"}`}
      action={v.status === "open" && ["admin", "management"].includes(me) ? <Btn sm href={`/reviews/${v.id}`}>Open review</Btn> : null}>{v.reason}{v.decision_note ? ` · ${v.decision_note}` : ""}</Banner>)}
    {admin && <div className="row" style={{ gap: 6, flexWrap: "wrap", borderTop: "1px solid var(--rule)", paddingTop: 12 }}>
      {!r.physical && missing.length > 0 && !res?.locked && <Btn sm onClick={() => { setErr(null); setEnter({ evaluator_id: missing[0].id, scores: {}, national_identity: null }); }}>Enter a missing score</Btn>}
      {!r.physical && missing.length > 0 && r.status === "open" && <Btn sm onClick={() => { setErr(null); setReas({ from: missing[0].id, to: "" }); }}>Reassign</Btn>}
      {unfinished && <Btn sm v="ghost" onClick={() => { setErr(null); setStop(true); }}>Mark not scored</Btn>}
      {res?.complete && <Btn sm v="ghost" onClick={() => { setErr(null); setLock(res.locked ? "unlock" : "lock"); }}>{res.locked ? "Unlock result" : "Lock result"}</Btn>}
    </div>}
    {admin && d.scoreHistory?.filter(h => h.round_id === r.id).length > 0 && <details><summary className="small faint" style={{ cursor: "pointer" }}>Score changes ({d.scoreHistory.filter(h => h.round_id === r.id).length})</summary>{d.scoreHistory.filter(h => h.round_id === r.id).map(h => <p key={h.id} className="small muted" style={{ marginTop: 6 }}>{when(h.at)}: {h.before?.total ?? "–"} → {h.after?.total ?? "–"}{h.before?.national_identity !== h.after?.national_identity ? ` (identity ${yn(h.before?.national_identity)} → ${yn(h.after?.national_identity)})` : ""}. {h.reason}</p>)}</details>}

    <Modal open={!!edit} title="Change a submitted score" sub={edit ? `${e.code} · ${edit.evaluator} · Round ${r.round_no}` : ""} onClose={() => setEdit(null)} footer={<><Btn onClick={() => setEdit(null)}>Cancel</Btn><Btn v="primary" busy={busy} disabled={!reason.trim()} onClick={saveEdit}>Save change</Btn></>}>
      {err && <Banner tone="bad" title={err} />}
      {edit && scoreInputs(edit, setEdit)}
      {edit && <p className="strong">New total {wTotal(crit, edit.scores)} (was {edit.total})</p>}
      <Field label="Reason (kept with the score's history)"><textarea className="textarea" rows={2} value={reason} onChange={x => setReason(x.target.value)} /></Field>
    </Modal>
    <Modal open={!!enter} title="Enter a missing score" sub={`${e.code} · Round ${r.round_no} · on the evaluator's behalf`} onClose={() => setEnter(null)} footer={<><Btn onClick={() => setEnter(null)}>Cancel</Btn><Btn v="primary" busy={busy} disabled={!reason.trim()} onClick={saveEnter}>Submit score</Btn></>}>
      {err && <Banner tone="bad" title={err} />}
      {enter && <><Field label="Evaluator"><select className="select" value={enter.evaluator_id} onChange={x => setEnter({ ...enter, evaluator_id: x.target.value })}>{missing.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>{scoreInputs(enter, setEnter)}<p className="strong">Total {wTotal(crit, enter.scores)}</p></>}
      <Field label="Reason (for example: scored on paper)"><input className="input" value={reason} onChange={x => setReason(x.target.value)} /></Field>
    </Modal>
    <Modal open={!!reas} title="Reassign" sub={`${e.code} · Round ${r.round_no}`} onClose={() => setReas(null)} footer={<><Btn onClick={() => setReas(null)}>Cancel</Btn><Btn v="primary" busy={busy} disabled={!reas?.to} onClick={saveReas}>Reassign</Btn></>}>
      {err && <Banner tone="bad" title={err} />}
      {reas && <><Field label="Replace"><select className="select" value={reas.from} onChange={x => setReas({ ...reas, from: x.target.value })}>{missing.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        <Field label="With"><select className="select" value={reas.to} onChange={x => setReas({ ...reas, to: x.target.value })}><option value="">Choose from the round's panel…</option>{(r.panel || []).filter(p => !assigned.some(a => a.id === p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Reason (optional)"><input className="input" value={reason} onChange={x => setReason(x.target.value)} /></Field></>}
    </Modal>
    <Modal open={stop} title="Mark as not scored?" sub={`${e.code} · Round ${r.round_no}`} onClose={() => setStop(false)} footer={<><Btn onClick={() => setStop(false)}>Cancel</Btn><Btn v="primary" busy={busy} disabled={!reason.trim()} onClick={saveStop}>Mark not scored</Btn></>}>
      {err && <Banner tone="bad" title={err} />}
      <p className="muted">The artwork stops here and is shown as not scored. Any open review on it is closed.</p>
      <Field label="Reason"><input className="input" value={reason} onChange={x => setReason(x.target.value)} /></Field>
    </Modal>
    <Modal open={!!lock} title={lock === "unlock" ? "Unlock this result?" : "Lock this result again?"} sub={`${e.code} · Round ${r.round_no}`} onClose={() => setLock(null)} footer={<><Btn onClick={() => setLock(null)}>Cancel</Btn><Btn v="primary" busy={busy} disabled={!reason.trim()} onClick={saveLock}>{lock === "unlock" ? "Unlock" : "Lock"}</Btn></>}>
      {err && <Banner tone="bad" title={err} />}
      <p className="muted">{lock === "unlock" ? "Scores can then be corrected and the result is recalculated. Lock it again when you're done." : "The result becomes final again."}</p>
      <Field label="Reason (kept in the audit log)"><input className="input" value={reason} onChange={x => setReason(x.target.value)} /></Field>
    </Modal>
  </Card>;
}

export default function EntryPage({ params }) {
  const { code } = use(params);
  const d = useApi(`/api/entries/${encodeURIComponent(code)}`);
  const meta = useMeta(); const toast = useToast(); const me = meta?.data?.me?.role;
  const [flag, setFlag] = useState(false); const [fr, setFr] = useState({ reason: "", note: "" }); const [busy, setBusy] = useState(false);
  const [coord, setCoord] = useState(false); const [tab, setTab] = useState("rounds"); const [refreshing, setRefreshing] = useState(false); const [files, setFiles] = useState(null);
  const [lgEdit, setLgEdit] = useState(false);
  if (!d.data) return <Loading error={d.error} />;
  const { entry: e, students, rounds, logistics, sessions, history, access } = d.data;
  const curRound = rounds.find(r => r.round_no === e.current_round);
  async function doFlag() { setBusy(true); try { const r = await api("/api/reviews", { body: { entry_code: e.code, round_no: e.current_round, ...fr } }); toast(r.note); setFlag(false); d.reload(); } catch (x) { toast(x.message, "err"); } setBusy(false); }
  async function refresh() { setRefreshing(true); try { const r = await api(`/api/entries/${encodeURIComponent(e.code)}/files`); setFiles(r.files); toast(`${r.files.length} file${r.files.length === 1 ? "" : "s"} found`); } catch (x) { toast(x.message, "err"); } setRefreshing(false); }
  async function setCoordinator(id) { try { await api(`/api/entries/${e.code}`, { method: "PATCH", body: { coordinator_id: id } }); toast("Coordinator changed"); setCoord(false); d.reload(); } catch (x) { toast(x.message, "err"); } }
  async function markViewed(v) { try { await api(`/api/entries/${e.code}`, { method: "PATCH", body: { mgmt_viewed: v } }); d.reload(); } catch (x) { toast(x.message, "err"); } }
  const back = me === "coordinator" && access === "view" ? ["All artworks", "/entries?scope=all"] : ["Artworks", "/entries"];
  return <>
    <PageHead back={back} title={<span className="code" style={{ fontSize: 22 }}>{e.code}</span>} badges={statusBadge({ ...e, results: rounds.map(r => r.result).filter(Boolean) })}
      sub={<>{[e.pathway, e.sub].filter(Boolean).join(" · ")} · {e.school?.name}{e.school?.region ? `, ${e.school.region}` : ""} · <span className="faint">referenceId {e.reference_id}</span></>}
      actions={<>{d.data.can.flag && <Btn onClick={() => setFlag(true)}>Flag for review</Btn>}{d.data.can.allocate && <Btn onClick={() => setCoord(true)}>Coordinator: {e.coordinator || "none"}</Btn>}</>} />
    {d.data.can.markViewed && <div className="row mgmt-row" style={{ gap: 8, flexWrap: "wrap", marginTop: -6 }}>
      <Check label="Viewed by management" checked={!!e.mgmt_viewed_at} disabled={me === "management" && e.mgmt_viewed_how === "opened"} onChange={markViewed} />
      {e.mgmt_viewed_at && <span className="small faint">{e.mgmt_viewed_how === "opened" ? `Opened by ${e.mgmt_viewed_name || "management"}` : `Marked by ${e.mgmt_viewed_name || "someone"}`} · {when(e.mgmt_viewed_at)}</span>}
    </div>}
    {access === "view" && <Banner title="View only">{me === "storage" ? "Scores and results are not shown to the Logistics team." : "This artwork isn't allocated to you. You can see its files and details; scores and actions are for its coordinator."}</Banner>}
    <div className="x-side x-rec">
      <div className="stack" style={{ gap: 16, minWidth: 0 }}>
        <section className="card"><FileViewer files={files || d.data.files} canDownload={d.data.can.download} onRefresh={refresh} refreshing={refreshing} checkedAt={e.files_checked_at ? when(e.files_checked_at) : null} /></section>
        <EntryAbout e={e} students={students} showStudents={me !== "evaluator"} />
        {d.data.cycle?.mixed && <CycleCard e={e} cy={d.data.cycle} can={d.data.can.cycle} onDone={d.reload} />}
      </div>
      <div className="stack" style={{ gap: 16, minWidth: 0 }}>
        <Tabs value={tab} onChange={setTab} items={[["rounds", "Scores"], ["details", "Details"], ...(me !== "evaluator" && access === "full" ? [["history", "History", history.length]] : [])]} />
        {tab === "rounds" && (rounds.length ? rounds.slice().reverse().map(r => <RoundCard key={r.id} r={r} d={d.data} me={me} onChanged={d.reload} />) : <Card><p className="muted">No round has been set up for this pathway yet.</p></Card>)}
        {tab === "details" && <>
          <Card title="Submission"><dl className="kv">{[["Artwork code", e.code], ["referenceId", e.reference_id], ["RegistrationId", e.registration_id], ["Submitted", e.submitted_at ? when(e.submitted_at) : ""], ["Artwork type", e.registration_type || (e.group_name ? "Group" : "Individual")], ["School", `${e.school?.name || ""}${e.school?.esis ? ` · eSIS ${e.school.esis}` : ""}`], ["School type", e.school?.school_type], ["Coordinator", e.coordinator || "Not allocated"], ["Drive folder", e.source_path]].filter(x => x[1]).flatMap(([k, v]) => [<dt key={k}>{k}</dt>, <dd key={k + "v"}>{v}</dd>])}</dl></Card>
          {logistics && <Card title="Artwork" right={<span className="row" style={{ gap: 4 }}>{logistics.damaged && <Badge tone="warn">Damaged</Badge>}<Badge tone={logistics.state === "missing" ? "bad" : logistics.state === "storage" ? "ok" : ""}>{LG[logistics.state]}</Badge></span>}>
            <dl className="kv">{[["Stored in", logistics.where], ["Condition", logistics.condition], ["Missing", logistics.missing_outcome ? MISSING[logistics.missing_outcome] : null], ["Framing", logistics.needs_framing ? (logistics.glass_framing ? "Needs framing, with protective glass" : "Needs framing") : "Not needed"], ["Collection", logistics.collection ? `${logistics.collection.code || ""} ${logistics.collection.scheduled_on || ""}` : null]].filter(x => x[1]).flatMap(([k, v]) => [<dt key={k}>{k}</dt>, <dd key={k + "v"}>{v}</dd>])}</dl>
            <div className="row" style={{ gap: 8 }}><Btn sm onClick={() => setLgEdit(true)}>History</Btn>{["admin", "storage", "coordinator"].includes(me) && <Btn sm href={`/logistics?tab=all&q=${encodeURIComponent(e.code)}`}>Open in logistics</Btn>}</div></Card>}
          {sessions.length > 0 && <Card title="Scoring sessions">{sessions.map(s => <Two key={s.id} a={s.title} b={`${s.session_date || ""} · ${s.venue || ""} · ${s.status}`} />)}</Card>}
        </>}
        {tab === "history" && <Card flush><div className="tl" style={{ padding: 16 }}>{history.length ? history.map(h => <div key={h.id} className="stack s4" style={{ padding: "8px 0", borderTop: "1px solid var(--rule)" }}><span className="strong">{h.action}</span><span className="small faint">{h.actor_name || "System"} · {when(h.at)}</span>{h.detail && <span className="small muted" style={{ overflowWrap: "anywhere" }}>{h.detail}</span>}</div>) : <p className="muted">Nothing recorded yet.</p>}</div></Card>}
      </div>
    </div>
    <Modal open={flag} title="Flag for management review" sub={`${e.code} · Round ${e.current_round}`} onClose={() => setFlag(false)} footer={<><Btn onClick={() => setFlag(false)}>Cancel</Btn><Btn v="primary" busy={busy} disabled={!fr.reason} onClick={doFlag}>Flag</Btn></>}>
      <Field label="Reason"><select className="select" value={fr.reason} onChange={x => setFr({ ...fr, reason: x.target.value })}><option value="">Choose…</option>{REASONS.map(r => <option key={r}>{r}</option>)}</select></Field>
      <Field label="Note for the manager"><textarea className="textarea" rows={3} value={fr.note} onChange={x => setFr({ ...fr, note: x.target.value })} /></Field>
      <p className="x-note">The review goes to the manager with the fewest open reviews and is due in {curRound?.review_hours || 48} hours.</p>
    </Modal>
    <Modal open={coord} title="Change coordinator" onClose={() => setCoord(false)}>
      <div className="stack s8">{(meta?.data?.accounts || []).filter(a => a.role === "coordinator").map(a => <Btn key={a.id} v={a.id === e.coordinator_id ? "primary" : "secondary"} onClick={() => setCoordinator(a.id)}>{a.display_name}</Btn>)}<Btn v="ghost" onClick={() => setCoordinator(null)}>Remove coordinator</Btn></div>
    </Modal>
    {lgEdit && logistics && <ArtworkDrawer row={{ ...logistics, entry: { code: e.code, title_en: e.title_en, group_name: e.group_name, school: e.school }, sub: e.sub }} role={me} onClose={() => setLgEdit(false)} onChanged={d.reload} />}
  </>;
}

// Competition pathways: a group whose students are in two cycles competes in the higher one unless someone chooses.
function CycleCard({ e, cy, can, onDone }) {
  const toast = useToast(); const name = n => cy.cycles.find(c => c.n === n);
  async function choose(v) { try { const r = await api("/api/winners", { body: { action: "cycle", code: e.code, cycle: v ? Number(v) : null } }); toast(r.note); onDone(); } catch (x) { toast(x.message, "err"); } }
  return <Card title="Competition cycle" sub={`Its students are in ${cy.options.map(n => `${name(n).name} (${name(n).grades})`).join(" and ")}.`}>
    <p style={{ margin: "0 0 10px" }}>It competes in <b>{name(cy.cycle).name}</b>{cy.chosen ? "" : ", the higher one, unless someone chooses otherwise"}.</p>
    {can ? <select className="select" style={{ maxWidth: 320 }} value={cy.chosen ? String(cy.cycle) : ""} onChange={x => choose(x.target.value)} aria-label="Cycle">
      <option value="">Automatic: {name(Math.max(...cy.options)).name}</option>
      {cy.options.map(n => <option key={n} value={n}>{name(n).name} · {name(n).grades}</option>)}
    </select> : <span className="small faint">Its coordinator, management or the admin can change this.</span>}
  </Card>;
}
