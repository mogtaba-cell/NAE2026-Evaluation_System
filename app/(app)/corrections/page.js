"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, useApi, useMeta, useToast, PageHead, Card, Btn, Badge, Banner, Loading, Field, Seg, Kpis, Search, Modal, when } from "@/components/ui";
import FileViewer from "@/components/FileViewer";

// Corrections: artworks sent to their coordinator from the evaluation, proofreading or the final review. The list on
// the left; the artwork's files in the middle; the request, the log of every contact with the school, the text to
// correct and the outcome on the right. Corrected → back to whoever asked. No response from the school → the
// pathway's default text (text problems) or not scored (artwork problems).
const DAY = 86400000;
const age = at => Math.floor((Date.now() - Date.parse(at)) / DAY);
const KIND = { opened: "Sent for correction", contacted: "Contacted the school", replied: "The school replied", note: "Note", waiting: "Status", file: "File", visibility: "Files shown to evaluators", details: "Details corrected", closed: "Closed" };
export default function Corrections() {
  const sp = useSearchParams(); const router = useRouter(); const meta = useMeta();
  const f = sp.get("f") || "open"; const sel = sp.get("id"); const byCode = sp.get("entry"); const [q, setQ0] = useState(""); const [team, setTeam] = useState(false);
  const d = useApi("/api/corrections", [], { live: 20000 });
  const setQ = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== "id") n.delete("id"); n.delete("entry"); router.replace(`/corrections?${n}`, { scroll: false }); };
  const all = d.data?.rows || [];
  const t = q.trim().toLowerCase();
  const rows = all.filter(r => (f === "all" || (f === "open" ? r.status === "open" : f === "late" ? r.status === "open" && age(r.opened_at) >= 3 : r.status !== "open")) && (!t || [r.code, r.title, r.school, r.esis, r.coordinator].some(v => String(v || "").toLowerCase().includes(t))))
    .sort((a, b) => f === "closed" ? String(b.closed_at).localeCompare(String(a.closed_at)) : a.opened_at.localeCompare(b.opened_at));
  const fromCode = byCode ? (all.find(r => r.code === byCode && r.status === "open") || all.find(r => r.code === byCode)) : null;
  const id = sel || fromCode?.id || rows[0]?.id || null;
  useEffect(() => { if (!sel && id && d.data) router.replace(`/corrections?${new URLSearchParams({ ...Object.fromEntries(sp), id })}`, { scroll: false }); }, [sel, id, d.data ? 1 : 0]); // eslint-disable-line
  if (!d.data || !meta?.data) return <Loading error={d.error} />;
  const me = meta.data.me?.role; const R = d.data.reasons;
  const open = all.filter(r => r.status === "open");
  return <>
    <PageHead title="Corrections" sub={me === "coordinator" ? "Artworks sent back to you because the file or the details need correcting. Contact the school, log every contact, then send each artwork back corrected. If the school doesn't respond: missing or wrong text gets the pathway's default text; a wrong or unclear artwork is marked not scored." : "Artworks with their coordinators for a correction from the school: from the evaluation, proofreading or the final review. Only the selected corrections coordinators receive them, shared out by school."}
      actions={["admin", "management"].includes(me) ? <Btn onClick={() => setTeam(true)}>Corrections coordinators</Btn> : null} />
    {team && <Team onClose={() => setTeam(false)} onDone={() => d.reload()} />}
    <Kpis dense items={[["Open", open.length, "with coordinators"], ["Waiting 3 days or more", open.filter(r => age(r.opened_at) >= 3).length, "", open.some(r => age(r.opened_at) >= 3) ? "bad" : "ok"], ["Waiting for the school", open.filter(r => r.waiting_since).length, "contacted, no answer yet"], ["Closed", all.length - open.length, ""]]} />
    {!all.length ? <Card><p className="muted" style={{ margin: 0 }}>No corrections. Artworks come here when an evaluator, proofreader or reviewer finds a problem the school needs to fix.</p></Card> :
    <div className="f3-sc f3-sess rv-ws">
      <section className="card f3-queue">
        <div className="qh"><Seg value={f} onChange={v => setQ("f", v)} items={[["open", `Open ${open.length}`], ["late", "3+ days"], ["closed", "Closed"], ["all", "All"]]} />
          <Search value={q} onChange={setQ0} placeholder="Code, title, school or coordinator" /></div>
        <div className="qb">{rows.map(r => { const a = age(r.opened_at); return <div key={r.id} role="button" tabIndex={0} className={`f3-qi${r.id === id ? " on" : ""}`} onClick={() => setQ("id", r.id)} onKeyDown={k => k.key === "Enter" && setQ("id", r.id)}>
          <div className="t tf"><b dir="auto">{r.title || "Untitled"}</b><span className="cd">{r.code} · {r.school}</span>
            <span className="rv-who">{r.status === "open" ? <><Badge tone={a >= 3 ? "bad" : a >= 1 ? "warn" : ""}>{a ? `${a} day${a === 1 ? "" : "s"}` : "Today"}</Badge> <span>{R[r.reason]?.label} · {d.data.sources[r.source]}{me !== "coordinator" ? ` · ${r.coordinator}` : ""}</span></> : <span>{d.data.statuses[r.status]} · {R[r.reason]?.label}</span>}</span></div></div>; })}
          {!rows.length && <p className="small faint" style={{ padding: 12 }}>Nothing here.</p>}</div>
      </section>
      {id ? <Detail key={id} id={id} onDone={() => d.reload()} /> : <><div /><div /></>}
    </div>}
  </>;
}

// Admin: which coordinators receive corrections, and which school each one has (a school stays with one of them).
function Team({ onClose, onDone }) {
  const d = useApi("/api/corrections?team=1"); const toast = useToast();
  const [ids, setIds] = useState(null); const [busy, setBusy] = useState(null); const [err, setErr] = useState(null); const [fq, setFq] = useState("");
  useEffect(() => { if (d.data && !ids) setIds(d.data.coordinators.filter(a => a.handles_corrections).map(a => a.id)); }, [d.data]); // eslint-disable-line
  const sel = d.data ? d.data.coordinators.filter(a => a.handles_corrections) : [];
  const dirty = d.data && ids && JSON.stringify([...ids].sort()) !== JSON.stringify(sel.map(a => a.id).sort());
  async function go(key, body) { setBusy(key); setErr(null); try { const r = await api("/api/corrections", { body }); toast(r.note); d.reload(); onDone(); } catch (x) { setErr(x.message); } setBusy(null); }
  const t = fq.trim().toLowerCase(); const schools = (d.data?.schools || []).filter(x => !t || `${x.name} ${x.esis}`.toLowerCase().includes(t));
  return <Modal open wide title="Corrections coordinators" sub="Only these coordinators receive artworks that need a correction from the school. Each school stays with one of them; a new school goes to whoever has the fewest schools." onClose={onClose}
    footer={<><Btn onClick={onClose}>Close</Btn><Btn v="primary" disabled={!dirty} busy={busy === "team"} onClick={() => go("team", { action: "team", ids })}>Save the selection</Btn></>}>
    {!d.data || !ids ? <Loading error={d.error} /> : <div className="stack" style={{ gap: 14 }}>
      {err && <Banner tone="bad" title={err} />}
      {d.data.unassigned > 0 && <Banner tone="warn" title={`${d.data.unassigned} open correction${d.data.unassigned === 1 ? " has" : "s have"} no coordinator`}>Select coordinators and save: they are shared out by school.</Banner>}
      <Field label="Coordinators who handle corrections" help={dirty ? "Saving shares out the schools (and their open corrections) of anyone you untick." : ""}>
        <div className="stack s4">{d.data.coordinators.filter(a => a.active !== false).map(a => <label key={a.id} className="row" style={{ gap: 8 }}><input type="checkbox" checked={ids.includes(a.id)} onChange={x => setIds(x.target.checked ? [...ids, a.id] : ids.filter(i => i !== a.id))} /><span className="small">{a.display_name}</span>{a.handles_corrections && <span className="small faint">· {a.schools} school{a.schools === 1 ? "" : "s"} · {a.open} open</span>}</label>)}</div></Field>
      <div className="stack s8">
        <div className="row" style={{ gap: 8 }}><b className="small">Schools ({d.data.schools.length})</b><span className="sp" /><Search value={fq} onChange={setFq} placeholder="School or eSIS" /></div>
        {!d.data.schools.length ? <p className="small faint" style={{ margin: 0 }}>No schools yet. A school is given to a coordinator the first time one of its artworks needs a correction.</p> :
        <div className="tw" style={{ maxHeight: 320, overflow: "auto" }}><table className="x-cmp"><thead><tr><th>School</th><th>Open</th><th>Coordinator</th></tr></thead><tbody>
          {schools.map(x => <tr key={x.school_id}><td><span className="small" dir="auto">{x.name}</span>{x.esis && <span className="small faint"> · eSIS {x.esis}</span>}</td><td>{x.open || ""}</td>
            <td><select className="select" style={{ minWidth: 160 }} disabled={busy === x.school_id || !sel.length} value={sel.some(a => a.id === x.coordinator_id) ? x.coordinator_id : ""} onChange={e => go(x.school_id, { action: "move_school", school_id: x.school_id, coordinator_id: e.target.value })}>
              {!sel.some(a => a.id === x.coordinator_id) && <option value="">Not assigned</option>}{sel.map(a => <option key={a.id} value={a.id}>{a.display_name}</option>)}</select></td></tr>)}
        </tbody></table></div>}
      </div>
    </div>}
  </Modal>;
}

function Detail({ id, onDone }) {
  const d = useApi(`/api/corrections?id=${id}`); const toast = useToast();
  const [entry, setEntry] = useState(null); const [f, setF] = useState(null); const [busy, setBusy] = useState(null); const [ask, setAsk] = useState(null); const [err, setErr] = useState(null);
  useEffect(() => { if (!d.data) return; const e = d.data.entry; setF({ title_en: e.title_en || "", title_ar: e.title_ar || "", description_en: e.description_en || "", description_ar: e.description_ar || "", reflections: { influence: e.reflections?.influence || "", enjoy: e.reflections?.enjoy || "", focus: e.reflections?.focus || "" } }); setEntry({ kind: "contacted", channel: "call", text: "" }); }, [d.data]);
  if (!d.data || !f) return <><div className="stack" style={{ minWidth: 0 }}><Loading error={d.error} /></div><div /></>;
  const { correction: c, entry: e, reasons: R, statuses: ST, channels: CH, can } = d.data;
  const open = c.status === "open"; const work = can.work && open; const kind = R[c.reason]?.kind;
  const reload = () => { d.reload(); onDone(); };
  async function go(key, body, ok) { setBusy(key); setErr(null); try { const r = await api("/api/corrections", { body: { id: c.id, ...body } }); toast(r.note); setAsk(null); ok && ok(); reload(); } catch (x) { setErr(x.message); } setBusy(null); }
  async function upload(file) { setBusy("file"); setErr(null); try { const r = await fetch("/api/corrections/file", { method: "POST", headers: { "content-type": file.type || "application/octet-stream", "x-id": c.id, "x-name": encodeURIComponent(file.name) }, body: file }); const j = await r.json(); if (!r.ok) throw new Error(j.error); toast(j.note); reload(); } catch (x) { setErr(x.message); } setBusy(null); }
  const changed = JSON.stringify(f) !== JSON.stringify({ title_en: e.title_en || "", title_ar: e.title_ar || "", description_en: e.description_en || "", description_ar: e.description_ar || "", reflections: { influence: e.reflections?.influence || "", enjoy: e.reflections?.enjoy || "", focus: e.reflections?.focus || "" } });
  const def = d.data.defaults; const hasDef = Object.values(def).some(v => String(v || "").trim());
  const txt = (k, label, ar, rows = 1) => <Field label={label}>{rows > 1 ? <textarea className="textarea" rows={rows} dir={ar ? "rtl" : "auto"} disabled={!work} value={f[k]} onChange={x => setF({ ...f, [k]: x.target.value })} /> : <input className="input" dir={ar ? "rtl" : "auto"} disabled={!work} value={f[k]} onChange={x => setF({ ...f, [k]: x.target.value })} />}</Field>;
  const outcomes = [["corrected", "Corrected: send back", c.source === "evaluation" ? "It goes back for scoring (to the same session if it's still running)." : `It goes back to the ${c.source === "review" ? "reviewer" : "proofreader"} who asked.`, "primary"],
    ["no_response", "No response from the school", kind === "text" ? (hasDef ? "The pathway's default title and description replace the text, and it goes on." : "The pathway has no default text yet: ask an admin to set it in Program setup.") : "The artwork is marked not scored."],
    ...(kind === "artwork" ? [["still_faulty", "New submission still incomplete / faulty", "The artwork is marked not scored."]] : [])];
  return <>
    <div className="stack sticky-view" style={{ gap: 12, minWidth: 0 }}>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><a className="code" style={{ fontSize: 15, fontWeight: 600 }} href={`/entries/${e.code}`}>{e.code}</a><Badge>{e.pathway}</Badge><Badge>{e.sub}</Badge><Badge tone={open ? "warn" : c.status === "corrected" ? "ok" : c.status === "not_scored" ? "bad" : "info"}>{ST[c.status]}</Badge></div>
      <FileViewer files={d.data.files || []} tall />
      <span className="small faint">{e.school?.name}{e.school?.esis ? ` · eSIS ${e.school.esis}` : ""}</span>
      {d.data.students.length > 0 && <div className="small faint">Students (can't be changed here): {d.data.students.map(s => `${s.name_en || s.name_ar}${s.grade ? ` (${s.grade})` : ""}`).join(", ")}</div>}
    </div>
    <div className="stack" style={{ gap: 14, minWidth: 0 }}>
      <Banner tone={open ? "warn" : ""} title={`${R[c.reason]?.label} · from ${d.data.sources[c.source]}${d.data.session ? ` (${d.data.session.title})` : ""}`}>{`${c.requested_by || "Someone"} ${when(c.opened_at)}: “${c.note}”. ${R[c.reason]?.text}`}{!open && ` Closed ${when(c.closed_at)} by ${c.closed_by}: ${ST[c.status]}${c.outcome_note ? ` (${c.outcome_note})` : ""}.`}</Banner>
      {err && <Banner tone="bad" title={err} />}
      <Card title="Contact with the school" sub={c.waiting_since ? `Waiting for the school since ${when(c.waiting_since)} (${age(c.waiting_since)} day${age(c.waiting_since) === 1 ? "" : "s"}).` : open ? "Log every call, email or message, and the school's replies." : ""}
        right={work && <Btn sm v={c.waiting_since ? "secondary" : "ghost"} busy={busy === "wait"} onClick={() => go("wait", { action: "waiting", on: !c.waiting_since })}>{c.waiting_since ? "Not waiting any more" : "Waiting for the school"}</Btn>}>
        <div className="cr-log">{d.data.log.map(l => <div key={l.id} className={`cr-l k-${l.kind}`}><span className="small faint">{when(l.at)} · {l.by_name}</span><b className="small">{KIND[l.kind] || l.kind}{l.channel ? ` (${CH[l.channel]})` : ""}</b>{l.text && <span className="small" dir="auto">{l.text}</span>}{l.file_path && <a className="small link" href={`/api/corrections/file?log=${l.id}`}>{l.file_name}</a>}</div>)}</div>
        {can.work && entry && <div className="cr-add">
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}><select className="select" style={{ width: 200 }} value={entry.kind} onChange={x => setEntry({ ...entry, kind: x.target.value })}><option value="contacted">Contacted the school</option><option value="replied">The school replied</option><option value="note">Note</option></select>
            {entry.kind !== "note" && <select className="select" style={{ width: 150 }} value={entry.channel} onChange={x => setEntry({ ...entry, channel: x.target.value })}>{Object.entries(CH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}</div>
          <textarea className="textarea" rows={2} dir="auto" value={entry.text} placeholder={entry.kind === "contacted" ? "Who you spoke to and what you asked for" : entry.kind === "replied" ? "What the school said or sent" : "Note"} onChange={x => setEntry({ ...entry, text: x.target.value })} />
          <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}><Btn sm v="primary" busy={busy === "log"} disabled={entry.kind === "note" && !entry.text.trim()} onClick={() => go("log", { action: "log", kind: entry.kind, channel: entry.channel, text: entry.text }, () => setEntry({ ...entry, text: "" }))}>Add to the log</Btn></div>
        </div>}
      </Card>
      {(kind === "artwork" || work) && <Card title={c.reason === "artwork_mismatch" ? "Correct artwork image" : "Artwork file"} sub={c.reason === "artwork_mismatch" ? "Upload the correct artwork image the school sent (or check the artwork's folder if the school uploaded it there). Needed before it goes back for scoring." : kind === "artwork" ? "Add the correct file the school sent, or check the artwork's folder if the school uploaded it there." : "If the school sends a new file too, add it here."}>
        {work ? <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><label className="btn sm">{busy === "file" ? "Uploading…" : c.reason === "artwork_mismatch" ? "Upload the correct artwork image" : "Add the school's file"}<input type="file" hidden onChange={x => x.target.files?.[0] && upload(x.target.files[0])} /></label><Btn sm busy={busy === "files"} onClick={() => go("files", { action: "check_files" })}>Check the artwork's folder</Btn></div> : <p className="small faint" style={{ margin: 0 }}>Closed.</p>}
        {(d.data.files || []).length > 0 && <div className="stack s4" style={{ marginTop: 12 }}>
          <span className="small faint">{c.reason === "artwork_mismatch" ? "When the correct image is in, the files it replaces are hidden from evaluators. You can also hide or show a file here." : "Files evaluators see. Hide a file that isn't this artwork."}</span>
          {d.data.files.map(x => <div key={x.id} className="cr-file"><span className="small" dir="auto" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: x.hidden ? "line-through" : "none" }}>{x.name}</span>
            {x.hidden ? <Badge tone="warn">Hidden from evaluators</Badge> : null}<span className="sp" />
            {work && <Btn sm v="ghost" busy={busy === x.id} onClick={() => go(x.id, { action: "file_visibility", drive_id: x.id, hidden: !x.hidden })}>{x.hidden ? "Show again" : "Hide"}</Btn>}</div>)}
        </div>}
      </Card>}
      <Card title="Title, description and answers" sub={work ? "Correct them with what the school sends. Student names and grades can't be changed here." : ""} right={work && changed && <Btn sm v="primary" busy={busy === "det"} onClick={() => go("det", { action: "details", details: e.competition ? { title_en: f.title_en, title_ar: f.title_ar, description_en: f.description_en, description_ar: f.description_ar } : f })}>Save</Btn>}>
        <div className="stack" style={{ gap: 10 }}>{txt("title_en", "Title (English)")}{txt("title_ar", "Title (Arabic)", true)}{txt("description_en", "Description (English)", false, 3)}{txt("description_ar", "Description (Arabic)", true, 3)}
          {!e.competition && [["influence", "Did anyone or anything influence your idea?"], ["enjoy", "What was the most enjoyable part of creating your work?"], ["focus", "What elements did you focus on, and why?"]].map(([k, l]) => <Field key={k} label={l}><textarea className="textarea" rows={2} dir="auto" disabled={!work} value={f.reflections[k]} onChange={x => setF({ ...f, reflections: { ...f.reflections, [k]: x.target.value } })} /></Field>)}</div>
      </Card>
      {work && <Card title="Outcome">
        <div className="stack" style={{ gap: 8 }}>{outcomes.map(([k, label, help, v]) => <div key={k} className="cr-out"><div className="stack s4" style={{ minWidth: 0 }}><b className="small">{label}</b><span className="small faint">{help}</span></div><Btn sm v={v || "secondary"} disabled={changed || (k === "no_response" && kind === "text" && !hasDef)} title={changed ? "Save the text first" : ""} onClick={() => setAsk({ outcome: k, label, help, note: "" })}>{label.split(":")[0]}</Btn></div>)}</div>
        {changed && <p className="small" style={{ color: "var(--warn)", margin: "8px 0 0" }}>Save the corrected text first.</p>}
      </Card>}
      {d.data.others.length > 0 && <p className="small faint" style={{ margin: 0 }}>Earlier corrections for this artwork: {d.data.others.map(o => `${R[o.reason]?.label} (${ST[o.status]}, ${when(o.opened_at)})`).join(" · ")}</p>}
    </div>
    <Modal open={!!ask} title={ask?.label} sub={ask?.help} onClose={() => setAsk(null)} footer={<><Btn onClick={() => setAsk(null)}>Cancel</Btn><Btn v="primary" busy={busy === "close"} onClick={() => go("close", { action: "close", outcome: ask.outcome, note: ask.note })}>Confirm</Btn></>}>
      {ask && <Field label="Note (optional)"><textarea className="textarea" rows={2} value={ask.note} onChange={x => setAsk({ ...ask, note: x.target.value })} placeholder={ask.outcome === "corrected" ? "What the school sent" : "For example: called three times, no answer"} /></Field>}
    </Modal>
  </>;
}
