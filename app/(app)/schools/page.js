"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi, PageHead, Search, Table, Two, Loading, Btn, fmt } from "@/components/ui";

const SORTS = [["name", "Name"], ["artworks", "Artworks"], ["students", "Students"], ["round2", "Through to Round 2"], ["passedR2", "Passed Round 2"], ["rate", "Share through to Round 2"]];
export default function Schools() {
  const router = useRouter();
  const [q, setQ] = useState(""); const [sort, setSort] = useState("name"); const [dir, setDir] = useState("asc");
  const [f, setF] = useState({ region: "", type: "", pathway: "", r2: "" });
  const d = useApi("/api/catalog/schools", [], { live: 60000 });
  const opts = useMemo(() => { const rows = d.data?.rows || []; const u = k => [...new Set(rows.map(r => r[k]).filter(Boolean))].sort(); return { region: u("region"), type: u("school_type"), pathway: [...new Set(rows.flatMap(r => r.pathways))].sort() }; }, [d.data]);
  if (!d.data) return <Loading error={d.error} />;
  const t = q.trim().toLowerCase();
  const val = (s, k) => k === "rate" ? (s.artworks ? s.round2 / s.artworks : 0) : s[k] || 0;
  const rows = d.data.rows.filter(s => (!t || [s.name, s.esis, s.region, s.school_type].some(v => String(v || "").toLowerCase().includes(t)))
      && (!f.region || s.region === f.region) && (!f.type || s.school_type === f.type) && (!f.pathway || s.pathways.includes(f.pathway))
      && (!f.r2 || (f.r2 === "some" ? s.round2 > 0 : f.r2 === "none" ? s.round2 === 0 : f.r2 === "passed" ? s.passedR2 > 0 : true)))
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : val(a, sort) - val(b, sort) || a.name.localeCompare(b.name)) * (dir === "asc" ? 1 : -1));
  const head = (k, label, cls) => ({ h: <button type="button" className={`th-sort${sort === k ? " on" : ""}`} onClick={() => { if (sort === k) setDir(dir === "asc" ? "desc" : "asc"); else { setSort(k); setDir(k === "name" ? "asc" : "desc"); } }}>{label}{sort === k ? (dir === "asc" ? " ↑" : " ↓") : ""}</button>, cls });
  const active = Object.values(f).some(Boolean) || t;
  return <>
    <PageHead title="Schools" sub="Every school with artworks in this program. Open a school to see its catalog: each artwork, where it stands, and its students." />
    <section className="card"><div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      <Search value={q} onChange={setQ} placeholder="School name, eSIS, region or type" />
      <select className="select" style={{ width: 160 }} value={f.region} onChange={e => setF({ ...f, region: e.target.value })} aria-label="Region"><option value="">All regions</option>{opts.region.map(o => <option key={o}>{o}</option>)}</select>
      <select className="select" style={{ width: 160 }} value={f.type} onChange={e => setF({ ...f, type: e.target.value })} aria-label="School type"><option value="">All school types</option>{opts.type.map(o => <option key={o}>{o}</option>)}</select>
      <select className="select" style={{ width: 170 }} value={f.pathway} onChange={e => setF({ ...f, pathway: e.target.value })} aria-label="Pathway"><option value="">All pathways</option>{opts.pathway.map(o => <option key={o}>{o}</option>)}</select>
      <select className="select" style={{ width: 210 }} value={f.r2} onChange={e => setF({ ...f, r2: e.target.value })} aria-label="Round 2"><option value="">Any Round 2 result</option><option value="some">Some through to Round 2</option><option value="none">None through to Round 2</option><option value="passed">Some passed Round 2</option></select>
      <span className="row nowrap" style={{ gap: 6 }}><select className="select" style={{ width: 200 }} value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort by">{SORTS.map(([k, l]) => <option key={k} value={k}>Sort: {l}</option>)}</select>
        <Btn onClick={() => setDir(dir === "asc" ? "desc" : "asc")} title="Change order">{dir === "asc" ? (sort === "name" ? "A to Z ↑" : "Lowest first ↑") : (sort === "name" ? "Z to A ↓" : "Highest first ↓")}</Btn></span>
      {active && <Btn v="ghost" onClick={() => { setQ(""); setF({ region: "", type: "", pathway: "", r2: "" }); }}>Clear filters</Btn>}
      <span className="small faint" style={{ alignSelf: "center" }}>{rows.length} of {d.data.total} schools</span>
    </div></section>
    <section className="card flush"><Table minw={860} empty="No schools match." onRow={i => router.push(`/schools/${rows[i].id}`)} cols={[head("name", "School"), "Region", head("artworks", "Artworks", "r"), head("students", "Students", "r"), head("round2", "Round 2", "r"), head("passedR2", "Passed R2", "r"), "Pathways"]}
      rows={rows.map(s => [<Two key="n" a={s.name} b={s.esis ? `eSIS ${s.esis}` : ""} />, <Two key="r" a={s.region || ""} b={s.school_type || ""} />, fmt(s.artworks), fmt(s.students), <span key="2">{fmt(s.round2)}{s.artworks ? <span className="faint small"> · {Math.round(s.round2 / s.artworks * 100)}%</span> : ""}</span>, fmt(s.passedR2), <span key="p" className="small">{s.pathways.join(", ")}</span>])} /></section>
  </>;
}
