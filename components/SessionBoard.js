"use client";
import LocPicker from "@/components/LocPicker";
// The live board of one scoring session, shared by Logistics and the session's coordinator.
//   Waiting on the shelves  ->  In the room (batch 1, 2, ...)  ->  Handed back  ->  Back on the shelves
// Logistics brings the next batch; the coordinator hands a batch back once it is scored; Logistics confirms it is back
// on the shelves and brings the next one. It refreshes itself every few seconds, so both sides see the same thing.
import { useState } from "react";
import { api, useApi, useToast, Btn, Badge, Banner, Loading, Modal, Field, Check, when } from "@/components/ui";

function LocationSelect({ value, onChange }) {

  return <LocPicker value={value} onChange={onChange} allowEmpty emptyLabel="Back where each one was" />;
}

export default function SessionBoard({ sessionId, role, compact, onChanged }) {
  const d = useApi(`/api/sessions/${sessionId}/board`, [], { live: 8000 });
  const toast = useToast();
  const [sel, setSel] = useState({ waiting: new Set(), room: new Set(), back: new Set() });
  const [count, setCount] = useState(10); const [busy, setBusy] = useState(null); const [ask, setAsk] = useState(null); const [loc, setLoc] = useState("");
  if (!d.data) return <Loading error={d.error} />;
  const { rows, session: s, nextBatch } = d.data;
  const staff = ["admin", "storage"].includes(role); const coord = role === "coordinator" || role === "admin";
  const lane = k => rows.filter(r => r.lane === k);
  const waiting = lane("waiting"), room = lane("room"), back = lane("back"), done = lane("shelved"), missing = lane("missing");
  const batches = [...new Set(room.map(r => r.batch || 0))].sort((a, b) => a - b);
  const live = s.status === "live" || s.status === "planned";
  const toggle = (k, code, on) => { const n = new Set(sel[k]); on ? n.add(code) : n.delete(code); setSel({ ...sel, [k]: n }); };
  const setAll = (k, codes, on) => { const n = new Set(sel[k]); codes.forEach(c => on ? n.add(c) : n.delete(c)); setSel({ ...sel, [k]: n }); };
  async function go(key, b) {
    setBusy(key);
    try { const r = await api(`/api/sessions/${sessionId}/board`, { body: b }); toast(r.note); setSel({ waiting: new Set(), room: new Set(), back: new Set() }); setAsk(null); d.reload(); onChanged && onChanged(); }
    catch (e) { toast(e.message, "err"); } setBusy(null);
  }
  const Row = ({ r, k }) => <div className={`sb-row${sel[k]?.has(r.code) ? " on" : ""}`}>
    {k && ((k === "waiting" && staff) || (k === "room" && (coord || staff)) || (k === "back" && staff)) ? <Check label="" checked={sel[k].has(r.code)} onChange={v => toggle(k, r.code, v)} /> : <span />}
    <div className="sb-main"><span className="code">{r.code}</span><span className="t" dir="auto">{r.title}</span><span className="m small faint">{[r.school, r.sub, r.size].filter(Boolean).join(" · ")}</span></div>
    <div className="sb-side">{k === "waiting" && <span className="small">{r.where || "Not shelved"}</span>}{r.damaged && <Badge tone="warn">Damaged</Badge>}{r.scored ? <Badge tone="ok">Scored</Badge> : r.progress && r.progress !== "0/0" ? <Badge>{r.progress}</Badge> : null}</div>
  </div>;
  const unscored = b => room.filter(r => r.batch === b && !r.scored).length;

  return <div className={`sb${compact ? " compact" : ""}`}>
    <div className="sb-sum">
      <span><b>{waiting.length}</b> waiting on the shelves</span><span className="arrow">→</span>
      <span><b>{room.length}</b> in the room{batches.length ? ` (batch ${batches.join(", ")})` : ""}</span><span className="arrow">→</span>
      <span><b>{back.length}</b> handed back</span><span className="arrow">→</span>
      <span><b>{done.length}</b> scored and back on the shelves</span>
      {missing.length > 0 && <Badge tone="bad">{missing.length} missing</Badge>}
      <span className="sp" /><span className="small faint">Updates by itself</span>
    </div>
    {!rows.length && <p className="muted" style={{ padding: 12 }}>This session has no physical artworks (they are scored from their files).</p>}
    {rows.length > 0 && <div className="sb-lanes">
      <section className="sb-lane">
        <div className="sb-lh"><div><b>Waiting on the shelves</b><span className="small faint">Sorted by room and shelf</span></div><span className="n">{waiting.length}</span></div>
        {staff && live && waiting.length > 0 && <div className="sb-act">
          {sel.waiting.size ? <Btn sm v="primary" busy={busy === "bring"} onClick={() => go("bring", { action: "bring", codes: [...sel.waiting] })}>Bring {sel.waiting.size} to the room as batch {nextBatch}</Btn>
            : <><span className="small">Bring the next</span><select className="select sb-n" value={count} onChange={e => setCount(+e.target.value)}>{[5, 8, 10, 12, 15, 20, 30].map(n => <option key={n} value={n}>{n}</option>)}</select><Btn sm v="primary" busy={busy === "bring"} onClick={() => go("bring", { action: "bring", count })}>as batch {nextBatch}</Btn></>}
          <span className="sp" /><Check label="All" checked={sel.waiting.size > 0 && sel.waiting.size === waiting.length} onChange={v => setAll("waiting", waiting.map(r => r.code), v)} />
        </div>}
        {!staff && waiting.length > 0 && <p className="small faint sb-note">Logistics brings these in batches.</p>}
        <div className="sb-list">{waiting.map(r => <Row key={r.code} r={r} k="waiting" />)}{!waiting.length && <p className="small faint sb-note">Nothing waiting.</p>}</div>
      </section>

      <section className="sb-lane room">
        <div className="sb-lh"><div><b>In the room</b><span className="small faint">{coord ? "Score these, then hand the batch back" : "With the coordinator"}</span></div><span className="n">{room.length}</span></div>
        {!room.length && <p className="small faint sb-note">{waiting.length ? "Storage hasn't brought a batch yet." : "Nothing in the room."}</p>}
        {batches.map(bn => { const br = room.filter(r => (r.batch || 0) === bn); const left = unscored(bn); const first = br.map(r => r.handed_at).filter(Boolean).sort()[0]; return <div key={bn} className="sb-batch">
          <div className="sb-bh"><Check label="" checked={br.every(r => sel.room.has(r.code))} onChange={v => setAll("room", br.map(r => r.code), v)} /><b>{bn ? `Batch ${bn}` : "Brought in earlier"}</b><span className="small faint">{br.length} artworks · {br.length - left} scored{first ? ` · ${when(first)}` : ""}</span><span className="sp" />
            {(coord || staff) && <Btn sm v={left ? "secondary" : "primary"} busy={busy === `back${bn}`} onClick={() => left ? setAsk({ batch: bn, left }) : go(`back${bn}`, { action: "back", batch: bn || undefined, codes: bn ? undefined : br.map(r => r.code) })}>{coord ? "Batch done: hand back" : "Collect from room"}</Btn>}</div>
          {br.map(r => <Row key={r.code} r={r} k="room" />)}
        </div>; })}
        {sel.room.size > 0 && <div className="sb-act"><Btn sm busy={busy === "backsel"} onClick={() => go("backsel", { action: "back", codes: [...sel.room] })}>Hand back {sel.room.size} selected</Btn></div>}
      </section>

      <section className="sb-lane">
        <div className="sb-lh"><div><b>Handed back</b><span className="small faint">{staff ? "Check them and put them back" : "Logistics takes them back"}</span></div><span className="n">{back.length}</span></div>
        {staff && back.length > 0 && <div className="sb-act"><Btn sm v="primary" busy={busy === "shelve"} onClick={() => setAsk({ shelve: true, codes: sel.back.size ? [...sel.back] : null })}>{sel.back.size ? `Back on shelves (${sel.back.size})` : `All ${back.length} back on shelves`}</Btn><span className="sp" /><Check label="All" checked={sel.back.size > 0 && sel.back.size === back.length} onChange={v => setAll("back", back.map(r => r.code), v)} /></div>}
        <div className="sb-list">{back.map(r => <Row key={r.code} r={r} k="back" />)}{!back.length && <p className="small faint sb-note">Nothing to put back.</p>}</div>
        {done.length > 0 && <details className="sb-done"><summary className="small">{done.length} scored and back on the shelves</summary>{done.map(r => <Row key={r.code} r={r} />)}</details>}
        {missing.length > 0 && <details className="sb-done" open><summary className="small" style={{ color: "var(--bad)" }}>{missing.length} missing</summary>{missing.map(r => <Row key={r.code} r={r} />)}</details>}
      </section>
    </div>}
    {staff && sel.waiting.size > 0 && <div className="sb-foot"><Btn sm v="ghost" busy={busy === "miss"} onClick={() => go("miss", { action: "missing", codes: [...sel.waiting] })}>Mark {sel.waiting.size} selected as not found</Btn></div>}

    <Modal open={!!ask} title={ask?.shelve ? "Back on the shelves" : `Hand back batch ${ask?.batch || ""}?`} onClose={() => setAsk(null)} footer={<><Btn onClick={() => setAsk(null)}>Cancel</Btn><Btn v="primary" busy={!!busy} onClick={() => ask.shelve ? go("shelve", { action: "shelve", codes: ask.codes || undefined, location_id: loc || null }) : go(`back${ask.batch}`, { action: "back", batch: ask.batch })}>Confirm</Btn></>}>
      {ask?.shelve ? <Field label="Put them" help="Leave as is to put each artwork back on the shelf it came from."><LocationSelect value={loc} onChange={setLoc} /></Field>
        : ask && <Banner tone="warn" title={`${ask.left} artwork${ask.left === 1 ? " isn't" : "s aren't"} fully scored yet`}>They go back to storage and wait on the shelves again; Logistics can bring them in a later batch.</Banner>}
    </Modal>
  </div>;
}

// A one-line summary for lists (logistics To do, dashboards).
export const boardLine = a => [a.waiting && `${a.waiting} waiting`, a.room && `${a.room} in the room`, a.back && `${a.back} handed back`].filter(Boolean).join(" · ") || "Nothing to move";
