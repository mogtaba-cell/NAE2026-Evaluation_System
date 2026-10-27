"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, useApi, useMeta, useToast, PageHead, Card, Table, Btn, Badge, Banner, Loading, Modal, Field, Check, Two, Prog, Seg, dshort } from "@/components/ui";

const LABEL = { live: ["In progress", "info"], done: ["Done", "ok"], planned: ["Planned", ""], cancelled: ["Cancelled", "bad"] };
export default function Sessions() {
  const d = useApi("/api/sessions"); const meta = useMeta(); const toast = useToast(); const router = useRouter();
  const [f, setF] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const [show, setShow] = useState("active");
  const [schoolScope, setSchoolScope] = useState("mine"); const [mode, setMode] = useState("schools"); const [pq, setPq] = useState("");
  const pe = useApi(f && mode === "pick" && f.round_id ? `/api/sessions?pool=${f.round_id}` : null);
  if (!d.data) return <Loading error={d.error} />;
  const x = d.data; const me = meta?.data?.me;
  const admin = me?.role === "admin";
  const canCreate = ["admin", "coordinator"].includes(me?.role) && x.rounds.length > 0;
  const rd = x.rounds.find(r => r.id === f?.round_id);
  const evs = x.evaluators.filter(e => !rd || (e.pathways || []).includes(rd.pathway_code) || f?.evaluator_ids.includes(e.id));
  const otherEvs = x.evaluators.filter(e => rd && !(e.pathways || []).includes(rd.pathway_code) && !f?.evaluator_ids.includes(e.id));
  const pool = (f && x.pools[f.round_id]) || [];
  const shownPool = admin || schoolScope === "all" ? pool : pool.filter(g => g.mine);
  const chosen = pool.filter(g => f?.school_ids.includes(g.school_id || "none"));
  const count = mode === "pick" ? (f?.entry_ids || []).length : chosen.reduce((a, g) => a + (f?.sub_codes.length ? f.sub_codes.reduce((b, c) => b + (g.subs[c] || 0), 0) : g.count), 0);
  const list = x.sessions.filter(s => show === "all" || (show === "active" ? ["planned", "live"].includes(s.status) : s.status === show));
  async function create() { setBusy(true); setErr(null); try { const r = await api("/api/sessions", { body: mode === "pick" ? { ...f, school_ids: [], sub_codes: [] } : { ...f, entry_ids: [] } }); toast(`Session created with ${r.count} entries.`); router.push(`/sessions/${r.id}`); } catch (e) { setErr(e.message); } setBusy(false); }
  return <>
    <PageHead title="Scoring sessions" sub="Coordinators run sessions with evaluators who have no login and type their scores: Round 1 and online Round 2 entries from their files, physical Round 2 artworks in the room. Several sessions can run at once; each entry is in one session at a time." actions={canCreate && <Btn v="primary" onClick={() => { setErr(null); setSchoolScope("mine"); setMode("schools"); setPq(""); setF({ entry_ids: [],  round_id: x.rounds[0]?.id || "", title: "", session_date: "", time_text: "09:00 to 13:00", venue: "", evaluator_ids: [], school_ids: [], sub_codes: [], coordinator_id: admin ? "" : undefined }); }}>New session</Btn>} />
    {x.ready > 0 && <Banner title={`${x.ready} entries are waiting for a session`}>Create a session and pick the schools to score.</Banner>}
    <div className="row" style={{ marginBottom: 12 }}><Seg value={show} onChange={setShow} items={[["active", "Planned and live"], ["done", "Done"], ["cancelled", "Cancelled"], ["all", "All"]]} /></div>
    <Card flush><Table minw={860} cols={["Session", "When", "Coordinator", "Team", "Progress", "Status"]} onRow={i => router.push(me?.role === "storage" ? `/pull-list?session=${list[i].id}` : `/sessions/${list[i].id}`)} empty="No sessions here."
      rows={list.map(s => [<Two key="t" a={s.title} b={s.pathway} />, <Two key="w" a={s.session_date ? dshort(s.session_date) : "Date not set"} b={[s.time_text, s.venue].filter(Boolean).join(" · ")} />, s.coordinator || "", <span key="e" className="small">{s.team.map(t => t.name).join(", ")}</span>, <Prog key="p" pct={s.count ? s.scored / s.count * 100 : 0} label={`${s.scored}/${s.count}`} />, <Badge key="s" tone={LABEL[s.status]?.[1]}>{LABEL[s.status]?.[0] || s.status}</Badge>])} /></Card>
    <Modal open={!!f} wide title="New scoring session" onClose={() => setF(null)} footer={<><span className="small faint">{count ? (mode === "pick" ? `${count} entr${count === 1 ? "y" : "ies"} picked` : `${count} entr${count === 1 ? "y" : "ies"} from ${chosen.length} school${chosen.length === 1 ? "" : "s"}`) : mode === "pick" ? "Pick entries" : "Pick schools"}</span><span className="sp" /><Btn onClick={() => setF(null)}>Cancel</Btn><Btn v="primary" busy={busy} disabled={!count} onClick={create}>Create session</Btn></>}>
      {err && <Banner tone="bad" title={err} />}
      {f && <div className="stack" style={{ gap: 12 }}>
        <div className="grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
          <Field label="Round"><select className="select" value={f.round_id} onChange={e => setF({ ...f, round_id: e.target.value, evaluator_ids: [], school_ids: [], sub_codes: [], entry_ids: [] })}>{x.rounds.map(r => <option key={r.id} value={r.id}>{r.pathway} · Round {r.round_no} ({r.status}) · {(x.pools[r.id] || []).reduce((a, g) => a + g.count, 0)} waiting</option>)}</select></Field>
          {admin && <Field label="Run by"><select className="select" value={f.coordinator_id} onChange={e => setF({ ...f, coordinator_id: e.target.value })}><option value="">Choose a coordinator…</option>{x.coordinators.filter(c => !rd || !c.pathways?.length || c.pathways.includes(rd.pathway_code) || c.id === f.coordinator_id).map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}</select></Field>}
          <Field label="Title (optional)"><input className="input" value={f.title} placeholder="Session name" onChange={e => setF({ ...f, title: e.target.value })} /></Field>
        </div>
        <div className="grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
          <Field label="Date"><input type="date" className="input" value={f.session_date} onChange={e => setF({ ...f, session_date: e.target.value })} /></Field>
          <Field label="Time"><input className="input" value={f.time_text} onChange={e => setF({ ...f, time_text: e.target.value })} /></Field>
          <Field label="Venue"><input className="input" value={f.venue} placeholder="Room or hall" onChange={e => setF({ ...f, venue: e.target.value })} /></Field>
        </div>
        <Seg value={mode} onChange={setMode} items={[["schools", "Whole schools"], ["pick", "Pick artworks"]]} />
        {mode === "schools" ? <>
          {rd?.subs?.length > 1 && <Field label="Subpathways" help="Leave all unticked to include every subpathway. Physical ones are scored in the room."><div className="row" style={{ gap: 12, flexWrap: "wrap" }}>{rd.subs.map(s => <Check key={s.code} label={`${s.name}${s.physical ? " (physical)" : ""}`} checked={f.sub_codes.includes(s.code)} onChange={v => setF({ ...f, sub_codes: v ? [...f.sub_codes, s.code] : f.sub_codes.filter(c => c !== s.code) })} />)}</div></Field>}
          <Field label="Schools" help="Every waiting entry of the ticked schools: online entries still to be scored, and physical artworks checked in to storage. Entries in another session are left out.">
            {!admin && <div style={{ marginBottom: 8 }}><Seg value={schoolScope} onChange={setSchoolScope} items={[["mine", "My schools"], ["all", "All schools"]]} /></div>}
            <div className="stack s4" style={{ maxHeight: 260, overflow: "auto" }}>{shownPool.length ? shownPool.map(g => <Check key={g.school_id || "none"} label={`${g.name}${g.esis ? ` (${g.esis})` : ""} · ${g.count} entr${g.count === 1 ? "y" : "ies"}${g.mine && !admin ? " · yours" : ""}`} checked={f.school_ids.includes(g.school_id || "none")} onChange={v => setF({ ...f, school_ids: v ? [...f.school_ids, g.school_id || "none"] : f.school_ids.filter(k => k !== (g.school_id || "none")) })} />) : <span className="muted">{pool.length ? "None of your schools have artworks waiting. Switch to All schools." : "No entries are waiting for this round."}</span>}</div>
          </Field>
        </> : <PickEntries pe={pe} f={f} setF={setF} q={pq} setQ={setPq} admin={admin} schoolScope={schoolScope} setSchoolScope={setSchoolScope} />}
        <Field label="Evaluator team" help="Evaluators without a login can be in the room; the coordinator types their scores.">
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>{evs.map(e => <Check key={e.id} label={`${e.name}${e.account_id ? "" : " (no login)"}`} checked={f.evaluator_ids.includes(e.id)} onChange={v => setF({ ...f, evaluator_ids: v ? [...f.evaluator_ids, e.id] : f.evaluator_ids.filter(k => k !== e.id) })} />)}{!evs.length && <span className="muted">No evaluators on this pathway yet.</span>}</div>
          {otherEvs.length > 0 && <details style={{ marginTop: 8 }}><summary className="small faint" style={{ cursor: "pointer" }}>Evaluators from other pathways ({otherEvs.length})</summary><div className="row" style={{ gap: 12, flexWrap: "wrap", marginTop: 8 }}>{otherEvs.map(e => <Check key={e.id} label={e.name} checked={false} onChange={() => setF({ ...f, evaluator_ids: [...f.evaluator_ids, e.id] })} />)}</div></details>}
        </Field>
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
  return <Field label="Entries" help="Physical artworks are checked in to storage and go on the pull list; online entries are scored from their files. Entries in another session are left out.">
    <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: "wrap" }}>{!admin && <Seg value={schoolScope} onChange={setSchoolScope} items={[["mine", "My schools"], ["all", "All schools"]]} />}<input className="input" style={{ flex: "1 1 200px" }} placeholder="Search code, title, school" value={q} onChange={e => setQ(e.target.value)} /></div>
    <div className="stack s4" style={{ maxHeight: 300, overflow: "auto", border: "1px solid var(--rule)", borderRadius: "var(--r)", padding: 8 }}>
      {groups.length ? groups.map(g => { const ids = g.rows.map(e => e.id); const on = ids.every(id => sel.has(id)); return <details key={g.key} open={!!t}>
        <summary className="row nowrap" style={{ gap: 8, cursor: "pointer", padding: "4px 0" }}><span onClick={e => e.stopPropagation()}><Check label="" checked={on} onChange={v => set(ids, v)} /></span><b style={{ fontWeight: 500 }}>{g.name}</b><span className="small faint">{ids.filter(id => sel.has(id)).length}/{ids.length}</span></summary>
        <div className="stack s4" style={{ paddingLeft: 32, paddingBottom: 6 }}>{g.rows.map(e => <Check key={e.id} label={`${e.code} · ${e.title || ""} · ${e.sub || ""}${e.online ? " · online" : e.where ? ` · ${e.where}` : ""}`} checked={sel.has(e.id)} onChange={v => set([e.id], v)} />)}</div>
      </details>; }) : <span className="muted">No entries are waiting{!admin && schoolScope === "mine" ? " for your schools. Switch to All schools." : "."}</span>}
    </div>
  </Field>;
}
