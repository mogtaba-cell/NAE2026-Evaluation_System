"use client";
import { useState } from "react";
import { api, useApi, useMeta, useToast, PageHead, Card, Table, Badge, Btn, Banner, Loading, Modal, Field, Check, Two, dshort, fmt } from "@/components/ui";
import Readiness from "@/components/Readiness";

const ST = { setup: ["Setting up", ""], active: ["Active", "ok"], closed: ["Closed", "info"], archived: ["Archived", ""] };
const TYPES = [["Participation", "Participation"], ["Competition", "Competition"]];

export default function Setup() {
  const meta = useMeta(); const toast = useToast();
  const list = useApi("/api/programs");
  const [newP, setNewP] = useState(null); const [edit, setEdit] = useState(null); const [addPw, setAddPw] = useState(null); const [copy, setCopy] = useState(null); const [editPw, setEditPw] = useState(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  if (!meta?.data || !list.data) return <Loading error={meta?.error || list.error} />;
  const cur = meta.data.program; const pws = meta.data.pathways;
  const programs = list.data.programs;
  const others = programs.filter(p => p.id !== cur.id && p.pathways.length);
  const reload = () => { meta.reload(); list.reload(); };
  async function run(fn, done) { setBusy(true); setErr(null); try { const r = await fn(); done && done(r); reload(); } catch (e) { setErr(e.message); } setBusy(false); }
  async function switchTo(id) { await api("/api/programs", { method: "PUT", body: { id } }); location.reload(); }
  const accounts = (meta.data.accounts || []).filter(a => ["admin", "management", "leadership"].includes(a.role));

  const PwCard = ({ p }) => {
    const next = p.rounds.find(r => r.status === "setup") || p.rounds.find(r => r.status === "open") || p.rounds[0];
    const rd = next?.readiness; const ok = rd ? rd.checks.filter(c => c.ok).length : 0;
    return <div className="x-pwc">
      <div className="nm"><h3>{p.name}</h3><span className="small faint">{p.code} · {fmt(p.entries)} entries · {p.subs.length} subpathway{p.subs.length === 1 ? "" : "s"}</span>
        <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>{p.rounds.map(r => <Badge key={r.id} tone={r.status === "open" ? "info" : r.status === "closed" ? "ok" : ""}>R{r.round_no} {r.status}</Badge>)}</div>
        {p.subs.length > 0 && <span className="small faint">{p.subs.map(s => s.name).join(" · ")}</span>}</div>
      <div className="stack s8"><span className="small faint">{next ? `Round ${next.round_no} ${next.status === "setup" ? "readiness" : "checks"}` : ""}</span>{rd && <Readiness checks={rd.checks} />}</div>
      <div className="ac"><span className="small faint">{rd ? `${ok} of ${rd.checks.length} ready` : ""}</span>
        <Btn v={rd?.ready ? "secondary" : "primary"} href={`/setup/${p.code}`}>Subpathways, rubrics and rounds</Btn>
        <Btn v="ghost" onClick={() => { setErr(null); setEditPw({ code: p.code, name: p.name, eval_type: p.eval_type, entries: p.entries }); }}>Edit</Btn></div></div>;
  };

  return <>
    <PageHead title="Program setup" sub="Programs hold their own pathways and subpathways, each with its own rubrics and rounds. Pick the program to work on; every page then shows that program." actions={<><Btn href="/import">Import entries</Btn><Btn href="/rubrics">Rubric library</Btn><Btn v="primary" onClick={() => { setErr(null); setNewP({ name: "", code: "", cycle: "", starts_on: "", ends_on: "", copy_from: "", copy_rubrics: true }); }}>New program</Btn></>} />

    <Card title="Programs" flush>
      <Table cols={["Program", "Cycle", "Window", "Status", { h: "Pathways", cls: "r" }, { h: "Entries", cls: "r" }, ""]} rows={programs.map(p => [
        <Two key="n" a={<span className="strong">{p.name}</span>} b={p.code} />, p.cycle || <span className="faint">–</span>,
        <span key="w" className="small">{p.starts_on ? `${dshort(p.starts_on)} to ${p.ends_on ? dshort(p.ends_on) : "?"}` : <span className="faint">Not set</span>}</span>,
        <Badge key="s" tone={ST[p.status]?.[1]}>{ST[p.status]?.[0] || p.status}</Badge>, <span key="pw" className="num">{p.pathways.length}</span>, <span key="e" className="num">{fmt(p.entries)}</span>,
        p.id === cur.id ? <Badge key="c" tone="info">Working in this</Badge> : <Btn key="c" sm onClick={() => switchTo(p.id)}>Work on this</Btn>])} />
    </Card>

    {cur.id && <>
      <div className="row" style={{ gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginTop: 8 }}>
        <div className="stack s4" style={{ flex: 1, minWidth: 240 }}><h2>{cur.name}</h2><span className="small faint">{[cur.code, cur.cycle && `cycle ${cur.cycle}`, ST[cur.status]?.[0]].filter(Boolean).join(" · ")}</span></div>
        <Btn onClick={() => { const p = programs.find(x => x.id === cur.id); setErr(null); setEdit({ ...p, starts_on: p.starts_on || "", ends_on: p.ends_on || "", cycle: p.cycle || "", owner_ids: p.owner_ids || [] }); }}>Program details</Btn>
        {others.length > 0 && <Btn onClick={() => { setErr(null); setCopy({ from: others[0].id, codes: [], with_rubrics: true }); }}>Copy pathways from another program</Btn>}
        <Btn v="primary" onClick={() => { setErr(null); setAddPw({ name: "", code: "", eval_type: "Participation" }); }}>Add pathway</Btn>
      </div>
      {TYPES.map(([t, label]) => { const g = pws.filter(p => (p.eval_type || "Participation") === t); return g.length ? <div key={t} className="stack" style={{ gap: 12 }}><div className="stack s4"><h3>{label}</h3><span className="faint small">{g.map(p => p.name).join(", ")}</span></div>{g.map(p => <PwCard key={p.code} p={p} />)}</div> : null; })}
      {!pws.length && <Card><p className="muted">This program has no pathways yet. Add a pathway, or copy pathways (with their subpathways, rubrics and round settings) from another program.</p></Card>}
    </>}

    <Modal open={!!newP} title="New program" sub="For example Oral History 2026 or Nabati Poetry Cycle 1. It starts in setup; switch it to Active when it's ready." onClose={() => setNewP(null)} footer={<><Btn onClick={() => setNewP(null)}>Cancel</Btn><Btn v="primary" busy={busy} disabled={!newP?.name.trim() || !newP?.code.trim()} onClick={() => run(() => api("/api/programs", { body: newP }), async r => { setNewP(null); toast(r.copied ? `Program created with ${r.copied} pathways copied` : "Program created"); await switchTo(r.id); })}>Create program</Btn></>}>
      {err && <Banner tone="bad" title={err} />}
      {newP && <div className="stack" style={{ gap: 12 }}>
        <div className="grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
          <Field label="Name"><input className="input" value={newP.name} onChange={e => setNewP({ ...newP, name: e.target.value })} placeholder="Oral History 2026" /></Field>
          <Field label="Code" help="Letters or numbers"><input className="input" value={newP.code} onChange={e => setNewP({ ...newP, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) })} placeholder="OH26" /></Field>
          <Field label="Cycle or year"><input className="input" value={newP.cycle} onChange={e => setNewP({ ...newP, cycle: e.target.value })} placeholder="2026" /></Field>
        </div>
        <div className="grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Evaluation window starts"><input type="date" className="input" value={newP.starts_on} onChange={e => setNewP({ ...newP, starts_on: e.target.value })} /></Field>
          <Field label="Ends"><input type="date" className="input" value={newP.ends_on} onChange={e => setNewP({ ...newP, ends_on: e.target.value })} /></Field>
        </div>
        <Field label="Start from" help="Copying brings pathways, subpathways, round settings and (optionally) copies of their rubrics. No entries, dates or evaluator panels are copied.">
          <select className="select" value={newP.copy_from} onChange={e => setNewP({ ...newP, copy_from: e.target.value })}><option value="">An empty program</option>{programs.filter(p => p.pathways.length).map(p => <option key={p.id} value={p.id}>A copy of {p.name}'s structure</option>)}</select></Field>
        {newP.copy_from && <Check label="Copy the rubrics too (as new rubrics for this program)" checked={newP.copy_rubrics} onChange={v => setNewP({ ...newP, copy_rubrics: v })} />}
      </div>}
    </Modal>

    <Modal open={!!edit} title="Program details" onClose={() => setEdit(null)} footer={<><Btn onClick={() => setEdit(null)}>Cancel</Btn><Btn v="primary" busy={busy} onClick={() => run(() => api(`/api/programs/${edit.id}`, { method: "PATCH", body: { name: edit.name, cycle: edit.cycle, starts_on: edit.starts_on, ends_on: edit.ends_on, status: edit.status, owner_ids: edit.owner_ids } }), () => { setEdit(null); toast("Program saved"); })}>Save</Btn></>}>
      {err && <Banner tone="bad" title={err} />}
      {edit && <div className="stack" style={{ gap: 12 }}>
        <div className="grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <Field label="Name"><input className="input" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Cycle or year"><input className="input" value={edit.cycle} onChange={e => setEdit({ ...edit, cycle: e.target.value })} /></Field>
        </div>
        <div className="grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Field label="Window starts"><input type="date" className="input" value={edit.starts_on} onChange={e => setEdit({ ...edit, starts_on: e.target.value })} /></Field>
          <Field label="Ends"><input type="date" className="input" value={edit.ends_on} onChange={e => setEdit({ ...edit, ends_on: e.target.value })} /></Field>
          <Field label="Status"><select className="select" value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value })}>{Object.entries(ST).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        </div>
        <Field label="Owners" help="The people responsible for this program."><div className="row" style={{ gap: 12, flexWrap: "wrap" }}>{accounts.map(a => <Check key={a.id} label={a.display_name} checked={edit.owner_ids.includes(a.id)} onChange={v => setEdit({ ...edit, owner_ids: v ? [...edit.owner_ids, a.id] : edit.owner_ids.filter(x => x !== a.id) })} />)}</div></Field>
        <p className="small faint">Archived programs are hidden from everyone except admins.</p>
      </div>}
    </Modal>

    <Modal open={!!addPw} title={`Add a pathway to ${cur.name}`} onClose={() => setAddPw(null)} footer={<><Btn onClick={() => setAddPw(null)}>Cancel</Btn><Btn v="primary" busy={busy} disabled={!addPw?.name.trim()} onClick={() => run(() => api(`/api/programs/${cur.id}`, { body: { action: "add_pathway", ...addPw } }), r => { setAddPw(null); toast(`Pathway added (${r.code}). Add its subpathways next.`); location.assign(`/setup/${r.code}`); })}>Add pathway</Btn></>}>
      {err && <Banner tone="bad" title={err} />}
      {addPw && <div className="stack" style={{ gap: 12 }}>
        <Field label="Name"><input className="input" value={addPw.name} onBlur={async () => { if (addPw.name.trim() && !addPw.code) { const r = await api(`/api/programs/${cur.id}`, { body: { action: "suggest_code", name: addPw.name } }).catch(() => null); if (r) setAddPw(a => ({ ...a, code: a.code || r.code })); } }} onChange={e => setAddPw({ ...addPw, name: e.target.value })} placeholder="Literary Arts" /></Field>
        <div className="grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Code" help="Starts every entry code, so it's unique across programs."><input className="input" value={addPw.code} onChange={e => setAddPw({ ...addPw, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) })} /></Field>
          <Field label="Evaluation type"><select className="select" value={addPw.eval_type} onChange={e => setAddPw({ ...addPw, eval_type: e.target.value })}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        </div>
        <p className="small faint">The pathway gets Round 1 (online) and Round 2. Add its subpathways and rubrics on the next page.</p>
      </div>}
    </Modal>

    <Modal open={!!editPw} title="Edit pathway" onClose={() => setEditPw(null)} footer={<>{editPw && !editPw.entries && <Btn v="ghost" busy={busy} onClick={() => run(() => api(`/api/programs/${cur.id}`, { body: { action: "remove_pathway", code: editPw.code } }), () => { setEditPw(null); toast("Pathway removed"); })}>Remove pathway</Btn>}<span className="sp" /><Btn onClick={() => setEditPw(null)}>Cancel</Btn><Btn v="primary" busy={busy} onClick={() => run(() => api(`/api/programs/${cur.id}`, { body: { action: "edit_pathway", ...editPw } }), () => { setEditPw(null); toast("Pathway saved"); })}>Save</Btn></>}>
      {err && <Banner tone="bad" title={err} />}
      {editPw && <div className="stack" style={{ gap: 12 }}>
        <Field label="Name"><input className="input" value={editPw.name} onChange={e => setEditPw({ ...editPw, name: e.target.value })} /></Field>
        <Field label="Evaluation type"><select className="select" value={editPw.eval_type} onChange={e => setEditPw({ ...editPw, eval_type: e.target.value })}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <p className="small faint">Code {editPw.code}. {editPw.entries ? "A pathway with entries can't be removed." : "A pathway without entries can be removed."}</p>
      </div>}
    </Modal>

    <Modal open={!!copy} wide title={`Copy pathways into ${cur.name}`} sub="Each copy gets its own code, its subpathways, round settings and (optionally) copies of its rubrics. Entries stay where they are." onClose={() => setCopy(null)} footer={<><Btn onClick={() => setCopy(null)}>Cancel</Btn><Btn v="primary" busy={busy} disabled={!copy?.codes.length} onClick={() => run(() => api(`/api/programs/${cur.id}`, { body: { action: "copy_pathways", codes: copy.codes, with_rubrics: copy.with_rubrics } }), r => { setCopy(null); toast(`Copied ${r.codes.length} pathway${r.codes.length === 1 ? "" : "s"}`); })}>Copy {copy?.codes.length || ""}</Btn></>}>
      {err && <Banner tone="bad" title={err} />}
      {copy && <div className="stack" style={{ gap: 12 }}>
        <Field label="From"><select className="select" value={copy.from} onChange={e => setCopy({ ...copy, from: e.target.value, codes: [] })}>{others.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <div className="stack s8">{others.find(p => p.id === copy.from)?.pathways.map(pw => <Check key={pw.code} label={`${pw.name} (${pw.eval_type}) · ${pw.subs} subpathways`} checked={copy.codes.includes(pw.code)} onChange={v => setCopy({ ...copy, codes: v ? [...copy.codes, pw.code] : copy.codes.filter(c => c !== pw.code) })} />)}</div>
        <Check label="Copy their rubrics too" checked={copy.with_rubrics} onChange={v => setCopy({ ...copy, with_rubrics: v })} />
      </div>}
    </Modal>
  </>;
}
