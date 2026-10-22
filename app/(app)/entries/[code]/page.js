"use client";
import { useState, use } from "react";
import { api, useApi, useMeta, useToast, PageHead, Card, Badge, Banner, Btn, Loading, Modal, Field, statusBadge, when, dueTxt, Tabs, Two } from "@/components/ui";
import FileViewer from "@/components/FileViewer";
import EntryAbout from "@/components/EntryAbout";
import { total as wTotal } from "@/components/ScoreForm";

const REASONS = ["Close to the pass mark", "Evaluators disagree", "Possible plagiarism or AI use", "Eligibility question", "Wrong pathway or subpathway", "Other"];
const LG = { to_collect: "To collect", storage: "In storage", coordinator: "With coordinator", missing: "Missing", returned: "Returned" };

function RoundCard({ r, d, me, onChanged }) {
  const toast = useToast(); const [edit, setEdit] = useState(null); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const crit = r.rubric?.criteria || [];
  const res = r.result;
  async function saveEdit() { setBusy(true); setErr(null); try { const x = await api("/api/scores/edit", { body: { score_id: edit.id, scores: edit.scores, national_identity: edit.national_identity, reason } }); toast(`Score changed to ${x.total}`); setEdit(null); setReason(""); onChanged(); } catch (e) { setErr(e.message); } setBusy(false); }
  return <Card title={`Round ${r.round_no}${r.physical ? " · physical" : " · online"}`} sub={`${r.rubric ? `Rubric ${r.rubric.code} v${r.rubric.version} · ` : ""}Pass: ${r.pass_text}`} right={res?.flag ? <Badge tone="warn">Flagged</Badge> : res?.passed === true ? <Badge tone="ok">Through</Badge> : res?.passed === false ? <Badge>Not through</Badge> : <Badge>{r.status === "open" ? "Scoring" : r.status}</Badge>}>
    {res && res.team != null && <div className="x-tot"><div className="stack s4"><span className="s">{res.final != null && res.final !== res.team ? "Final (after review)" : "Team result"}</span><span className="v">{res.final ?? res.team}</span></div><div className="stack s4"><span className="s">Grade</span><span style={{ fontSize: 18, fontWeight: 600 }}>{res.grade}</span></div>{r.rubric?.identity_required && <div className="stack s4"><span className="s">Identity</span><span>{res.identity_yes ? "Yes" : "No"}</span></div>}<span className="s" style={{ marginLeft: "auto" }}>{res.scored} of {res.needed} scored{res.locked ? " · locked" : ""}</span></div>}
    {r.scores.length > 0 ? <div className="tw"><table className="x-cmp"><thead><tr><th>Evaluator</th>{crit.map(c => <th key={c.key} title={c.label}>{c.label.split(" ")[0]} {c.weight}%</th>)}{r.rubric?.identity_required && <th>ID</th>}<th>Total</th>{d.can.editScore && <th></th>}</tr></thead>
      <tbody>{r.scores.map(s => <tr key={s.id}><td><Two a={s.evaluator} b={s.status === "submitted" ? (s.self ? `Submitted ${when(s.submitted_at)}` : `Entered by ${s.entered_by || "coordinator"}`) : "Draft"} /></td>{crit.map(c => <td key={c.key}>{s.scores?.[c.key] ?? ""}</td>)}{r.rubric?.identity_required && <td>{s.national_identity == null ? "" : s.national_identity ? "Yes" : "No"}</td>}<td>{s.status === "submitted" ? s.total : "–"}</td>{d.can.editScore && <td>{s.status === "submitted" && <Btn sm v="ghost" onClick={() => setEdit({ ...s, scores: { ...s.scores } })}>Change</Btn>}</td>}</tr>)}</tbody></table></div>
      : <p className="muted">{r.evaluators.length ? `Waiting for ${r.evaluators.map(e => e.name).join(" and ")}.` : r.status === "open" ? "No evaluators assigned yet." : "Scoring has not started."}</p>}
    {r.hidden > 0 && <p className="x-note">{r.hidden} other score{r.hidden > 1 ? "s are" : " is"} hidden until you submit yours.</p>}
    {r.reviews.map(v => <Banner key={v.id} tone={v.status === "open" ? "warn" : ""} title={v.status === "open" ? `Review with ${v.manager || "management"} · ${dueTxt(v.due_at)[0]}` : v.status === "overridden" ? `Overridden to ${v.new_result} by ${v.manager || "management"}` : `Confirmed by ${v.manager || "management"}`}
      action={v.status === "open" && ["admin", "management"].includes(me) ? <Btn sm href={`/reviews/${v.id}`}>Open review</Btn> : null}>{v.reason}{v.decision_note ? ` · ${v.decision_note}` : ""}</Banner>)}
    <Modal open={!!edit} title="Change a submitted score" sub={edit ? `${d.entry.code} · ${edit.evaluator} · Round ${r.round_no}` : ""} onClose={() => setEdit(null)} footer={<><Btn onClick={() => setEdit(null)}>Cancel</Btn><Btn v="primary" busy={busy} disabled={!reason.trim()} onClick={saveEdit}>Save change</Btn></>}>
      {err && <Banner tone="bad" title={err} />}
      {edit && crit.map(c => <div className="f3-crit" key={c.key}><div className="lab"><b>{c.label}</b><span>{c.weight}%</span></div><input className="sc-in" inputMode="numeric" value={edit.scores[c.key] ?? ""} onChange={e => setEdit({ ...edit, scores: { ...edit.scores, [c.key]: e.target.value.replace(/\D/g, "").slice(0, 3) } })} /></div>)}
      {edit && <p className="strong">New total {wTotal(crit, edit.scores)} (was {edit.total})</p>}
      <Field label="Reason (kept in the audit log)"><textarea className="textarea" rows={2} value={reason} onChange={e => setReason(e.target.value)} /></Field>
    </Modal>
  </Card>;
}

export default function EntryPage({ params }) {
  const { code } = use(params);
  const d = useApi(`/api/entries/${encodeURIComponent(code)}`);
  const meta = useMeta(); const toast = useToast(); const me = meta?.data?.me?.role;
  const [flag, setFlag] = useState(false); const [fr, setFr] = useState({ reason: "", note: "" }); const [busy, setBusy] = useState(false);
  const [coord, setCoord] = useState(false); const [tab, setTab] = useState("rounds"); const [refreshing, setRefreshing] = useState(false); const [files, setFiles] = useState(null);
  if (!d.data) return <Loading error={d.error} />;
  const { entry: e, students, rounds, logistics, sessions, history } = d.data;
  async function doFlag() { setBusy(true); try { const r = await api("/api/reviews", { body: { entry_code: e.code, round_no: e.current_round, ...fr } }); toast(r.note); setFlag(false); d.reload(); } catch (x) { toast(x.message, "err"); } setBusy(false); }
  async function refresh() { setRefreshing(true); try { const r = await api(`/api/entries/${encodeURIComponent(e.code)}/files`); setFiles(r.files); toast(`${r.files.length} file${r.files.length === 1 ? "" : "s"} found`); } catch (x) { toast(x.message, "err"); } setRefreshing(false); }
  async function setCoordinator(id) { try { await api(`/api/entries/${e.code}`, { method: "PATCH", body: { coordinator_id: id } }); toast("Coordinator changed"); setCoord(false); d.reload(); } catch (x) { toast(x.message, "err"); } }
  return <>
    <PageHead back={["Entries", "/entries"]} title={<span className="code" style={{ fontSize: 22 }}>{e.code}</span>} badges={statusBadge(e)}
      sub={<>{[e.pathway, e.sub].filter(Boolean).join(" · ")} · {e.school?.name}{e.school?.region ? `, ${e.school.region}` : ""} · <span className="faint">referenceId {e.reference_id}</span></>}
      actions={<>{d.data.can.flag && <Btn onClick={() => setFlag(true)}>Flag for review</Btn>}{d.data.can.allocate && <Btn onClick={() => setCoord(true)}>Coordinator: {e.coordinator || "none"}</Btn>}</>} />
    <div className="x-side x-rec">
      <div className="stack" style={{ gap: 16, minWidth: 0 }}>
        <section className="card"><FileViewer files={files || d.data.files} canDownload={d.data.can.download} onRefresh={refresh} refreshing={refreshing} checkedAt={e.files_checked_at ? when(e.files_checked_at) : null} /></section>
        <EntryAbout e={e} students={students} showStudents={me !== "evaluator"} />
      </div>
      <div className="stack" style={{ gap: 16, minWidth: 0 }}>
        <Tabs value={tab} onChange={setTab} items={[["rounds", "Scores"], ["details", "Details"], ...(me !== "evaluator" ? [["history", "History", history.length]] : [])]} />
        {tab === "rounds" && (rounds.length ? rounds.slice().reverse().map(r => <RoundCard key={r.id} r={r} d={d.data} me={me} onChanged={d.reload} />) : <Card><p className="muted">No round has been set up for this pathway yet.</p></Card>)}
        {tab === "details" && <>
          <Card title="Submission"><dl className="kv">{[["Entry code", e.code], ["referenceId", e.reference_id], ["RegistrationId", e.registration_id], ["Submitted", e.submitted_at ? when(e.submitted_at) : ""], ["School", `${e.school?.name || ""}${e.school?.esis ? ` · eSIS ${e.school.esis}` : ""}`], ["School type", e.school?.school_type], ["Coordinator", e.coordinator || "Not allocated"], ["Drive folder", e.source_path]].filter(x => x[1]).flatMap(([k, v]) => [<dt key={k}>{k}</dt>, <dd key={k + "v"}>{v}</dd>])}</dl></Card>
          {logistics && <Card title="Artwork logistics" right={<Badge tone={logistics.state === "missing" ? "bad" : logistics.state === "storage" ? "ok" : ""}>{LG[logistics.state]}</Badge>}><dl className="kv">{[["Location", logistics.location], ["Condition", logistics.condition], ["Collection", logistics.collection ? `${logistics.collection.code || ""} ${logistics.collection.scheduled_on || ""}` : null]].filter(x => x[1]).flatMap(([k, v]) => [<dt key={k}>{k}</dt>, <dd key={k + "v"}>{v}</dd>])}</dl></Card>}
          {sessions.length > 0 && <Card title="Scoring sessions">{sessions.map(s => <Two key={s.id} a={s.title} b={`${s.session_date || ""} · ${s.venue || ""} · ${s.status}`} />)}</Card>}
        </>}
        {tab === "history" && <Card flush><div className="tl" style={{ padding: 16 }}>{history.length ? history.map(h => <div key={h.id} className="stack s4" style={{ padding: "8px 0", borderTop: "1px solid var(--rule)" }}><span className="strong">{h.action}</span><span className="small faint">{h.actor_name || "System"} · {when(h.at)}</span>{h.detail && <span className="small muted" style={{ overflowWrap: "anywhere" }}>{h.detail}</span>}</div>) : <p className="muted">Nothing recorded yet.</p>}</div></Card>}
      </div>
    </div>
    <Modal open={flag} title="Flag for management review" sub={`${e.code} · Round ${e.current_round}`} onClose={() => setFlag(false)} footer={<><Btn onClick={() => setFlag(false)}>Cancel</Btn><Btn v="primary" busy={busy} disabled={!fr.reason} onClick={doFlag}>Flag</Btn></>}>
      <Field label="Reason"><select className="select" value={fr.reason} onChange={x => setFr({ ...fr, reason: x.target.value })}><option value="">Choose…</option>{REASONS.map(r => <option key={r}>{r}</option>)}</select></Field>
      <Field label="Note for the manager"><textarea className="textarea" rows={3} value={fr.note} onChange={x => setFr({ ...fr, note: x.target.value })} /></Field>
      <p className="x-note">The review goes to the manager with the fewest open reviews and is due in 48 hours.</p>
    </Modal>
    <Modal open={coord} title="Change coordinator" onClose={() => setCoord(false)}>
      <div className="stack s8">{(meta?.data?.accounts || []).filter(a => a.role === "coordinator").map(a => <Btn key={a.id} v={a.id === e.coordinator_id ? "primary" : "secondary"} onClick={() => setCoordinator(a.id)}>{a.display_name}</Btn>)}<Btn v="ghost" onClick={() => setCoordinator(null)}>Remove coordinator</Btn></div>
    </Modal>
  </>;
}
