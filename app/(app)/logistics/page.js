"use client";
// Artwork logistics: one shared chain for the Logistics team and coordinators (plan, slide 13).
// "To do" shows each team only what is waiting on them, grouped in batches (a session, a collection); any step
// can be done for a whole batch or for ticked artworks. "All artworks" is the full list with filters.
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, useApi, useMeta, useToast, PageHead, Btn, Badge, Banner, Loading, Modal, Field, Card, Table, Tabs, Check, Seg, Search, dshort } from "@/components/ui";
import Handling from "@/components/Handling";
import { Photography, Exhibition, ExhibitionDispatch } from "@/components/Curation";
import { ArtworkBatch, ArtworkDrawer, bySession, SHORT } from "@/components/Movements";

const CHAIN = ["to_collect", "received", "storage", "requested", "coordinator", "returning"];
const SIDE = ["picked", "handed_over", "framer", "photography", "showcase", "exhibition", "returned", "missing"];

function group(rows, by) {
  if (by === "session") return bySession(rows, () => true);
  const key = r => by === "school" ? (r.entry.school?.name || "No school") : by === "shelf" ? (r.state === "storage" || r.state === "requested" || r.state === "picked" || r.state === "showcase" ? r.where || "Not shelved" : SHORT[r.state]) : by === "sub" ? `${r.pathway || ""} · ${r.sub || ""}` : null;
  if (!by || by === "none") return null;
  const m = {}; rows.forEach(r => { const k = key(r); (m[k] = m[k] || []).push(r); });
  return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([k, rs]) => ({ key: k, title: k, sub: `${rs.length} artwork${rs.length === 1 ? "" : "s"}`, rows: rs }));
}

export default function Logistics() {
  const sp = useSearchParams();
  const d = useApi("/api/logistics", [], { live: 15000 }); const meta = useMeta(); const toast = useToast();
  const role = meta?.data?.me?.role;
  const staff = ["admin", "storage"].includes(role); const coord = role === "coordinator";
  const [tab0, setTab] = useState(sp.get("tab") || null);
  const tab = tab0 || (staff || coord ? "todo" : "all");
  const [f, setF] = useState({ q: sp.get("q") || "", state: sp.get("state") || "", sub: "", session: "", by: "session" });
  const [open, setOpen] = useState(null); const [onlyShort, setOnlyShort] = useState(true);
  const [mk, setMk] = useState(null);
  const rows = d.data?.rows || [];
  const count = useMemo(() => rows.reduce((m, r) => { m[r.state] = (m[r.state] || 0) + 1; return m; }, {}), [rows]);
  if (!d.data || !meta?.data) return <Loading error={d.error} />;
  const reload = () => d.reload();
  const openRow = r => setOpen(r);
  const is = (...st) => r => st.includes(r.state);

  // what is waiting on whom
  const pull = rows.filter(is("requested", "picked"));
  const back = rows.filter(is("returning"));
  const waitingCoord = rows.filter(is("handed_over"));
  const unbatched = rows.filter(r => r.state === "to_collect" && !r.collection_id);
  const scheduled = [...new Set(rows.filter(r => r.state === "to_collect" && r.collection_id).map(r => r.collection_id))];
  const framing = rows.filter(r => r.needs_framing && (!onlyShort || r.selected) && ["storage", "framer"].includes(r.state));
  const toMe = rows.filter(r => r.state === "handed_over" && r.session?.mine);
  const withMe = rows.filter(r => r.state === "coordinator" && r.session?.mine);
  const exc = rows.filter(r => r.state === "missing" || r.damaged || r.issue);
  // sessions with artworks to move (from the artworks' own session links)
  const sessMap = {}; rows.filter(r => r.session && ["requested", "picked", "handed_over", "coordinator", "returning"].includes(r.state)).forEach(r => { const g = sessMap[r.session.id] = sessMap[r.session.id] || { s: r.session, waiting: 0, room: 0, back: 0 }; if (["requested", "picked"].includes(r.state)) g.waiting++; else if (r.state === "returning") g.back++; else g.room++; });
  const sessList = Object.values(sessMap).filter(g => !coord || g.s.mine).sort((a, b) => (a.s.status === "live" ? 0 : 1) - (b.s.status === "live" ? 0 : 1) || String(a.s.date || "9").localeCompare(String(b.s.date || "9")));
  const todoN = staff ? pull.length + back.length + (count.to_collect || 0) : coord ? sessList.reduce((a, g) => a + g.room, 0) : 0;
  const Sessions = () => <div className="mv-sec"><Card flush title="Scoring sessions" sub={staff ? "Bring each session's artworks into the room in batches, take each batch back when it's scored. Open a board to work on it." : "Logistics brings your artworks in batches. Hand a batch back on the board when it's scored."}>
    {sessList.length ? <div className="x-todo" style={{ padding: "4px 16px 12px" }}>{sessList.map(g => <div className="it" key={g.s.id}><div className="tx"><b>{g.s.title} {g.s.status === "live" && <Badge tone="info">In progress</Badge>}</b><span>{[g.s.date && dshort(g.s.date), g.s.time, g.s.venue, g.s.coordinator].filter(Boolean).join(" · ")}</span><span>{[g.waiting && `${g.waiting} waiting on the shelves`, g.room && `${g.room} in the room`, g.back && `${g.back} handed back`].filter(Boolean).join(" · ")}</span></div>
      <Btn sm v={(staff && (g.back || (g.s.status === "live" && g.waiting && !g.room))) || (coord && g.room) ? "primary" : "secondary"} href={`/pull-list?session=${g.s.id}`}>Open board</Btn></div>)}</div> : <p className="muted" style={{ padding: 16 }}>No session has artworks to move right now.</p>}
  </Card></div>;

  const tabs = [
    ...(staff || coord ? [["todo", "To do", todoN]] : []),
    ["all", coord ? "My artworks" : "All artworks", rows.length],
    ...(coord ? [] : [["exceptions", "Exceptions", exc.length]]),
    ...(staff || coord || ["management", "leadership"].includes(role) ? [["handling", "Artworks handling"]] : []),
    ...(staff || ["management", "leadership"].includes(role) ? [["photography", "Photography"], ["dispatch", "Exhibition: sending"], ["exhibition", "Exhibition: curation"]] : []),
    ...(staff ? [["locations", "Storage locations"], ["venues", "Session venues"]] : [])
  ];
  const showState = st => { setF({ ...f, state: st }); setTab("all"); };

  return <>
    <PageHead title="Artwork logistics"
      sub={coord ? "Physical artworks of your schools and sessions. During a session, Logistics brings them into the room in batches; you hand each batch back on the session board when it is scored." : "Physical Round 2 artworks from school delivery to return. Every step is recorded with who, when and where. Tick a whole batch or single artworks and choose what happened."}
      actions={<>{staff && <Btn href="/collections">Collections</Btn>}{(staff || coord) && <Btn v="primary" href="/pull-list">Session boards</Btn>}</>} />

    {staff && (count.received || 0) > 0 && <Banner tone="warn" title={`${count.received} artwork${count.received === 1 ? "" : "s"} received at the office need${count.received === 1 ? "s" : ""} a shelf`} action={<Btn sm v="primary" href="/collections?view=store">To store</Btn>}>Choose the room, shelf and row for each school's pathway.</Banner>}
    <div className="mv-pipe">
      {CHAIN.map((k, i) => <span key={k} className="row nowrap" style={{ gap: 6 }}>{i > 0 && <span className="arrow">→</span>}<button type="button" className={`chip${tab === "all" && f.state === k ? " on" : ""}`} onClick={() => showState(f.state === k && tab === "all" ? "" : k)}>{SHORT[k]}<span className="n">{count[k] || 0}</span></button></span>)}
      <span className="arrow" style={{ margin: "0 4px" }}>·</span>
      {SIDE.map(k => <button key={k} type="button" className={`chip${tab === "all" && f.state === k ? " on" : ""}`} onClick={() => showState(f.state === k && tab === "all" ? "" : k)}>{SHORT[k]}<span className="n">{count[k] || 0}</span></button>)}
    </div>

    <Tabs value={tab} onChange={setTab} items={tabs} />

    {tab === "todo" && staff && <>
      
      <Sessions />
      {(unbatched.length > 0 || scheduled.length > 0) && <div className="mv-sec"><Card title="Deliveries from schools" right={<span className="row" style={{ gap: 8 }}>{unbatched.length > 0 && <Btn v="primary" sm onClick={() => setMk({ mode: "all", date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }), codes: [] })}>Prepare deliveries</Btn>}<Btn sm href="/collections">Open collections</Btn></span>}>
        <p className="muted">{unbatched.length ? `${unbatched.length} artwork${unbatched.length === 1 ? " is" : "s are"} not in a collection yet. ` : ""}{scheduled.length ? `${scheduled.length} collection${scheduled.length === 1 ? " is" : "s are"} scheduled and waiting to be checked in.` : ""}</p></Card></div>}
      {framing.length > 0 && <div className="mv-sec"><Card title="Artworks handling" right={<Btn sm v="primary" onClick={() => setTab("handling")}>Open artworks handling</Btn>}><p className="muted" style={{ margin: 0 }}>{framing.filter(r => r.state === "storage").length} selected artwork{framing.filter(r => r.state === "storage").length === 1 ? "" : "s"} to send to the framer{framing.filter(r => r.state === "framer").length ? `, ${framing.filter(r => r.state === "framer").length} at the framer` : ""}. Open Framing for photos, the checklist export and sending them.</p></Card></div>}
    </>}

    {tab === "todo" && coord && <Sessions />}

    {tab === "all" && <AllArtworks rows={rows} f={f} setF={setF} role={role} onDone={reload} onOpen={openRow} />}

    {tab === "exceptions" && <Card flush title="Exceptions" sub="Missing, damaged, or needing a fix. Each artwork is handled on its own so the rest of its batch carries on. Open an artwork to decide what happens to a missing one.">
      <ArtworkBatch rows={exc} role={role} steps={["found", "missing"]} onDone={reload} onOpen={openRow} empty="No exceptions."
        groups={[
          { key: "m", title: "Missing", sub: "School delivers later, score from its files (admin) or withdraw (admin)", rows: exc.filter(is("missing")) },
          { key: "d", title: "Damaged", rows: exc.filter(r => r.state !== "missing" && r.damaged) },
          { key: "i", title: "Needs a fix", rows: exc.filter(r => r.state !== "missing" && !r.damaged && r.issue) }
        ].filter(g => g.rows.length)} /></Card>}

    {tab === "locations" && staff && <Locations />}
    {(tab === "handling" || tab === "framing") && <Handling />}
    {tab === "photography" && <Photography />}
    {tab === "dispatch" && <ExhibitionDispatch canAct={staff} />}
    {tab === "exhibition" && <Exhibition canAct={staff} />}
    {tab === "venues" && staff && <Venues admin={role === "admin"} />}

    {open && <ArtworkDrawer row={open} role={role} onClose={() => setOpen(null)} onChanged={reload} />}
    {mk && <ScheduleCollections rows={unbatched} mk={mk} setMk={setMk} onDone={() => { setMk(null); reload(); }} toast={toast} />}
  </>;
}

function AllArtworks({ rows, f, setF, role, onDone, onOpen }) {
  const subs = [...new Set(rows.map(r => `${r.pathway || ""} · ${r.sub || ""}`))].sort();
  const sessions = [...new Map(rows.filter(r => r.session).map(r => [r.session.id, r.session])).values()];
  const q = f.q.trim().toLowerCase();
  const list = rows.filter(r => (!f.state || r.state === f.state) && (!f.sub || `${r.pathway || ""} · ${r.sub || ""}` === f.sub) && (!f.session || r.session?.id === f.session)
    && (!q || [r.entry.code, r.entry.title_en, r.entry.group_name, r.entry.school?.name, r.where, r.coordinator].some(v => String(v || "").toLowerCase().includes(q))));
  const LIMIT = 400; const shown = list.slice(0, LIMIT);
  const by = f.by === "session" && !shown.some(r => r.session) ? "shelf" : f.by;
  return <Card flush>
    <div className="mv-filters">
      <Search value={f.q} onChange={v => setF({ ...f, q: v })} placeholder="Code, title, school or shelf" />
      <select className="select" value={f.state} onChange={e => setF({ ...f, state: e.target.value })}><option value="">Every state</option>{Object.entries(SHORT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <select className="select" value={f.sub} onChange={e => setF({ ...f, sub: e.target.value })}><option value="">Every subpathway</option>{subs.map(s => <option key={s} value={s}>{s}</option>)}</select>
      {sessions.length > 0 && <select className="select" value={f.session} onChange={e => setF({ ...f, session: e.target.value })}><option value="">Any session</option>{sessions.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select>}
      <Seg value={by} onChange={v => setF({ ...f, by: v })} items={[["session", "By session"], ["shelf", "By shelf"], ["school", "By school"], ["none", "List"]]} />
    </div>
    {list.length > LIMIT && <p className="small faint" style={{ padding: "8px 12px" }}>Showing the first {LIMIT} of {list.length}. Use the filters to narrow the list.</p>}
    <ArtworkBatch rows={shown} groups={group(shown, by)} role={role} onDone={onDone} onOpen={onOpen} empty="No artworks match." />
  </Card>;
}

function ScheduleCollections({ rows, mk, setMk, onDone, toast }) {
  const [busy, setBusy] = useState(false);
  const schools = Object.values(rows.reduce((m, r) => { const k = r.entry.school?.id || "none"; (m[k] = m[k] || { key: k, name: r.entry.school?.name || "No school", rows: [] }).rows.push(r); return m; }, {})).sort((a, b) => a.name.localeCompare(b.name));
  const sel = new Set(mk.codes); const set = (codes, on) => { const s = new Set(sel); codes.forEach(c => on ? s.add(c) : s.delete(c)); setMk({ ...mk, codes: [...s] }); };
  const n = mk.mode === "all" ? rows.length : sel.size;
  async function go() { setBusy(true); try { const r = await api("/api/logistics", { body: { action: "create_collections", scheduled_on: mk.date || null, codes: mk.mode === "all" ? undefined : mk.codes } }); toast(r.note); onDone(); } catch (e) { toast(e.message, "err"); } setBusy(false); }
  return <Modal open wide title="Prepare school deliveries" sub="One collection per school: everything that school brings to the office. Set the date the school is expected; you can change it later." onClose={() => setMk(null)} footer={<><span className="small faint">{n} artwork{n === 1 ? "" : "s"}</span><span className="sp" /><Btn onClick={() => setMk(null)}>Cancel</Btn><Btn v="primary" busy={busy} disabled={!n} onClick={go}>Create collections</Btn></>}>
    <div className="stack" style={{ gap: 12 }}>
      <Seg value={mk.mode} onChange={v => setMk({ ...mk, mode: v })} items={[["all", `All ${rows.length} not scheduled`], ["pick", "Choose schools or artworks"]]} />
      <Field label="Expected delivery date (optional)"><input type="date" className="input" style={{ maxWidth: 220 }} value={mk.date} onChange={e => setMk({ ...mk, date: e.target.value })} /></Field>
      {mk.mode === "pick" && <div className="stack s4" style={{ maxHeight: 340, overflow: "auto", border: "1px solid var(--rule)", borderRadius: "var(--r)", padding: 8 }}>
        {schools.map(g => { const codes = g.rows.map(r => r.entry.code); const all = codes.every(c => sel.has(c)); return <details key={g.key}>
          <summary className="row nowrap" style={{ gap: 8, cursor: "pointer", padding: "4px 0" }}><span onClick={e => e.stopPropagation()}><Check label="" checked={all} onChange={v => set(codes, v)} /></span><b style={{ fontWeight: 500 }}>{g.name}</b><span className="small faint">{codes.filter(c => sel.has(c)).length}/{codes.length}</span></summary>
          <div className="stack s4" style={{ paddingLeft: 32, paddingBottom: 6 }}>{g.rows.map(r => <Check key={r.entry.code} label={`${r.entry.code} · ${r.entry.title_en || r.entry.group_name || ""} · ${r.sub || ""}`} checked={sel.has(r.entry.code)} onChange={v => set([r.entry.code], v)} />)}</div>
        </details>; })}
      </div>}
    </div>
  </Modal>;
}

function Venues({ admin }) {
  const v = useApi("/api/venues"); const toast = useToast(); const [nv, setNv] = useState({ name: "", notes: "", capacity: "" });
  async function add() { try { const r = await api("/api/venues", { body: { action: "add", ...nv } }); setNv({ name: "", notes: "", capacity: "" }); toast(r.note); } catch (e) { toast(e.message, "err"); } }
  async function upd(id, patch) { try { await api("/api/venues", { body: { action: "update", id, ...patch } }); } catch (e) { toast(e.message, "err"); v.reload(); } }
  const list = v.data?.venues || [];
  return <Card title="Session venues" sub={admin ? "The rooms and halls scoring sessions can be held in. Coordinators pick one of these when they plan a session. Renaming a venue updates its sessions; untick one that is no longer used." : "The rooms and halls scoring sessions can be held in. The admin keeps this list."}>
    {!v.data ? <Loading error={v.error} /> : admin ? <div className="vn-list">
      <div className="vn-h"><span>Venue</span><span>Where or notes</span><span className="r">Seats</span><span>Sessions</span><span /></div>
      {list.map(x => <div key={x.id} className="vn-row">
        <input className="input vn-n" defaultValue={x.name} onBlur={e => e.target.value.trim() && e.target.value.trim() !== x.name && upd(x.id, { name: e.target.value })} aria-label="Venue name" />
        <input className="input vn-o" defaultValue={x.notes || ""} placeholder="Building, floor, access…" onBlur={e => e.target.value.trim() !== (x.notes || "") && upd(x.id, { notes: e.target.value })} aria-label="Notes" />
        <label className="vn-c"><small>Seats</small><input className="input num" inputMode="numeric" defaultValue={x.capacity ?? ""} onBlur={e => String(e.target.value) !== String(x.capacity ?? "") && upd(x.id, { capacity: e.target.value })} aria-label="Seats" /></label>
        <span className="small vn-s">{x.upcoming ? `${x.upcoming} coming up` : ""}{x.upcoming && x.sessions > x.upcoming ? " · " : ""}{x.sessions > x.upcoming ? `${x.sessions - x.upcoming} done` : ""}{!x.sessions ? "No sessions" : ""}</span>
        <Check label="In use" checked={x.active} onChange={on => upd(x.id, { active: on })} />
      </div>)}
      {!list.length && <p className="muted" style={{ margin: 0 }}>No venues yet.</p>}
    </div> : <Table minw={480} empty="No venues yet." cols={["Venue", "Where or notes", { h: "Seats", cls: "r" }, { h: "Sessions", cls: "r" }, ""]}
      rows={list.map(x => [<b key="n">{x.name}</b>, <span key="o" className="small">{x.notes || ""}</span>, x.capacity ?? "", x.upcoming ? `${x.upcoming} coming up` : "–", x.active ? <Badge key="a" tone="ok">In use</Badge> : <Badge key="a">Not in use</Badge>])} />}
    {admin && <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 12 }}>
      <input className="input" style={{ width: 200 }} placeholder="Venue name (e.g. GVC Hall 3)" value={nv.name} onChange={e => setNv({ ...nv, name: e.target.value })} />
      <input className="input" style={{ width: 220 }} placeholder="Where or notes (optional)" value={nv.notes} onChange={e => setNv({ ...nv, notes: e.target.value })} />
      <input className="input" style={{ width: 90 }} inputMode="numeric" placeholder="Seats" value={nv.capacity} onChange={e => setNv({ ...nv, capacity: e.target.value.replace(/\D/g, "") })} />
      <Btn onClick={add} disabled={!nv.name.trim()}>Add venue</Btn></div>}
  </Card>;
}

function Locations() {
  const locs = useApi("/api/locations"); const toast = useToast(); const meta = useMeta();
  const pws = meta?.data?.pathways || [];
  const [open, setOpen] = useState({}); const [nr, setNr] = useState(null); const [edit, setEdit] = useState(null);
  const post = async (body, msg) => { try { const r = await api("/api/locations", { body }); toast(r.note || msg || "Saved"); return true; } catch (e) { toast(e.message, "err"); return false; } };
  if (!locs.data) return <Loading error={locs.error} />;
  const rooms = locs.data.rooms;
  return <Card title="Storage locations" sub="Rooms hold shelves; shelves hold rows. Tag each room with the pathways stored there: check-in opens on that room, and Logistics can still pick another." right={<Btn onClick={() => setNr({ name: "", shelves: "6", rows: "3", pathways: [] })}>Add room</Btn>}>
    {!rooms.length && <p className="muted">No rooms yet.</p>}
    <div className="stack" style={{ gap: 10 }}>{rooms.map(r => { const isOpen = open[r.id] ?? rooms.length <= 3; return <div key={r.id} className="rm" style={r.active ? undefined : { opacity: .6 }}>
      <div className="rm-h"><button type="button" className="link nm" onClick={() => setOpen({ ...open, [r.id]: !isOpen })}>{isOpen ? "▾" : "▸"} {r.name}</button>
        <span className="rm-tags">{(r.pathways || []).map(c => <Badge key={c} tone="info">{pws.find(p => p.code === c)?.name || c}</Badge>)}</span>
        <span className="small faint">{r.shelves.length} shelves · {r.count} stored{r.active ? "" : " · not in use"}</span><span className="sp" />
        <Btn sm v="ghost" onClick={() => setEdit({ kind: "room", id: r.id, name: r.name, pathways: r.pathways || [], active: r.active })}>Edit</Btn>
        <Btn sm v="ghost" onClick={async () => { if (await post({ action: "add_shelf", room_id: r.id })) setOpen({ ...open, [r.id]: true }); }}>Add shelf</Btn></div>
      {isOpen && <div className="rm-shelves">{r.shelves.map(sh => <button type="button" key={sh.id} className={`rm-sh${sh.active ? "" : " off"}`} style={{ textAlign: "left", cursor: "pointer", font: "inherit" }} onClick={() => setEdit({ kind: "shelf", id: sh.id, name: sh.name, rows: String(sh.rows), active: sh.active, room: r.name })}>
        <b>{sh.name}</b>
        <span className="rm-rows">{sh.slots.filter(x => x.active || x.count).map(x => <span key={x.id} className={x.count ? "u" : ""} title={`Row ${x.row}: ${x.count} stored`}>{x.row}{x.count ? `·${x.count}` : ""}</span>)}</span>
        <span className="small faint">{sh.count ? `${sh.count} stored` : "empty"}{sh.active ? "" : " · not in use"}</span>
      </button>)}{!r.shelves.length && <span className="small faint">No shelves yet.</span>}</div>}
    </div>; })}</div>
    <p className="small faint" style={{ margin: 0 }}>Click a shelf to rename it, change its rows or take it out of use. "2·3" means row 2 holds 3 artworks.</p>
    <Modal open={!!nr} title="Add a room" onClose={() => setNr(null)} footer={<><Btn onClick={() => setNr(null)}>Cancel</Btn><Btn v="primary" disabled={!nr?.name.trim()} onClick={async () => { if (await post({ action: "add_room", ...nr })) setNr(null); }}>Add room</Btn></>}>
      {nr && <div className="stack" style={{ gap: 12 }}>
        <Field label="Room name"><input className="input" value={nr.name} onChange={e => setNr({ ...nr, name: e.target.value })} placeholder="For example Room D" autoFocus /></Field>
        <div className="row" style={{ gap: 12 }}><Field label="Shelves"><input className="input num" inputMode="numeric" value={nr.shelves} onChange={e => setNr({ ...nr, shelves: e.target.value.replace(/\D/g, "") })} /></Field><Field label="Rows on each shelf"><input className="input num" inputMode="numeric" value={nr.rows} onChange={e => setNr({ ...nr, rows: e.target.value.replace(/\D/g, "") })} /></Field></div>
        <Field label="Pathways stored here" help="Check-in opens on this room for these pathways."><div className="row" style={{ gap: 12, flexWrap: "wrap" }}>{pws.map(p => <Check key={p.code} label={p.name} checked={nr.pathways.includes(p.code)} onChange={on => setNr({ ...nr, pathways: on ? [...nr.pathways, p.code] : nr.pathways.filter(c => c !== p.code) })} />)}</div></Field>
      </div>}
    </Modal>
    <Modal open={!!edit} title={edit?.kind === "room" ? `Edit ${edit?.name}` : `${edit?.room} · ${edit?.name}`} onClose={() => setEdit(null)} footer={<><Btn onClick={() => setEdit(null)}>Cancel</Btn><Btn v="primary" onClick={async () => {
        const ok = edit.kind === "room" ? await post({ action: "update_room", id: edit.id, name: edit.name, pathways: edit.pathways, active: edit.active }) : await post({ action: "update_shelf", id: edit.id, name: edit.name, rows: edit.rows, active: edit.active });
        if (ok) setEdit(null); }}>Save</Btn></>}>
      {edit && <div className="stack" style={{ gap: 12 }}>
        <Field label="Name"><input className="input" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
        {edit.kind === "room" ? <Field label="Pathways stored here"><div className="row" style={{ gap: 12, flexWrap: "wrap" }}>{pws.map(p => <Check key={p.code} label={p.name} checked={edit.pathways.includes(p.code)} onChange={on => setEdit({ ...edit, pathways: on ? [...edit.pathways, p.code] : edit.pathways.filter(c => c !== p.code) })} />)}</div></Field>
          : <Field label="Rows" help="Fewer rows: artworks on the removed rows keep their place until they are moved."><input className="input num" style={{ width: 100 }} inputMode="numeric" value={edit.rows} onChange={e => setEdit({ ...edit, rows: e.target.value.replace(/\D/g, "") })} /></Field>}
        <Check label="In use" checked={edit.active} onChange={v => setEdit({ ...edit, active: v })} />
      </div>}
    </Modal>
  </Card>;
}
