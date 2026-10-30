"use client";
import { useState } from "react";
import { api, useApi, useMeta, useToast, PageHead, Card, Table, Btn, Badge, Banner, Loading, Modal, Field, Check, Tabs, Person, when, Switch } from "@/components/ui";

const ROLES = [["admin", "Admin"], ["coordinator", "Coordinator"], ["evaluator", "Evaluator"], ["management", "Management"], ["storage", "Logistics"], ["leadership", "HQ (higher management)"]];
const RL = Object.fromEntries(ROLES);

function PwPicker({ value, onChange, pws }) {
  return <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>{pws.map(p => <Check key={p.code} label={p.name} checked={value.includes(p.code)} onChange={v => onChange(v ? [...value, p.code] : value.filter(x => x !== p.code))} />)}</div>;
}

export default function People() {
  const d = useApi("/api/people"); const meta = useMeta(); const toast = useToast(); const progs = useApi("/api/programs");
  const [tab, setTab] = useState("accounts"); const [form, setForm] = useState(null); const [pw, setPw] = useState(null); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  if (!d.data) return <Loading error={d.error} />;
  const pws = (meta?.data?.pathways || []);
  const pwName = c => pws.find(p => p.code === c)?.code || c;
  const allProgs = progs.data?.programs || [];
  const progNames = ids => (ids || []).map(id => allProgs.find(g => g.id === id)?.name).filter(Boolean).join(", ");
  async function submit() {
    setBusy(true); setErr(null);
    try {
      let r;
      if (form.kind === "evaluator") r = form.id ? await api(`/api/evaluators/${form.id}`, { method: "PATCH", body: form }) : await api("/api/people", { body: { ...form, kind: "evaluator" } });
      else r = form.id ? await api(`/api/people/${form.id}`, { method: "PATCH", body: form }) : await api("/api/people", { body: form });
      if (r.tempPassword) setPw({ user: form.username, pw: r.tempPassword }); else toast("Saved");
      setForm(null); d.reload(); meta?.reload();
    } catch (e) { setErr(e.message); } setBusy(false);
  }
  async function reset(a) { try { const r = await api(`/api/people/${a.id}`, { method: "PATCH", body: { reset_password: true } }); setPw({ user: a.username, pw: r.tempPassword }); } catch (e) { toast(e.message, "err"); } }
  const accs = d.data.accounts;
  return <>
    <PageHead title="People and logins" sub="Accounts sign in with a username and password. New accounts get a temporary password and must set their own at first sign-in. Evaluators without a login are scored by their coordinator in physical sessions." actions={<><Btn onClick={() => { setErr(null); setForm({ kind: "evaluator", name: "", pathways: [] }); }}>Add evaluator without login</Btn><Btn v="primary" onClick={() => { setErr(null); setForm({ username: "", display_name: "", email: "", role: "evaluator", pathways: [] }); }}>New account</Btn></>} />
    <Tabs value={tab} onChange={setTab} items={[["accounts", "Accounts", accs.length], ["evaluators", "Evaluator panel", d.data.evaluators.length]]} />
    {tab === "accounts" && <Card flush><Table minw={900} cols={["Person", "Role", "Programs and pathways", "Workload", "Last sign-in", ""]} rows={accs.map(a => [
      <Person key="p" name={a.display_name} sub={`${a.username}${a.email ? " · " + a.email : ""}`} />,
      <span key="r">{RL[a.role]}{!a.active && <Badge tone="bad"> Off</Badge>}</span>,
      <span key="w" className="small">{a.role === "admin" ? <span className="faint">Everything</span> : <>{progNames(a.programs) || <span className="faint">All programs</span>}{(a.pathways || []).length ? <span className="faint"> · {(a.pathways || []).map(pwName).join(", ")}</span> : null}</>}</span>,
      <span key="l" className="small">{a.role === "coordinator" ? `${a.entries} artworks · ${a.schools} schools` : a.role === "management" ? `${a.reviewsOpen} open${a.reviewsOverdue ? `, ${a.reviewsOverdue} overdue` : ""} · ${a.reviewsDone} decided` : ""}</span>,
      <span key="s" className="small faint">{a.last_login_at ? when(a.last_login_at) : a.must_change_password ? "Not yet" : ""}</span>,
      <span key="b" className="row nowrap" style={{ gap: 4 }}><Btn sm v="ghost" onClick={() => { setErr(null); setForm({ id: a.id, display_name: a.display_name, email: a.email || "", role: a.role, pathways: a.pathways || [], programs: a.programs || [], active: a.active, username: a.username }); }}>Edit</Btn><Btn sm v="ghost" onClick={() => reset(a)}>Reset password</Btn></span>])} /></Card>}
    {tab === "evaluators" && <Card flush><Table minw={760} cols={["Evaluator", "Login", "Pathways", { h: "Assigned", cls: "r" }, { h: "Submitted", cls: "r" }, ""]} rows={d.data.evaluators.map(e => [
      <Person key="p" name={e.name} sub={e.active ? "" : "Not active"} />, e.account ? <span key="a" className="code">{e.account}</span> : <span key="a" className="faint small">Scored by coordinator</span>,
      <span key="w" className="small">{(e.pathways || []).map(pwName).join(", ")}</span>, <span key="n" className="num">{e.assigned}</span>, <span key="s" className="num">{e.submitted}</span>,
      <Btn key="b" sm v="ghost" onClick={() => { setErr(null); setForm({ kind: "evaluator", id: e.id, name: e.name, pathways: e.pathways || [], active: e.active }); }}>Edit</Btn>])} /></Card>}
    <Modal open={!!form} title={form?.kind === "evaluator" ? (form.id ? "Edit evaluator" : "Add evaluator without login") : form?.id ? "Edit account" : "New account"} onClose={() => setForm(null)} footer={<><Btn onClick={() => setForm(null)}>Cancel</Btn><Btn v="primary" busy={busy} onClick={submit}>{form?.id ? "Save" : "Create"}</Btn></>}>
      {err && <Banner tone="bad" title={err} />}
      {form && form.kind === "evaluator" && <><Field label="Name"><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Pathways they evaluate"><PwPicker pws={pws} value={form.pathways} onChange={v => setForm({ ...form, pathways: v })} /></Field>
        {form.id && <Switch checked={form.active !== false} onChange={v => setForm({ ...form, active: v })} label="Active (gets new assignments)" />}</>}
      {form && form.kind !== "evaluator" && <>
        <Field label="Full name"><input className="input" value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} /></Field>
        {!form.id && <Field label="Username" help="Lowercase, e.g. layla.hassan"><input className="input" value={form.username} onChange={e => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, "") })} /></Field>}
        <Field label="Email (optional)"><input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Role"><select className="select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>{ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        {form.role !== "admin" && allProgs.length > 0 && <Field label="Programs" help="Leave all unticked for every program. They only see the programs ticked here."><div className="row" style={{ gap: 12, flexWrap: "wrap" }}>{allProgs.map(g => <Check key={g.id} label={g.name} checked={(form.programs || []).includes(g.id)} onChange={v => setForm({ ...form, programs: v ? [...(form.programs || []), g.id] : (form.programs || []).filter(x => x !== g.id) })} />)}</div></Field>}
        {["evaluator", "coordinator"].includes(form.role) && <Field label={form.role === "evaluator" ? "Pathways they evaluate" : "Pathways they can see (besides their own schools)"}><PwPicker pws={pws} value={form.pathways} onChange={v => setForm({ ...form, pathways: v })} /></Field>}
        {form.id && <Switch checked={form.active !== false} onChange={v => setForm({ ...form, active: v })} label="Account can sign in" />}</>}
    </Modal>
    <Modal open={!!pw} title="Temporary password" sub={pw ? `For ${pw.user}` : ""} onClose={() => setPw(null)} footer={<Btn v="primary" onClick={() => setPw(null)}>Done</Btn>}>
      {pw && <><div className="pw-box">{pw.pw}</div><p className="muted">Share it with the person privately. It is shown only once. They will be asked to set their own password when they sign in.</p></>}
    </Modal>
  </>;
}
