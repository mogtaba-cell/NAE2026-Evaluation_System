"use client";
import { useMemo, useState } from "react";
import { api, useApi, useToast, Card, Btn, Badge, Loading, Modal, Field, Check, Seg, Search, Banner, when } from "@/components/ui";

// Collections, step 3: returning artworks to their schools (not selected in Round 2, the wrong artwork, or after the
// exhibition). Tick a school's artworks, record who collects them, and print the return note for signatures.
export default function Returns() {
  const d = useApi("/api/returns", [], { live: 30000 }); const toast = useToast();
  const [f, setF] = useState("not_selected"); const [q, setQ] = useState(""); const [sel, setSel] = useState(new Set()); const [ask, setAsk] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const all = d.data?.rows || [];
  const t = q.trim().toLowerCase();
  const rows = all.filter(r => (f === "all" || (f === "none" ? !r.suggest : r.suggest === f)) && (!t || [r.code, r.title, r.school, r.esis].some(v => String(v || "").toLowerCase().includes(t))));
  const groups = useMemo(() => { const m = new Map(); [...rows].sort((a, b) => a.school.localeCompare(b.school) || a.locSort - b.locSort || a.code.localeCompare(b.code)).forEach(r => { const k = r.school_id || "none"; if (!m.has(k)) m.set(k, { name: r.school, esis: r.esis, rows: [] }); m.get(k).rows.push(r); }); return [...m.entries()]; }, [rows]);
  if (!d.data) return <Loading error={d.error} />;
  const R = d.data.reasons;
  const toggle = (codes, on) => { const n = new Set(sel); codes.forEach(c => on ? n.add(c) : n.delete(c)); setSel(n); };
  const picked = all.filter(r => sel.has(r.code)); const schools = [...new Set(picked.map(r => r.school_id))];
  const cnt = k => all.filter(r => k === "all" ? true : k === "none" ? !r.suggest : r.suggest === k).length;
  async function save() { setBusy(true); setErr(null); try { const r = await api("/api/returns", { body: { ...ask, codes: picked.map(x => x.code) } }); toast(r.note); setAsk(null); setSel(new Set()); d.reload(); if (r.id) window.open(`/api/returns/${r.id}/note`, "_blank"); } catch (e) { setErr(e.message); } setBusy(false); }
  return <>
    <Card flush title="Returning artworks to schools" sub="Artworks in storage (or at the exhibition) that go back to their school. Tick one school's artworks, record who collects them, and print the return note for both signatures.">
      <div className="fr-tools">
        <Search value={q} onChange={setQ} placeholder="Code, title or school" />
        <Seg value={f} onChange={v => { setF(v); setSel(new Set()); }} items={[["not_selected", `Not selected ${cnt("not_selected")}`], ["after_exhibition", `After the exhibition ${cnt("after_exhibition")}`], ["wrong", `Withdrawn ${cnt("wrong")}`], ["none", `Others ${cnt("none")}`], ["all", "All"]]} />
      </div>
      {picked.length > 0 && <div className="fr-bar"><b>{picked.length} ticked{schools.length > 1 ? ` from ${schools.length} schools` : ` · ${picked[0].school}`}</b><span className="sp" />
        <Btn sm v="primary" disabled={schools.length !== 1} title={schools.length > 1 ? "One school at a time" : ""} onClick={() => setAsk({ reason: picked[0].suggest || (f !== "all" && f !== "none" ? f : "not_selected"), contact_name: "", contact_phone: "", boxes: "", note: "" })}>Return to the school</Btn>
        <Btn sm v="ghost" onClick={() => setSel(new Set())}>Clear</Btn></div>}
      {!groups.length ? <p className="muted" style={{ padding: 16, margin: 0 }}>Nothing here.</p> : groups.map(([k, g]) => { const codes = g.rows.map(r => r.code); return <div key={k} className="fr-g">
        <div className="fr-gh"><Check label="" checked={codes.every(c => sel.has(c))} onChange={v => toggle(codes, v)} /><b>{g.name}{g.esis ? ` · eSIS ${g.esis}` : ""}</b><span className="small faint">{g.rows.length} artwork{g.rows.length === 1 ? "" : "s"}</span></div>
        {g.rows.map(r => <div key={r.code} className={`rt-r${sel.has(r.code) ? " on" : ""}`}><Check label="" checked={sel.has(r.code)} onChange={v => toggle([r.code], v)} />
          <div className="fr-main"><span><a className="code" href={`/entries/${r.code}`}>{r.code}</a> <span dir="auto">{r.title}</span></span><span className="small faint">{r.pathway}</span></div>
          <div className="fr-need"><Badge tone={r.selected ? "ok" : r.r2 === "Not selected" ? "warn" : ""}>{r.r2}</Badge>{r.suggest && r.suggest !== "not_selected" && <Badge>{R[r.suggest]}</Badge>}</div>
          <div className="fr-where"><b className="small">{r.state === "exhibition" ? "At the exhibition" : r.where || "–"}</b></div></div>)}
      </div>; })}
    </Card>
    <Card flush title="Returns made" sub="Each return to a school, with its return note.">
      {d.data.returns.length ? <div className="rt-list">{d.data.returns.map(r => <div key={r.id} className="rt-done"><div className="stack s4" style={{ minWidth: 0 }}><b>{r.school}{r.esis ? ` · eSIS ${r.esis}` : ""}</b><span className="small faint">{when(r.at)} · {r.entries.length} artwork{r.entries.length === 1 ? "" : "s"} · {R[r.reason] || r.reason}{r.note ? ` (${r.note})` : ""} · collected by {r.contact_name}{r.contact_phone ? ` (${r.contact_phone})` : ""} · handed over by {r.by_name}</span></div>
        {r.note_path && <a className="btn sm" href={`/api/returns/${r.id}/note`} target="_blank" rel="noreferrer">Return note (PDF)</a>}</div>)}</div> : <p className="muted" style={{ padding: 16, margin: 0 }}>No returns yet.</p>}
    </Card>
    <Modal open={!!ask} title={`Return ${picked.length} artwork${picked.length === 1 ? "" : "s"} to ${picked[0]?.school || "the school"}`} sub="A return note is made with both signature lines; print it for the school representative to sign." onClose={() => setAsk(null)}
      footer={<><Btn onClick={() => setAsk(null)}>Cancel</Btn><Btn v="primary" busy={busy} onClick={save}>Confirm return</Btn></>}>
      {ask && <div className="stack" style={{ gap: 12 }}>
        {err && <Banner tone="bad" title={err} />}
        <Field label="Why they go back"><select className="select" value={ask.reason} onChange={e => setAsk({ ...ask, reason: e.target.value })}>{Object.entries(R).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <Field label="Collected by (for the school)"><input className="input" value={ask.contact_name} onChange={e => setAsk({ ...ask, contact_name: e.target.value })} /></Field>
          <Field label="Phone"><input className="input" inputMode="tel" value={ask.contact_phone} onChange={e => setAsk({ ...ask, contact_phone: e.target.value })} /></Field>
          <Field label="Boxes"><input className="input" style={{ width: 90 }} inputMode="numeric" value={ask.boxes} onChange={e => setAsk({ ...ask, boxes: e.target.value })} /></Field>
        </div>
        <Field label={ask.reason === "other" ? "Note" : "Note (optional)"}><textarea className="textarea" rows={2} value={ask.note} onChange={e => setAsk({ ...ask, note: e.target.value })} /></Field>
      </div>}
    </Modal>
  </>;
}
