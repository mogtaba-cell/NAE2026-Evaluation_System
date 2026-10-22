"use client";
import { use, useEffect, useState } from "react";
import { api, useApi, useMeta, useToast, PageHead, Card, Btn, Badge, Banner, Loading, Field, Switch, Table, when } from "@/components/ui";

export default function RubricBuilder({ params }) {
  const { id } = use(params);
  const d = useApi(`/api/rubrics/${id}`); const meta = useMeta(); const toast = useToast();
  const [crit, setCrit] = useState(null); const [idn, setIdn] = useState(false); const [busy, setBusy] = useState(null); const [err, setErr] = useState(null);
  const admin = meta?.data?.me?.role === "admin";
  const draft = d.data?.versions.find(v => v.status === "draft"); const pub = d.data?.versions.filter(v => v.status === "published").pop();
  useEffect(() => { if (d.data) { const v = draft || pub; setCrit((v?.criteria || []).map(c => ({ ...c }))); setIdn(!!v?.identity_required); } }, [d.data]); // eslint-disable-line
  if (!d.data || !crit) return <Loading error={d.error} />;
  const tot = crit.reduce((s, c) => s + (Number(c.weight) || 0), 0);
  const upd = (i, k, v) => setCrit(c => c.map((x, j) => j === i ? { ...x, [k]: v } : x));
  async function save() { setBusy("save"); setErr(null); try { await api(`/api/rubrics/${id}`, { method: "PATCH", body: { criteria: crit, identity_required: idn } }); toast("Draft saved"); d.reload(); } catch (e) { setErr(e.message); } setBusy(null); }
  async function publish() { setBusy("pub"); setErr(null); try { await api(`/api/rubrics/${id}`, { method: "PATCH", body: { criteria: crit, identity_required: idn } }); const r = await api(`/api/rubrics/${id}`, { body: { action: "publish" } }); toast(r.note); d.reload(); meta.reload(); } catch (e) { setErr(e.message); } setBusy(null); }
  return <>
    <PageHead back={["Rubric library", "/rubrics"]} title={<span className="code" style={{ fontSize: 22 }}>{d.data.rubric.code}</span>} badges={<>{pub && <Badge tone="ok">Published v{pub.version}</Badge>}{draft && <Badge tone="warn">Draft v{draft.version}</Badge>}</>}
      sub={`${d.data.rubric.name} · used by ${d.data.subs.map(s => s.name).join(", ") || "no subpathway yet"} · ${d.data.scored} scores saved`} />
    {err && <Banner tone="bad" title={err} />}
    {d.data.scored > 0 && <Banner title="Scores already use this rubric">Editing creates a new draft version. Scores already saved keep the version they were scored with; new scores use the newly published version.</Banner>}
    <Card title="Criteria" sub="Each criterion is scored 0 to 100. The total is the weighted sum, rounded up." right={<span className={`badge ${tot === 100 ? "ok" : "warn"}`}>Total {tot}%</span>}>
      {crit.map((c, i) => <div key={i} className="grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.6fr) 90px auto", gap: 8, alignItems: "end" }}>
        <Field label={i === 0 ? "Criterion" : ""}><input className="input" value={c.label} disabled={!admin} onChange={e => upd(i, "label", e.target.value)} /></Field>
        <Field label={i === 0 ? "What evaluators look for" : ""}><input className="input" value={c.description || ""} disabled={!admin} onChange={e => upd(i, "description", e.target.value)} /></Field>
        <Field label={i === 0 ? "Weight %" : ""}><input className="input num" inputMode="numeric" value={c.weight} disabled={!admin} onChange={e => upd(i, "weight", e.target.value.replace(/\D/g, ""))} /></Field>
        {admin && <Btn v="ghost" title="Remove" onClick={() => setCrit(crit.filter((_, j) => j !== i))}>×</Btn>}</div>)}
      {admin && <div><Btn sm onClick={() => setCrit([...crit, { label: "", weight: 0, description: "" }])}>Add criterion</Btn></div>}
      <Switch checked={idn} onChange={v => admin && setIdn(v)} label="Also ask evaluators: does the work express national identity? (yes/no)" />
      <div className="meter"><div className="grow stack s4"><span className="strong">Total {tot}%</span><span className="small" style={{ color: tot === 100 ? "var(--ok)" : "var(--warn)" }}>{tot === 100 ? "Ready to publish" : tot < 100 ? `${100 - tot} points left to assign` : `${tot - 100} points over`}</span></div>
        {admin && <><Btn busy={busy === "save"} onClick={save}>Save draft</Btn><Btn v="primary" busy={busy === "pub"} disabled={tot !== 100 || crit.some(c => !c.label)} onClick={publish}>Publish</Btn></>}</div>
    </Card>
    <Card title="Versions" flush><Table cols={["Version", "Status", "Criteria", "Published"]} rows={d.data.versions.slice().reverse().map(v => [`v${v.version}`, <Badge key="s" tone={v.status === "published" ? "ok" : v.status === "draft" ? "warn" : ""}>{v.status}</Badge>, <span key="c" className="small">{(v.criteria || []).map(c => `${c.label} ${c.weight}%`).join(" · ")}</span>, v.published_at ? when(v.published_at) : ""])} /></Card>
  </>;
}
