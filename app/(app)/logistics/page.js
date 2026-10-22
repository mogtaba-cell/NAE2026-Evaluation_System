"use client";
import { useState } from "react";
import { api, useApi, useMeta, useToast, PageHead, Btn, Badge, Loading, Kpis, Modal, Field } from "@/components/ui";
import { LG, isExc, EditLogistics } from "@/components/Logistics";

const COLS = [["to_collect", "To collect", "At the school"], ["storage", "In storage", "Room B"], ["coordinator", "With coordinator", "In a session"], ["exc", "Exceptions", "Missing or damaged"]];

export default function Logistics() {
  const d = useApi("/api/logistics"); const meta = useMeta(); const toast = useToast();
  const [edit, setEdit] = useState(null); const [more, setMore] = useState({}); const [mk, setMk] = useState(null);
  if (!d.data) return <Loading error={d.error} />;
  const rows = d.data.rows; const col = r => isExc(r) ? "exc" : r.state === "returned" ? "storage" : r.state;
  const by = k => rows.filter(r => col(r) === k);
  const unbatched = rows.filter(r => r.state === "to_collect" && !r.collection_id).length;
  const canEdit = ["admin", "storage"].includes(meta?.data?.me?.role);
  async function makeCollections() { try { const r = await api("/api/logistics", { body: { action: "create_collections", scheduled_on: mk } }); toast(r.note); setMk(null); d.reload(); } catch (e) { toast(e.message, "err"); } }
  return <>
    <PageHead title="Artwork logistics" sub="Only physical entries that went through to Round 2 are collected (for example Painting & Drawing, Traditional Crafts and Calligraphy). Everything else is judged from its files." actions={<><Btn href="/collections">Collections</Btn><Btn href="/pull-list">Pull lists</Btn>{canEdit && unbatched > 0 && <Btn v="primary" onClick={() => setMk("")}>Schedule {unbatched} for collection</Btn>}</>} />
    <Kpis items={[["Physical entries", rows.length], ["To collect", by("to_collect").length, `${unbatched} not scheduled yet`], ["In storage", by("storage").length, "", "ok"], ["Exceptions", by("exc").length, `${rows.filter(r => r.state === "missing").length} missing`, by("exc").length ? "warn" : "ok"]]} />
    <div className="x-board">{COLS.map(([k, t, s]) => { const x = by(k); const lim = more[k] ? x.length : 12; return <section className="x-col" key={k}><div className="kh"><span>{t}</span><span className="s">{s}</span><span className="n">{x.length}</span></div>
      {x.slice(0, lim).map(r => <div className="x-kc" key={r.entry_id} role="button" tabIndex={0} onClick={() => canEdit ? setEdit(r) : location.assign(`/entries/${r.entry.code}`)}><div className="row between nowrap"><span className="code">{r.entry.code}</span>{r.scored && <Badge tone="ok">Scored</Badge>}</div><b>{r.entry.title_en || r.entry.group_name || r.sub}</b><span>{r.entry.school?.name}</span>
        <span>{r.state === "to_collect" ? (r.collection?.scheduled_on ? `Collect ${r.collection.scheduled_on}` : "Not scheduled") : r.state === "missing" ? "Missing at collection" : r.state === "coordinator" ? (r.session ? `${r.session.title}` : "With coordinator") : isExc(r) ? r.condition : r.location || "Not shelved"}</span></div>)}
      {x.length > lim && <button type="button" className="x-more link" onClick={() => setMore({ ...more, [k]: true })}>Show {x.length - lim} more</button>}{!x.length && <span className="x-more">Nothing here</span>}</section>; })}</div>
    <p className="x-note">Framing happens only after final selection, for showcase entries. It is not part of Round 2.</p>
    {edit && <EditLogistics row={edit} onClose={() => setEdit(null)} onSaved={d.reload} />}
    <Modal open={mk !== null} title="Schedule collections" sub="One collection per school and pathway" onClose={() => setMk(null)} footer={<><Btn onClick={() => setMk(null)}>Cancel</Btn><Btn v="primary" onClick={makeCollections}>Create collections</Btn></>}>
      <Field label="Collection date (optional)"><input type="date" className="input" value={mk || ""} onChange={e => setMk(e.target.value)} /></Field>
      <p className="muted">{unbatched} entries are grouped by school. You can change each collection's date later.</p>
    </Modal>
  </>;
}
