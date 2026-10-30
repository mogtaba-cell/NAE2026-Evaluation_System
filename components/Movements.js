"use client";
import LocPicker from "@/components/LocPicker";
// Artwork movements in the browser: a list grouped into batches (a session, a collection, a shelf ...) where
// people tick a whole batch or single artworks and apply the next step; and one artwork's details and history.
import { useMemo, useState } from "react";
import { api, useApi, useToast, Btn, Badge, Banner, Modal, Field, Check, Loading, when, dshort } from "@/components/ui";

export const SHORT = { to_collect: "Awaiting delivery", storage: "In storage", requested: "Waiting for its session", picked: "Picked", handed_over: "Handed over", coordinator: "In the session room", returning: "Handed back", framer: "At the framer", showcase: "Showcase", returned: "Returned to school", missing: "Missing" };
const TONE = { to_collect: "", storage: "ok", requested: "info", picked: "info", handed_over: "warn", coordinator: "info", returning: "warn", framer: "", showcase: "ok", returned: "", missing: "bad" };
export const MISSING = { collect_later: "School delivers later", score_online: "Scored from its files", withdrawn: "Withdrawn" };
export const StateBadge = ({ s }) => <Badge tone={TONE[s]}>{SHORT[s] || s}</Badge>;

// label, from states, roles, needs (location | framer | note), primary
export const STEPS = {
  return_room:   ["Hand back to storage", ["coordinator", "handed_over"], ["admin", "coordinator", "storage"]],
  receive_back:  ["Back on the shelves", ["returning", "coordinator", "handed_over"], ["admin", "storage"], "location", true],
  move:          ["Move to…", ["storage", "showcase"], ["admin", "storage"], "location"],
  to_framer:     ["Send to the framer", ["storage"], ["admin", "storage"], "framer"],
  from_framer:   ["Back from the framer", ["framer"], ["admin", "storage"], "location"],
  showcase:      ["Ready for showcase", ["storage"], ["admin", "storage"]],
  unshowcase:    ["Back to storage list", ["showcase"], ["admin", "storage"]],
  return_school: ["Returned to the school", ["storage", "showcase"], ["admin", "storage"], "note"],
  missing:       ["Mark missing", ["storage", "requested", "picked", "handed_over", "coordinator", "returning"], ["admin", "storage"], "note"],
  found:         ["Found: put in storage", ["missing"], ["admin", "storage"], "location"]
};

function LocationSelect({ value, onChange, placeholder = "Choose…" }) {

  return <LocPicker value={value} onChange={onChange} allowEmpty emptyLabel={placeholder || "Choose…"} />;
}

// rows: artworks from /api/logistics. groups: [{ key, title, sub, rows }] (optional). steps: which actions to offer.
export function ArtworkBatch({ rows, groups, role, steps, onDone, empty = "Nothing here.", sessionId, onOpen, compact }) {
  const toast = useToast();
  const [sel, setSel] = useState(new Set()); const [ask, setAsk] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const gs = groups || [{ key: "all", rows }];
  const all = gs.flatMap(g => g.rows);
  const picked = all.filter(r => sel.has(r.entry.code));
  const mine = (steps || Object.keys(STEPS)).filter(k => STEPS[k][2].includes(role));
  const ro = !mine.length;
  const avail = mine.map(k => [k, picked.filter(r => STEPS[k][1].includes(r.state)).length]).filter(([, n]) => n > 0);
  const toggle = (codes, on) => { const s = new Set(sel); codes.forEach(c => on ? s.add(c) : s.delete(c)); setSel(s); };
  async function run(action, extra = {}) {
    setBusy(true); setErr(null);
    try {
      const codes = picked.filter(r => STEPS[action][1].includes(r.state)).map(r => r.entry.code);
      const r = await api("/api/logistics", { body: { action, codes, session_id: sessionId || undefined, ...extra } });
      toast(r.note); setAsk(null); setSel(new Set()); onDone && onDone();
    } catch (e) { setErr(e.message); } setBusy(false);
  }
  function start(k) { const need = STEPS[k][3]; if (!need) return run(k); setErr(null); setAsk({ action: k, location_id: "", vendor: "", due: "", note: "" }); }
  if (!all.length) return <p className="muted" style={{ padding: compact ? 0 : 16 }}>{empty}</p>;
  return <div className="mv">
    {!ro && <div className="mv-bar">
      <Check label={picked.length ? `${picked.length} selected` : `Select all (${all.length})`} checked={picked.length > 0 && picked.length === all.length} onChange={v => toggle(all.map(r => r.entry.code), v)} />
      <span className="sp" />
      {picked.length === 0 ? <span className="small faint">Tick a batch or single artworks, then choose what happened.</span> : avail.length ? avail.map(([k, n]) => <Btn key={k} sm v={STEPS[k][4] ? "primary" : "secondary"} busy={busy && ask?.action !== k} onClick={() => start(k)}>{STEPS[k][0]} ({n})</Btn>) : <span className="small faint">No step applies to the selected artworks.</span>}
    </div>}
    {gs.map(g => { const codes = g.rows.map(r => r.entry.code); const on = codes.length && codes.every(c => sel.has(c)); return <div key={g.key} className="mv-group">
      {g.title && <div className="mv-gh">{!ro && <Check label="" checked={!!on} onChange={v => toggle(codes, v)} />}<div className="stack s4" style={{ minWidth: 0, flex: 1 }}><b>{g.title}</b>{g.sub && <span className="small faint">{g.sub}</span>}</div>{g.right}</div>}
      {g.rows.map(r => <div key={r.entry.code} className={`mv-row${sel.has(r.entry.code) ? " on" : ""}`}>
        {ro ? <span /> : <Check label="" checked={sel.has(r.entry.code)} onChange={v => toggle([r.entry.code], v)} />}
        <button type="button" className="mv-main" onClick={() => onOpen && onOpen(r)}>
          <span className="code">{r.entry.code}</span>
          <span className="t">{r.entry.title_en || r.entry.group_name || r.sub}</span>
          <span className="m small faint">{[r.entry.school?.name, r.sub, r.entry.size_text].filter(Boolean).join(" · ")}</span>
        </button>
        <span className="mv-where small">{r.state === "storage" || r.state === "requested" || r.state === "picked" || r.state === "showcase" ? (r.where || "Not shelved") : r.state === "missing" ? (r.missing_outcome ? MISSING[r.missing_outcome] : "Not decided") : r.state === "to_collect" ? (r.collection ? `Batch ${r.collection.scheduled_on ? dshort(r.collection.scheduled_on) : "not dated"}` : "Not scheduled") : r.state === "framer" ? (r.framing_vendor || "Framer") + (r.framing_due ? ` · due ${dshort(r.framing_due)}` : "") : r.session ? r.session.coordinator || "" : ""}</span>
        <span className="mv-st">{r.damaged && <Badge tone="warn">Damaged</Badge>}{r.needs_framing && <Badge>{r.glass_framing ? "Frame + glass" : "Frame"}</Badge>}<StateBadge s={r.state} /></span>
      </div>)}
    </div>; })}
    <Modal open={!!ask} title={ask ? `${STEPS[ask.action][0]} · ${picked.filter(r => STEPS[ask.action][1].includes(r.state)).length} artwork(s)` : ""} onClose={() => setAsk(null)} footer={<><Btn onClick={() => setAsk(null)}>Cancel</Btn><Btn v="primary" busy={busy} disabled={ask && ["move", "found"].includes(ask.action) && !ask.location_id} onClick={() => run(ask.action, { location_id: ask.location_id || null, vendor: ask.vendor, due: ask.due || null, note: ask.note })}>Confirm</Btn></>}>
      {err && <Banner tone="bad" title={err} />}
      {ask && STEPS[ask.action][3] === "location" && <Field label="Store in" help={ask.action === "receive_back" || ask.action === "from_framer" ? "Leave empty to put each artwork back where it was." : null}><LocationSelect value={ask.location_id} onChange={v => setAsk({ ...ask, location_id: v })} placeholder={ask.action === "receive_back" || ask.action === "from_framer" ? "Where each was before" : "Choose room and shelf…"} /></Field>}
      {ask && STEPS[ask.action][3] === "framer" && <div className="grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}><Field label="Framer"><input className="input" value={ask.vendor} onChange={e => setAsk({ ...ask, vendor: e.target.value })} placeholder="Vendor name" /></Field><Field label="Expected back"><input type="date" className="input" value={ask.due} onChange={e => setAsk({ ...ask, due: e.target.value })} /></Field></div>}
      {ask && ["note", "framer"].includes(STEPS[ask.action][3]) && <Field label="Note (optional)"><input className="input" value={ask.note} onChange={e => setAsk({ ...ask, note: e.target.value })} placeholder={ask.action === "missing" ? "Where was it last seen?" : "Anything to record"} /></Field>}
    </Modal>
  </div>;
}

// One artwork: where it is, details and its movement history.
export function ArtworkDrawer({ row, onClose, role, onChanged }) {
  const h = useApi(row ? `/api/logistics?entry=${encodeURIComponent(row.entry.code)}` : null);
  const toast = useToast(); const admin = role === "admin"; const staff = ["admin", "storage"].includes(role);
  const [busy, setBusy] = useState(null); const [reason, setReason] = useState(""); const [cond, setCond] = useState(row?.condition || ""); const [dmg, setDmg] = useState(!!row?.damaged); const [err, setErr] = useState(null);
  if (!row) return null;
  async function call(key, b, msg) { setBusy(key); setErr(null); try { const r = await api("/api/logistics", { body: b }); toast(r.note || msg || "Saved"); onChanged && onChanged(); h.reload(); } catch (e) { setErr(e.message); } setBusy(null); }
  const facts = [
    ["Where", row.state === "framer" ? `${row.framing_vendor || "Framer"}${row.framing_due ? `, due ${dshort(row.framing_due)}` : ""}` : row.where || "Not shelved"],
    ["Session", row.session ? `${row.session.title}${row.session.date ? `, ${dshort(row.session.date)}` : ""} (${row.session.coordinator || ""})` : "None"],
    ["Delivered", row.collected_on ? `${dshort(row.collected_on)}${row.collected_by ? ` · received by ${row.collected_by}` : ""}` : row.collection ? `Batch ${row.collection.code}${row.collection.scheduled_on ? `, ${dshort(row.collection.scheduled_on)}` : ""}` : "Not yet"],
    ["Handover", row.handed_at ? `${row.handed_by || ""} → ${row.received_by || ""}, ${when(row.handed_at)}` : "–"],
    ["Condition", `${row.condition || "Good"}${row.damaged ? " (damaged)" : ""}`],
    ["Framing", row.needs_framing ? `${row.glass_framing ? "Needs framing with protective glass" : "Needs framing"}${row.framed ? " · framed" : ""}` : "Not needed"],
    ["Round 2", row.scored ? `${row.r2?.final ?? ""} · grade ${row.r2?.grade || ""}${row.selected ? " · selected" : ""}` : "Not scored yet"]
  ];
  return <Modal open wide title={`${row.entry.code} · ${SHORT[row.state] || row.state}`} sub={[row.entry.title_en || row.entry.group_name, row.entry.school?.name, row.sub].filter(Boolean).join(" · ")} onClose={onClose} footer={<><Btn href={`/entries/${row.entry.code}`}>Open artwork</Btn><span className="sp" /><Btn onClick={onClose}>Close</Btn></>}>
    {err && <Banner tone="bad" title={err} />}
    <div className="mv-facts">{facts.map(([k, v]) => <div key={k}><span className="small faint">{k}</span><span>{v}</span></div>)}</div>
    {staff && row.state === "missing" && <div className="stack s8" style={{ borderTop: "1px solid var(--rule)", paddingTop: 12 }}>
      <b>Missing: what should happen?</b>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><Btn busy={busy === "later"} onClick={() => call("later", { action: "missing_outcome", entry_code: row.entry.code, outcome: "collect_later", reason })}>Collect later</Btn>
        {admin && <><Btn disabled={!reason.trim()} busy={busy === "online"} onClick={() => call("online", { action: "missing_outcome", entry_code: row.entry.code, outcome: "score_online", reason })}>Score from its files</Btn><Btn disabled={!reason.trim()} busy={busy === "wd"} onClick={() => call("wd", { action: "missing_outcome", entry_code: row.entry.code, outcome: "withdrawn", reason })}>Withdraw</Btn></>}</div>
      {admin && <input className="input" placeholder="Reason (needed to score from files or withdraw)" value={reason} onChange={e => setReason(e.target.value)} />}
    </div>}
    {staff && <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid var(--rule)", paddingTop: 12 }}>
      <Check label="Damaged" checked={dmg} onChange={setDmg} />
      <input className="input" style={{ flex: "1 1 220px" }} value={cond} onChange={e => setCond(e.target.value)} placeholder={dmg ? "What's damaged?" : "Condition notes"} />
      <Btn sm busy={busy === "dmg"} onClick={() => call("dmg", { action: "damage", codes: [row.entry.code], damaged: dmg, condition: cond })}>Save condition</Btn>
      <select className="select" style={{ width: 210 }} value={row.issue || ""} onChange={e => call("iss", { action: "issue", codes: [row.entry.code], issue: e.target.value || null })}><option value="">No issue to fix</option><option value="needs_school_fix">Needs a fix by the school</option><option value="needs_internal_fix">Needs an internal fix</option></select>
    </div>}
    <div className="stack s8" style={{ borderTop: "1px solid var(--rule)", paddingTop: 12 }}>
      <b>History</b>
      {!h.data ? <Loading error={h.error} /> : h.data.events.length ? <div className="mv-hist">{h.data.events.map(ev => <div key={ev.id} className="it">
        <span className="small faint">{when(ev.at)}</span>
        <div className="stack s4"><span><b>{ev.action}</b>{ev.from_state && ev.to_state && ev.from_state !== ev.to_state ? <span className="small faint"> · {SHORT[ev.from_state] || ev.from_state} → {SHORT[ev.to_state] || ev.to_state}</span> : null}</span>
          <span className="small faint">{[ev.actor_name, ev.location, ev.handed_by && `handed by ${ev.handed_by}`, ev.received_by && `received by ${ev.received_by}`, ev.note].filter(Boolean).join(" · ")}</span></div></div>)}</div> : <p className="muted">No movements recorded yet.</p>}
    </div>
  </Modal>;
}

// Group artworks of sessions: one batch per session, artworks sorted by shelf.
export function bySession(rows, filter) {
  const m = {}; rows.filter(filter).forEach(r => { const k = r.session?.id || "none"; (m[k] = m[k] || { key: k, s: r.session, rows: [] }).rows.push(r); });
  return Object.values(m).sort((a, b) => String(a.s?.date || "9").localeCompare(String(b.s?.date || "9"))).map(g => ({ key: g.key, title: g.s ? g.s.title : "No session", sub: g.s ? [g.s.date && dshort(g.s.date), g.s.time, g.s.venue, g.s.coordinator && `coordinator ${g.s.coordinator}`].filter(Boolean).join(" · ") : "", session: g.s, rows: g.rows.sort((a, b) => a.locSort - b.locSort || String(a.where || "").localeCompare(String(b.where || ""), undefined, { numeric: true }) || a.entry.code.localeCompare(b.entry.code)) }));
}

// The artworks of one session, for its coordinator: confirm what storage handed over, hand back when scored.
export function SessionArtworks({ sessionId, role, onClose, onChanged }) {
  const lg = useApi(`/api/logistics`, [], { live: 10000 }); const [open, setOpen] = useState(null);
  const rows = (lg.data?.rows || []).filter(r => r.session?.id === sessionId).sort((a, b) => a.entry.code.localeCompare(b.entry.code));
  const steps = role === "coordinator" ? ["receive", "send_back"] : ["pick", "hand_over", "receive", "send_back", "receive_back", "missing"];
  const done = () => { lg.reload(); onChanged && onChanged(); };
  const groups = [["handed_over", "Handed to you: confirm what you received"], ["coordinator", "With you"], ["requested", "Still in storage (requested)"], ["picked", "Picked by storage, not handed over yet"], ["returning", "Handed back to storage"], ["storage", "Back in storage"], ["missing", "Missing"]]
    .map(([k, t]) => ({ key: k, title: t, rows: rows.filter(r => r.state === k) })).filter(g => g.rows.length);
  return <Modal open wide title="Artworks in this session" sub="Tick a whole group or single artworks. Every step is recorded with who and when." onClose={onClose} footer={<><Btn href={`/pull-list?session=${sessionId}`}>Pull list</Btn><span className="sp" /><Btn onClick={onClose}>Close</Btn></>}>
    {!lg.data ? <Loading error={lg.error} /> : <ArtworkBatch rows={rows} groups={groups} role={role} steps={steps} sessionId={sessionId} onDone={done} onOpen={setOpen} empty="No physical artworks in this session." />}
    {open && <ArtworkDrawer row={open} role={role} onClose={() => setOpen(null)} onChanged={done} />}
  </Modal>;
}
