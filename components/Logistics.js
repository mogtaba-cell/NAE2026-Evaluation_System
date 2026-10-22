"use client";
import { useState } from "react";
import { api, useToast, Modal, Field, Btn, Banner } from "@/components/ui";
export const LG = { to_collect: "To collect", storage: "In storage", coordinator: "With coordinator", missing: "Missing", returned: "Returned" };
export const isExc = r => r.state === "missing" || /damag/i.test(r.condition || "");

export function EditLogistics({ row, onClose, onSaved }) {
  const toast = useToast(); const [f, setF] = useState({ state: row.state, location: row.location || "", condition: row.condition || "" }); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  async function save() { setBusy(true); try { await api("/api/logistics", { body: { action: "set_state", entry_code: row.entry.code, ...f } }); toast("Updated"); onSaved(); onClose(); } catch (e) { setErr(e.message); } setBusy(false); }
  return <Modal open title={`Update ${row.entry.code}`} sub={row.entry.school?.name} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn v="primary" busy={busy} onClick={save}>Save</Btn></>}>
    {err && <Banner tone="bad" title={err} />}
    <Field label="Where it is"><select className="select" value={f.state} onChange={e => setF({ ...f, state: e.target.value })}>{Object.entries(LG).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
    <Field label="Shelf or location"><input className="input" value={f.location} onChange={e => setF({ ...f, location: e.target.value })} placeholder="Room B · Shelf 4" /></Field>
    <Field label="Condition"><input className="input" value={f.condition} onChange={e => setF({ ...f, condition: e.target.value })} placeholder="Good, or describe any damage" /></Field>
  </Modal>;
}
