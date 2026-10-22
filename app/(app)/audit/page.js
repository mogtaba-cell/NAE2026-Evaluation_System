"use client";
import { useState, useEffect } from "react";
import { useApi, PageHead, Card, Table, Loading, Search, Pager, Two, when } from "@/components/ui";

export default function Audit() {
  const [q, setQ] = useState(""); const [dq, setDq] = useState(""); const [role, setRole] = useState(""); const [page, setPage] = useState(0);
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(0); }, 350); return () => clearTimeout(t); }, [q]);
  const d = useApi(`/api/audit?q=${encodeURIComponent(dq)}&role=${role}&page=${page}`);
  return <>
    <PageHead title="Audit log" sub="Every sign-in, import, score, change, review decision and handover, with who did it and when. It can't be edited." />
    <Card><div className="row" style={{ gap: 8 }}><Search value={q} onChange={setQ} placeholder="Search actions, details or people" /><select className="select" style={{ width: 180 }} value={role} onChange={e => { setRole(e.target.value); setPage(0); }}><option value="">Everyone</option>{["admin", "coordinator", "evaluator", "management", "storage", "leadership", "system"].map(r => <option key={r} value={r}>{r}</option>)}</select></div></Card>
    {!d.data ? <Loading error={d.error} /> : <Card flush><Table minw={860} cols={["When", "Who", "What happened", "Item"]} rows={d.data.rows.map(x => [<span key="w" className="small faint" style={{ whiteSpace: "nowrap" }}>{when(x.at)}</span>, <Two key="p" a={x.actor_name || "System"} b={x.actor_role} />, <div key="a" className="stack s4"><span className="strong">{x.action}</span>{x.detail && <span className="small faint" style={{ overflowWrap: "anywhere" }}>{x.detail}</span>}</div>, x.entry_code ? <a key="o" className="code link" href={`/entries/${x.entry_code}`}>{x.entry_code}</a> : <span key="o" className="small faint">{x.object_type}</span>])} footer={<Pager page={d.data.page} per={d.data.per} count={d.data.count} onPage={setPage} />} /></Card>}
  </>;
}
