"use client";
import { useState } from "react";
import { api, useApi, useMeta, useToast, Modal, Field, Btn, Banner, Badge, Check } from "@/components/ui";
export const LG = { to_collect: "To collect", storage: "In storage", coordinator: "With coordinator", missing: "Missing", returned: "Returned to school", framer: "At the framer" };
export const MISSING = { collect_later: "Collect later", score_online: "Scored from its files", withdrawn: "Withdrawn" };
export const isExc = r => r.state === "missing" || r.damaged;

// One artwork's record: where it is, damage, framing, and what happens to a missing artwork.
export function EditLogistics({ row, onClose, onSaved }) {
  const toast = useToast(); const meta = useMeta(); const admin = meta?.data?.me?.role === "admin";
  const locs = useApi("/api/locations"); const active = (locs.data?.locations || []).filter(l => l.active);
  const [loc, setLoc] = useState(row.location_id || ""); const [damaged, setDamaged] = useState(!!row.damaged); const [cond, setCond] = useState(row.condition || "");
  const [reason, setReason] = useState(""); const [err, setErr] = useState(null); const [busy, setBusy] = useState(null);
  async function call(key, body, msg) { setBusy(key); setErr(null); try { const r = await api("/api/logistics", { body: { entry_code: row.entry.code, ...body } }); toast(r.note || msg || "Updated"); onSaved(); onClose(); } catch (e) { setErr(e.message); } setBusy(null); }
  const LocSel = <select className="select" value={loc} onChange={e => setLoc(e.target.value)}><option value="">Choose room and shelf…</option>{active.map(l => <option key={l.id} value={l.id}>{l.label} ({l.count} stored)</option>)}</select>;
  const st = row.state;
  return <Modal open title={`${row.entry.code} · ${LG[st] || st}`} sub={[row.entry.school?.name, row.sub, row.where].filter(Boolean).join(" · ")} onClose={onClose} footer={<Btn onClick={onClose}>Close</Btn>}>
    {err && <Banner tone="bad" title={err} />}
    {st === "to_collect" && <p className="muted">{row.collection ? `In collection ${row.collection.code}${row.collection.scheduled_on ? `, ${row.collection.scheduled_on}` : ""}.` : "Not scheduled yet. Use “Schedule for collection” on the board."}</p>}
    {st === "coordinator" && <p className="muted">In {row.session?.title || "a scoring session"}. It comes back to storage when the session finishes.</p>}
    {st === "missing" && <div className="stack" style={{ gap: 12 }}>
      <p className="muted">Missing at collection.{row.missing_outcome ? ` Current choice: ${MISSING[row.missing_outcome]}.` : ""} What should happen?</p>
      <div className="stack s8">
        <Btn busy={busy === "later"} onClick={() => call("later", { action: "missing_outcome", outcome: "collect_later", reason })}>Collect later (back on the list to collect)</Btn>
        {admin && <><Field label="Reason (needed for the two choices below)"><input className="input" value={reason} onChange={e => setReason(e.target.value)} /></Field>
          <Btn disabled={!reason.trim()} busy={busy === "online"} onClick={() => call("online", { action: "missing_outcome", outcome: "score_online", reason })}>Score it from its files online</Btn>
          <Btn disabled={!reason.trim()} busy={busy === "wd"} onClick={() => call("wd", { action: "missing_outcome", outcome: "withdrawn", reason })}>Withdraw it (not scored)</Btn></>}
      </div>
      <Field label="Found it? Put it in storage">{LocSel}</Field>
      <div><Btn v="primary" disabled={!loc} busy={busy === "found"} onClick={() => call("found", { action: "set_state", state: "storage", location_id: loc }, "Back in storage")}>Put in storage</Btn></div>
    </div>}
    {st === "storage" && <div className="stack" style={{ gap: 12 }}>
      <Field label="Move to">{LocSel}</Field>
      <div><Btn disabled={!loc || loc === row.location_id} busy={busy === "move"} onClick={() => call("move", { action: "move", location_id: loc }, "Moved")}>Move</Btn></div>
      <div className="stack s8" style={{ borderTop: "1px solid var(--rule)", paddingTop: 12 }}>
        <Check label="Damaged" checked={damaged} onChange={setDamaged} />
        <input className="input" value={cond} onChange={e => setCond(e.target.value)} placeholder={damaged ? "What's damaged?" : "Condition notes"} />
        <div><Btn busy={busy === "dmg"} onClick={() => call("dmg", { action: "damage", damaged, condition: cond }, "Saved")}>Save condition</Btn></div>
      </div>
      <div className="row" style={{ gap: 8, borderTop: "1px solid var(--rule)", paddingTop: 12, flexWrap: "wrap" }}>
        {row.needs_framing && <Btn busy={busy === "fr"} onClick={() => call("fr", { action: "set_state", state: "framer" }, "Sent to the framer")}>Send to the framer{row.glass_framing ? " (with glass)" : ""}</Btn>}
        <Btn busy={busy === "ret"} onClick={() => call("ret", { action: "set_state", state: "returned" }, "Marked as returned to the school")}>Returned to school</Btn>
      </div>
    </div>}
    {(st === "framer" || st === "returned") && <div className="stack" style={{ gap: 12 }}>
      <Field label={st === "framer" ? "Back from the framer: store it in" : "Back in storage: store it in"}>{LocSel}</Field>
      <div><Btn v="primary" busy={busy === "back"} onClick={() => call("back", { action: "set_state", state: "storage", location_id: loc || undefined }, "Back in storage")}>Back in storage</Btn></div>
    </div>}
    <p className="faint small" style={{ marginTop: 8 }}>Framing: {row.needs_framing ? (row.glass_framing ? "needs framing with protective glass" : "needs framing") : "not needed"}{row.damaged ? " · damaged" : ""}</p>
  </Modal>;
}
