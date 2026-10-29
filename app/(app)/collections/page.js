"use client";
import { useState, useEffect } from "react";
import { api, useApi, useMeta, useToast, PageHead, Card, Table, Badge, Loading, Btn, Banner, Field, Modal, Two, Check, dshort } from "@/components/ui";

export default function Collections() {
  const d = useApi("/api/collections", [], { live: true }); const meta = useMeta(); const toast = useToast();
  const locs = useApi("/api/locations");
  const [sel, setSel] = useState(null); const c = useApi(sel ? `/api/collections/${sel}` : null);
  const [rec, setRec] = useState({}); const [cond, setCond] = useState({}); const [dmg, setDmg] = useState({}); const [where, setWhere] = useState(""); const [itemWhere, setItemWhere] = useState({});
  const [by, setBy] = useState(""); const [conf, setConf] = useState(false); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (d.data && !sel) setSel((d.data.collections.find(x => x.status === "scheduled") || d.data.collections[0])?.id || null); }, [d.data]); // eslint-disable-line
  useEffect(() => { setRec({}); setCond({}); setDmg({}); setWhere(""); setItemWhere({}); setBy(""); setErr(null); }, [sel]);
  if (!d.data) return <Loading error={d.error} />;
  const list = d.data.collections; const can = ["admin", "storage"].includes(meta?.data?.me?.role);
  const active = (locs.data?.locations || []).filter(l => l.active);
  const x = c.data; const scheduled = x?.collection.status === "scheduled";
  const todo = (x?.items || []).filter(i => i.state === "to_collect");
  const received = Object.values(rec).filter(v => v === "ok").length;
  const missingN = Object.values(rec).filter(v => v === "missing").length;
  const laterN = todo.length - received - missingN;
  const needWhere = todo.some(i => rec[i.entry.code] === "ok" && !itemWhere[i.entry.code]) && !where;
  async function handover() { setBusy(true); setErr(null); try { const r = await api(`/api/collections/${sel}`, { body: { action: "handover", received: rec, conditions: cond, damaged: dmg, location_id: where || null, locations: itemWhere, handed_by: by } }); toast(r.note); setConf(false); c.reload(); d.reload(); } catch (e) { setErr(e.message); setConf(false); } setBusy(false); }
  async function schedule(v) { try { await api(`/api/collections/${sel}`, { body: { action: "schedule", scheduled_on: v } }); c.reload(); d.reload(); } catch (e) { toast(e.message, "err"); } }
  const locSelect = (value, onChange, placeholder) => <select className="select" value={value} onChange={e => onChange(e.target.value)}><option value="">{placeholder}</option>{active.map(l => <option key={l.id} value={l.id}>{l.label} ({l.count} stored)</option>)}</select>;
  return <>
    <PageHead title="Collections" sub="One batch per school, pathway and subpathway. Storage checks each artwork on arrival and records where the batch is stored. A missing artwork is marked on its own and the rest of the batch carries on." actions={<Btn href="/logistics">Artwork logistics</Btn>} />
    {!list.length ? <Banner title="No collections yet">Schedule them from Artwork logistics (To do) once physical artworks go through to Round 2.</Banner> : <div className="x-side">
      <Card title="All collections" flush><Table minw={560} sel={list.findIndex(l => l.id === sel)} onRow={i => setSel(list[i].id)} cols={["School", "Subpathway", "Date", { h: "Artworks", cls: "r" }, "Status"]} rows={list.map(l => [<Two key="s" a={l.school?.name} b={`${l.code}${l.coordinator ? " · " + l.coordinator : ""}`} />, <span key="p" className="small">{l.sub || l.pathway}</span>, l.scheduled_on ? dshort(l.scheduled_on) : <span key="d" className="faint">Not set</span>, l.count, l.status === "scheduled" ? <Badge key="b" tone={l.left < l.count ? "info" : ""}>{l.left < l.count ? `Partly in · ${l.left} left` : "Scheduled"}</Badge> : <Badge key="b" tone={l.missing ? "warn" : "ok"}>Checked in{l.where ? ` · ${l.where}` : ""}{l.missing ? ` · ${l.missing} missing` : ""}</Badge>])} /></Card>
      {!x ? <Loading error={c.error} /> : <Card title={x.collection.school?.name} sub={`${x.collection.pathway || ""}${x.collection.sub ? " · " + x.collection.sub : ""} · ${x.collection.code} · eSIS ${x.collection.school?.esis || ""}`} right={scheduled ? <Badge>{todo.length < x.items.length ? `${todo.length} still to collect` : "Scheduled"}</Badge> : <Badge tone="ok">Checked in{x.collection.where ? ` · ${x.collection.where}` : ""}</Badge>}>
        {err && <Banner tone="bad" title={err} />}
        {can && scheduled && <div className="grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
          <Field label="Collection date"><input type="date" className="input" value={x.collection.scheduled_on || ""} onChange={e => schedule(e.target.value)} /></Field>
          <Field label="Stored in" help="Where this batch goes. Change single artworks below if needed.">{locSelect(where, setWhere, "Choose room and shelf…")}</Field>
        </div>}
        <div className="stack s8">{can && scheduled && todo.length > 1 && <div className="row" style={{ gap: 8 }}><Btn sm onClick={() => setRec(Object.fromEntries(todo.map(i => [i.entry.code, "ok"])))}>Mark all received</Btn><Btn sm v="ghost" onClick={() => setRec({})}>Clear</Btn><span className="small faint">Anything you don't mark stays in this collection for a later visit.</span></div>}
          {x.items.map(i => { const code = i.entry.code; const on = rec[code] === "ok"; const act = can && scheduled && i.state === "to_collect"; return <div key={i.entry_id} style={{ padding: "8px 0", borderTop: "1px solid var(--rule)" }}>
          <div className="row nowrap" style={{ gap: 12 }}>
            <div className="grow stack s4" style={{ minWidth: 0 }}><span className="code">{code}</span><span className="small faint" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.entry.title_en || i.entry.group_name} · {i.entry.size_text || i.entry.medium || ""}</span></div>
            {act ? <span className="f3-yn lg" style={{ flex: "none" }}><button type="button" className={on ? "on" : ""} style={{ width: 88 }} onClick={() => setRec({ ...rec, [code]: "ok" })}>Received</button><button type="button" className={rec[code] === "missing" ? "on" : ""} style={{ width: 72 }} onClick={() => setRec({ ...rec, [code]: "missing" })}>Missing</button><button type="button" className={!rec[code] ? "on" : ""} style={{ width: 72 }} onClick={() => { const r = { ...rec }; delete r[code]; setRec(r); }}>Not yet</button></span>
              : <span className="small">{i.state === "missing" ? <Badge tone="bad">Missing</Badge> : <>{i.where || i.state}{i.damaged ? <> <Badge tone="warn">Damaged</Badge></> : null}</>}</span>}
          </div>
          {act && on && <div className="row" style={{ gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <Check label="Damaged" checked={!!dmg[code]} onChange={v => setDmg({ ...dmg, [code]: v })} />
            <input className="input" style={{ height: 30, flex: "1 1 180px" }} placeholder={dmg[code] ? "What's damaged?" : "Condition notes (optional)"} value={cond[code] || ""} onChange={e => setCond({ ...cond, [code]: e.target.value })} />
            <div style={{ flex: "1 1 200px" }}>{locSelect(itemWhere[code] || "", v => setItemWhere({ ...itemWhere, [code]: v }), "Same place as the batch")}</div>
          </div>}
        </div>; })}</div>
        {can && scheduled && <div className="row" style={{ gap: 8 }}><span className="small faint">{received} received · {missingN} missing · {laterN} not yet</span><span className="sp" style={{ flex: 1 }} /><Btn v="primary" disabled={!(received + missingN) || needWhere} onClick={() => setConf(true)}>{laterN && received + missingN ? "Check in these" : "Confirm handover"}</Btn></div>}
        {can && scheduled && needWhere && <p className="small" style={{ color: "var(--warn)" }}>Choose where the batch is stored.</p>}
        {!scheduled && <p className="x-note">Handed over by {x.collection.handed_by || "the school"}.</p>}
      </Card>}
    </div>}
    <Modal open={conf} title="Confirm handover" onClose={() => setConf(false)} footer={<><Btn onClick={() => setConf(false)}>Cancel</Btn><Btn v="primary" busy={busy} onClick={handover}>Confirm</Btn></>}>
      <p>{received} received{Object.values(dmg).filter(Boolean).length ? ` (${Object.values(dmg).filter(Boolean).length} damaged)` : ""}, {Object.values(rec).filter(v => v === "missing").length} missing.{where ? ` Received artworks go to ${active.find(l => l.id === where)?.label}.` : ""} Missing artworks are listed under Exceptions.{laterN ? ` ${laterN} not yet collected stay in this collection for a later visit.` : ""}</p>
      <Field label="Handed over by (school contact)"><input className="input" value={by} onChange={e => setBy(e.target.value)} /></Field>
    </Modal>
  </>;
}
