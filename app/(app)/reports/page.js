"use client";
import { useState } from "react";
import { useMeta, useToast, PageHead, Card, Btn, Field, Check, Switch, Banner } from "@/components/ui";
import { download } from "@/components/ui";

const REPORTS = [
  ["entries", "Entries by school", "Every entry with school, group, students, status and coordinator."],
  ["results", "Round results", "Round 1 and Round 2 results, grades and whether each entry went through."],
  ["participation", "Participation", "Entries and students by pathway, region and school type."],
  ["reviews", "Management reviews", "Every flag with reason, scores, decision and who decided."],
  ["logistics", "Artwork logistics", "Physical entries: collection, shelf, condition, session."],
  ["consent", "Showcase consent", "Students with and without consent for showcase photos and interviews."]
];
const FIELDS = [["code", "Entry code"], ["reference_id", "referenceId"], ["registration_id", "RegistrationId"], ["title_en", "Title (English)"], ["title_ar", "Title (Arabic)"], ["description_en", "Description (English)"], ["description_ar", "Description (Arabic)"], ["pathway", "Pathway"], ["sub", "Subpathway"], ["school", "School"], ["esis", "School eSIS"], ["region", "Region"], ["school_type", "School type"], ["group", "Group name"], ["students", "Number of students"], ["grades", "Grades"], ["medium", "Medium"], ["size", "Size"], ["files", "Files"], ["r1", "Round 1 result"], ["r1g", "Round 1 grade"], ["r2", "Round 2 result"], ["r2g", "Round 2 grade"], ["status", "Status"], ["coordinator", "Coordinator"]];

export default function Reports() {
  const meta = useMeta(); const toast = useToast();
  const [pathway, setPathway] = useState(""); const [official, setOfficial] = useState(false); const [busy, setBusy] = useState(null);
  const [fields, setFields] = useState(["code", "title_en", "title_ar", "pathway", "sub", "school", "r1", "r2"]);
  const pws = (meta?.data?.pathways || []).filter(p => p.entries);
  async function get(kind, extra = "") { setBusy(kind); try { await download(`/api/reports?kind=${kind}${pathway ? `&pathway=${pathway}` : ""}${official ? "&official=1" : ""}${extra}`); } catch (e) { toast(e.message, "err"); } setBusy(null); }
  return <>
    <PageHead title="Reports and exports" sub="Excel files built from live data. Working exports are marked DRAFT; official exports include only locked results." />
    <Card><div className="row" style={{ gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
      <Field label="Pathway"><select className="select" style={{ width: 240 }} value={pathway} onChange={e => setPathway(e.target.value)}><option value="">All pathways</option>{pws.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}</select></Field>
      <Switch checked={official} onChange={setOfficial} label="Official (locked results only, no DRAFT mark)" /></div></Card>
    <Banner title="Student data is sensitive">Exports with student names or ESIS stay inside GVC and ADEK. Don't post them to shared channels.</Banner>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>{REPORTS.map(([k, t, s]) => <Card key={k} title={t} sub={s}><div><Btn busy={busy === k} onClick={() => get(k)}>Download .xlsx</Btn></div></Card>)}</div>
    <Card title="Custom export" sub="Pick the columns you need, in this order." right={<Btn v="primary" busy={busy === "custom"} disabled={!fields.length} onClick={() => get("custom", `&fields=${fields.join(",")}`)}>Download .xlsx</Btn>}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 8 }}>{FIELDS.map(([k, l]) => <Check key={k} label={l} checked={fields.includes(k)} onChange={v => setFields(v ? [...fields, k] : fields.filter(x => x !== k))} />)}</div>
    </Card>
  </>;
}
