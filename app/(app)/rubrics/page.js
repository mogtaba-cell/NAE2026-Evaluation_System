"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, useApi, useMeta, PageHead, Card, Table, Btn, Badge, Loading, Modal, Field, Banner } from "@/components/ui";

export default function Rubrics() {
  const d = useApi("/api/rubrics"); const meta = useMeta(); const router = useRouter();
  const [nw, setNw] = useState(null); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  if (!d.data) return <Loading error={d.error} />;
  const list = d.data.rubrics.sort((a, b) => a.code.localeCompare(b.code));
  const admin = meta?.data?.me?.role === "admin";
  async function create() { setBusy(true); setErr(null); try { const r = await api("/api/rubrics", { body: nw }); router.push(`/rubrics/${r.id}`); } catch (e) { setErr(e.message); } setBusy(false); }
  return <>
    <PageHead title="Rubric library" sub="Each subpathway uses one rubric per round. Publishing a new version never changes scores already saved: they keep the version they were scored with." actions={admin && <Btn v="primary" onClick={() => setNw({ code: "", name: "", pathway_code: "", copyFrom: "" })}>New rubric</Btn>} />
    <Card flush><Table minw={820} cols={["Rubric", "Criteria", "Used by", "Version"]} onRow={i => router.push(`/rubrics/${list[i].id}`)} rows={list.map(r => [
      <div key="a" className="stack s4"><span className="code strong">{r.code}</span><span className="small faint">{r.name}</span></div>,
      <span key="b" className="small">{r.published ? r.published.criteria.map(c => `${c.label} ${c.weight}%`).join(" · ") : "Not published"}{r.published?.identity_required ? (r.published?.identity_pass ? " · national identity (yes required)" : " · national identity asked") : ""}</span>,
      <span key="c" className="small">{r.usedBy.length ? r.usedBy.map(u => `${u.name} (R${u.r1 && u.r2 ? "1+2" : u.r1 ? 1 : 2})`).join(", ") : <span className="faint">Not used</span>}</span>,
      <span key="d" className="row" style={{ gap: 4 }}>{r.published ? <Badge tone="ok">v{r.published.version}</Badge> : null}{r.draft ? <Badge tone="warn">Draft v{r.draft.version}</Badge> : null}</span>])} /></Card>
    <Modal open={!!nw} title="New rubric" onClose={() => setNw(null)} footer={<><Btn onClick={() => setNw(null)}>Cancel</Btn><Btn v="primary" busy={busy} onClick={create}>Create draft</Btn></>}>
      {err && <Banner tone="bad" title={err} />}
      {nw && <><Field label="Code" help="Short, e.g. VA_PAINTING_R1"><input className="input" value={nw.code} onChange={e => setNw({ ...nw, code: e.target.value.toUpperCase() })} /></Field>
        <Field label="Name"><input className="input" value={nw.name} onChange={e => setNw({ ...nw, name: e.target.value })} /></Field>
        <Field label="Pathway"><select className="select" value={nw.pathway_code} onChange={e => setNw({ ...nw, pathway_code: e.target.value })}><option value="">Any</option>{meta?.data?.pathways.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}</select></Field>
        <Field label="Start from"><select className="select" value={nw.copyFrom} onChange={e => setNw({ ...nw, copyFrom: e.target.value })}><option value="">Blank</option>{list.filter(r => r.published).map(r => <option key={r.id} value={r.id}>Copy of {r.code}</option>)}</select></Field></>}
    </Modal>
  </>;
}
