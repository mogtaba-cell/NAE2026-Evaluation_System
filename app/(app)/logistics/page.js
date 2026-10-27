"use client";
// Artwork logistics: one shared chain for the storage team and coordinators (plan, slide 13).
// "To do" shows each team only what is waiting on them, grouped in batches (a session, a collection); any step
// can be done for a whole batch or for ticked artworks. "All artworks" is the full list with filters.
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, useApi, useMeta, useToast, PageHead, Btn, Badge, Banner, Loading, Modal, Field, Card, Table, Tabs, Check, Seg, Search, dshort } from "@/components/ui";
import { ArtworkBatch, ArtworkDrawer, bySession, SHORT } from "@/components/Movements";

const CHAIN = ["to_collect", "storage", "requested", "picked", "handed_over", "coordinator", "returning"];
const SIDE = ["framer", "showcase", "returned", "missing"];

function group(rows, by) {
  if (by === "session") return bySession(rows, () => true);
  const key = r => by === "school" ? (r.entry.school?.name || "No school") : by === "shelf" ? (r.state === "storage" || r.state === "requested" || r.state === "picked" || r.state === "showcase" ? r.where || "Not shelved" : SHORT[r.state]) : by === "sub" ? `${r.pathway || ""} · ${r.sub || ""}` : null;
  if (!by || by === "none") return null;
  const m = {}; rows.forEach(r => { const k = key(r); (m[k] = m[k] || []).push(r); });
  return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([k, rs]) => ({ key: k, title: k, sub: `${rs.length} artwork${rs.length === 1 ? "" : "s"}`, rows: rs }));
}

export default function Logistics() {
  const sp = useSearchParams();
  const d = useApi("/api/logistics"); const meta = useMeta(); const toast = useToast();
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
  const framing = rows.filter(r => r.needs_framing && (!onlyShort || r.shortlisted) && ["storage", "framer"].includes(r.state));
  const toMe = rows.filter(r => r.state === "handed_over" && r.session?.mine);
  const withMe = rows.filter(r => r.state === "coordinator" && r.session?.mine);
  const exc = rows.filter(r => r.state === "missing" || r.damaged || r.issue);
  const todoN = staff ? pull.length + back.length + (count.to_collect || 0) : coord ? toMe.length + withMe.length : 0;

  const tabs = [
    ...(staff || coord ? [["todo", "To do", todoN]] : []),
    ["all", coord ? "My artworks" : "All artworks", rows.length],
    ...(coord ? [] : [["exceptions", "Exceptions", exc.length]]),
    ...(staff ? [["locations", "Storage locations"]] : [])
  ];
  const showState = st => { setF({ ...f, state: st }); setTab("all"); };

  return <>
    <PageHead title="Artwork logistics"
      sub={coord ? "Physical artworks in your sessions. Confirm when storage hands them to you, and hand them back when the session is over." : "Physical Round 2 artworks from collection to return. Every step is recorded with who, when and where. Tick a whole batch or single artworks and choose what happened."}
      actions={<>{staff && <Btn href="/collections">Collections</Btn>}{(staff || coord) && <Btn href="/pull-list">Pull lists</Btn>}</>} />

    <div className="mv-pipe">
      {CHAIN.map((k, i) => <span key={k} className="row nowrap" style={{ gap: 6 }}>{i > 0 && <span className="arrow">→</span>}<button type="button" className={`chip${tab === "all" && f.state === k ? " on" : ""}`} onClick={() => showState(f.state === k && tab === "all" ? "" : k)}>{SHORT[k]}<span className="n">{count[k] || 0}</span></button></span>)}
      <span className="arrow" style={{ margin: "0 4px" }}>·</span>
      {SIDE.map(k => <button key={k} type="button" className={`chip${tab === "all" && f.state === k ? " on" : ""}`} onClick={() => showState(f.state === k && tab === "all" ? "" : k)}>{SHORT[k]}<span className="n">{count[k] || 0}</span></button>)}
    </div>

    <Tabs value={tab} onChange={setTab} items={tabs} />

    {tab === "todo" && staff && <>
      {!pull.length && !back.length && !unbatched.length && !scheduled.length && <Banner tone="ok" title="Nothing waiting on storage">New pull requests appear here as soon as a coordinator creates a session with physical artworks.</Banner>}
      {pull.length > 0 && <div className="mv-sec"><Card flush title={`Pull for sessions · ${pull.length}`} sub="Sorted by room and shelf. Mark artworks picked as you take them off the shelf, then hand them over. The coordinator confirms receipt on their side.">
        <ArtworkBatch rows={pull} role={role} steps={["pick", "unpick", "hand_over", "missing"]} onDone={reload} onOpen={openRow}
          groups={bySession(pull, () => true).map(g => ({ ...g, sub: `${g.sub} · ${g.rows.filter(r => r.state === "picked").length}/${g.rows.length} picked`, right: g.session && <Btn sm href={`/pull-list?session=${g.session.id}`}>Pull list</Btn> }))} /></Card></div>}
      {waitingCoord.length > 0 && <p className="small faint mv-sec">{waitingCoord.length} artwork{waitingCoord.length === 1 ? " is" : "s are"} handed over and waiting for the coordinator to confirm. <button type="button" className="link" onClick={() => showState("handed_over")}>See them</button></p>}
      {back.length > 0 && <div className="mv-sec"><Card flush title={`Coming back to storage · ${back.length}`} sub="Handed back by coordinators. Check them and confirm. Leave the shelf empty to put each artwork back where it was.">
        <ArtworkBatch rows={back} role={role} steps={["receive_back", "missing"]} onDone={reload} onOpen={openRow} groups={bySession(back, () => true)} /></Card></div>}
      {(unbatched.length > 0 || scheduled.length > 0) && <div className="mv-sec"><Card title="Collections from schools" right={<span className="row" style={{ gap: 8 }}>{unbatched.length > 0 && <Btn v="primary" sm onClick={() => setMk({ mode: "all", date: "", codes: [] })}>Schedule collections</Btn>}<Btn sm href="/collections">Open collections</Btn></span>}>
        <p className="muted">{unbatched.length ? `${unbatched.length} artwork${unbatched.length === 1 ? " is" : "s are"} not in a collection yet. ` : ""}{scheduled.length ? `${scheduled.length} collection${scheduled.length === 1 ? " is" : "s are"} scheduled and waiting to be checked in.` : ""}</p></Card></div>}
      <div className="mv-sec"><Card flush title="Framing for the showcase" sub="Ticked during Round 2 scoring. Shortlisted means grade A and passed Round 2." right={<Check label="Shortlisted only" checked={onlyShort} onChange={setOnlyShort} />}>
        <ArtworkBatch rows={framing} role={role} steps={["to_framer", "from_framer"]} onDone={reload} onOpen={openRow} empty="No artworks waiting for framing."
          groups={[{ key: "s", title: "In storage, to send", rows: framing.filter(is("storage")) }, { key: "f", title: "At the framer", rows: framing.filter(is("framer")) }].filter(g => g.rows.length)} /></Card></div>
    </>}

    {tab === "todo" && coord && <>
      {!toMe.length && !withMe.length && <Banner tone="ok" title="Nothing waiting on you">When storage hands artworks over for one of your sessions, confirm them here or on the session page.</Banner>}
      {toMe.length > 0 && <div className="mv-sec"><Card flush title={`Handed to you · ${toMe.length}`} sub="Storage says these are with you. Confirm the ones you received. If something is not there, leave it unticked and tell storage.">
        <ArtworkBatch rows={toMe} role={role} steps={["receive", "send_back"]} onDone={reload} onOpen={openRow} groups={bySession(toMe, () => true)} /></Card></div>}
      {withMe.length > 0 && <div className="mv-sec"><Card flush title={`With you · ${withMe.length}`} sub="Hand artworks back when they are scored. Finishing the session hands back everything still with you.">
        <ArtworkBatch rows={withMe} role={role} steps={["send_back"]} onDone={reload} onOpen={openRow} groups={bySession(withMe, () => true)} /></Card></div>}
    </>}

    {tab === "all" && <AllArtworks rows={rows} f={f} setF={setF} role={role} onDone={reload} onOpen={openRow} />}

    {tab === "exceptions" && <Card flush title="Exceptions" sub="Missing, damaged, or needing a fix. Each artwork is handled on its own so the rest of its batch carries on. Open an artwork to decide what happens to a missing one.">
      <ArtworkBatch rows={exc} role={role} steps={["found", "missing"]} onDone={reload} onOpen={openRow} empty="No exceptions."
        groups={[
          { key: "m", title: "Missing", sub: "Collect later, score from its files (admin) or withdraw (admin)", rows: exc.filter(is("missing")) },
          { key: "d", title: "Damaged", rows: exc.filter(r => r.state !== "missing" && r.damaged) },
          { key: "i", title: "Needs a fix", rows: exc.filter(r => r.state !== "missing" && !r.damaged && r.issue) }
        ].filter(g => g.rows.length)} /></Card>}

    {tab === "locations" && staff && <Locations />}

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
  return <Modal open wide title="Schedule collections" sub="One collection per school, pathway and subpathway. You can change each date later." onClose={() => setMk(null)} footer={<><span className="small faint">{n} artwork{n === 1 ? "" : "s"}</span><span className="sp" /><Btn onClick={() => setMk(null)}>Cancel</Btn><Btn v="primary" busy={busy} disabled={!n} onClick={go}>Create collections</Btn></>}>
    <div className="stack" style={{ gap: 12 }}>
      <Seg value={mk.mode} onChange={v => setMk({ ...mk, mode: v })} items={[["all", `All ${rows.length} not scheduled`], ["pick", "Choose schools or artworks"]]} />
      <Field label="Collection date (optional)"><input type="date" className="input" style={{ maxWidth: 220 }} value={mk.date} onChange={e => setMk({ ...mk, date: e.target.value })} /></Field>
      {mk.mode === "pick" && <div className="stack s4" style={{ maxHeight: 340, overflow: "auto", border: "1px solid var(--rule)", borderRadius: "var(--r)", padding: 8 }}>
        {schools.map(g => { const codes = g.rows.map(r => r.entry.code); const all = codes.every(c => sel.has(c)); return <details key={g.key}>
          <summary className="row nowrap" style={{ gap: 8, cursor: "pointer", padding: "4px 0" }}><span onClick={e => e.stopPropagation()}><Check label="" checked={all} onChange={v => set(codes, v)} /></span><b style={{ fontWeight: 500 }}>{g.name}</b><span className="small faint">{codes.filter(c => sel.has(c)).length}/{codes.length}</span></summary>
          <div className="stack s4" style={{ paddingLeft: 32, paddingBottom: 6 }}>{g.rows.map(r => <Check key={r.entry.code} label={`${r.entry.code} · ${r.entry.title_en || r.entry.group_name || ""} · ${r.sub || ""}`} checked={sel.has(r.entry.code)} onChange={v => set([r.entry.code], v)} />)}</div>
        </details>; })}
      </div>}
    </div>
  </Modal>;
}

function Locations() {
  const locs = useApi("/api/locations"); const toast = useToast(); const [nl, setNl] = useState({ room: "", shelf: "" });
  async function addLoc() { try { await api("/api/locations", { body: { action: "add", ...nl } }); setNl({ room: "", shelf: "" }); locs.reload(); toast("Location added"); } catch (e) { toast(e.message, "err"); } }
  async function locUpd(id, patch) { try { await api("/api/locations", { body: { action: "update", id, ...patch } }); locs.reload(); } catch (e) { toast(e.message, "err"); } }
  return <Card title="Storage locations" sub="Rooms and shelves. Rename or add them here; artworks keep their place.">
    <Table minw={520} cols={["Room", "Shelf or area", { h: "Stored", cls: "r" }, ""]} rows={(locs.data?.locations || []).map(l => [<input key="r" className="input" defaultValue={l.room} onBlur={e => e.target.value.trim() && e.target.value !== l.room && locUpd(l.id, { room: e.target.value })} />, <input key="s" className="input" defaultValue={l.shelf} onBlur={e => e.target.value.trim() && e.target.value !== l.shelf && locUpd(l.id, { shelf: e.target.value })} />, l.count, <Check key="a" label="In use" checked={l.active} onChange={v => locUpd(l.id, { active: v })} />])} />
    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><input className="input" style={{ width: 180 }} placeholder="Room" value={nl.room} onChange={e => setNl({ ...nl, room: e.target.value })} /><input className="input" style={{ width: 180 }} placeholder="Shelf or area" value={nl.shelf} onChange={e => setNl({ ...nl, shelf: e.target.value })} /><Btn onClick={addLoc} disabled={!nl.room.trim() || !nl.shelf.trim()}>Add location</Btn></div>
  </Card>;
}
