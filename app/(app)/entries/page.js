"use client";
import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApi, useMeta, PageHead, Search, Table, Pager, Chips, EntryCell, statusBadge, Loading, Badge, Two, Btn, download, useToast, Check } from "@/components/ui";
import { useState, useEffect } from "react";

const STATUS_ORDER = [["to_score", "To score"], ["in_progress", "In progress"], ["review", "Needs review"], ["through", "Through"], ["not_through", "Not through"], ["final", "Final"], ["not_open", "Not open"]];

export default function Entries() {
  const router = useRouter(); const sp = useSearchParams(); const meta = useMeta(); const toast = useToast();
  const p = Object.fromEntries(sp.entries());
  const set = (k, v) => { const n = new URLSearchParams(sp); if (v === "" || v == null || v === false) n.delete(k); else n.set(k, v); if (k !== "page") n.delete("page"); router.replace(`/entries?${n}`, { scroll: false }); };
  const [q, setQ] = useState(p.q || ""); useEffect(() => { setQ(p.q || ""); }, [p.q]);
  useEffect(() => { const t = setTimeout(() => { if ((q || "") !== (p.q || "")) set("q", q.trim()); }, 350); return () => clearTimeout(t); }, [q]); // eslint-disable-line
  const d = useApi(`/api/entries?${sp.toString()}`);
  const me = meta?.data?.me; const pws = (meta?.data?.pathways || []);
  const pw = pws.find(x => x.code === p.pathway);
  const chips = useMemo(() => { const c = d.data?.counts || []; const out = [["", "All", c.reduce((a, x) => a + x.n, 0)]]; [1, 2].forEach(r => STATUS_ORDER.forEach(([s, l]) => { const n = c.filter(x => x.current_round === r && x.status === s).reduce((a, x) => a + x.n, 0); if (n) out.push([`${r}:${s}`, `R${r} · ${l}`, n]); })); return out; }, [d.data]);
  const res = e => { const r = (e.results || []).sort((a, b) => b.round_no - a.round_no)[0]; if (!r || r.team == null) return <span className="faint small">{r ? `${r.scored} of ${r.needed} scored` : ""}</span>; return <Two a={<span className="num">{r.final ?? r.team} · {r.grade}</span>} b={`Round ${r.round_no}${r.passed === true ? " · through" : r.passed === false ? " · not through" : ""}`} />; };
  return <>
    <PageHead title={me?.role === "coordinator" ? "My entries" : "Entries"} sub="Search by entry code, referenceId, RegistrationId, student name or ESIS, or school." actions={["admin", "management", "leadership"].includes(me?.role) && <Btn onClick={() => download(`/api/reports?kind=entries&${sp.toString()}`).catch(e => toast(e.message, "err"))}>Export list</Btn>} />
    <section className="card">
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <Search value={q} onChange={setQ} placeholder="Code, referenceId, student, school…" />
        <select className="select" style={{ width: 200 }} value={p.pathway || ""} onChange={e => { const n = new URLSearchParams(sp); n.delete("sub"); n.delete("page"); e.target.value ? n.set("pathway", e.target.value) : n.delete("pathway"); router.replace(`/entries?${n}`); }} aria-label="Pathway"><option value="">All pathways</option>{pws.map(x => <option key={x.code} value={x.code}>{x.name}</option>)}</select>
        {pw && <select className="select" style={{ width: 210 }} value={p.sub || ""} onChange={e => set("sub", e.target.value)} aria-label="Subpathway"><option value="">All subpathways</option>{pw.subs.filter(s => s.entries).map(s => <option key={s.code} value={s.code}>{s.name} ({s.entries})</option>)}</select>}
        <select className="select" style={{ width: 150 }} value={p.region || ""} onChange={e => set("region", e.target.value)} aria-label="Region"><option value="">All regions</option>{["Abu Dhabi", "Al Ain", "Al Dhafra"].map(r => <option key={r}>{r}</option>)}</select>
        <select className="select" style={{ width: 150 }} value={p.type || ""} onChange={e => set("type", e.target.value)} aria-label="School type"><option value="">All schools</option>{["Public", "Private", "Charter"].map(r => <option key={r}>{r}</option>)}</select>
        {me?.role === "coordinator" && <Check label="Allocated to me" checked={p.mine === "1"} onChange={v => set("mine", v ? "1" : "")} />}
        {me?.role === "admin" && <Check label="No files" checked={p.nofiles === "1"} onChange={v => set("nofiles", v ? "1" : "")} />}
        {me?.role === "admin" && <Check label="Not allocated" checked={p.unallocated === "1"} onChange={v => set("unallocated", v ? "1" : "")} />}
      </div>
      <Chips items={chips} value={p.status || ""} onChange={v => set("status", v)} />
    </section>
    {!d.data ? <Loading error={d.error} /> : <section className="card flush">
      <Table minw={940} cols={["Entry", "School", "Pathway", { h: "Students", cls: "r" }, "Status", "Result", { h: "Files", cls: "r" }]}
        onRow={i => router.push(`/entries/${d.data.rows[i].code}`)}
        rows={d.data.rows.map(e => [<EntryCell key="e" e={e} sub={<>{e.title_en || e.title_ar || e.group_name || "Untitled"}{e.why && <span className="faint"> · matched {e.why}</span>}</>} />, <Two key="s" a={<span style={{ maxWidth: 220, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "bottom" }}>{e.school?.name}</span>} b={`${e.school?.region || ""}${e.school?.school_type ? " · " + e.school.school_type : ""}`} />, <span key="p" className="small">{e.pathway_code} · {(meta?.data?.pathways || []).find(x => x.code === e.pathway_code)?.subs.find(s => s.code === e.sub_code)?.name || e.sub_code}</span>, <span key="n" className="num">{e.students_count || ""}</span>, statusBadge(e), res(e), e.files_count ? <span key="f" className="num">{e.files_count}</span> : <Badge key="f" tone="warn">None</Badge>])}
        empty={p.q ? `No entries match "${p.q}".` : "No entries yet."}
        footer={<Pager page={d.data.page} per={d.data.per} count={d.data.count} onPage={n => set("page", String(n))} />} />
    </section>}
  </>;
}
