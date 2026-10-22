"use client";
import { useState } from "react";
import { useApi, PageHead, Card, Table, Loading, Badge, Chips, Two, Btn, download, useToast } from "@/components/ui";

export default function Final() {
  const d = useApi("/api/final-results"); const [pw, setPw] = useState(""); const toast = useToast();
  if (!d.data) return <Loading error={d.error} />;
  const rows = d.data.rows.filter(r => !pw || r.entry.pathway_code === pw);
  return <>
    <PageHead title="Final results" sub="Round 2 results, highest first. Results marked Draft can still change until the round is closed and locked." actions={<Btn onClick={() => download(`/api/reports?kind=results${pw ? `&pathway=${pw}` : ""}`).catch(e => toast(e.message, "err"))}>Export</Btn>} />
    <Chips value={pw} onChange={setPw} items={[["", "All", d.data.rows.length], ...d.data.pathways.map(p => [p.code, p.name, d.data.rows.filter(r => r.entry.pathway_code === p.code).length])]} />
    <Card flush><Table minw={860} empty="No Round 2 results yet." cols={[{ h: "#", cls: "r" }, "Entry", "School", "Subpathway", { h: "Round 1", cls: "r" }, { h: "Round 2", cls: "r" }, "Grade", ""]} onRow={i => location.assign(`/entries/${rows[i].entry.code}`)}
      rows={rows.map((r, i) => [<span key="n" className="num faint">{i + 1}</span>, <Two key="e" a={<span className="code">{r.entry.code}</span>} b={<span dir="auto">{r.entry.title_en || r.entry.title_ar || r.entry.group_name}</span>} />, <span key="s" className="small">{r.entry.school?.name}</span>, <span key="b" className="small">{r.sub}</span>, <span key="1" className="num">{r.r1 ?? ""}</span>, <span key="2" className="num strong">{r.final}</span>, r.grade, r.locked ? <Badge key="l" tone="ok">Final</Badge> : <Badge key="l">Draft</Badge>])} /></Card>
  </>;
}
