"use client";
import { useMemo, useState } from "react";
import { api, useApi, useToast, Card, Btn, Badge, Loading, Modal, Field, Check, Seg, Search, Kpis, download, dshort, when } from "@/components/ui";
import LocPicker from "@/components/LocPicker";
import Planner from "@/components/Planner";

// Artworks handling: framing, printing, production and "other", from the display option chosen during the
// physical evaluation. Admins, management and coordinators fill in the details and approve; Logistics sends
// approved artworks in numbered batches, exports the batch checklist (with signatures) and records them back.
const ST = { draft: ["Needs approval", "warn"], approved: ["Approved", "info"], sent: ["Sent", "brand"], back: ["Back", "ok"] };
const SZ = { S: 1, M: 2, L: 3, XL: 4 };
const short = s => { const n = String(s || "").split(", ").filter(Boolean); return n.length > 2 ? `${n.slice(0, 2).join(", ")} +${n.length - 2} more` : n.join(", "); };
export default function Handling() {
  const d = useApi("/api/handling", [], { live: 30000 }); const toast = useToast();
  const [track, setTrack] = useState("framing"); const [st, setSt] = useState("all"); const [by, setBy] = useState("school"); const [q, setQ] = useState(""); const [pw, setPw] = useState(""); const [only, setOnly] = useState(true);
  const [sel, setSel] = useState(new Set()); const [ask, setAsk] = useState(null); const [busy, setBusy] = useState(false); const [big, setBig] = useState(null);
  const all = d.data?.rows || [];
  const T = d.data?.tracks || {};
  const base = all.filter(r => r.track === track && (!pw || r.pathway_code === pw) && (!only || r.selected || r.sent_at || !all.some(x => x.selected)));
  const t = q.trim().toLowerCase();
  const rows = base.filter(r => (st === "all" || (st === "todo" ? r.status === "draft" : r.status === st)) && (!t || [r.code, r.title, r.school, r.esis, r.where, r.students].some(v => String(v || "").toLowerCase().includes(t))));
  const grp = st === "sent" || st === "back" ? (by === "batch" ? "batch" : by) : by === "batch" ? "school" : by;
  const groups = useMemo(() => {
    const key = r => grp === "place" ? (r.room ? `${r.room} · ${r.shelf}` : "No storage place") : grp === "size" ? (({ S: "Small", M: "Medium", L: "Large", XL: "Extra large" })[r.size_class] || "Size not set") : grp === "batch" ? (r.batch ? `Batch ${r.batch}` : "No batch") : `${r.school}${r.esis ? ` · eSIS ${r.esis}` : ""}`;
    const srt = grp === "place" ? (a, b) => a.locSort - b.locSort || a.code.localeCompare(b.code) : grp === "size" ? (a, b) => (SZ[a.size_class] || 9) - (SZ[b.size_class] || 9) || a.school.localeCompare(b.school) || a.code.localeCompare(b.code) : grp === "batch" ? (a, b) => (b.batch || 0) - (a.batch || 0) || a.code.localeCompare(b.code) : (a, b) => a.school.localeCompare(b.school) || a.code.localeCompare(b.code);
    const m = new Map(); [...rows].sort(srt).forEach(r => { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return [...m.entries()];
  }, [rows, grp]);
  if (!d.data) return <Loading error={d.error} />;
  const { canEdit, canAct, canLists } = d.data;
  const toggle = (codes, on) => { const n = new Set(sel); codes.forEach(c => on ? n.add(c) : n.delete(c)); setSel(n); };
  const picked = rows.filter(r => sel.has(r.code));
  const editable = picked.filter(r => ["draft", "approved"].includes(r.status));
  const canSend = picked.filter(r => r.status === "approved"), canBack = picked.filter(r => r.status === "sent");
  async function go(action, extra = {}, list = picked) { setBusy(true); try { const r = await api("/api/handling", { body: { action, codes: list.map(x => x.code), ...extra } }); toast(r.note); setAsk(null); setSel(new Set()); d.reload(); } catch (e) { toast(e.message, "err"); } setBusy(false); }
  const cnt = (tr, f = () => true) => all.filter(r => r.track === tr && (!only || r.selected || r.sent_at || !all.some(x => x.selected)) && f(r)).length;
  const batches = [...new Set(base.filter(r => r.batch).map(r => r.batch))].sort((a, b) => b - a);
  const exportX = (extra = {}) => download(`/api/handling?${new URLSearchParams({ format: "xlsx", track, by: grp === "batch" ? "school" : grp, only: only ? "selected" : "all", ...(st !== "all" ? { status: st } : {}), ...extra })}`).catch(e => toast(e.message, "err"));
  const fields = T[track]?.fields || [];
  const opts = kind => (d.data.options || []).filter(o => o.kind === kind && o.active).map(o => o.label);
  return <>
    <div className="row" style={{ margin: "4px 0 12px", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <Seg value={track} onChange={v => { setTrack(v); setSel(new Set()); setSt("all"); }} items={["framing", "printing", "production", "other"].map(k => [k, `${T[k]?.label || k} ${cnt(k)}`])} />
      <span className="sp" /><Check label="Selected artworks only" checked={only} onChange={setOnly} />
    </div>
    {track === "framing" && <Planner kind="framing" plan={d.data.plan} stats={d.data.planned?.stats} alerts={d.data.planned?.alerts} canSet={canAct}
      onSave={async p => { const r = await api("/api/handling", { body: { action: "save_plan", ...p } }); toast(r.note); d.reload(); }} />}
    <Kpis dense items={[["Needs approval", cnt(track, r => r.status === "draft"), canEdit ? "fill in the details, then approve" : "waiting for admin, management or the coordinator", cnt(track, r => r.status === "draft") ? "warn" : ""], ["Approved", cnt(track, r => r.status === "approved"), "ready to send"], ["Sent", cnt(track, r => r.status === "sent"), `${new Set(all.filter(r => r.track === track && r.status === "sent").map(r => r.batch)).size} batch(es)`, "brand"], ["Back", cnt(track, r => r.status === "back"), "", "ok"]]} />
    <Card flush title={`${T[track]?.label || ""}${track === "other" ? ": choose where each one goes" : ""}`} sub={track === "other" ? "Artworks whose display option is “Other”. Read the note and send each one to framing, printing or production." : track === "production" ? "Hanging and podium display. Add a description (and a file) for each artwork, approve it, then Logistics sends it to production." : `Fill in the ${fields.map(f => f.label.toLowerCase()).join(" and ")}, approve, then Logistics sends approved artworks in batches.`}
      right={track !== "other" && <span className="row" style={{ gap: 6 }}>{batches.length > 0 && <select className="select" style={{ width: 150 }} value="" onChange={e => e.target.value && exportX({ batch: e.target.value })} aria-label="Export a batch"><option value="">Export a batch…</option>{batches.map(b => <option key={b} value={b}>Batch {b}</option>)}</select>}<Btn v="primary" onClick={() => exportX()}>Export checklist</Btn></span>}>
      <div className="fr-tools">
        <Search value={q} onChange={setQ} placeholder="Code, title, student, school or place" />
        <Seg value={st} onChange={v => { setSt(v); setSel(new Set()); }} items={[["all", "All"], ["todo", `Needs approval ${cnt(track, r => r.status === "draft")}`], ["approved", `Approved ${cnt(track, r => r.status === "approved")}`], ["sent", `Sent ${cnt(track, r => r.status === "sent")}`], ["back", `Back ${cnt(track, r => r.status === "back")}`]]} />
        <Seg value={by} onChange={setBy} items={[["school", "By school"], ["place", "By storage place"], ["size", "By size"], ...(st === "sent" || st === "back" ? [["batch", "By batch"]] : [])]} />
        {d.data.pathways.length > 1 && <select className="select" style={{ width: 170 }} value={pw} onChange={e => setPw(e.target.value)} aria-label="Pathway"><option value="">All pathways</option>{d.data.pathways.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}</select>}
      </div>
      {picked.length > 0 && (canEdit || canAct) && <div className="fr-bar"><b>{picked.length} ticked</b><span className="sp" />
        {canEdit && track === "other" && ["framing", "printing", "production"].map(k => <Btn key={k} sm disabled={!editable.length} onClick={() => go("set_track", { track: k }, editable)}>To {T[k].label.toLowerCase()}</Btn>)}
        {canEdit && track !== "other" && <><Btn sm disabled={!editable.length} onClick={() => setAsk({ action: "details", details: Object.fromEntries(fields.map(f => [f.key, editable.length === 1 ? editable[0].details?.[f.key] || "" : ""])) })}>Details{editable.length ? ` (${editable.length})` : ""}</Btn>
          <Btn sm v="primary" disabled={!editable.some(r => r.status === "draft")} onClick={() => go("approve", {}, editable)}>Approve</Btn>
          <Btn sm v="ghost" disabled={!editable.some(r => r.status === "approved")} onClick={() => go("unapprove", {}, editable)}>Withdraw approval</Btn></>}
        {canAct && track !== "other" && <><Btn sm v="primary" disabled={!canSend.length} onClick={() => setAsk({ action: "send", vendor: "", due: "" })}>Send{canSend.length ? ` (${canSend.length})` : ""}</Btn>
          <Btn sm disabled={!canBack.length} onClick={() => setAsk({ action: "back", location_id: "" })}>{track === "framing" ? "Back to storage" : "Back"}{canBack.length ? ` (${canBack.length})` : ""}</Btn></>}
        <Btn sm v="ghost" onClick={() => setSel(new Set())}>Clear</Btn></div>}
      {!groups.length ? <p className="muted" style={{ padding: 16, margin: 0 }}>{base.length ? "Nothing here with these filters." : "No artworks here yet. Coordinators choose a display option for each artwork during the physical evaluation."}</p> : groups.map(([g, list]) => { const codes = list.map(r => r.code); const on = codes.every(c => sel.has(c)); return <div key={g} className="fr-g">
        <div className="fr-gh">{(canEdit || canAct) && <Check label="" checked={on} onChange={v => toggle(codes, v)} />}<b>{g}</b><span className="small faint">{list.length} artwork{list.length === 1 ? "" : "s"}{grp === "batch" && list[0].sent_at ? ` · sent ${when(list[0].sent_at)}${list[0].vendor ? ` to ${list[0].vendor}` : ""}${list[0].due ? ` · due ${dshort(list[0].due)}` : ""}` : ""}</span>
          {grp === "batch" && list[0].batch && <><span className="sp" /><Btn sm v="ghost" onClick={() => exportX({ batch: list[0].batch, status: "" })}>Export batch</Btn></>}</div>
        {list.map(r => <div key={r.code} className={`fr-r hd-r${sel.has(r.code) ? " on" : ""}`}>
          {canEdit || canAct ? <Check label="" checked={sel.has(r.code)} onChange={v => toggle([r.code], v)} /> : <span />}
          <button type="button" className="fr-th" onClick={() => r.thumb && setBig(r)} aria-label={`Photo of ${r.code}`}>{r.thumb ? <img src={`${r.thumb}?s=200`} alt="" loading="lazy" /> : <span className="small faint">No photo</span>}</button>
          <div className="fr-main"><span><a className="code" href={`/entries/${r.code}`}>{r.code}</a> <span dir="auto">{r.title}</span></span>
            <span className="small faint">{[grp === "school" ? null : r.school, short(r.students), r.grades, r.size].filter(Boolean).join(" · ")}</span>
            <span className="small">{r.option_label}{r.size_class ? ` · ${({ S: "Small", M: "Medium", L: "Large", XL: "Extra large" })[r.size_class]}` : ""}{r.option_note ? <span className="hd-note"> · “{r.option_note}”</span> : ""}</span>
            {fields.some(f => r.details?.[f.key]) && <span className="small hd-det">{fields.filter(f => r.details?.[f.key]).map(f => `${f.label}: ${f.text ? r.details[f.key].slice(0, 120) : r.details[f.key]}`).join(" · ")}</span>}
            {track === "production" && r.details?.file_name && <a className="small link" href={`/api/handling/file?code=${encodeURIComponent(r.code)}`} target="_blank" rel="noreferrer">{r.details.file_name}</a>}</div>
          <div className="fr-need"><Badge tone={ST[r.status]?.[1]}>{r.status === "sent" ? (r.batch ? `Batch ${r.batch} sent` : "Sent") : ST[r.status]?.[0]}</Badge>{r.damaged && <Badge tone="bad">Damaged</Badge>}</div>
          <div className="fr-where"><b className="small">{r.status === "sent" && track === "framing" ? `At the framer${r.vendor ? ` (${r.vendor})` : ""}` : r.where || "–"}</b>
            <span className="small faint">{r.status === "approved" ? `Approved by ${r.approved_by}` : r.status === "sent" ? `Sent ${when(r.sent_at)}${r.due ? ` · due ${dshort(r.due)}` : ""}` : r.status === "back" ? `Back ${when(r.back_at)}` : r.updated_by ? `Updated by ${r.updated_by}` : ""}</span></div>
        </div>)}
      </div>; })}
    </Card>
    {canLists && <Lists d={d} />}
    <Modal open={ask?.action === "details"} title={`${T[track]?.label} details · ${editable.length} artwork${editable.length === 1 ? "" : "s"}`} sub="Changing approved details needs approval again." onClose={() => setAsk(null)}
      footer={<><Btn onClick={() => setAsk(null)}>Cancel</Btn><Btn v="primary" busy={busy} onClick={() => go("save_details", { details: ask.details }, editable)}>Save</Btn></>}>
      {ask?.action === "details" && <div className="stack" style={{ gap: 12 }}>
        {fields.map(f => <Field key={f.key} label={f.label} help={f.list && !opts(f.list).length ? "No options in this list yet: type it (admins and management can add the list below)." : undefined}>
          {f.text ? <textarea className="textarea" rows={4} value={ask.details[f.key] || ""} onChange={e => setAsk({ ...ask, details: { ...ask.details, [f.key]: e.target.value } })} />
            : <Choice options={opts(f.list)} value={ask.details[f.key] || ""} onChange={v => setAsk({ ...ask, details: { ...ask.details, [f.key]: v } })} />}</Field>)}
        {track === "production" && editable.length === 1 && <Field label="File with the details (optional)" help="A drawing, PDF or photo. Up to 10 MB."><input type="file" className="input" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; try { const r = await fetch("/api/handling/file", { method: "POST", headers: { "content-type": f.type || "application/octet-stream", "x-code": editable[0].code, "x-name": encodeURIComponent(f.name) }, body: f }); const j = await r.json(); if (!r.ok) throw new Error(j.error); toast(j.note); d.reload(); } catch (x) { toast(x.message, "err"); } }} /></Field>}
      </div>}
    </Modal>
    <Modal open={ask?.action === "send"} title={`Send ${canSend.length} artwork${canSend.length === 1 ? "" : "s"} for ${T[track]?.label?.toLowerCase()}`} sub="They get the next batch number. Export the batch checklist and send it with them for signatures." onClose={() => setAsk(null)}
      footer={<><Btn onClick={() => setAsk(null)}>Cancel</Btn><Btn v="primary" busy={busy} onClick={() => go("send", { vendor: ask.vendor || null, due: ask.due || null }, canSend)}>Send</Btn></>}>
      {ask?.action === "send" && <div className="stack" style={{ gap: 12 }}>
        <Field label={`${track === "framing" ? "Framing company" : track === "printing" ? "Printer" : "Production company"} (optional)`}><input className="input" value={ask.vendor} onChange={e => setAsk({ ...ask, vendor: e.target.value })} /></Field>
        <Field label="Due back" help="You'll be alerted if they aren't back by then."><input type="date" className="input" style={{ maxWidth: 200 }} value={ask.due} onChange={e => setAsk({ ...ask, due: e.target.value })} /></Field>
      </div>}
    </Modal>
    <Modal open={ask?.action === "back"} title={`${canBack.length} artwork${canBack.length === 1 ? "" : "s"} back${track === "framing" ? " to storage" : ""}`} onClose={() => setAsk(null)}
      footer={<><Btn onClick={() => setAsk(null)}>Cancel</Btn><Btn v="primary" busy={busy} onClick={() => go("back", { location_id: ask.location_id || null }, canBack)}>Confirm</Btn></>}>
      {ask?.action === "back" && (track === "framing" ? <Field label="Store them in" help="Leave the room empty to put each one back where it was."><LocPicker value={ask.location_id} onChange={v => setAsk({ ...ask, location_id: v })} allowEmpty emptyLabel="Back where each was" /></Field> : <p className="muted" style={{ margin: 0 }}>Record that these are back from {T[track]?.label?.toLowerCase()}.</p>)}
    </Modal>
    <Modal open={!!big} wide title={big ? `${big.code} · ${big.title}` : ""} sub={big ? `${big.school} · ${big.option_label}` : ""} onClose={() => setBig(null)} footer={<Btn onClick={() => setBig(null)}>Close</Btn>}>
      {big && <img src={`${big.thumb}?s=1600`} alt="" style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", background: "var(--wash2)", borderRadius: 12 }} />}
    </Modal>
  </>;
}
// a dropdown from the team's list, with "Other" to type something else
function Choice({ options, value, onChange }) {
  const inList = !value || options.includes(value); const [other, setOther] = useState(!inList);
  if (!options.length) return <input className="input" value={value} onChange={e => onChange(e.target.value)} />;
  return <div className="stack s4"><select className="select" value={other ? "__other" : value} onChange={e => { if (e.target.value === "__other") { setOther(true); onChange(""); } else { setOther(false); onChange(e.target.value); } }}>
    <option value="">Choose…</option>{options.map(o => <option key={o} value={o}>{o}</option>)}<option value="__other">Other…</option></select>
    {other && <input className="input" value={value} onChange={e => onChange(e.target.value)} placeholder="Type it" autoFocus />}</div>;
}
function Lists({ d }) {
  const toast = useToast(); const [nv, setNv] = useState({});
  async function go(body) { try { const r = await api("/api/handling", { body }); toast(r.note); d.reload(); return true; } catch (e) { toast(e.message, "err"); return false; } }
  return <Card title="Dropdown lists" sub="The choices for frame material and colour, print size and material. Take an option out of use to hide it.">
    <div className="hd-lists">{Object.entries(d.data.lists).map(([k, label]) => { const list = d.data.options.filter(o => o.kind === k); return <div key={k} className="rm-card"><b>{label}</b>
      <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>{list.map(o => <button key={o.id} type="button" className={`chip${o.active ? " on" : ""}`} title={o.active ? "Take out of use" : "Use again"} onClick={() => go({ action: "update_option", id: o.id, active: !o.active })}>{o.label}</button>)}{!list.length && <span className="small faint">No options yet.</span>}</div>
      <div className="row" style={{ gap: 6, marginTop: 8 }}><input className="input" style={{ height: 32 }} placeholder="Add an option" value={nv[k] || ""} onChange={e => setNv({ ...nv, [k]: e.target.value })} /><Btn sm disabled={!(nv[k] || "").trim()} onClick={async () => { if (await go({ action: "add_option", kind: k, label: nv[k] })) setNv({ ...nv, [k]: "" }); }}>Add</Btn></div>
    </div>; })}</div>
  </Card>;
}
