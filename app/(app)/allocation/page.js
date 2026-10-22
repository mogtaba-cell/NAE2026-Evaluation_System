"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, useApi, useMeta, useToast, PageHead, Card, Table, Btn, Banner, Loading, Check, Seg, Kpis, Person, Field, fmt } from "@/components/ui";

export default function Allocation() {
  const meta = useMeta(); const sp = useSearchParams(); const router = useRouter(); const toast = useToast();
  const pws = (meta?.data?.pathways || []).filter(p => p.entries);
  const pathway = sp.get("pathway") || pws[0]?.code;
  const d = useApi(pathway ? `/api/allocation?pathway=${pathway}` : null);
  const [chosen, setChosen] = useState([]); const [mode, setMode] = useState("balanced"); const [counts, setCounts] = useState({}); const [all, setAll] = useState(false);
  const [pv, setPv] = useState(null); const [busy, setBusy] = useState(null); const [err, setErr] = useState(null); const [schoolQ, setSchoolQ] = useState("");
  useEffect(() => { if (d.data) { setChosen(d.data.allCoordinators.filter(c => !c.pathways?.length || c.pathways.includes(pathway)).map(c => c.id)); setPv(null); } }, [d.data, pathway]);
  if (!meta?.data) return <Loading />;
  if (!pws.length) return <><PageHead title="Allocation" /><Banner title="Import entries first" action={<Btn sm href="/import">Data import</Btn>} /></>;
  async function run(action) { setBusy(action); setErr(null); try { const r = await api("/api/allocation", { body: { pathway, action, coordinators: chosen, mode, counts, all } }); if (action === "preview") setPv(r); else { toast(r.note); setPv(null); d.reload(); meta.reload(); } } catch (e) { setErr(e.message); } setBusy(null); }
  async function move(school_id, coordinator_id) { try { await api("/api/allocation", { body: { pathway, action: "move", school_id, coordinator_id } }); toast("School moved"); d.reload(); } catch (e) { toast(e.message, "err"); } }
  const x = d.data;
  return <>
    <PageHead title="Allocation" sub="Coordinators follow up with schools. Each school stays with one coordinator, so allocation works school by school." actions={<select className="select" style={{ width: 220 }} value={pathway} onChange={e => router.replace(`/allocation?pathway=${e.target.value}`)}>{pws.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}</select>} />
    {!x ? <Loading error={d.error} /> : <>
      <Kpis items={[["Entries", fmt(x.total)], ["Schools", fmt(x.schools.length)], ["Not allocated", fmt(x.unallocated), "", x.unallocated ? "warn" : "ok"], ["Coordinators", x.coordinators.filter(c => c.entries).length, "with entries here"]]} />
      <div className="x-side">
        <Card title="Allocate" sub="Pick the coordinators, then preview before confirming.">
          {err && <Banner tone="bad" title={err} />}
          <Field label="Coordinators"><div className="stack s8">{x.allCoordinators.map(c => <div key={c.id} className="row nowrap" style={{ gap: 12 }}><Check label={c.name} checked={chosen.includes(c.id)} onChange={v => setChosen(v ? [...chosen, c.id] : chosen.filter(k => k !== c.id))} />
            {mode === "counts" && chosen.includes(c.id) && <input className="input num" style={{ width: 90, marginLeft: "auto" }} placeholder="entries" value={counts[c.id] || ""} onChange={e => setCounts({ ...counts, [c.id]: e.target.value.replace(/\D/g, "") })} />}</div>)}
            {!x.allCoordinators.length && <span className="muted">No coordinator accounts yet. Create them in People and logins.</span>}</div></Field>
          <Field label="How to split"><Seg value={mode} onChange={setMode} items={[["balanced", "Balanced"], ["counts", "Set numbers"]]} /></Field>
          <Check label="Re-allocate everything (not only unallocated entries)" checked={all} onChange={setAll} />
          <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}><Btn busy={busy === "preview"} onClick={() => run("preview")} disabled={!chosen.length}>Preview</Btn><Btn v="primary" busy={busy === "confirm"} disabled={!pv} onClick={() => run("confirm")}>Confirm</Btn></div>
          {pv && <Table cols={["Coordinator", { h: "Schools", cls: "r" }, { h: "Entries", cls: "r" }]} rows={pv.preview.map(c => [c.name, c.schools, c.entries])} />}
          {pv && <p className="x-note">{pv.moved} entries would be allocated.</p>}
        </Card>
        <Card title="Current split" flush><Table cols={["Coordinator", { h: "Schools", cls: "r" }, { h: "Entries", cls: "r" }]} rows={x.coordinators.filter(c => c.entries).map(c => [<Person key="p" name={c.name} />, c.schools, c.entries])} empty="Nobody allocated yet." /></Card>
      </div>
      <Card title="Schools" sub="Move a whole school to another coordinator." flush right={<input className="input" style={{ width: 220 }} placeholder="Find a school" value={schoolQ} onChange={e => setSchoolQ(e.target.value)} />}>
        <Table minw={640} cols={["School", { h: "Entries", cls: "r" }, "Coordinator"]} rows={x.schools.filter(s => !schoolQ || (s.name || "").toLowerCase().includes(schoolQ.toLowerCase()) || s.esis === schoolQ).slice(0, 100).map(s => [<div key="s" className="stack s4"><span className="strong">{s.name}</span><span className="small faint">eSIS {s.esis}</span></div>, s.entries,
          <select key="c" className="select" style={{ width: 220 }} value={s.coordinator_id || ""} onChange={e => move(s.id, e.target.value)}><option value="">Not allocated</option>{x.allCoordinators.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>])} />
      </Card>
    </>}
  </>;
}
