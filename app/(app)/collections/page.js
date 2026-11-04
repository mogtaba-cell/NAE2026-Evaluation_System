"use client";
import LocPicker from "@/components/LocPicker";
// Collections from schools, made for a phone, in two steps.
// 1. Delivery: pick a collection, mark each artwork received or missing, count and photograph the boxes (outside and
//    inside) and the representative's Emirates ID, enter who delivered them, confirm. A confirmation note (PDF) is
//    saved with the photos in the Shared Drive. Mistakes can be corrected afterwards (received <-> missing).
// 2. To store: Logistics puts the received artworks away (room, shelf, row), each pathway together.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StateBadge } from "@/components/Movements";
import { api, useApi, useMeta, useToast, PageHead, Badge, Loading, Btn, Banner, Field, Modal, Check, Seg, Search, Empty, dshort, when } from "@/components/ui";

// Shrink a camera photo to at most 1600 px (about 200 to 400 KB) before sending it.
async function shrink(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise(r => c.toBlob(b => r(b || file), "image/jpeg", 0.82));
}
function PhotoButton({ collectionId, kind, entry, onAdded, label, primary }) {
  const ref = useRef(null); const toast = useToast(); const [busy, setBusy] = useState(false);
  async function pick(e) {
    const files = [...(e.target.files || [])]; e.target.value = ""; if (!files.length) return;
    setBusy(true);
    try {
      for (const f of files) {
        const blob = await shrink(f);
        const r = await fetch(`/api/collections/${collectionId}/photos`, { method: "POST", headers: { "content-type": blob.type || "image/jpeg", "x-kind": kind, ...(entry ? { "x-entry": entry } : {}) }, body: blob });
        const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Upload failed");
        onAdded && onAdded(j.photo);
      }
    } catch (x) { toast(x.message, "err"); }
    setBusy(false);
  }
  return <><input ref={ref} type="file" accept="image/*" capture="environment" multiple={kind !== "eid"} hidden onChange={pick} />
    <Btn sm={!primary} v={primary ? "primary" : "secondary"} busy={busy} onClick={() => ref.current?.click()}>{label}</Btn></>;
}
function Thumbs({ photos, onRemove, canRemove }) {
  const [big, setBig] = useState(null);
  if (!photos?.length) return null;
  return <><div className="cl-thumbs">{photos.map(p => <button key={p.id} type="button" className="cl-thumb" onClick={() => setBig(p)}><img src={p.url} alt={p.kind === "eid" ? "Emirates ID" : p.kind === "box" ? "Box photo" : "Artwork photo"} loading="lazy" />{p.kind === "eid" && <span>EID</span>}</button>)}</div>
    <Modal open={!!big} wide title={big?.kind === "eid" ? "Emirates ID photo" : "Photo"} sub={big ? `${big.taken_by_name || ""}${big.at ? ` · ${when(big.at)}` : ""}` : ""} onClose={() => setBig(null)} footer={<>{canRemove && <Btn v="ghost" onClick={async () => { await onRemove(big); setBig(null); }}>Remove photo</Btn>}<span className="sp" /><Btn onClick={() => setBig(null)}>Close</Btn></>}>
      {big && <img src={big.url} alt="" style={{ width: "100%", borderRadius: 8 }} />}
    </Modal></>;
}
// The school's submitted photos of an artwork: small previews; tap one to see it large and swipe through the rest.
function Submitted({ files, code }) {
  const [i, setI] = useState(null); const touch = useRef(null);
  if (!files?.length) return <span className="small faint">No photos submitted</span>;
  const go = d => setI(x => (x + d + files.length) % files.length);
  const f = i != null ? files[i] : null;
  return <><div className="cl-sub"><span className="small faint">Submitted photos</span><div className="cl-thumbs">{files.map((x, k) => <button key={k} type="button" className="cl-thumb sm" onClick={() => setI(k)} aria-label={`Open ${x.name}`}><img src={`${x.thumb}?s=240`} alt="" loading="lazy" />{x.video && <span>Video</span>}</button>)}</div></div>
    <Modal open={f != null} wide title={code} sub={f ? `${f.name} · ${i + 1} of ${files.length}` : ""} onClose={() => setI(null)} footer={<>{files.length > 1 && <><Btn onClick={() => go(-1)}>‹ Previous</Btn><Btn onClick={() => go(1)}>Next ›</Btn></>}<span className="sp" /><Btn onClick={() => setI(null)}>Close</Btn></>}>
      {f && <div className="cl-big" onTouchStart={e => { touch.current = e.touches[0].clientX; }} onTouchEnd={e => { const dx = e.changedTouches[0].clientX - (touch.current ?? 0); if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); }}>
        {f.video ? <video src={f.big} controls playsInline style={{ width: "100%", maxHeight: "70vh" }} /> : <img src={f.big} alt={f.name} />}
      </div>}
    </Modal></>;
}
function LocSelect({ value, onChange, placeholder, pathway }) {

  return <LocPicker value={value} onChange={onChange} pathway={pathway} allowEmpty emptyLabel={placeholder || "Choose…"} />;
}
const STATUS = c => c.status === "checked_in" ? (c.missing ? ["Delivered · " + c.missing + " missing", "warn"] : c.toStore ? [`Delivered · ${c.toStore} to store`, "info"] : ["Delivered and stored", "ok"]) : c.left < c.count ? [`${c.left} still to be delivered`, "info"] : ["Awaiting delivery", ""];

export default function Collections() {
  const sp = useSearchParams(); const router = useRouter();
  const d = useApi("/api/collections", [], { live: true }); const meta = useMeta();
  const [q, setQ] = useState(""); const [f, setF] = useState("todo"); const [moving, setMoving] = useState(false); const toast = useToast();
  async function copyToDrive() { setMoving(true); try { let r; do { r = await api("/api/collections/photos/backfill", { method: "POST" }); } while (r.moved && r.left); toast(r.left ? `${r.left} still to copy` : "All photos are in Google Drive"); d.reload(); } catch (e) { toast(e.message, "err"); } setMoving(false); }
  const sel = sp.get("c"); const view = sp.get("view") === "store" ? "store" : "deliveries";
  const open = id => router.replace(id ? `/collections?c=${id}` : "/collections", { scroll: false });
  const st = useApi("/api/collections?store=1", [], { live: true });
  if (!d.data) return <Loading error={d.error} />;
  const can = ["admin", "storage", "coordinator"].includes(meta?.data?.me?.role);   // coordinators see (and work on) only their schools' collections
  const all = d.data.collections;
  const t = q.trim().toLowerCase();
  const isTodo = c => c.status === "scheduled", isPart = c => c.status === "scheduled" && c.left < c.count;
  const list = all.filter(c => (f === "all" || (f === "todo" && isTodo(c)) || (f === "part" && isPart(c)) || (f === "done" && !isTodo(c)))
    && (!t || [c.school?.name, c.school?.esis, c.code, c.sub, c.coordinator].some(v => String(v || "").toLowerCase().includes(t))))
    .sort((a, b) => isTodo(a) !== isTodo(b) ? (isTodo(a) ? -1 : 1) : String(a.scheduled_on || "9").localeCompare(String(b.scheduled_on || "9")) || String(a.school?.name).localeCompare(String(b.school?.name)));
  const n = k => all.filter(k).length;
  return <>
    <div className={sel ? "cl-hide-phone" : ""}><PageHead title="Collections" sub="Two steps. 1. Delivery: schools bring their artworks to the GVC office; mark each one received or missing, count and photograph the boxes and the representative's Emirates ID, and confirm (a confirmation note is saved in the Shared Drive). 2. To store: Logistics puts the received artworks on their shelves." actions={<Btn href="/logistics">Artwork logistics</Btn>} />
      <div style={{ margin: "12px 0" }}><Seg value={view} onChange={v => router.replace(v === "store" ? "/collections?view=store" : "/collections", { scroll: false })} items={[["deliveries", "1. Deliveries"], ["store", `2. To store${st.data?.count ? ` ${st.data.count}` : ""}`]]} /></div></div>
    {view === "store" ? <ToStore d={st} role={meta?.data?.me?.role} onChanged={() => { st.reload(); d.reload(); }} /> : <>
    {d.data.offDrive > 0 && <Banner tone="warn" title={`${d.data.offDrive} collection photo${d.data.offDrive === 1 ? " is" : "s are"} not in Google Drive yet`} action={<Btn sm busy={moving} onClick={copyToDrive}>Copy to Drive</Btn>}>Google Drive couldn't be reached when they were taken, so they were kept in the website for now.</Banner>}
    {!all.length ? <Empty title="No collections yet">Prepare them from Artwork logistics (To do → Deliveries from schools) once physical artworks are shortlisted for Round 2.</Empty> : <div className={`cl-wrap${sel ? " has-sel" : ""}`}>
      <section className="cl-list">
        <div className="cl-tools"><Search value={q} onChange={setQ} placeholder="School, eSIS, code" />
          <Seg value={f} onChange={setF} items={[["todo", `Awaiting ${n(isTodo)}`], ["part", `Partly in ${n(isPart)}`], ["done", `Checked in ${n(c => !isTodo(c))}`], ["all", "All"]]} /></div>
        {list.map(c => { const [st, tone] = STATUS(c); return <button key={c.id} type="button" className={`cl-card${c.id === sel ? " on" : ""}`} onClick={() => open(c.id)}>
          <span className="cl-c1"><b>{c.school?.name}</b><Badge tone={tone}>{st}</Badge></span>
          <span className="small faint">{[c.sub || c.pathway, c.school?.esis && `eSIS ${c.school.esis}`, c.coordinator].filter(Boolean).join(" · ")}</span>
          <span className="cl-c3"><span>{c.scheduled_on ? dshort(c.scheduled_on) : "No date"}</span><span>{c.count} artwork{c.count === 1 ? "" : "s"}</span>{c.where && <span>{c.where}</span>}</span>
        </button>; })}
        {!list.length && <p className="muted" style={{ padding: 16 }}>No collections here.</p>}
      </section>
      <section className="cl-detail">{sel ? <Detail key={sel} id={sel} can={can} onBack={() => open(null)} onChanged={() => { d.reload(); st.reload(); }} /> : <div className="cl-pick">Choose a collection.</div>}</section>
    </div>}
    </>}
  </>;
}

function Detail({ id, can, onBack, onChanged }) {
  const c = useApi(`/api/collections/${id}`, [], { live: 30000 }); const toast = useToast();
  const [rec, setRec] = useState({}); const [cond, setCond] = useState({}); const [dmg, setDmg] = useState({}); const [boxes, setBoxes] = useState("");
  const [contact, setContact] = useState({ name: "", phone: "" }); const [newPhotos, setNewPhotos] = useState([]);
  const [dDate, setDDate] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }));   // delivery date: today (UAE)
  const [conf, setConf] = useState(false); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false); const [fix, setFix] = useState(null);
  const x = c.data;
  const photosByEntry = useMemo(() => { const m = {}; (x?.items || []).forEach(i => { m[i.entry.code] = [...(i.photos || []), ...newPhotos.filter(p => p.entry_id === i.entry_id)]; }); return m; }, [x, newPhotos]);
  if (!x) return <Loading error={c.error} />;
  const col = x.collection; const scheduled = col.status === "scheduled";
  const todo = x.items.filter(i => i.state === "to_collect");
  const doneItems = x.items.filter(i => i.state !== "to_collect");
  const received = todo.filter(i => rec[i.entry.code] === "ok").length, missingN = todo.filter(i => rec[i.entry.code] === "missing").length, laterN = todo.length - received - missingN;   // laterN = not marked yet
  const eid = newPhotos.find(p => p.kind === "eid"); const boxNew = newPhotos.filter(p => p.kind === "box");
  const needs = [];
  if (laterN) needs.push(`mark ${laterN === todo.length ? "each artwork" : `${laterN} more artwork${laterN === 1 ? "" : "s"}`} received or missing`);
  // artworks grouped by pathway: each pathway's received artworks are stored together (or split by artwork)
  const groups = Object.values(todo.reduce((m, i) => { const k = i.pathway_code || "?"; (m[k] ||= { code: k, name: i.pathway || "Other", items: [] }).items.push(i); return m; }, {})).sort((a, b) => a.name.localeCompare(b.name));
  const recIn = g => g.items.filter(i => rec[i.entry.code] === "ok");
  if (received && !(Number(boxes) > 0)) needs.push("enter the number of boxes");
  if (received && !contact.name.trim()) needs.push("enter the representative's name");
  if (received && !/^\+?[0-9 ()-]{7,20}$/.test(contact.phone.trim())) needs.push("enter their phone number");
  if (received && !boxNew.length) needs.push("photograph the boxes");
  if (received && !eid) needs.push("photograph their Emirates ID");
  const added = p => setNewPhotos(l => [...l, p]);
  async function removePhoto(p) { try { await api(`/api/collections/photos/${p.id}`, { method: "DELETE" }); setNewPhotos(l => l.filter(y => y.id !== p.id)); c.reload(); } catch (e) { toast(e.message, "err"); } }
  async function schedule(v) { try { await api(`/api/collections/${id}`, { body: { action: "schedule", scheduled_on: v } }); c.reload(); onChanged(); } catch (e) { toast(e.message, "err"); } }
  async function handover() {
    setBusy(true); setErr(null);
    try { const r = await api(`/api/collections/${id}`, { body: { action: "handover", collected_on: dDate, received: rec, conditions: cond, damaged: dmg, boxes, contact_name: contact.name, contact_phone: contact.phone, photo_ids: newPhotos.map(p => p.id) } });
      toast(r.note); setConf(false); setRec({}); setCond({}); setDmg({}); setBoxes(""); setNewPhotos([]); setContact({ name: "", phone: "" }); c.reload(); onChanged(); }
    catch (e) { setErr(e.message); setConf(false); } setBusy(false);
  }
  async function correct() {
    setBusy(true);
    try { const r = await api(`/api/collections/${id}`, { body: { action: "correct", entry_code: fix.code, to: fix.to, note: fix.note, location_id: fix.loc || null } }); toast(r.note); setFix(null); c.reload(); onChanged(); }
    catch (e) { toast(e.message, "err"); } setBusy(false);
  }
  return <div className="cl-d">
    <button type="button" className="cl-back link" onClick={onBack}>‹ All collections</button>
    <div className="cl-dh"><div><h2>{col.school?.name}</h2><p className="small faint">{[col.pathway, col.sub, col.code, col.school?.esis && `eSIS ${col.school.esis}`].filter(Boolean).join(" · ")}</p></div>{scheduled ? <Badge>{todo.length < x.items.length ? `${todo.length} still to be delivered` : "Awaiting delivery"}</Badge> : <Badge tone="ok">Checked in{col.where ? ` · ${col.where}` : ""}</Badge>}</div>
    {err && <Banner tone="bad" title={err} />}

    {can && scheduled && todo.length > 0 && <>
      <div className="cl-sec"><div className="cl-sh"><b>Delivery date</b>{col.scheduled_on && col.scheduled_on !== dDate && <span className="small faint">expected {dshort(col.scheduled_on)}</span>}</div><input type="date" className="input" value={dDate} onChange={e => setDDate(e.target.value)} /></div>
      <div className="cl-sec">
        <div className="cl-sh"><b>1. Artworks ({todo.length})</b><span className="sp" /><Btn sm onClick={() => setRec(Object.fromEntries(todo.map(i => [i.entry.code, "ok"])))}>All received</Btn></div>
        {groups.map(g => <div key={g.code} className="cl-pw">
          <div className="cl-pwh"><b>{g.name}</b><span className="small faint">{g.items.length} artwork{g.items.length === 1 ? "" : "s"}</span><span className="sp" />{recIn(g).length > 0 && <Badge tone="ok">{recIn(g).length} received</Badge>}{g.items.some(i => rec[i.entry.code] === "missing") && <Badge tone="bad">{g.items.filter(i => rec[i.entry.code] === "missing").length} missing</Badge>}</div>
        {g.items.map(i => { const code = i.entry.code; const v = rec[code]; return <div key={code} className={`cl-item${v === "ok" ? " ok" : v === "missing" ? " miss" : ""}`}>
          <div className="cl-it"><span className="code">{code}</span><span className="t" dir="auto">{i.entry.title_en || i.entry.title_ar || i.entry.group_name || ""}</span><span className="small faint">{[i.sub, i.entry.size_text, i.entry.medium].filter(Boolean).join(" · ")}</span></div>
          <Submitted files={i.files} code={code} />
          <div className="cl-3 two"><button type="button" className={v === "ok" ? "on ok" : ""} onClick={() => setRec({ ...rec, [code]: "ok" })}>Received</button><button type="button" className={v === "missing" ? "on miss" : ""} onClick={() => setRec({ ...rec, [code]: "missing" })}>Missing</button></div>
          {v === "missing" && <span className="small faint">Stays in this collection until the school brings it.</span>}
          {v === "ok" && <div className="cl-more">
            <Check label="Damaged" checked={!!dmg[code]} onChange={on => setDmg({ ...dmg, [code]: on })} />
            {(dmg[code] || cond[code]) !== undefined && <input className="input" placeholder={dmg[code] ? "What's damaged?" : "Condition notes (optional)"} value={cond[code] || ""} onChange={e => setCond({ ...cond, [code]: e.target.value })} />}
          </div>}
        </div>; })}</div>)}
      </div>
      {received > 0 && <>
        <div className="cl-sec"><div className="cl-sh"><b>2. The boxes</b></div>
          <Field label="Number of boxes"><input className="input num" style={{ maxWidth: 140 }} inputMode="numeric" value={boxes} onChange={e => setBoxes(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="0" /></Field>
          <span className="small faint">Take as many photos as you need: each box from the outside (its condition) and opened, showing what's inside.</span>
          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}><PhotoButton collectionId={id} kind="box" onAdded={added} label={boxNew.length ? "Take more photos" : "Take photos"} primary={!boxNew.length} />{boxNew.length > 0 && <span className="small">{boxNew.length} photo{boxNew.length === 1 ? "" : "s"}</span>}</div>
          <Thumbs photos={boxNew} canRemove onRemove={removePhoto} />
        </div>
        <div className="cl-sec"><div className="cl-sh"><b>3. Delivered by (school representative)</b></div>
          <Field label="Full name"><input className="input" autoComplete="off" value={contact.name} onChange={e => setContact({ ...contact, name: e.target.value })} placeholder="As on the Emirates ID" /></Field>
          <Field label="Mobile number"><input className="input" type="tel" inputMode="tel" autoComplete="off" value={contact.phone} onChange={e => setContact({ ...contact, phone: e.target.value })} placeholder="050 123 4567" /></Field>
          <Field label="Emirates ID photo" help="Saved with the box photos in the school's folder in the Shared Drive. In the website only admins, Logistics and the school's coordinator can open it, and every view is recorded.">
            <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>{!eid && <PhotoButton collectionId={id} kind="eid" onAdded={added} label="Photograph Emirates ID" primary />}<Thumbs photos={eid ? [eid] : []} canRemove onRemove={removePhoto} /></div>
          </Field>
        </div>
      </>}
      <div className="cl-bar">
        <div className="small"><b>{received}</b> received · <b>{missingN}</b> missing{laterN ? <> · <b>{laterN}</b> not marked</> : ""}{needs.length ? <span className="faint"> · To confirm: {needs.join(", ")}</span> : ""}</div>
        <Btn v="primary" disabled={needs.length > 0} onClick={() => setConf(true)}>{received ? "Confirm delivery" : "Record delivery"}</Btn>
      </div>
    </>}

    {doneItems.length > 0 && <div className="cl-sec">
      <div className="cl-sh"><b>{scheduled ? "Already delivered" : "Artworks"}</b></div>
      {doneItems.map(i => <div key={i.entry.code} className="cl-item">
        <div className="cl-it"><span className="code">{i.entry.code}</span><span className="t" dir="auto">{i.entry.title_en || i.entry.title_ar || i.entry.group_name || ""}</span><span className="row" style={{ gap: 6, flexWrap: "wrap" }}><StateBadge s={i.state} />{i.state === "storage" && i.where ? <span className="small faint">{i.where}</span> : i.state === "received" ? <span className="small faint">At the office, to be stored</span> : null}{i.damaged && <Badge tone="warn">Damaged</Badge>}</span></div>
        <Submitted files={i.files} code={i.entry.code} />
        <Thumbs photos={photosByEntry[i.entry.code]} canRemove={can} onRemove={removePhoto} />
        {can && ["missing", "storage", "received"].includes(i.state) && <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {i.state === "missing" && <Btn sm v="primary" onClick={() => setFix({ code: i.entry.code, to: "received", note: "", loc: "" })}>It was received</Btn>}
          {["storage", "received"].includes(i.state) && <Btn sm v="ghost" onClick={() => setFix({ code: i.entry.code, to: "missing", note: "", loc: "" })}>Mark missing</Btn>}
        </div>}
      </div>)}
    </div>}

    {(x.boxPhotos.length > 0 || (can && !scheduled)) && <div className="cl-sec"><div className="cl-sh"><b>Box photos ({x.boxPhotos.length})</b><span className="sp" />{can && <PhotoButton collectionId={id} kind="box" onAdded={() => c.reload()} label="Add photos" />}</div>
      {x.boxPhotos.length ? <Thumbs photos={x.boxPhotos} canRemove={can} onRemove={removePhoto} /> : <span className="small faint">No box photos yet.</span>}
    </div>}

    {x.visits.length > 0 && <div className="cl-sec"><div className="cl-sh"><b>Deliveries</b></div>
      {x.visits.map(v => <div key={v.id} className="cl-visit">
        <div className="row between" style={{ gap: 8, flexWrap: "wrap" }}><b>{when(v.at)}</b><span className="small faint">by {v.by_name}</span></div>
        {v.contact_name && <span className="small">Delivered by <b>{v.contact_name}</b>{v.contact_phone ? <> · <a href={`tel:${v.contact_phone.replace(/[^0-9+]/g, "")}`}>{v.contact_phone}</a></> : ""}{v.boxes ? ` · ${v.boxes} box${v.boxes === 1 ? "" : "es"}` : ""}{v.location ? ` · stored in ${v.location}` : ""}</span>}
        {v.note_path && <a className="small link" href={`/api/collections/visits/${v.id}/note`} target="_blank" rel="noreferrer">Delivery confirmation note (PDF)</a>}
        <span className="small faint">{[v.received.length && `${v.received.length} received`, v.missing.length && `${v.missing.length} missing (${v.missing.join(", ")})`, v.later.length && `${v.later.length} not yet`].filter(Boolean).join(" · ") || "Nothing delivered"}</span>
        {v.photos.some(p => p.kind === "box") && <span className="small faint">{v.photos.filter(p => p.kind === "box").length} box photos (above)</span>}
        <Thumbs photos={v.photos.filter(p => p.kind !== "box")} canRemove={can} onRemove={removePhoto} />
      </div>)}
    </div>}

    <Modal open={conf} title="Confirm delivery" onClose={() => setConf(false)} footer={<><Btn onClick={() => setConf(false)}>Back</Btn><Btn v="primary" busy={busy} onClick={handover}>Confirm</Btn></>}>
      <p><b>{received}</b> received{Object.values(dmg).filter(Boolean).length ? ` (${Object.values(dmg).filter(Boolean).length} damaged)` : ""}{missingN ? <>, <b>{missingN}</b> missing: they stay in this collection until the school brings them</> : ""}.</p>
      {received > 0 && <p className="muted">Delivered by {contact.name} ({contact.phone}) in {boxes} box{Number(boxes) === 1 ? "" : "es"}. {boxNew.length} box photo{boxNew.length === 1 ? "" : "s"} and the Emirates ID photo are saved with this delivery, with a confirmation note. The artworks then wait in “To store” for Logistics to shelve them.</p>}
    </Modal>
    <Modal open={!!fix} title={fix?.to === "missing" ? `Mark ${fix?.code} missing?` : `${fix?.code} was received`} sub={fix?.to === "missing" ? "It goes back into this collection until the school brings it." : ""} onClose={() => setFix(null)} footer={<><Btn onClick={() => setFix(null)}>Cancel</Btn><Btn v="primary" busy={busy} disabled={fix?.to === "missing" && !fix?.note.trim()} onClick={correct}>Save</Btn></>}>
      {fix && <div className="stack" style={{ gap: 12 }}>
        {fix.to === "received" && x.items.find(i => i.entry.code === fix.code)?.state === "missing" && <Field label="Stored in"><LocSelect value={fix.loc} onChange={v => setFix({ ...fix, loc: v })} placeholder={col.where ? `Same as the batch (${col.where})` : "Choose room and shelf…"} /></Field>}
        <Field label={fix.to === "missing" ? "What happened?" : "Note (optional)"}><input className="input" value={fix.note} onChange={e => setFix({ ...fix, note: e.target.value })} placeholder={fix.to === "missing" ? "For example: not in the box after all" : "For example: found in the second box"} /></Field>
      </div>}
    </Modal>
  </div>;
}

// Step 2: artworks received at the office wait here until Logistics puts them on a shelf. Each school's pathway is
// stored together (room, shelf, row), or artwork by artwork.
function ToStore({ d, role, onChanged }) {
  const toast = useToast(); const canStore = ["admin", "storage"].includes(role);
  const [where, setWhere] = useState({}); const [split, setSplit] = useState({}); const [one, setOne] = useState({}); const [busy, setBusy] = useState(null);
  if (!d.data) return <Loading error={d.error} />;
  const gs = d.data.groups;
  if (!gs.length) return <Empty title="Nothing to store">Artworks appear here once a school's delivery is confirmed (1. Deliveries).</Empty>;
  async function store(g) {
    setBusy(g.key);
    try {
      const body = split[g.key] ? { action: "store", codes: g.items.filter(i => one[i.code]).map(i => i.code), locations: Object.fromEntries(g.items.filter(i => one[i.code]).map(i => [i.code, one[i.code]])) } : { action: "store", codes: g.items.map(i => i.code), location_id: where[g.key] };
      const r = await api("/api/logistics", { body }); toast(r.note); onChanged();
    } catch (x) { toast(x.message, "err"); } setBusy(null);
  }
  return <div className="stack" style={{ gap: 12 }}>
    <p className="small faint" style={{ margin: 0 }}>{d.data.count} artwork{d.data.count === 1 ? "" : "s"} received at the office and not on a shelf yet.{canStore ? " Choose the room, shelf and row for each school's pathway, then store." : " The Logistics team stores them."}</p>
    {gs.map(g => <section key={g.key} className="card cl-store">
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}><b>{g.school}</b><span className="small faint">{g.esis ? `eSIS ${g.esis} · ` : ""}{g.pathway} · {g.items.length} artwork{g.items.length === 1 ? "" : "s"}{g.collected_on ? ` · delivered ${dshort(g.collected_on)}` : ""}</span><span className="sp" />{canStore && <Btn sm v="ghost" onClick={() => setSplit({ ...split, [g.key]: !split[g.key] })}>{split[g.key] ? "Store them together" : "Split by artwork"}</Btn>}</div>
      <div className="cl-store-items">{g.items.map(i => <div key={i.code} className="cl-store-it"><div className="cl-it"><span className="code">{i.code}</span><span className="t" dir="auto">{i.title}</span><span className="small faint">{[i.sub, i.medium].filter(Boolean).join(" · ")}</span><span className="small"><b>Size:</b> {i.size || <span className="faint">not recorded</span>}</span>{i.damaged && <span><Badge tone="warn">Damaged</Badge></span>}</div>
        <Submitted files={i.files} code={i.code} />
        {canStore && split[g.key] && <LocSelect value={one[i.code] || ""} pathway={g.pathway_code} onChange={v => setOne({ ...one, [i.code]: v })} placeholder="Choose…" />}</div>)}</div>
      {canStore && <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        {!split[g.key] && <div style={{ flex: "1 1 320px" }}><LocSelect value={where[g.key] || ""} pathway={g.pathway_code} onChange={v => setWhere({ ...where, [g.key]: v })} placeholder="Choose…" /></div>}
        <Btn v="primary" busy={busy === g.key} disabled={split[g.key] ? !g.items.some(i => one[i.code]) : !where[g.key]} onClick={() => store(g)}>{split[g.key] ? `Store ${g.items.filter(i => one[i.code]).length}` : `Store ${g.items.length}`}</Btn>
      </div>}
    </section>)}
  </div>;
}
