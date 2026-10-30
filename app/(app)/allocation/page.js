"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, useApi, useMeta, useToast, PageHead, Card, Table, Btn, Banner, Loading, Check, Seg, Kpis, Field, fmt } from "@/components/ui";

// Allocation: which coordinator follows up with which school, per pathway. A school's artworks in a pathway always
// stay with one coordinator. Preview first; Confirm saves exactly what was previewed.
export default function Allocation() {
  const meta = useMeta(); const sp = useSearchParams(); const router = useRouter(); const toast = useToast();
  const pws = (meta?.data?.pathways || []).filter(p => p.entries);
  const pathway = sp.get("pathway") || pws[0]?.code;
  const d = useApi(pathway ? `/api/allocation?pathway=${pathway}` : null);
  const [chosen, setChosen0] = useState([]); const [mode, setMode0] = useState("balanced"); const [counts, setCounts0] = useState({}); const [all, setAll0] = useState(false);
  const [pv, setPv] = useState(null); const [busy, setBusy] = useState(null); const [err, setErr] = useState(null); const [schoolQ, setSchoolQ] = useState(""); const [initFor, setInitFor] = useState(null);
  // any change to the choices makes the preview out of date
  const touch = fn => v => { fn(v); setPv(null); };
  const setChosen = touch(setChosen0), setMode = touch(setMode0), setCounts = touch(setCounts0), setAll = touch(setAll0);
  // tick the pathway's coordinators once per pathway (not on every refresh, which used to undo the choices and the preview)
  useEffect(() => { if (d.data && initFor !== pathway) { setChosen0(d.data.allCoordinators.filter(c => !c.pathways?.length || c.pathways.includes(pathway)).map(c => c.id)); setCounts0({}); setAll0(false); setMode0("balanced"); setPv(null); setInitFor(pathway); } }, [d.data, pathway, initFor]);
  if (!meta?.data) return <Loading />;
  if (!pws.length) return <><PageHead title="Allocation" /><Banner title="Import artworks first" action={<Btn sm href="/import">Data import</Btn>} /></>;
  async function run(action) {
    setBusy(action); setErr(null);
    try {
      const r = await api("/api/allocation", { body: { pathway, action, coordinators: chosen, mode, counts, all } });
      if (action === "preview") setPv(r); else { toast(r.note); setPv(null); }
    } catch (e) { setErr(e.message); }
    setBusy(null);
  }
  async function move(school_id, coordinator_id) { try { await api("/api/allocation", { body: { pathway, action: "move", school_id, coordinator_id } }); toast("School moved"); setPv(null); } catch (e) { toast(e.message, "err"); } }
  const x = d.data;
  const pwName = pws.find(p => p.code === pathway)?.name || pathway;
  const nowOf = id => x?.coordinators.find(c => c.id === id) || { schools: 0, entries: 0 };
  const setTotal = chosen.reduce((a, id) => a + (Number(counts[id]) || 0), 0);
  const pool = x ? (all ? x.total : x.unallocated) : 0;
  const rows = x ? [...new Set([...x.coordinators.filter(c => c.entries).map(c => c.id), ...(pv ? pv.preview.map(c => c.id) : [])])].map(id => {
    const c = x.allCoordinators.find(k => k.id === id) || {}; const now = nowOf(id); const after = pv?.preview.find(k => k.id === id);
    return { id, name: c.name, now, after };
  }).sort((a, b) => (b.after?.entries ?? b.now.entries) - (a.after?.entries ?? a.now.entries)) : [];
  return <>
    <PageHead title="Allocation" sub="Coordinators follow up with schools. Each school stays with one coordinator in a pathway, so allocation works school by school."
      actions={<select className="select" style={{ width: 220 }} value={pathway} onChange={e => router.replace(`/allocation?pathway=${e.target.value}`)} aria-label="Pathway">{pws.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}</select>} />
    {!x ? <Loading error={d.error} /> : <>
      <Kpis dense items={[["Artworks", fmt(x.total)], ["Schools", fmt(x.schools.length)], ["Not allocated", fmt(x.unallocated), "", x.unallocated ? "warn" : "ok"], ["Coordinators", x.coordinators.filter(c => c.entries).length, "with artworks here"]]} />
      <div className="x-side">
        <Card title="Allocate" sub="Tick the coordinators, choose how to split, preview, then confirm.">
          {err && <Banner tone="bad" title={err} />}
          <Field label="How to split"><Seg value={mode} onChange={setMode} items={[["balanced", "Balanced"], ["counts", "Set numbers"]]} /></Field>
          <div className="al-list">
            <div className="al-h"><span>Coordinator</span><span className="r">Has now</span>{mode === "counts" && <span className="r">Target</span>}</div>
            {x.allCoordinators.map(c => { const on = chosen.includes(c.id); const mine = !c.pathways?.length || c.pathways.includes(pathway); return <div key={c.id} className={`al-row${on ? " on" : ""}`}>
              <span className="al-n"><Check label={c.name} checked={on} onChange={v => setChosen(v ? [...chosen, c.id] : chosen.filter(k => k !== c.id))} />{!mine && <span className="small faint">other pathways</span>}</span>
              <span className="r small">{nowOf(c.id).entries ? `${nowOf(c.id).entries} artworks` : "–"}</span>
              {mode === "counts" && <span className="r">{on ? <input className="input num" style={{ width: 84, height: 32 }} inputMode="numeric" placeholder="0" value={counts[c.id] || ""} onChange={e => setCounts({ ...counts, [c.id]: e.target.value.replace(/\D/g, "").slice(0, 4) })} aria-label={`Target for ${c.name}`} /> : null}</span>}
            </div>; })}
            {!x.allCoordinators.length && <span className="muted">No coordinator accounts yet. Create them in People and logins.</span>}
          </div>
          {mode === "counts" && <p className="small faint" style={{ margin: 0 }}>Targets add up to <b>{setTotal}</b> of {pool} artwork{pool === 1 ? "" : "s"} to hand out. {setTotal !== pool ? "Totals land close, not exact, because a school is never split; any difference goes to whoever is furthest below their target." : "Totals land close, not exact, because a school is never split."}</p>}
          <Check label="Re-allocate everything (not only unallocated artworks)" checked={all} onChange={setAll} />
          <p className="small faint" style={{ margin: 0 }}>{all ? `All ${x.total} ${pwName} artworks will be split again among the ticked coordinators. Anyone unticked loses their schools in ${pwName}.` : x.unallocated ? `Only the ${x.unallocated} unallocated artworks will be handed out; everyone keeps their current schools.` : "Every artwork already has a coordinator. Tick \"Re-allocate everything\" to split them again."}</p>
          <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
            <Btn busy={busy === "preview"} onClick={() => run("preview")} disabled={!chosen.length || !pool}>Preview</Btn>
            <Btn v="primary" busy={busy === "confirm"} disabled={!pv} onClick={() => run("confirm")}>{pv ? `Confirm: move ${pv.changed} school${pv.changed === 1 ? "" : "s"}` : "Confirm"}</Btn>
          </div>
        </Card>
        <Card title={pv ? "Preview: now → after" : "Current split"} sub={pv ? `${pv.moved} artworks handed out · ${pv.changed} school${pv.changed === 1 ? "" : "s"} change coordinator. Nothing is saved until you confirm.` : null} flush>
          <div className="al-split">
            <div className="al-sh"><span>Coordinator</span><span className="r">Schools</span><span className="r">Artworks</span></div>
            {rows.map(r => <div key={r.id} className="al-sr">
              <span className="strong">{r.name}</span>
              <span className="r">{r.after ? <>{r.now.schools} → <b>{r.after.schools}</b></> : r.now.schools}</span>
              <span className="r">{r.after ? <>{r.now.entries} → <b className={r.after.entries > r.now.entries ? "up" : r.after.entries < r.now.entries ? "down" : ""}>{r.after.entries}</b></> : r.now.entries}</span>
            </div>)}
            {!rows.length && <p className="muted" style={{ padding: 16, margin: 0 }}>Nobody allocated yet.</p>}
          </div>
        </Card>
      </div>
      <Card title="Schools" sub="Move a whole school to another coordinator. This saves straight away." flush right={<input className="input" style={{ width: 220 }} placeholder="Find a school" value={schoolQ} onChange={e => setSchoolQ(e.target.value)} />}>
        <Table minw={560} cols={["School", { h: "Artworks", cls: "r" }, "Coordinator"]} rows={x.schools.filter(s => !schoolQ || (s.name || "").toLowerCase().includes(schoolQ.toLowerCase()) || s.esis === schoolQ).slice(0, 100).map(s => [<div key="s" className="stack s4"><span className="strong">{s.name}</span><span className="small faint">eSIS {s.esis}</span></div>, s.entries,
          <select key="c" className="select" style={{ width: 220 }} value={s.coordinator_id || ""} onChange={e => move(s.id, e.target.value)}><option value="">Not allocated</option>{x.allCoordinators.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>])} />
        {x.schools.length > 100 && !schoolQ && <p className="small faint" style={{ padding: "8px 16px", margin: 0 }}>Showing the 100 largest schools. Search to find the rest.</p>}
      </Card>
    </>}
  </>;
}
