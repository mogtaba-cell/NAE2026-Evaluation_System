"use client";
import { useState } from "react";
import { api, useApi, useMeta, useToast, PageHead, Btn, Badge, Loading, Kpis, Modal, Field, Card, Table, Tabs, Check, Two } from "@/components/ui";
import { EditLogistics, MISSING } from "@/components/Logistics";

const COLS = [["to_collect", "To collect", "At the school"], ["storage", "In storage", "On a shelf"], ["coordinator", "With coordinator", "In a session"], ["framer", "At the framer", "Showcase framing"], ["missing", "Missing", "Not received"], ["returned", "Returned", "Back at the school"]];

export default function Logistics() {
  const d = useApi("/api/logistics"); const meta = useMeta(); const toast = useToast();
  const locs = useApi("/api/locations");
  const [tab, setTab] = useState("board");
  const [edit, setEdit] = useState(null); const [more, setMore] = useState({}); const [mk, setMk] = useState(null);
  const [onlyShort, setOnlyShort] = useState(true); const [nl, setNl] = useState({ room: "", shelf: "" });
  if (!d.data) return <Loading error={d.error} />;
  const rows = d.data.rows;
  const by = k => rows.filter(r => r.state === k);
  const unbatched = rows.filter(r => r.state === "to_collect" && !r.collection_id).length;
  const role = meta?.data?.me?.role;
  const canEdit = ["admin", "storage"].includes(role);
  async function makeCollections() { try { const r = await api("/api/logistics", { body: { action: "create_collections", scheduled_on: mk } }); toast(r.note); setMk(null); d.reload(); } catch (e) { toast(e.message, "err"); } }
  async function addLoc() { try { await api("/api/locations", { body: { action: "add", ...nl } }); setNl({ room: "", shelf: "" }); locs.reload(); toast("Location added"); } catch (e) { toast(e.message, "err"); } }
  async function locUpd(id, patch) { try { await api("/api/locations", { body: { action: "update", id, ...patch } }); locs.reload(); } catch (e) { toast(e.message, "err"); } }
  const framing = rows.filter(r => r.needs_framing && (!onlyShort || r.shortlisted));
  const line = r => r.state === "to_collect" ? (r.collection?.scheduled_on ? `Collect ${r.collection.scheduled_on}` : "Not scheduled") : r.state === "missing" ? (r.missing_outcome ? MISSING[r.missing_outcome] : "Missing at collection") : r.state === "coordinator" ? (r.session?.title || "With coordinator") : r.where || "Not shelved";
  return <>
    <PageHead title="Artwork logistics" sub="Physical artworks (subpathways marked Physical in Program setup) that went through to Round 2: collection, storage, sessions, framing for the showcase, and return." actions={<><Btn href="/collections">Collections</Btn><Btn href="/pull-list">Pull lists</Btn>{canEdit && unbatched > 0 && <Btn v="primary" onClick={() => setMk("")}>Schedule {unbatched} for collection</Btn>}</>} />
    <Kpis items={[["Physical artworks", rows.length], ["To collect", by("to_collect").length, `${unbatched} not scheduled yet`], ["In storage", by("storage").length, "", "ok"], ["Missing", by("missing").length, `${rows.filter(r => r.damaged).length} damaged`, by("missing").length ? "warn" : "ok"], ["Need framing", rows.filter(r => r.needs_framing).length, `${rows.filter(r => r.needs_framing && r.glass_framing).length} with glass`]]} />
    <Tabs value={tab} onChange={setTab} items={[["board", "Board"], ["framing", `Framing ${rows.filter(r => r.needs_framing).length}`], ...(canEdit ? [["locations", "Storage locations"]] : [])]} />
    {tab === "board" && <div className="x-board x-board6">{COLS.map(([k, t, s]) => { const x = by(k); const lim = more[k] ? x.length : 12; return <section className="x-col" key={k}><div className="kh"><span>{t}</span><span className="s">{s}</span><span className="n">{x.length}</span></div>
      {x.slice(0, lim).map(r => <div className="x-kc" key={r.entry_id} role="button" tabIndex={0} onClick={() => canEdit ? setEdit(r) : location.assign(`/entries/${r.entry.code}`)}><div className="row between nowrap"><span className="code">{r.entry.code}</span><span className="row nowrap" style={{ gap: 4 }}>{r.damaged && <Badge tone="warn">Damaged</Badge>}{r.scored && <Badge tone="ok">Scored</Badge>}</span></div><b>{r.entry.title_en || r.entry.group_name || r.sub}</b><span>{r.entry.school?.name} · {r.sub}</span>
        <span>{line(r)}</span></div>)}
      {x.length > lim && <button type="button" className="x-more link" onClick={() => setMore({ ...more, [k]: true })}>Show {x.length - lim} more</button>}{!x.length && <span className="x-more">Nothing here</span>}</section>; })}</div>}
    {tab === "framing" && <Card flush title="Framing for the showcase" sub="Ticked during Round 2 scoring. Shortlisted = grade A and passed Round 2." right={<Check label="Shortlisted only" checked={onlyShort} onChange={setOnlyShort} />}>
      <Table minw={820} empty="No artworks marked for framing." cols={["Artwork", "School", "Glass", "Round 2", "Where", ""]} onRow={i => canEdit && setEdit(framing[i])}
        rows={framing.map(r => [<Two key="e" a={<span className="code">{r.entry.code}</span>} b={r.entry.title_en || r.entry.group_name || r.sub} />, <span key="s" className="small">{r.entry.school?.name}</span>, r.glass_framing ? <Badge key="g" tone="info">Protective glass</Badge> : <span key="g" className="faint small">No</span>, r.r2 ? <span key="r" className="small">{r.r2.final ?? "–"} · {r.r2.grade}{r.shortlisted ? " · shortlisted" : ""}</span> : <span key="r" className="faint small">Not scored</span>, <span key="w" className="small">{r.state === "framer" ? "At the framer" : r.where || r.state}</span>, canEdit ? <Btn key="b" sm onClick={ev => { ev.stopPropagation(); setEdit(r); }}>Update</Btn> : ""])} /></Card>}
    {tab === "locations" && canEdit && <Card title="Storage locations" sub="Temporary rooms until the real storage plan is confirmed. Rename or add rooms and shelves here.">
      <Table minw={520} cols={["Room", "Shelf or area", { h: "Stored", cls: "r" }, ""]} rows={(locs.data?.locations || []).map(l => [<input key="r" className="input" defaultValue={l.room} onBlur={e => e.target.value.trim() && e.target.value !== l.room && locUpd(l.id, { room: e.target.value })} />, <input key="s" className="input" defaultValue={l.shelf} onBlur={e => e.target.value.trim() && e.target.value !== l.shelf && locUpd(l.id, { shelf: e.target.value })} />, l.count, <Check key="a" label="In use" checked={l.active} onChange={v => locUpd(l.id, { active: v })} />])} />
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><input className="input" style={{ width: 180 }} placeholder="Room" value={nl.room} onChange={e => setNl({ ...nl, room: e.target.value })} /><input className="input" style={{ width: 180 }} placeholder="Shelf or area" value={nl.shelf} onChange={e => setNl({ ...nl, shelf: e.target.value })} /><Btn onClick={addLoc} disabled={!nl.room.trim() || !nl.shelf.trim()}>Add location</Btn></div>
    </Card>}
    {edit && <EditLogistics row={edit} onClose={() => setEdit(null)} onSaved={d.reload} />}
    <Modal open={mk !== null} title="Schedule collections" sub="One collection per school, pathway and subpathway" onClose={() => setMk(null)} footer={<><Btn onClick={() => setMk(null)}>Cancel</Btn><Btn v="primary" onClick={makeCollections}>Create collections</Btn></>}>
      <Field label="Collection date (optional)"><input type="date" className="input" value={mk || ""} onChange={e => setMk(e.target.value)} /></Field>
      <p className="muted">{unbatched} artworks are grouped by school and subpathway. You can change each collection's date later.</p>
    </Modal>
  </>;
}
