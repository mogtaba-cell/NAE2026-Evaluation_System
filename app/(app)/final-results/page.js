"use client";
import { useState } from "react";
import { useApi, PageHead, Card, Table, Loading, Badge, Chips, Two, Btn, Tabs, download, useToast } from "@/components/ui";

export default function Final() {
  const d = useApi("/api/final-results"); const [pw, setPw] = useState(""); const [tab, setTab] = useState("short"); const toast = useToast();
  if (!d.data) return <Loading error={d.error} />;
  const inPw = r => !pw || r.entry.pathway_code === pw;
  const all = d.data.rows.filter(inPw);
  const rows = tab === "short" ? all.filter(r => r.shortlisted) : tab === "all" ? all : [];
  const stopped = d.data.stopped.filter(e => !pw || e.pathway_code === pw);
  const anyOpen = d.data.pathways.some(p => (!pw || p.code === pw) && p.r2 && !p.r2locked);
  return <>
    <PageHead title="Final results" sub="The shortlist is every Round 2 entry with grade A that passed Round 2. Results are provisional until Round 2 is closed; then they are final." actions={<Btn onClick={() => download(`/api/reports?kind=results${pw ? `&pathway=${pw}` : ""}`).catch(e => toast(e.message, "err"))}>Export</Btn>} />
    <Chips value={pw} onChange={setPw} items={[["", "All pathways", d.data.rows.filter(r => r.shortlisted).length], ...d.data.pathways.map(p => [p.code, p.name, d.data.rows.filter(r => r.entry.pathway_code === p.code && r.shortlisted).length])]} />
    <Tabs value={tab} onChange={setTab} items={[["short", "Shortlist", all.filter(r => r.shortlisted).length], ["all", "All Round 2 results", all.length], ["stopped", "Withdrawn or not scored", stopped.length]]} />
    {anyOpen && tab !== "stopped" && <p className="small faint">Round 2 is still open{pw ? "" : " in at least one pathway"}: these results are provisional.</p>}
    {tab !== "stopped" ? <Card flush><Table minw={980} empty={tab === "short" ? "No shortlisted entries yet." : "No Round 2 results yet."} cols={[{ h: "#", cls: "r" }, "Entry", "School", "Subpathway", { h: "Round 1", cls: "r" }, { h: "Round 2", cls: "r" }, "Grade", "Round 2 outcome", "Framing", ""]} onRow={i => location.assign(`/entries/${rows[i].entry.code}`)}
      rows={rows.map((r, i) => [<span key="n" className="num faint">{i + 1}</span>, <Two key="e" a={<span className="code">{r.entry.code}</span>} b={<span dir="auto">{r.entry.title_en || r.entry.title_ar || r.entry.group_name}</span>} />, <span key="s" className="small">{r.entry.school?.name}</span>, <span key="b" className="small">{r.sub}</span>, <span key="1" className="num">{r.r1 ?? ""}</span>, <span key="2" className="num strong">{r.final}</span>, r.grade, r.passed ? <Badge key="o" tone="ok">Passed{r.shortlisted ? " · shortlisted" : ""}</Badge> : <Badge key="o">Did not pass</Badge>, <span key="f" className="small">{r.framing?.needs ? (r.framing.glass ? "Framing, glass" : "Framing") : ""}</span>, r.locked ? <Badge key="l" tone="ok">Final</Badge> : <Badge key="l">Provisional</Badge>])} /></Card>
      : <Card flush><Table minw={760} empty="None." cols={["Entry", "School", "Subpathway", "Status"]} onRow={i => location.assign(`/entries/${stopped[i].code}`)} rows={stopped.map(e => [<Two key="e" a={<span className="code">{e.code}</span>} b={e.title_en || e.group_name} />, <span key="s" className="small">{e.school?.name}</span>, <span key="b" className="small">{e.sub}</span>, <Badge key="x" tone="bad">{e.status === "withdrawn" ? "Withdrawn" : "Not scored"}</Badge>])} /></Card>}
  </>;
}
