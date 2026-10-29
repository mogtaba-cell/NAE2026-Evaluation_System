"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi, PageHead, Search, Table, Two, Loading, Pager } from "@/components/ui";

export default function Students() {
  const router = useRouter(); const [q, setQ] = useState(""); const [dq, setDq] = useState(""); const [page, setPage] = useState(0);
  useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setPage(0); }, 300); return () => clearTimeout(t); }, [q]);
  const d = useApi(`/api/catalog/students?q=${encodeURIComponent(dq)}&page=${page}`);
  return <>
    <PageHead title="Students" sub="Find a student by name (English or Arabic) or ESIS and open their catalog: every artwork they are part of and where it stands." />
    <section className="card"><div className="row" style={{ gap: 8 }}><Search value={q} onChange={setQ} placeholder="Student name or ESIS" autoFocus />{d.data && <span className="small faint" style={{ alignSelf: "center" }}>{d.data.count} record{d.data.count === 1 ? "" : "s"}</span>}</div></section>
    {!d.data ? <Loading error={d.error} /> : <section className="card flush">
      <Table minw={820} empty={dq ? "No students match." : "No students yet."} onRow={i => router.push(`/students/${encodeURIComponent(d.data.rows[i].key)}`)} cols={["Student", "ESIS", "Grade", "School", "Artworks"]}
        rows={d.data.rows.map(s => [<Two key="n" a={s.name_en || s.name_ar} b={s.name_en && s.name_ar ? <span dir="rtl">{s.name_ar}</span> : ""} />, <span key="e" className="code">{s.esis || "–"}</span>, s.grade || "", <span key="s" className="small">{s.school?.name}</span>, <span key="a" className="small code">{s.artworks.join(", ")}</span>])} />
      <Pager page={page} per={d.data.per} count={d.data.count} onPage={setPage} />
    </section>}
  </>;
}
