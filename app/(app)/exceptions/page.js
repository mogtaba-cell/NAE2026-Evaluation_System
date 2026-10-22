"use client";
import { useState } from "react";
import { useApi, PageHead, Card, Table, Badge, Loading, Btn, Two } from "@/components/ui";
import { isExc, EditLogistics } from "@/components/Logistics";

export default function Exceptions() {
  const d = useApi("/api/logistics"); const [edit, setEdit] = useState(null);
  if (!d.data) return <Loading error={d.error} />;
  const l = d.data.rows.filter(isExc);
  return <>
    <PageHead title="Exceptions" sub="Entries that are missing or damaged. Each stays on its own record so the rest of its collection is not held up. The coordinator follows up with the school; a missing entry can still be scored from its files." />
    <Card flush><Table minw={860} empty="No exceptions." cols={["Entry", "School", "Problem", "Collection", ""]} rows={l.map(r => [<Two key="e" a={<span className="code">{r.entry.code}</span>} b={r.entry.title_en || r.sub} />, r.entry.school?.name, r.state === "missing" ? <Badge key="p" tone="bad">Missing</Badge> : <Badge key="p" tone="warn">{r.condition}</Badge>, <span key="c" className="small">{r.collection?.code || ""}</span>, <Btn key="b" sm onClick={() => setEdit(r)}>Update</Btn>])} /></Card>
    {edit && <EditLogistics row={edit} onClose={() => setEdit(null)} onSaved={d.reload} />}
  </>;
}
