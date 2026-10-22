"use client";
import { useState, useEffect } from "react";
import { api, useApi, useMeta, useToast, PageHead, Card, Table, Badge, Loading, Btn, Banner, Field, Modal, Two, dshort } from "@/components/ui";

export default function Collections() {
  const d = useApi("/api/collections"); const meta = useMeta(); const toast = useToast();
  const [sel, setSel] = useState(null); const c = useApi(sel ? `/api/collections/${sel}` : null);
  const [rec, setRec] = useState({}); const [cond, setCond] = useState({}); const [by, setBy] = useState(""); const [conf, setConf] = useState(false); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (d.data && !sel) setSel((d.data.collections.find(x => x.status === "scheduled") || d.data.collections[0])?.id || null); }, [d.data]); // eslint-disable-line
  useEffect(() => { setRec({}); setCond({}); setBy(""); setErr(null); }, [sel]);
  if (!d.data) return <Loading error={d.error} />;
  const list = d.data.collections; const can = ["admin", "storage"].includes(meta?.data?.me?.role);
  const x = c.data; const scheduled = x?.collection.status === "scheduled";
  async function handover() { setBusy(true); setErr(null); try { const r = await api(`/api/collections/${sel}`, { body: { action: "handover", received: rec, conditions: cond, handed_by: by } }); toast(r.note); setConf(false); c.reload(); d.reload(); } catch (e) { setErr(e.message); setConf(false); } setBusy(false); }
  async function schedule(v) { try { await api(`/api/collections/${sel}`, { body: { action: "schedule", scheduled_on: v } }); c.reload(); d.reload(); } catch (e) { toast(e.message, "err"); } }
  return <>
    <PageHead title="Collections" sub="One collection per school. The storage team checks each entry on arrival; a missing entry is marked on its own record and the rest of the batch carries on." actions={<Btn href="/logistics">Logistics board</Btn>} />
    {!list.length ? <Banner title="No collections yet">Create them from the logistics board once physical entries go through to Round 2.</Banner> : <div className="x-side">
      <Card title="All collections" flush><Table minw={520} sel={list.findIndex(l => l.id === sel)} onRow={i => setSel(list[i].id)} cols={["School", "Date", { h: "Entries", cls: "r" }, "Status"]} rows={list.map(l => [<Two key="s" a={l.school?.name} b={`${l.code}${l.coordinator ? " · " + l.coordinator : ""}`} />, l.scheduled_on ? dshort(l.scheduled_on) : <span key="d" className="faint">Not set</span>, l.count, l.status === "scheduled" ? <Badge key="b">Scheduled</Badge> : <Badge key="b" tone={l.missing ? "warn" : "ok"}>Checked in{l.missing ? ` · ${l.missing} missing` : ""}</Badge>])} /></Card>
      {!x ? <Loading error={c.error} /> : <Card title={x.collection.school?.name} sub={`${x.collection.code} · eSIS ${x.collection.school?.esis || ""} · ${x.collection.school?.region || ""}`} right={scheduled ? <Badge>Scheduled</Badge> : <Badge tone="ok">Checked in</Badge>}>
        {err && <Banner tone="bad" title={err} />}
        {can && scheduled && <Field label="Collection date"><input type="date" className="input" style={{ width: 180 }} value={x.collection.scheduled_on || ""} onChange={e => schedule(e.target.value)} /></Field>}
        <div className="stack s8">{x.items.map(i => <div key={i.entry_id} className="row nowrap" style={{ gap: 12, padding: "8px 0", borderTop: "1px solid var(--rule)" }}>
          <div className="grow stack s4" style={{ minWidth: 0 }}><span className="code">{i.entry.code}</span><span className="small faint" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.entry.title_en || i.entry.group_name} · {i.entry.size_text || i.entry.medium || ""}</span>
            {can && scheduled && rec[i.entry.code] === "ok" && <input className="input" style={{ height: 30, marginTop: 4 }} placeholder="Condition (Good)" value={cond[i.entry.code] || ""} onChange={e => setCond({ ...cond, [i.entry.code]: e.target.value })} />}</div>
          {can && scheduled ? <span className="f3-yn lg" style={{ flex: "none" }}><button type="button" className={rec[i.entry.code] === "ok" ? "on" : ""} style={{ width: 88 }} onClick={() => setRec({ ...rec, [i.entry.code]: "ok" })}>Received</button><button type="button" className={rec[i.entry.code] === "missing" ? "on" : ""} style={{ width: 72 }} onClick={() => setRec({ ...rec, [i.entry.code]: "missing" })}>Missing</button></span>
            : <span className="small">{i.state === "missing" ? <Badge tone="bad">Missing</Badge> : i.location || i.state}</span>}</div>)}</div>
        {can && scheduled && <div className="row" style={{ gap: 8 }}><span className="small faint">{Object.keys(rec).length} of {x.items.length} checked</span><span className="sp" style={{ flex: 1 }} /><Btn v="primary" disabled={Object.keys(rec).length < x.items.length} onClick={() => setConf(true)}>Confirm handover</Btn></div>}
        {!scheduled && <p className="x-note">Handed over by {x.collection.handed_by || "the school"}.</p>}
      </Card>}
    </div>}
    <Modal open={conf} title="Confirm handover" onClose={() => setConf(false)} footer={<><Btn onClick={() => setConf(false)}>Cancel</Btn><Btn v="primary" busy={busy} onClick={handover}>Confirm</Btn></>}>
      <p>{Object.values(rec).filter(v => v === "ok").length} received, {Object.values(rec).filter(v => v === "missing").length} missing. Received entries go to Storage Room B and get a shelf.</p>
      <Field label="Handed over by (school contact)"><input className="input" value={by} onChange={e => setBy(e.target.value)} /></Field>
    </Modal>
  </>;
}
