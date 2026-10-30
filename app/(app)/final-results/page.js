"use client";
import { useState } from "react";
import { api, Modal, Field, useApi, PageHead, Card, Table, Loading, Badge, Chips, Two, Btn, Tabs, download, useToast } from "@/components/ui";

const PLACE = { 1: "1st place", 2: "2nd place", 3: "3rd place" };
const placeTone = n => n === 1 ? "ok" : n === 2 ? "info" : "warn";
export default function Final() {
  const d = useApi("/api/final-results", [], { live: 60000 }); const [pw, setPw] = useState(""); const [tab0, setTab] = useState(null); const toast = useToast();
  if (!d.data) return <Loading error={d.error} />;
  const x = d.data;
  const inPw = r => !pw || r.entry.pathway_code === pw;
  const all = x.rows.filter(inPw);
  const comp = x.pathways.filter(p => p.competition && (!pw || p.code === pw));
  const tab = tab0 || "selected";
  const rows = tab === "selected" ? all.filter(r => r.selected) : tab === "all" ? all : [];
  const stopped = x.stopped.filter(e => !pw || e.pathway_code === pw);
  const anyOpen = x.pathways.some(p => (!pw || p.code === pw) && p.r2 && !p.r2locked);
  const winners = all.filter(r => r.place);
  const cyc = n => x.cycles.find(c => c.n === n);
  return <>
    <PageHead title="Final results" sub="Artworks that pass Round 1 are Shortlisted; those that pass Round 2 are Selected. In competition pathways the Selected artworks of each subpathway are ranked within each cycle for 1st, 2nd and 3rd place. Results are provisional until Round 2 is closed; then they are final." actions={<Btn onClick={() => download(`/api/reports?kind=results${pw ? `&pathway=${pw}` : ""}`).catch(e => toast(e.message, "err"))}>Export</Btn>} />
    <Chips value={pw} onChange={setPw} items={[["", "All pathways", x.rows.filter(r => r.selected).length], ...x.pathways.map(p => [p.code, p.name, x.rows.filter(r => r.entry.pathway_code === p.code && r.selected).length])]} />
    <Tabs value={tab} onChange={setTab} items={[["selected", "Selected", all.filter(r => r.selected).length], ...(comp.length ? [["winners", "Winners", winners.length]] : []), ["all", "All Round 2 results", all.length], ["stopped", "Withdrawn or not scored", stopped.length]]} />
    {anyOpen && tab !== "stopped" && <p className="small faint">Round 2 is still open{pw ? "" : " in at least one pathway"}: these results are provisional.</p>}
    {tab === "winners" ? <Winners comp={comp} all={all} cycles={x.cycles} can={x.can} onDone={d.reload} />
      : tab !== "stopped" ? <Card flush><Table lead={1} minw={1040} empty={tab === "selected" ? "No selected artworks yet." : "No Round 2 results yet."} cols={[{ h: "#", cls: "r" }, "Artwork", "School", "Subpathway", "Cycle", { h: "Round 1", cls: "r" }, { h: "Round 2", cls: "r" }, "Grade", "Outcome", "Framing", ""]} onRow={i => location.assign(`/entries/${rows[i].entry.code}`)}
      rows={rows.map((r, i) => [<span key="n" className="num faint">{i + 1}</span>, <Two key="e" a={<span className="code">{r.entry.code}</span>} b={<span dir="auto">{r.entry.title_en || r.entry.title_ar || r.entry.group_name}</span>} />, <span key="s" className="small">{r.entry.school?.name}</span>, <span key="b" className="small">{r.sub}</span>, <span key="c" className="small">{r.cycle ? cyc(r.cycle)?.name : "–"}</span>, <span key="1" className="num">{r.r1 ?? ""}</span>, <span key="2" className="num strong">{r.final}</span>, r.grade,
        <span key="o" className="row nowrap" style={{ gap: 4 }}>{r.selected ? <Badge tone="ok">Selected</Badge> : <Badge>Not selected</Badge>}{r.place && <Badge tone={placeTone(r.place)}>{PLACE[r.place]}{r.tie ? " (tie)" : ""}</Badge>}</span>, <span key="f" className="small">{r.framing?.needs ? (r.framing.glass ? "Framing, glass" : "Framing") : ""}</span>, r.locked ? <Badge key="l" tone="ok">Final</Badge> : <Badge key="l">Provisional</Badge>])} /></Card>
      : <Card flush><Table minw={760} empty="None." cols={["Artwork", "School", "Subpathway", "Status"]} onRow={i => location.assign(`/entries/${stopped[i].code}`)} rows={stopped.map(e => [<Two key="e" a={<span className="code">{e.code}</span>} b={e.title_en || e.group_name} />, <span key="s" className="small">{e.school?.name}</span>, <span key="b" className="small">{e.sub}</span>, <Badge key="x" tone="bad">{e.status === "withdrawn" ? "Withdrawn" : "Not scored"}</Badge>])} /></Card>}
  </>;
}

// One card per competition subpathway: three cycles side by side, each with 1st, 2nd and 3rd place.
function Winners({ comp, all, cycles, can, onDone }) {
  const toast = useToast(); const [tie, setTie] = useState(null); const [busy, setBusy] = useState(false);
  const sel = all.filter(r => r.selected);
  const cname = n => cycles.find(c => c.n === n)?.name;
  const mixed = sel.filter(r => r.competition && r.mixed);
  // everyone on the same result in the same subpathway and cycle, in the current order
  const openTie = r => setTie({ note: "", list: sel.filter(x => x.competition && x.entry.pathway_code === r.entry.pathway_code && x.entry.sub_code === r.entry.sub_code && x.cycle === r.cycle && x.final === r.final).sort((a, b) => (a.entry.tiebreak ?? 999) - (b.entry.tiebreak ?? 999)), decided: !!r.decided });
  const move = (i, d) => { const l = [...tie.list]; [l[i], l[i + d]] = [l[i + d], l[i]]; setTie({ ...tie, list: l }); };
  async function saveTie(clear) { setBusy(true); try { const r = await api("/api/winners", { body: { action: "tie", codes: tie.list.map(x => x.entry.code), note: tie.note, clear } }); toast(r.note); setTie(null); onDone(); } catch (e) { toast(e.message, "err"); } setBusy(false); }
  async function setCycle(code, v) { try { const r = await api("/api/winners", { body: { action: "cycle", code, cycle: v ? Number(v) : null } }); toast(r.note); onDone(); } catch (e) { toast(e.message, "err"); } }
  const noCycle = sel.filter(r => r.competition && !r.cycle);
  return <>
    {noCycle.length > 0 && <Card title={`${noCycle.length} selected artwork${noCycle.length === 1 ? " has" : "s have"} no grade, so no cycle`} sub="Add the students' grades in the import; until then they can't be placed.">{noCycle.map(r => <span key={r.entry.code} className="code" style={{ marginRight: 10 }}>{r.entry.code}</span>)}</Card>}
    {mixed.length > 0 && <Card title={`Groups with students in two cycles (${mixed.length})`} sub="Each competes in the higher cycle unless management, the admin or its coordinator chooses the other. Changing a cycle clears its tie order.">
      <div className="stack" style={{ gap: 8 }}>{mixed.map(r => <div key={r.entry.code} className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <a className="code" href={`/entries/${r.entry.code}`}>{r.entry.code}</a><span className="small" style={{ minWidth: 160 }}>{r.sub} · {r.final}</span>
        {can.cycle ? <select className="select" style={{ width: 260 }} value={r.cycleChosen ? String(r.cycle) : ""} onChange={e => setCycle(r.entry.code, e.target.value)} aria-label={`Cycle for ${r.entry.code}`}>
          <option value="">Automatic: {cname(Math.max(...r.cycleOptions))}</option>{r.cycleOptions.map(n => <option key={n} value={n}>{cname(n)}</option>)}</select>
          : <span className="small">{cname(r.cycle)}{r.cycleChosen ? " (chosen)" : " (automatic)"}</span>}
      </div>)}</div></Card>}
    {comp.map(p => <div key={p.code} className="stack" style={{ gap: 12 }}>
      <h3 style={{ margin: "8px 0 0" }}>{p.name}</h3>
      {p.subs.filter(sb => sel.some(r => r.entry.pathway_code === p.code && r.entry.sub_code === sb.code)).map(sb => <Card key={sb.code} title={sb.name} sub={`${sel.filter(r => r.entry.pathway_code === p.code && r.entry.sub_code === sb.code).length} selected`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
          {cycles.map(c => { const w = all.filter(r => r.entry.pathway_code === p.code && r.entry.sub_code === sb.code && r.cycle === c.n && r.place).sort((a, b) => a.place - b.place || b.final - a.final);
            return <div key={c.n} className="stack" style={{ gap: 8, padding: 12, border: "1px solid var(--rule)", borderRadius: 12 }}>
              <div><b>{c.name}</b> <span className="small faint">{c.grades}</span></div>
              {w.length ? w.map(r => <div key={r.entry.code} className="stack s4"><a href={`/entries/${r.entry.code}`} className="row" style={{ gap: 8, alignItems: "flex-start", flexWrap: "nowrap", textDecoration: "none", color: "inherit" }}>
                <span style={{ flexShrink: 0 }}><Badge tone={placeTone(r.place)}>{PLACE[r.place]}</Badge></span>
                <span className="stack s4" style={{ minWidth: 0 }}><span><span className="code">{r.entry.code}</span> <span className="num strong">{r.final}</span>{r.tie && <span className="small" style={{ color: "var(--warn)" }}> tie</span>}{r.decided && <span className="small faint"> tie decided</span>}</span><span className="small faint" dir="auto">{r.entry.title_en || r.entry.title_ar || r.entry.group_name}</span><span className="small faint">{r.entry.school?.name}{r.mixed ? (r.cycleChosen ? " · students in two cycles, cycle chosen" : " · students in two cycles, placed in the higher one") : ""}</span></span>
              </a>{can.tie && (r.tie || r.decided) && <span style={{ paddingLeft: 4 }}><Btn sm v={r.tie ? "primary" : "ghost"} onClick={() => openTie(r)}>{r.tie ? "Decide the tie" : "Change tie order"}</Btn></span>}</div>) : <span className="small faint">No selected artworks yet.</span>}
            </div>; })}
        </div>
      </Card>)}
      {p.subs.some(sb => !sel.some(r => r.entry.pathway_code === p.code && r.entry.sub_code === sb.code)) && <p className="small faint" style={{ margin: 0 }}>No selected artworks yet in {p.subs.filter(sb => !sel.some(r => r.entry.pathway_code === p.code && r.entry.sub_code === sb.code)).map(sb => sb.name).join(", ")}.</p>}
    </div>)}
    {all.some(r => r.tie) && <p className="small faint">A tie means artworks have the same Round 2 result. They share the place until management or the admin decides the order.</p>}
    <Modal open={!!tie} title="Decide the tie" sub={tie ? `${tie.list[0]?.sub} · ${cname(tie.list[0]?.cycle)} · all on ${tie.list[0]?.final}` : ""} onClose={() => setTie(null)}
      footer={<>{tie?.decided && <Btn v="ghost" busy={busy} onClick={() => saveTie(true)}>Make it a tie again</Btn>}<span className="sp" /><Btn onClick={() => setTie(null)}>Cancel</Btn><Btn v="primary" busy={busy} onClick={() => saveTie(false)}>Save this order</Btn></>}>
      {tie && <div className="stack" style={{ gap: 12 }}>
        <p className="small" style={{ margin: 0 }}>Put them in the order the panel decided. The first takes the higher place.</p>
        {tie.list.map((r, i) => <div key={r.entry.code} className="row" style={{ gap: 8, alignItems: "center", flexWrap: "nowrap", padding: "8px 10px", border: "1px solid var(--rule)", borderRadius: 10 }}>
          <b className="num" style={{ width: 22 }}>{i + 1}</b>
          <span className="stack s4" style={{ flex: 1, minWidth: 0 }}><span className="code">{r.entry.code}</span><span className="small faint" dir="auto">{r.entry.title_en || r.entry.title_ar || r.entry.group_name} · {r.entry.school?.name}</span></span>
          <Btn sm v="ghost" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">↑</Btn><Btn sm v="ghost" disabled={i === tie.list.length - 1} onClick={() => move(i, 1)} title="Move down">↓</Btn>
        </div>)}
        <Field label="Note (optional)"><input className="input" value={tie.note} onChange={e => setTie({ ...tie, note: e.target.value })} placeholder="For example: decided by the panel on 5 Nov" /></Field>
      </div>}
    </Modal>
  </>;
}
