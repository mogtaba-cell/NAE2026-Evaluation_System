"use client";
import { use, useEffect, useState } from "react";
import RoundEditor from "@/components/RoundEditor";
import { api, useMeta, useToast, PageHead, Card, Table, Btn, Badge, Banner, Loading, Field, Check, Switch, Modal, fmt } from "@/components/ui";

export default function PathwaySetup({ params }) {
  const { code } = use(params);
  const meta = useMeta(); const toast = useToast();
  const [subs, setSubs] = useState(null); const [busy, setBusy] = useState(false);
  const p = meta?.data?.pathways?.find(x => x.code === code);
  useEffect(() => { if (p) setSubs(p.subs.map(s => ({ ...s }))); }, [p]);
  if (!meta?.data) return <Loading error={meta?.error} />;
  if (!p) return <Banner tone="bad" title="Pathway not found" />;
  const rubs = meta.data.rubrics.filter(r => !r.pathway_code || r.pathway_code === code);
  const rubOpt = (v, on) => <select className="select" value={v || ""} onChange={e => on(e.target.value)} style={{ minWidth: 160 }}><option value="">None</option>{rubs.map(r => <option key={r.id} value={r.id}>{r.code}{r.published ? ` v${r.published.version}` : " (draft)"}</option>)}</select>;
  const upd = (i, k, v) => setSubs(s => s.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const dirty = subs && JSON.stringify(subs.map(s => [s.is_physical, s.rubric_r1, s.rubric_r2])) !== JSON.stringify(p.subs.map(s => [s.is_physical, s.rubric_r1, s.rubric_r2]));
  async function saveSubs() { setBusy(true); try { await api(`/api/pathways/${code}`, { method: "PATCH", body: { subs: subs.map(s => ({ code: s.code, is_physical: s.is_physical, rubric_r1: s.rubric_r1 || "", rubric_r2: s.rubric_r2 || "" })) } }); toast("Subpathways saved"); meta.reload(); } catch (e) { toast(e.message, "err"); } setBusy(false); }
  return <>
    <PageHead back={["Program setup", "/setup"]} title={p.name} sub={`${p.track} track · ${fmt(p.entries)} entries · ${fmt(p.students)} students`} actions={<><Btn href={`/entries?pathway=${code}`}>Entries</Btn><Btn href={`/allocation?pathway=${code}`}>Allocation</Btn></>} />
    <div className="x-ck">{p.check.map(c => <div key={c.key} className={c.ok ? "ok" : p.entries ? "bad" : ""}><b>{c.label}</b><span>{c.text}</span></div>)}</div>
    <Card title="Subpathways and rubrics" sub="New subpathways found during import are added here automatically. Physical subpathways are collected and judged in the room in Round 2." flush right={<Btn v="primary" sm disabled={!dirty} busy={busy} onClick={saveSubs}>Save</Btn>}>
      {subs && <Table minw={760} cols={["Subpathway", { h: "Entries", cls: "r" }, "Physical in Round 2", "Round 1 rubric", "Round 2 rubric"]} rows={subs.map((s, i) => [<span key="n" className="strong">{s.name} <span className="code faint">{s.code}</span></span>, <span key="e" className="num">{s.entries}</span>, <Switch key="p" checked={!!s.is_physical} onChange={v => upd(i, "is_physical", v)} />, rubOpt(s.rubric_r1, v => upd(i, "rubric_r1", v)), rubOpt(s.rubric_r2, v => upd(i, "rubric_r2", v))])} />}
    </Card>
    <div id="rounds" className="stack" style={{ gap: 16 }}>{p.rounds.map(r => <RoundEditor key={r.id} r={r} onSaved={meta.reload} />)}</div>
  </>;
}
