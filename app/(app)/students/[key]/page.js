"use client";
import { use } from "react";
import { useApi, PageHead, Loading, Btn, Badge } from "@/components/ui";
import { ArtworkCatalog, CatalogKpis } from "@/components/Catalog";

export default function StudentCatalog({ params }) {
  const { key } = use(params);
  const d = useApi(`/api/catalog/students/${encodeURIComponent(decodeURIComponent(key))}`, [], { live: 30000 });
  if (!d.data) return <Loading error={d.error} />;
  const { student: s, summary, rows } = d.data;
  return <>
    <PageHead back={["Students", "/students"]} title={s.name_en || s.name_ar} sub={[s.name_en && s.name_ar ? s.name_ar : null, s.grade && `Grade ${String(s.grade).replace(/^grade\s*/i, "")}`, s.esis && `ESIS ${s.esis}`, s.nationality, s.school?.name].filter(Boolean).join(" · ")}
      badges={s.consent ? <Badge tone="ok">Showcase consent</Badge> : <Badge>No showcase consent</Badge>}
      actions={<>{s.school && <Btn className="no-print" href={`/schools/${s.school.id}`}>School catalog</Btn>}<Btn className="no-print" onClick={() => window.print()}>Print</Btn></>} />
    <CatalogKpis s={summary} />
    <ArtworkCatalog rows={rows} />
  </>;
}
