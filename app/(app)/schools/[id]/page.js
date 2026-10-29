"use client";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi, PageHead, Tabs, Table, Two, Badge, Loading, Btn } from "@/components/ui";
import { ArtworkCatalog, CatalogKpis } from "@/components/Catalog";

export default function SchoolCatalog({ params }) {
  const { id } = use(params); const router = useRouter(); const [tab, setTab] = useState("art");
  const d = useApi(`/api/catalog/schools/${id}`, [], { live: 30000 });
  if (!d.data) return <Loading error={d.error} />;
  const { school: s, summary, rows, students } = d.data;
  return <>
    <PageHead back={["Schools", "/schools"]} title={s.name} sub={[s.esis && `eSIS ${s.esis}`, s.region, s.school_type].filter(Boolean).join(" · ")} actions={<Btn className="no-print" onClick={() => window.print()}>Print</Btn>} />
    <CatalogKpis s={summary} />
    <div className="no-print"><Tabs value={tab} onChange={setTab} items={[["art", "Artworks", rows.length], ["stu", "Students", students.length]]} /></div>
    {tab === "art" && <ArtworkCatalog rows={rows} />}
    {tab === "stu" && <section className="card flush"><Table minw={820} empty="No students recorded." onRow={i => students[i].key && router.push(`/students/${encodeURIComponent(students[i].key)}`)} cols={["Student", "Grade", "ESIS", "Nationality", "Showcase consent", "Artworks"]}
      rows={students.map(x => [<Two key="n" a={x.name_en || x.name_ar} b={x.name_en && x.name_ar ? <span dir="rtl">{x.name_ar}</span> : ""} />, x.grade || "", <span key="e" className="code">{x.esis || "–"}</span>, x.nationality || "", x.consent ? <Badge key="c" tone="ok">Yes</Badge> : <span key="c" className="faint small">No</span>, <span key="a" className="small code">{x.codes.join(", ")}</span>])} /></section>}
  </>;
}
