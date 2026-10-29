"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi, PageHead, Search, Table, Two, Loading, Pager, Btn, Badge } from "@/components/ui";

const EMPTY = { school: "", pathway: "", grade: "", nationality: "", gender: "", consent: "", r2: "" };
export default function Students() {
  const router = useRouter(); const [q, setQ] = useState(""); const [dq, setDq] = useState(""); const [page, setPage] = useState(0);
  const [f, setF] = useState(EMPTY); const [sort, setSort] = useState("name"); const [dir, setDir] = useState("asc");
  useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setPage(0); }, 300); return () => clearTimeout(t); }, [q]);
  const facets = useApi("/api/catalog/students?facets=1");
  const qs = new URLSearchParams({ q: dq, page: String(page), sort, dir, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) });
  const d = useApi(`/api/catalog/students?${qs}`);
  const fx = facets.data || { grades: [], nationalities: [], genders: [], schools: [], pathways: [] };
  const set = (k, v) => { setF({ ...f, [k]: v }); setPage(0); };
  const active = Object.values(f).some(Boolean) || dq;
  const sel = (k, label, list, w = 170) => <select className="select" style={{ width: w }} value={f[k]} onChange={e => set(k, e.target.value)} aria-label={label}><option value="">{label}</option>{list.map(o => typeof o === "string" ? <option key={o}>{o}</option> : <option key={o.v} value={o.v}>{o.l}</option>)}</select>;
  return <>
    <PageHead title="Students" sub="Find a student by name (English or Arabic) or ESIS and open their catalog: every artwork they are part of and where it stands." />
    <section className="card"><div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      <Search value={q} onChange={setQ} placeholder="Student name or ESIS" />
      {sel("school", "All schools", fx.schools.map(s => ({ v: s.id, l: s.name })), 230)}
      {sel("pathway", "All pathways", fx.pathways.map(p => ({ v: p.code, l: p.name })))}
      {sel("grade", "All grades", fx.grades, 130)}
      {sel("nationality", "All nationalities", fx.nationalities)}
      {sel("gender", "Any gender", fx.genders, 130)}
      {sel("consent", "Showcase consent: any", [{ v: "yes", l: "Consent given" }, { v: "no", l: "No consent" }], 200)}
      {sel("r2", "Any round", [{ v: "yes", l: "Through to Round 2" }, { v: "no", l: "Still in Round 1" }], 180)}
      <span className="row nowrap" style={{ gap: 6 }}><select className="select" style={{ width: 150 }} value={sort} onChange={e => { setSort(e.target.value); setPage(0); }} aria-label="Sort by"><option value="name">Sort: name</option><option value="grade">Sort: grade</option></select>
        <Btn onClick={() => { setDir(dir === "asc" ? "desc" : "asc"); setPage(0); }}>{sort === "name" ? (dir === "asc" ? "A to Z ↑" : "Z to A ↓") : (dir === "asc" ? "Lowest grade first ↑" : "Highest grade first ↓")}</Btn></span>
      {active && <Btn v="ghost" onClick={() => { setQ(""); setF(EMPTY); setPage(0); }}>Clear filters</Btn>}
      {d.data && <span className="small faint" style={{ alignSelf: "center" }}>{d.data.count} record{d.data.count === 1 ? "" : "s"}</span>}
    </div></section>
    {!d.data ? <Loading error={d.error} /> : <section className="card flush">
      <Table minw={900} empty={active ? "No students match." : "No students yet."} onRow={i => router.push(`/students/${encodeURIComponent(d.data.rows[i].key)}`)} cols={["Student", "ESIS", "Grade", "School", "Nationality", "Artworks"]}
        rows={d.data.rows.map(s => [<Two key="n" a={s.name_en || s.name_ar} b={s.name_en && s.name_ar ? <span dir="rtl">{s.name_ar}</span> : ""} />, <span key="e" className="code">{s.esis || "–"}</span>, s.grade || "", <span key="s" className="small">{s.school?.name}</span>, <span key="na" className="small">{s.nationality || ""}</span>, <span key="a" className="small"><span className="code">{s.artworks.join(", ")}</span>{s.round2 ? <> <Badge tone="ok">{s.round2} in Round 2</Badge></> : null}</span>])} />
      <Pager page={page} per={d.data.per} count={d.data.count} onPage={setPage} />
    </section>}
  </>;
}
