"use client";
import { useState } from "react";
import { api, useMeta, useToast, Banner, Btn, Modal, Field } from "@/components/ui";

// Correct an artwork's details (artwork page and scoring sessions). The server decides who may (lib/entryedit.js).
const REFL = [["influence", "Did anyone or anything influence your idea?"], ["enjoy", "What was the most enjoyable part of creating your work?"], ["focus", "What elements did you focus on, and why?"]];
export default function EditDetails({ e, onClose, onDone }) {
  const meta = useMeta(); const toast = useToast();
  const pws = meta?.data?.pathways || [];
  const [f, setF] = useState({ pathway_code: e.pathway_code, sub_code: e.sub_code, title_en: e.title_en || "", title_ar: e.title_ar || "", description_en: e.description_en || "", description_ar: e.description_ar || "", registration_type: e.registration_type === "Group" || (!e.registration_type && e.group_name) ? "Group" : "Individual", group_name: e.group_name || "", size_text: e.size_text || "", medium: e.medium || "", reflections: { influence: e.reflections?.influence || "", enjoy: e.reflections?.enjoy || "", focus: e.reflections?.focus || "" }, reason: "" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const P = pws.find(p => p.code === f.pathway_code); const comp = P?.eval_type === "Competition";
  const moved = f.pathway_code !== e.pathway_code || f.sub_code !== e.sub_code;
  const set = (k, v) => setF({ ...f, [k]: v });
  async function save() {
    setBusy(true); setErr(null);
    try { const body = { ...f }; if (comp) { delete body.size_text; delete body.medium; delete body.reflections; } const r = await api(`/api/entries/${encodeURIComponent(e.code)}`, { method: "PATCH", body: { details: body } }); toast(r.note); onDone(); }
    catch (x) { setErr(x.message); } setBusy(false);
  }
  return <Modal open wide title={`Edit details · ${e.code}`} sub="Changes are recorded in the history with who made them. A re-import keeps these corrections." onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn v="primary" busy={busy} onClick={save}>Save changes</Btn></>}>
    {err && <Banner tone="bad" title={err} />}
    <div className="stack" style={{ gap: 14 }}>
      <div className="x-grid2" style={{ gap: 12 }}>
        <Field label="Pathway"><select className="select" value={f.pathway_code} onChange={x => { const np = pws.find(p => p.code === x.target.value); setF({ ...f, pathway_code: x.target.value, sub_code: np?.subs?.[0]?.code || "" }); }}>{pws.map(p => <option key={p.code} value={p.code}>{p.name}{p.eval_type === "Competition" ? " (competition)" : ""}</option>)}</select></Field>
        <Field label="Subpathway"><select className="select" value={f.sub_code} onChange={x => set("sub_code", x.target.value)}>{(P?.subs || []).map(s => <option key={s.code} value={s.code}>{s.name}</option>)}</select></Field>
      </div>
      {moved && <Banner tone="warn" title="Moving the artwork">Only possible before any score is saved. The artwork code stays {e.code}.{f.pathway_code !== e.pathway_code ? " It leaves its current round and sessions in the old pathway, and may need a new coordinator and evaluators." : ""}</Banner>}
      <div className="x-grid2" style={{ gap: 12 }}>
        <Field label="Title (English)"><input className="input" value={f.title_en} onChange={x => set("title_en", x.target.value)} /></Field>
        <Field label="Title (Arabic)"><input className="input" dir="rtl" value={f.title_ar} onChange={x => set("title_ar", x.target.value)} /></Field>
      </div>
      <div className="x-grid2" style={{ gap: 12 }}>
        <Field label="Description (English)"><textarea className="textarea" rows={3} value={f.description_en} onChange={x => set("description_en", x.target.value)} /></Field>
        <Field label="Description (Arabic)"><textarea className="textarea" rows={3} dir="rtl" value={f.description_ar} onChange={x => set("description_ar", x.target.value)} /></Field>
      </div>
      <div className="x-grid2" style={{ gap: 12 }}>
        <Field label="Artwork type"><select className="select" value={f.registration_type} onChange={x => set("registration_type", x.target.value)}><option>Individual</option><option>Group</option></select></Field>
        {f.registration_type === "Group" && <Field label="Group name"><input className="input" value={f.group_name} onChange={x => set("group_name", x.target.value)} /></Field>}
      </div>
      {!comp && <div className="x-grid2" style={{ gap: 12 }}>
        <Field label="Size" help="For example 40 × 60 cm"><input className="input" value={f.size_text} onChange={x => set("size_text", x.target.value)} /></Field>
        <Field label="Medium"><input className="input" value={f.medium} onChange={x => set("medium", x.target.value)} placeholder="For example Acrylic paint" /></Field>
      </div>}
      {!comp && <div className="stack" style={{ gap: 10 }}>{REFL.map(([k, q]) => <Field key={k} label={q}><textarea className="textarea" rows={2} dir="auto" value={f.reflections[k]} onChange={x => setF({ ...f, reflections: { ...f.reflections, [k]: x.target.value } })} /></Field>)}</div>}
      {comp && <p className="small faint" style={{ margin: 0 }}>{P?.name} is a competition pathway: it has no size, medium or reflection questions.</p>}
      <Field label="Why (optional)"><input className="input" value={f.reason} onChange={x => set("reason", x.target.value)} placeholder="For example: the teacher submitted it under Photography by mistake" /></Field>
    </div>
  </Modal>;
}
