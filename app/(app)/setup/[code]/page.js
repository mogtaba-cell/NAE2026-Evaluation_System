"use client";
import { use, useEffect, useState } from "react";
import RoundEditor from "@/components/RoundEditor";
import Readiness from "@/components/Readiness";
import { api, useMeta, useToast, PageHead, Card, Table, Btn, Badge, Banner, Loading, Field, Switch, fmt } from "@/components/ui";

export default function PathwaySetup({ params }) {
  const { code } = use(params);
  const meta = useMeta(); const toast = useToast();
  const [subs, setSubs] = useState(null); const [busy, setBusy] = useState(false); const [reason, setReason] = useState("");
  const p = meta?.data?.pathways?.find(x => x.code === code);
  useEffect(() => { if (p) setSubs(p.subs.map(s => ({ ...s }))); }, [p]);
  if (!meta?.data) return <Loading error={meta?.error} />;
  if (!p) return <Banner tone="bad" title="Pathway not found" />;
  const started = p.rounds.some(r => r.status !== "setup");
  const rubs = meta.data.rubrics.filter(r => !r.pathway_code || r.pathway_code === code);
  const rubOpt = (v, on, r2) => <select className="select" value={v || ""} onChange={e => on(e.target.value)} style={{ minWidth: 170 }}><option value="">{r2 ? "Same as Round 1" : "Choose a rubric…"}</option>{rubs.map(r => <option key={r.id} value={r.id}>{r.code}{r.published ? ` v${r.published.version}` : " (not published)"}{r.published?.identity_required ? " · identity" : ""}</option>)}</select>;
  const upd = (i, k, v) => setSubs(s => s.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const key = s => [s.is_physical, s.rubric_r1 || "", s.rubric_r2 || "", !!s.confirm_rubrics];
  const dirty = subs && JSON.stringify(subs.map(key)) !== JSON.stringify(p.subs.map(key));
  const needReason = started && subs && subs.some((s, i) => s.is_physical !== p.subs[i].is_physical || (s.rubric_r1 || "") !== (p.subs[i].rubric_r1 || "") || (s.rubric_r2 || "") !== (p.subs[i].rubric_r2 || ""));
  async function saveSubs() { setBusy(true); try { await api(`/api/pathways/${code}`, { method: "PATCH", body: { reason, subs: subs.map(s => ({ code: s.code, is_physical: s.is_physical, rubric_r1: s.rubric_r1 || "", rubric_r2: s.rubric_r2 || "", confirm_rubrics: !!s.confirm_rubrics })) } }); toast("Subpathways saved"); setReason(""); meta.reload(); } catch (e) { toast(e.message, "err"); } setBusy(false); }
  return <>
    <PageHead back={["Program setup", "/setup"]} title={p.name} sub={`${p.track} track · ${fmt(p.entries)} entries · ${fmt(p.students)} students`} actions={<><Btn href={`/entries?pathway=${code}`}>Entries</Btn><Btn href={`/allocation?pathway=${code}`}>Allocation</Btn><Btn href="/rounds">Rounds</Btn></>} />
    {p.rounds.map(r => <div key={r.id} className="stack s8"><span className="small faint">Round {r.round_no} · {r.status === "setup" ? "ready to open?" : r.status}</span><Readiness checks={r.readiness?.checks || []} /></div>)}
    <Card title="Subpathways and rubrics" sub="New subpathways found during import are added here. Round 1 is always online. In Round 2, subpathways switched to Physical are collected and scored in the room; the rest are scored online." flush right={<Btn v="primary" sm disabled={!dirty || (needReason && !reason.trim())} busy={busy} onClick={saveSubs}>Save</Btn>}>
      {subs && <Table minw={820} cols={["Subpathway", { h: "Entries", cls: "r" }, "Physical in Round 2", "Round 1 rubric", "Round 2 rubric"]} rows={subs.map((s, i) => [
        <div key="n" className="stack s4"><span className="strong">{s.name} <span className="code faint">{s.code}</span></span>{s.rubric_inherited && !s.confirm_rubrics && <span className="row" style={{ gap: 6 }}><Badge tone="warn">Rubrics copied at import</Badge><button type="button" className="link small" onClick={() => upd(i, "confirm_rubrics", true)}>Looks right</button></span>}</div>,
        <span key="e" className="num">{s.entries}</span>, <Switch key="p" checked={!!s.is_physical} onChange={v => upd(i, "is_physical", v)} />, rubOpt(s.rubric_r1, v => upd(i, "rubric_r1", v)), rubOpt(s.rubric_r2, v => upd(i, "rubric_r2", v), true)])} />}
      {needReason && <div style={{ padding: 16 }}><Field label="Reason for the change" help="A round of this pathway has opened. Changing Physical moves entries already in Round 2 (onto or off the collection list). A rubric can't be swapped once a subpathway has scores; publish a new version of it instead."><input className="input" value={reason} onChange={e => setReason(e.target.value)} /></Field></div>}
    </Card>
    <div id="rounds" className="stack" style={{ gap: 16 }}>{p.rounds.map(r => <RoundEditor key={r.id} r={r} p={p} onSaved={meta.reload} />)}</div>
  </>;
}
