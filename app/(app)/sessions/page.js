"use client";
import VenueSelect from "@/components/VenueSelect";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, useApi, useMeta, useToast, PageHead, Card, Table, Btn, Badge, Banner, Loading, Modal, Field, Check, Two, Prog, Seg, dshort } from "@/components/ui";
import { isOverdue, overdueText, timeText } from "@/lib/sessiontime";

const LABEL = { live: ["In progress", "info"], done: ["Done", "ok"], planned: ["Planned", ""], cancelled: ["Cancelled", "bad"] };
export default function Sessions() {
  const d = useApi("/api/sessions", [], { live: true }); const isEvalUser = meta0 => meta0?.data?.me?.role === "evaluator"; const meta1 = useMeta(); const pl = useApi(isEvalUser(meta1) || !meta1?.data ? null : "/api/sessions?pools=1"); const meta = useMeta(); const toast = useToast(); const router = useRouter();
  const od = useApi(["admin", "coordinator"].includes(meta1?.data?.me?.role) ? "/api/sessions/overdue" : null); const [odBusy, setOdBusy] = useState(null);
  // all reminders now (admin), or one session: its coordinator (admin) or its evaluators who type their own scores
  async function sendOd(b = {}, key = "all") { setOdBusy(key); try { const r = await api("/api/sessions/overdue", { body: b }); toast(r.note); od.reload(); } catch (e) { toast(e.message, "err"); } setOdBusy(null); }
  const [f, setF] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const [show, setShow] = useState("active");
  const [schoolScope, setSchoolScope] = useState("mine"); const [mode, setMode] = useState("count"); const [pq, setPq] = useState("");
  const pe = useApi(f && mode === "pick" && f.round_id ? `/api/sessions?pool=${f.round_id}` : null);
  if (!d.data) return <Loading error={d.error} />;
  const x = d.data; const me = meta?.data?.me;
  const admin = me?.role === "admin";
  const canCreate = ["admin", "coordinator"].includes(me?.role) && x.rounds.length > 0;
  const rd = x.rounds.find(r => r.id === f?.round_id);
  const evs = x.evaluators.filter(e => !rd || (e.pathways || []).includes(rd.pathway_code) || f?.evaluator_ids.includes(e.id));
  const otherEvs = x.evaluators.filter(e => rd && !(e.pathways || []).includes(rd.pathway_code) && !f?.evaluator_ids.includes(e.id));
  const pools = pl.data?.pools || {};
  const pool = (f && pools[f.round_id]) || [];
  const shownPool = admin || schoolScope === "all" ? pool : pool.filter(g => g.mine);
  const chosen = pool.filter(g => f?.school_ids.includes(g.school_id || "none"));
  // "Number of artworks": what is waiting for the ticked subpathways, physical and online
  const subSum = (g, key) => f?.sub_codes.length ? f.sub_codes.reduce((b, c) => b + ((key === "phys" ? g.physSubs : g.subs)[c] || 0), 0) : (key === "phys" ? (g.physical || 0) : g.count);
  const availPhys = pool.reduce((a, g) => a + subSum(g, "phys"), 0), availAll = pool.reduce((a, g) => a + subSum(g, "all"), 0), availOnl = availAll - availPhys;
  const kind = f?.kind || (availPhys ? "physical" : "online");
  const avail = kind === "physical" ? availPhys : kind === "online" ? availOnl : availAll;
  const want = Math.min(Number(f?.count) || 0, avail);
  const physN = mode === "count" ? (kind === "online" ? 0 : Math.min(want, availPhys)) : mode === "pick" ? (pe.data?.entries || []).filter(x => (f?.entry_ids || []).includes(x.id) && !x.online).length : chosen.reduce((a, g) => a + (f?.sub_codes.length ? f.sub_codes.reduce((b, c) => b + ((g.physSubs || {})[c] || 0), 0) : (g.physical || 0)), 0);
  const count = mode === "count" ? want : mode === "pick" ? (f?.entry_ids || []).length : chosen.reduce((a, g) => a + (f?.sub_codes.length ? f.sub_codes.reduce((b, c) => b + (g.subs[c] || 0), 0) : g.count), 0);
  const list = x.sessions.filter(s => show === "all" || (show === "active" ? ["planned", "live"].includes(s.status) : s.status === show));
  async function create() { setBusy(true); setErr(null); try { const r = await api("/api/sessions", { body: mode === "count" ? { ...f, school_ids: [], entry_ids: [], count: want, kind, mine_first: f.mine_first !== false } : mode === "pick" ? { ...f, school_ids: [], sub_codes: [], count: 0 } : { ...f, entry_ids: [], count: 0 } }); toast(`Session created with ${r.count} artworks.`); router.push(`/sessions/${r.id}`); } catch (e) { setErr(e.message); } setBusy(false); }
  return <>
    <PageHead title={me?.role === "evaluator" ? "My sessions" : "Scoring sessions"} sub={me?.role === "evaluator" ? "Scoring sessions you are in. Open one to type your own scores (when you score on your login) and to see the team's saved scores." : "Coordinators run sessions with a team of evaluators: Round 1 and online Round 2 artworks from their files, physical Round 2 artworks in the room. Each evaluator either types their own scores on their login, or the coordinator types them. Several sessions can run at once; each artwork is in one session at a time."} actions={canCreate && <Btn v="primary" onClick={() => { setErr(null); setSchoolScope("mine"); setMode("count"); setPq(""); setF({ entry_ids: [],  round_id: x.rounds[0]?.id || "", title: "", session_date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }), start_time: "09:00", end_time: "13:00", venue_id: "", evaluator_ids: [], self_ids: [], school_ids: [], sub_codes: [], coordinator_id: admin ? "" : undefined }); }}>New session</Btn>} />
    {od.data?.sessions?.length > 0 && <Banner tone="warn" title={`${od.data.sessions.length} session${od.data.sessions.length === 1 ? " is" : "s are"} overdue`} action={admin && <Btn sm busy={odBusy === "all"} onClick={() => sendOd()}>Email all reminders now</Btn>}>
      <div className="od-list">{od.data.sessions.map(x => { const evs = (x.self || []).filter(v => v.left > 0); return <div key={x.id} className="od-row">
        <div className="od-t"><a href={`/sessions/${x.id}`}><b>{x.title}</b></a><span className="small">{[x.session_date && dshort(x.session_date), timeText(x.start_time, x.end_time) || x.time_text, admin && (x.coordinator || "no coordinator"), `${x.done} of ${x.count} scored`].filter(Boolean).join(" · ")}{evs.length > 0 && <span className="faint"> · still to score on their login: {evs.map(v => `${v.name} (${v.left})`).join(", ")}</span>}</span></div>
        <div className="od-a">{admin && <Btn sm busy={odBusy === `c${x.id}`} onClick={() => sendOd({ session_id: x.id, to: "coordinator" }, `c${x.id}`)}>Email coordinator</Btn>}
          {evs.length > 0 && <Btn sm busy={odBusy === `e${x.id}`} onClick={() => sendOd({ session_id: x.id, to: "evaluators" }, `e${x.id}`)}>Remind {evs.length === 1 ? evs[0].name : `${evs.length} evaluators`}</Btn>}</div>
      </div>; })}</div>
      <p className="small" style={{ margin: "6px 0 0" }}>{od.data.mail ? (admin ? (od.data.cron ? "Coordinators and admins are also emailed every morning while a session is overdue." : "Daily emails need CRON_SECRET in Vercel; you can send them from here.") : "Admins and you are emailed every morning while a session is overdue. Finish it, or remind the evaluators who type their own scores.") : "Email is not set up yet (SMTP_USER and SMTP_PASS in Vercel)."}</p></Banner>}
    {pl.data?.ready > 0 && me?.role !== "coordinator" && <Banner title={`${pl.data.ready} artworks are waiting for a session`}>Create a session and pick the schools to score.</Banner>}
    <div className="row" style={{ marginBottom: 12 }}><Seg value={show} onChange={setShow} items={[["active", "Planned and live"], ["done", "Done"], ["cancelled", "Cancelled"], ["all", "All"]]} /></div>
    <Card flush><Table minw={860} cols={["Session", "When", "Coordinator", "Team", "Progress", "Status"]} onRow={i => router.push(me?.role === "storage" ? `/pull-list?session=${list[i].id}` : `/sessions/${list[i].id}`)} empty="No sessions here."
      rows={list.map(s => [<Two key="t" a={s.title} b={s.pathway} />, <Two key="w" a={<>{s.session_date ? dshort(s.session_date) : "Date not set"}{isOverdue(s) && <span style={{ marginLeft: 6 }}><Badge tone="bad">{overdueText(s)}</Badge></span>}</>} b={[timeText(s.start_time, s.end_time) || s.time_text, s.venue].filter(Boolean).join(" · ")} />, s.coordinator || "", <span key="e" className="small">{s.team.map(t => t.name).join(", ")}</span>, <Prog key="p" pct={s.count ? s.scored / s.count * 100 : 0} label={`${s.scored}/${s.count}`} />, <Badge key="s" tone={LABEL[s.status]?.[1]}>{LABEL[s.status]?.[0] || s.status}</Badge>])} /></Card>
    <Modal open={!!f} wide title="New scoring session" onClose={() => setF(null)} footer={<><span className="small faint">{count ? `${count} artwork${count === 1 ? "" : "s"}: ${physN ? `${physN} physical (Logistics brings them to the room)` : "no physical ones"}${count - physN ? `, ${count - physN} online (scored from files)` : ""}` : mode === "count" ? "Enter how many artworks" : mode === "pick" ? "Pick artworks" : "Pick schools"}</span><span className="sp" /><Btn onClick={() => setF(null)}>Cancel</Btn><Btn v="primary" busy={busy} disabled={!count || !f?.session_date || !f?.start_time || !f?.end_time || f.end_time <= f.start_time} onClick={create}>Create session</Btn></>}>
      {err && <Banner tone="bad" title={err} />}
      {f && <div className="stack" style={{ gap: 12 }}>
        <div className="grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
          <Field label="Round"><select className="select" value={f.round_id} onChange={e => setF({ ...f, round_id: e.target.value, evaluator_ids: [], self_ids: [], school_ids: [], sub_codes: [], entry_ids: [] })}>{x.rounds.map(r => <option key={r.id} value={r.id}>{r.pathway} · Round {r.round_no} ({r.status}) {pl.data ? ` · ${(pools[r.id] || []).reduce((a, g) => a + g.count, 0)} waiting` : ""}</option>)}</select></Field>
          {admin && <Field label="Run by"><select className="select" value={f.coordinator_id} onChange={e => setF({ ...f, coordinator_id: e.target.value })}><option value="">Choose a coordinator…</option>{x.coordinators.filter(c => !rd || !c.pathways?.length || c.pathways.includes(rd.pathway_code) || c.id === f.coordinator_id).map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}</select></Field>}
          <Field label="Title (optional)"><input className="input" value={f.title} placeholder="Session name" onChange={e => setF({ ...f, title: e.target.value })} /></Field>
        </div>
        <div className="grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
          <Field label="Date"><input type="date" className="input" value={f.session_date} onChange={e => setF({ ...f, session_date: e.target.value })} /></Field>
          <Field label="Starts"><input type="time" step="900" className="input" value={f.start_time} onChange={e => setF({ ...f, start_time: e.target.value })} /></Field>
          <Field label="Ends" help="A session not finished by then is overdue."><input type="time" step="900" className="input" value={f.end_time} onChange={e => setF({ ...f, end_time: e.target.value })} /></Field>
          <Field label="Venue"><VenueSelect value={f.venue_id} onChange={v => setF({ ...f, venue_id: v })} /></Field>
        </div>
        <Seg value={mode} onChange={setMode} items={[["count", "Number of artworks"], ["schools", "Whole schools"], ["pick", "Pick artworks"]]} />
        {mode === "count" ? <>
          {rd?.subs?.length > 1 && <Field label="Subpathways" help="Leave all unticked for every subpathway."><div className="row" style={{ gap: 12, flexWrap: "wrap" }}>{rd.subs.map(s => <Check key={s.code} label={`${s.name}${s.physical ? " (physical)" : ""}`} checked={f.sub_codes.includes(s.code)} onChange={v => setF({ ...f, sub_codes: v ? [...f.sub_codes, s.code] : f.sub_codes.filter(c => c !== s.code) })} />)}</div></Field>}
          {availPhys > 0 && availOnl > 0 && <Field label="Which artworks"><Seg value={kind} onChange={v => setF({ ...f, kind: v })} items={[["physical", `Physical, in the room (${availPhys})`], ["online", `Online, from files (${availOnl})`], ["both", "Both"]]} /></Field>}
          <Field label="How many artworks" help={kind === "online" ? "Taken school by school." : "Physical artworks are taken in shelf order (room, shelf, row), so Logistics brings them from places close together."}>
            <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input className="input num" style={{ width: 110 }} inputMode="numeric" value={f.count || ""} placeholder="e.g. 20" onChange={e => setF({ ...f, count: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
              {[10, 20, 30].filter(n => n < avail).map(n => <Btn key={n} sm v="ghost" onClick={() => setF({ ...f, count: String(n) })}>{n}</Btn>)}
              {avail > 0 && <Btn sm v="ghost" onClick={() => setF({ ...f, count: String(avail) })}>All {avail}</Btn>}
              <span className="small faint">{pl.data ? `${avail} waiting` : "Counting…"}{Number(f.count) > avail && avail ? ` · only ${avail} can be added` : ""}</span>
            </div>
          </Field>
          <Check label={admin ? "Start with the coordinator's own artworks, then others" : "Start with my artworks, then others"} checked={f.mine_first !== false} onChange={v => setF({ ...f, mine_first: v })} />
        </> : mode === "schools" ? <>
          {rd?.subs?.length > 1 && <Field label="Subpathways" help="Leave all unticked to include every subpathway. Physical ones are scored in the room."><div className="row" style={{ gap: 12, flexWrap: "wrap" }}>{rd.subs.map(s => <Check key={s.code} label={`${s.name}${s.physical ? " (physical)" : ""}`} checked={f.sub_codes.includes(s.code)} onChange={v => setF({ ...f, sub_codes: v ? [...f.sub_codes, s.code] : f.sub_codes.filter(c => c !== s.code) })} />)}</div></Field>}
          <Field label="Schools" help="Every waiting artwork of the ticked schools: online artworks still to be scored, and physical artworks checked in to storage. Artworks in another session are left out.">
            {!admin && <div style={{ marginBottom: 8 }}><Seg value={schoolScope} onChange={setSchoolScope} items={[["mine", "My schools"], ["all", "All schools"]]} /></div>}
            <div className="stack s4" style={{ maxHeight: 260, overflow: "auto" }}>{shownPool.length ? shownPool.map(g => <Check key={g.school_id || "none"} label={`${g.name}${g.esis ? ` (${g.esis})` : ""} · ${g.count} artwork${g.count === 1 ? "" : "s"}${g.mine && !admin ? " · yours" : ""}`} checked={f.school_ids.includes(g.school_id || "none")} onChange={v => setF({ ...f, school_ids: v ? [...f.school_ids, g.school_id || "none"] : f.school_ids.filter(k => k !== (g.school_id || "none")) })} />) : <span className="muted">{!pl.data ? "Finding what's waiting…" : pool.length ? "None of your schools have artworks waiting. Switch to All schools." : "No artworks are waiting for this round."}</span>}</div>
          </Field>
        </> : <PickEntries pe={pe} f={f} setF={setF} q={pq} setQ={setPq} admin={admin} schoolScope={schoolScope} setSchoolScope={setSchoolScope} />}
        <Field label="Evaluator team" help="Tick “types own scores” for evaluators who score on their own login; you type the scores of the others.">
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>{evs.map(e => <Check key={e.id} label={`${e.name}${e.account_id ? "" : " (no login)"}`} checked={f.evaluator_ids.includes(e.id)} onChange={v => setF({ ...f, evaluator_ids: v ? [...f.evaluator_ids, e.id] : f.evaluator_ids.filter(k => k !== e.id), self_ids: v ? f.self_ids : f.self_ids.filter(k => k !== e.id) })} />)}{!evs.length && <span className="muted">No evaluators on this pathway yet.</span>}</div>
          {otherEvs.length > 0 && <details style={{ marginTop: 8 }}><summary className="small faint" style={{ cursor: "pointer" }}>Evaluators from other pathways ({otherEvs.length})</summary><div className="row" style={{ gap: 12, flexWrap: "wrap", marginTop: 8 }}>{otherEvs.map(e => <Check key={e.id} label={e.name} checked={false} onChange={() => setF({ ...f, evaluator_ids: [...f.evaluator_ids, e.id] })} />)}</div></details>}
        </Field>
        {f.evaluator_ids.length > 0 && <Field label="Who types their own scores"><div className="row" style={{ gap: 12, flexWrap: "wrap" }}>{f.evaluator_ids.map(eid => { const v = x.evaluators.find(k => k.id === eid); return v ? <Check key={eid} label={`${v.name}${v.account_id ? "" : " (no login yet)"}`} disabled={!v.account_id} checked={(f.self_ids || []).includes(eid)} onChange={on => setF({ ...f, self_ids: on ? [...(f.self_ids || []), eid] : (f.self_ids || []).filter(k => k !== eid) })} /> : null; })}</div></Field>}
      </div>}
    </Modal>
  </>;
}

// Pick single entries from the waiting pool, grouped by school (a school's box ticks all of its entries).
function PickEntries({ pe, f, setF, q, setQ, admin, schoolScope, setSchoolScope }) {
  if (!pe.data) return <Loading error={pe.error} />;
  const sel = new Set(f.entry_ids || []);
  const set = (ids, on) => { const n = new Set(sel); ids.forEach(id => on ? n.add(id) : n.delete(id)); setF({ ...f, entry_ids: [...n] }); };
  const t = q.trim().toLowerCase();
  const list = pe.data.entries.filter(e => (admin || schoolScope === "all" || e.mine) && (!t || [e.code, e.title, e.school, e.sub].some(v => String(v || "").toLowerCase().includes(t))));
  const groups = Object.values(list.reduce((m, e) => { (m[e.school_id] = m[e.school_id] || { key: e.school_id, name: e.school, rows: [] }).rows.push(e); return m; }, {}));
  return <Field label="Artworks" help="Physical artworks are checked in to storage and go on the pull list; online artworks are scored from their files. Artworks in another session are left out.">
    <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: "wrap" }}>{!admin && <Seg value={schoolScope} onChange={setSchoolScope} items={[["mine", "My schools"], ["all", "All schools"]]} />}<input className="input" style={{ flex: "1 1 200px" }} placeholder="Search code, title, school" value={q} onChange={e => setQ(e.target.value)} /></div>
    <div className="stack s4" style={{ maxHeight: 300, overflow: "auto", border: "1px solid var(--rule)", borderRadius: "var(--r)", padding: 8 }}>
      {groups.length ? groups.map(g => { const ids = g.rows.map(e => e.id); const on = ids.every(id => sel.has(id)); return <details key={g.key} open={!!t}>
        <summary className="row nowrap" style={{ gap: 8, cursor: "pointer", padding: "4px 0" }}><span onClick={e => e.stopPropagation()}><Check label="" checked={on} onChange={v => set(ids, v)} /></span><b style={{ fontWeight: 500 }}>{g.name}</b><span className="small faint">{ids.filter(id => sel.has(id)).length}/{ids.length}</span></summary>
        <div className="stack s4" style={{ paddingLeft: 32, paddingBottom: 6 }}>{g.rows.map(e => <Check key={e.id} label={`${e.code} · ${e.title || ""} · ${e.sub || ""} · ${e.online ? "online, scored from files" : `physical${e.where ? `, ${e.where}` : ""}`}`} checked={sel.has(e.id)} onChange={v => set([e.id], v)} />)}</div>
      </details>; }) : <span className="muted">No artworks are waiting{!admin && schoolScope === "mine" ? " for your schools. Switch to All schools." : "."}</span>}
    </div>
  </Field>;
}
