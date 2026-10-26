"use client";
import { useState } from "react";
import { useApi, useMeta, PageHead, Card, Table, Badge, Loading, Btn, Two } from "@/components/ui";
import { isExc, EditLogistics, MISSING } from "@/components/Logistics";

export default function Exceptions() {
  const d = useApi("/api/logistics"); const meta = useMeta(); const [edit, setEdit] = useState(null);
  if (!d.data) return <Loading error={d.error} />;
  const canEdit = ["admin", "storage"].includes(meta?.data?.me?.role);
  const l = d.data.rows.filter(isExc);
  return <>
    <PageHead title="Exceptions" sub="Artworks that are missing or damaged. Each stays on its own record so the rest of its collection carries on. For a missing artwork, choose: collect later, score it from its files (admin), or withdraw it (admin)." />
    <Card flush><Table minw={860} empty="No exceptions." cols={["Artwork", "School", "Problem", "Decision", ""]} rows={l.map(r => [<Two key="e" a={<span className="code">{r.entry.code}</span>} b={r.entry.title_en || r.sub} />, r.entry.school?.name, r.state === "missing" ? <Badge key="p" tone="bad">Missing</Badge> : <Badge key="p" tone="warn">Damaged{r.condition && r.condition !== "Damaged" ? `: ${r.condition}` : ""}</Badge>, <span key="c" className="small">{r.state === "missing" ? (r.missing_outcome ? MISSING[r.missing_outcome] : "Not decided") : r.where || ""}</span>, canEdit ? <Btn key="b" sm onClick={() => setEdit(r)}>Update</Btn> : ""])} /></Card>
    {edit && <EditLogistics row={edit} onClose={() => setEdit(null)} onSaved={d.reload} />}
  </>;
}
