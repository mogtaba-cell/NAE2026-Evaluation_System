"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApi, PageHead, Search, Table, Two, Loading, fmt } from "@/components/ui";

export default function Schools() {
  const router = useRouter(); const [q, setQ] = useState(""); const [sort, setSort] = useState("name");
  const d = useApi("/api/catalog/schools", [], { live: 60000 });
  if (!d.data) return <Loading error={d.error} />;
  const t = q.trim().toLowerCase();
  const rows = d.data.rows.filter(s => !t || [s.name, s.esis, s.region, s.school_type].some(v => String(v || "").toLowerCase().includes(t)))
    .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : (b[sort] || 0) - (a[sort] || 0));
  return <>
    <PageHead title="Schools" sub="Every school with artworks in this program. Open a school to see its catalog: each artwork, where it stands, and its students." />
    <section className="card"><div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      <Search value={q} onChange={setQ} placeholder="School name, eSIS, region or type" autoFocus />
      <select className="select" style={{ width: 210 }} value={sort} onChange={e => setSort(e.target.value)}><option value="name">Sort by name</option><option value="artworks">Most artworks</option><option value="round2">Most through to Round 2</option><option value="passedR2">Most passed Round 2</option><option value="students">Most students</option></select>
      <span className="small faint" style={{ alignSelf: "center" }}>{rows.length} of {d.data.total} schools</span>
    </div></section>
    <section className="card flush"><Table minw={860} empty="No schools match." onRow={i => router.push(`/schools/${rows[i].id}`)} cols={["School", "Region", { h: "Artworks", cls: "r" }, { h: "Students", cls: "r" }, { h: "Round 2", cls: "r" }, { h: "Passed R2", cls: "r" }, "Pathways"]}
      rows={rows.map(s => [<Two key="n" a={s.name} b={s.esis ? `eSIS ${s.esis}` : ""} />, <Two key="r" a={s.region || ""} b={s.school_type || ""} />, fmt(s.artworks), fmt(s.students), fmt(s.round2), fmt(s.passedR2), <span key="p" className="small">{s.pathways.join(", ")}</span>])} /></section>
  </>;
}
