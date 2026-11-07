"use client";
import { useMemo, useState } from "react";
import { api, useApi, useToast, Card, Btn, Badge, Loading, Modal, Field, Check, Seg, Search, Kpis, when, download } from "@/components/ui";
import Planner from "@/components/Planner";

// Selected artworks after Round 2: professional photography (sent in numbered batches and ticked back, with times)
// and the exhibition (each artwork placed on a wall of a section). Both lists show a photo of each artwork.
function useSel() {
  const [sel, setSel] = useState(new Set());
  const toggle = (codes, on) => setSel(s => { const n = new Set(s); codes.forEach(c => on ? n.add(c) : n.delete(c)); return n; });
  return [sel, toggle, () => setSel(new Set())];
}
function Thumb({ r, onOpen }) {
  return <button type="button" className="fr-th" onClick={() => r.thumb && onOpen(r)} aria-label={`Photo of ${r.code}`}>{r.thumb ? <img src={`${r.thumb}?s=200`} alt="" loading="lazy" /> : <span className="small faint">No photo</span>}</button>;
}
function Big({ r, onClose }) {
  return <Modal open={!!r} wide title={r?.code} sub={r ? `${r.title} · ${r.school}` : ""} onClose={onClose} footer={<Btn onClick={onClose}>Close</Btn>}>{r?.thumb && <img src={`${r.thumb}?s=1600`} alt="" style={{ width: "100%", borderRadius: 8 }} />}</Modal>;
}
function Row({ r, on, onToggle, canAct, onOpen, children }) {
  return <div className={`fr-r${on ? " on" : ""}`}>
    {canAct ? <Check label="" checked={on} onChange={onToggle} /> : <span />}
    <Thumb r={r} onOpen={onOpen} />
    <div className="fr-main"><span><a className="code" href={`/entries/${r.code}`}>{r.code}</a> <span dir="auto">{r.title}</span></span>
      <span className="small faint">{[r.pathway && `${r.pathway}${r.sub ? ` · ${r.sub}` : ""}`, r.size, r.school].filter(Boolean).join(" · ")}</span></div>
    {children}
  </div>;
}
const filt = (rows, q, pw) => { const t = q.trim().toLowerCase(); return rows.filter(r => (!pw || r.pathway_code === pw) && (!t || [r.code, r.title, r.school, r.esis, r.where].some(v => String(v || "").toLowerCase().includes(t)))); };

export function Photography() {
  const d = useApi("/api/photography", [], { live: 30000 }); const toast = useToast();
  const [st, setSt] = useState("todo"); const [by, setBy] = useState("school"); const [q, setQ] = useState(""); const [pw, setPw] = useState(""); const [only, setOnly] = useState(false);
  const [big, setBig] = useState(null); const [busy, setBusy] = useState(false); const [ask, setAsk] = useState(null); const [gal, setGal] = useState(null);
  const [sel, toggle, clear] = useSel();
  const all0 = d.data?.rows || []; const all = only ? all0.filter(r => r.selected) : all0;
  const isTodo = r => !r.photo.done_at && r.state !== "photography", isOut = r => r.state === "photography", isDone = r => !!r.photo.done_at && r.state !== "photography";
  const rows = filt(all.filter(st === "todo" ? isTodo : st === "out" ? isOut : st === "done" ? isDone : () => true), q, pw);
  const grp = (st === "out" || st === "done") ? by : ["batch", "space"].includes(by) ? "school" : by;
  const groups = useMemo(() => {
    const key = r => grp === "batch" ? (r.photo.batch ? `Batch ${r.photo.batch}${r.photo.space ? ` · ${r.photo.space}` : ""}` : "No batch") : grp === "space" ? (r.photo.space || "Space not set") : grp === "place" ? (r.room ? `${r.room} · ${r.shelf}` : "Not on a shelf") : `${r.school}${r.esis ? ` · eSIS ${r.esis}` : ""}`;
    const srt = grp === "batch" ? (a, b) => (b.photo.batch || 0) - (a.photo.batch || 0) || a.code.localeCompare(b.code) : grp === "place" ? (a, b) => a.locSort - b.locSort || a.code.localeCompare(b.code) : grp === "space" ? (a, b) => String(a.photo.space).localeCompare(String(b.photo.space)) || a.code.localeCompare(b.code) : (a, b) => a.school.localeCompare(b.school) || a.code.localeCompare(b.code);
    const m = new Map(); [...rows].sort(srt).forEach(r => { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return [...m.entries()];
  }, [rows, grp]);
  if (!d.data) return <Loading error={d.error} />;
  const canAct = d.data.canAct; const spaces = d.data.plan?.spaces || [];
  const picked = rows.filter(r => sel.has(r.code));
  const canSend = picked.filter(r => ["storage", "showcase"].includes(r.state) && !isOut(r)), canBack = picked.filter(isOut);
  async function move(action, codes, extra = {}) { setBusy(true); try { const r = await api("/api/logistics", { body: { action, codes, note: ask?.note || null, ...extra } }); toast(r.note); setAsk(null); clear(); d.reload(); } catch (x) { toast(x.message, "err"); } setBusy(false); }
  async function act(action) { setBusy(action); try { const r = await api("/api/photography", { body: { action } }); toast(r.note); d.reload(); } catch (x) { toast(x.message, "err"); } setBusy(false); }
  const exportX = (extra = {}) => download(`/api/photography?${new URLSearchParams({ format: "xlsx", by: grp === "place" ? "place" : "school", status: st, ...(only ? { only: "selected" } : {}), ...extra })}`).catch(e => toast(e.message, "err"));
  const cnt = f => all.filter(f).length;
  const batches = [...new Set(all.filter(r => r.photo.batch).map(r => r.photo.batch))].sort((a, b) => b - a);
  const sc = d.data.scan;
  return <>
    <Planner kind="photography" plan={d.data.plan} stats={d.data.planned?.stats} alerts={d.data.planned?.alerts} canSet={canAct}
      onSave={async p => { const r = await api("/api/photography", { body: { action: "save_plan", ...p } }); toast(r.note); d.reload(); }} />
    <Kpis dense items={[["Physical artworks", all.length, only ? "selected only" : "to photograph professionally"], ["To photograph", cnt(isTodo), ""], ["At photography", cnt(isOut), `${new Set(all.filter(isOut).map(r => r.photo.batch)).size} batch(es)`, cnt(isOut) ? "warn" : ""], ["Photographed", cnt(isDone), `${cnt(r => r.photos.length > 0)} with photos in the Drive`, "ok"]]} />
    <Card flush title="Professional photography" sub="Send artworks to a space in numbered batches, export each space's checklist, and tick them back when photographed. The photography team saves the photos in 06 Uploads / Photography / <eSIS> - <School>, named by the artwork code (CODE-A, CODE-B … for more than one)."
      right={<Btn v="primary" onClick={() => exportX()}>Export checklist</Btn>}>
      <div className="row ph-actions">{canAct && <Btn sm busy={busy === "make_folders"} onClick={() => act("make_folders")}>Make Drive folders</Btn>}
        {canAct && <Btn sm busy={busy === "scan"} onClick={() => act("scan")}>Check for photos</Btn>}
        {spaces.length > 0 && <select className="select" style={{ width: 200 }} value="" onChange={e => e.target.value && exportX({ space: e.target.value })} aria-label="Export a space's checklist"><option value="">Checklist for a space…</option>{spaces.map(s => <option key={s} value={s}>{s}</option>)}</select>}
        {batches.length > 0 && <select className="select" style={{ width: 140 }} value="" onChange={e => e.target.value && exportX({ batch: e.target.value })} aria-label="Export a batch"><option value="">A batch…</option>{batches.map(b => <option key={b} value={b}>Batch {b}</option>)}</select>}
        </div>
      {sc && <p className="small faint" style={{ margin: "0 16px 8px" }}>Photos last checked {when(sc.at)}: {sc.linked} linked to artworks{sc.unmatched ? `, ${sc.unmatched} not named by an artwork code` : ""}.{sc.unmatched_names?.length > 0 && <details style={{ display: "inline" }}><summary className="link" style={{ display: "inline", cursor: "pointer" }}> See them</summary>{sc.unmatched_names.join(" · ")}</details>}</p>}
      <div className="fr-tools">
        <Search value={q} onChange={setQ} placeholder="Code, title, school or place" />
        <Seg value={st} onChange={v => { setSt(v); clear(); }} items={[["todo", `To photograph ${cnt(isTodo)}`], ["out", `At photography ${cnt(isOut)}`], ["done", `Photographed ${cnt(isDone)}`], ["all", "All"]]} />
        <Seg value={by} onChange={setBy} items={[["school", "By school"], ["place", "By storage place"], ...(st === "out" || st === "done" ? [["batch", "By batch"], ["space", "By space"]] : [])]} />
        {d.data.pathways.length > 1 && <select className="select" style={{ width: 170 }} value={pw} onChange={e => setPw(e.target.value)} aria-label="Pathway"><option value="">All pathways</option>{d.data.pathways.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}</select>}
        <Check label="Selected artworks only" checked={only} onChange={setOnly} />
      </div>
      {canAct && picked.length > 0 && <div className="fr-bar"><b>{picked.length} ticked</b><span className="sp" />
        <Btn sm v="primary" disabled={!canSend.length} onClick={() => setAsk({ action: "to_photo", note: "", space: spaces[0] || "" })}>Send to photography{canSend.length ? ` (${canSend.length})` : ""}</Btn>
        <Btn sm disabled={!canBack.length} onClick={() => setAsk({ action: "from_photo", note: "" })}>Photographed: back to storage{canBack.length ? ` (${canBack.length})` : ""}</Btn>
        <Btn sm v="ghost" onClick={clear}>Clear</Btn></div>}
      {!groups.length ? <p className="muted" style={{ padding: 16, margin: 0 }}>{all.length ? "Nothing here." : "No physical artworks in storage yet."}</p> : groups.map(([g, list]) => { const codes = list.map(r => r.code); const on = codes.every(c => sel.has(c));
        const b0 = list[0].photo; return <div key={g} className="fr-g">
          <div className="fr-gh">{canAct && <Check label="" checked={on} onChange={v => toggle(codes, v)} />}<b>{g}</b><span className="small faint">{list.length} artwork{list.length === 1 ? "" : "s"}{grp === "batch" && b0.sent_at ? ` · sent ${when(b0.sent_at)}${b0.sent_by ? ` by ${b0.sent_by}` : ""}` : ""}</span>
            {grp === "batch" && b0.batch && <><span className="sp" /><Btn sm v="ghost" onClick={() => exportX({ batch: b0.batch })}>Export batch</Btn></>}
            {grp === "space" && b0.space && st === "out" && <><span className="sp" /><Btn sm v="ghost" onClick={() => exportX({ space: b0.space })}>Export checklist</Btn></>}</div>
          {list.map(r => <Row key={r.code} r={r} on={sel.has(r.code)} onToggle={v => toggle([r.code], v)} canAct={canAct} onOpen={setBig}>
            <div className="fr-need">{r.pod && <Badge tone="info">POD</Badge>}{r.damaged && <Badge tone="bad">Damaged</Badge>}{isDone(r) ? <Badge tone="ok">Photographed</Badge> : isOut(r) ? <Badge tone="warn">Batch {r.photo.batch}{r.photo.space ? ` · ${r.photo.space}` : ""}</Badge> : null}
              {r.photos.length > 0 && <button type="button" className="chip on" onClick={() => setGal(r)}>{r.photos.length} photo{r.photos.length === 1 ? "" : "s"}</button>}</div>
            <div className="fr-where"><b className="small">{isOut(r) ? `At photography${r.photo.space ? ` · ${r.photo.space}` : ""}` : r.where || "–"}</b><span className="small faint">{r.photo.done_at ? `Done ${when(r.photo.done_at)}${r.photo.done_by ? ` · ${r.photo.done_by}` : ""}` : r.photo.sent_at ? `Sent ${when(r.photo.sent_at)}` : ""}</span></div>
          </Row>)}
        </div>; })}
    </Card>
    <Modal open={!!ask} title={ask?.action === "to_photo" ? `Send ${canSend.length} artwork${canSend.length === 1 ? "" : "s"} to photography` : `${canBack.length} artwork${canBack.length === 1 ? "" : "s"} photographed`} sub={ask?.action === "to_photo" ? "They get the next batch number and today's time." : "They go back to the shelf they came from."} onClose={() => setAsk(null)}
      footer={<><Btn onClick={() => setAsk(null)}>Cancel</Btn><Btn v="primary" busy={busy === true} disabled={ask?.action === "to_photo" && spaces.length > 0 && !ask?.space} onClick={() => move(ask.action, (ask.action === "to_photo" ? canSend : canBack).map(r => r.code), ask.action === "to_photo" ? { space: ask.space || null } : {})}>Confirm</Btn></>}>
      {ask && <div className="stack" style={{ gap: 12 }}>
        {ask.action === "to_photo" && (spaces.length ? <Field label="Space" help="Where this batch is photographed. Each space has its own checklist."><select className="select" value={ask.space} onChange={e => setAsk({ ...ask, space: e.target.value })}>{spaces.map(s => <option key={s} value={s}>{s}</option>)}</select></Field> : <p className="small faint" style={{ margin: 0 }}>Set the photography plan to choose a space for each batch.</p>)}
        <Field label="Note (optional)"><input className="input" value={ask.note} onChange={e => setAsk({ ...ask, note: e.target.value })} placeholder={ask.action === "to_photo" ? "For example: photographer" : "For example: all photos taken"} /></Field></div>}
    </Modal>
    <Modal open={!!gal} wide title={gal ? `${gal.code} · professional photos` : ""} sub={gal ? `${gal.title} · ${gal.school} · ${gal.folder}` : ""} onClose={() => setGal(null)} footer={<Btn onClick={() => setGal(null)}>Close</Btn>}>
      {gal && <div className="ph-gal">{gal.photos.map(f => <a key={f.id} href={`/api/photography/file?id=${encodeURIComponent(f.id)}`} target="_blank" rel="noreferrer"><img src={`/api/photography/file?id=${encodeURIComponent(f.id)}&s=600`} alt={f.name} loading="lazy" /><span className="small">{f.name}</span></a>)}</div>}
    </Modal>
    <Big r={big} onClose={() => setBig(null)} />
  </>;
}

function WallPicker({ sections, value, onChange }) {
  const act = sections.filter(s => s.active).map(s => ({ ...s, walls: s.walls.filter(w => w.active) })).filter(s => s.walls.length);
  const sec = act.find(s => s.walls.some(w => w.id === value))?.id || "";
  const [s0, setS0] = useState(sec);
  const S = act.find(s => s.id === (s0 || sec));
  if (!act.length) return <span className="small faint">No sections with walls yet. Add them below (Exhibition sections and walls).</span>;
  return <div className="lp"><label className="lp-f"><small>Section</small><select className="select" value={s0 || sec} onChange={e => { setS0(e.target.value); onChange(""); }}><option value="">Choose…</option>{act.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <label className="lp-f"><small>Wall</small><select className="select" value={value || ""} onChange={e => onChange(e.target.value)}><option value="">{S ? "Choose…" : "–"}</option>{(S?.walls || []).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label></div>;
}

// group selected artworks by school, storage place, batch or wall
function groupRows(rows, by, wallName) {
  const key = r => by === "place" ? (r.room ? `${r.room} · ${r.shelf}` : r.where || "Not on a shelf") : by === "batch" ? (r.sent?.batch ? `Batch ${r.sent.batch}` : "No batch") : by === "wall" ? (wallName(r.wall_id) ? `${wallName(r.wall_id).section} · ${wallName(r.wall_id).wall}` : "Not placed yet") : `${r.school}${r.esis ? ` · eSIS ${r.esis}` : ""}`;
  const srt = by === "place" ? (a, b) => a.locSort - b.locSort || a.code.localeCompare(b.code) : by === "batch" ? (a, b) => (b.sent?.batch || 0) - (a.sent?.batch || 0) || a.code.localeCompare(b.code) : by === "wall" ? (a, b) => (wallName(a.wall_id)?.sort ?? 1e9) - (wallName(b.wall_id)?.sort ?? 1e9) || a.code.localeCompare(b.code) : (a, b) => a.school.localeCompare(b.school) || a.code.localeCompare(b.code);
  const m = new Map(); [...rows].sort(srt).forEach(r => { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return [...m.entries()];
}
const wallNamer = sections => id => { for (const s of sections) { const w = s.walls.find(x => x.id === id); if (w) return { section: s.name, wall: w.name, sort: s.sort * 1000 + w.sort }; } return null; };

// Exhibition, step 1: selected artworks sent out of the office to the exhibition site (numbered batches), and back
export function ExhibitionDispatch({ canAct }) {
  const d = useApi("/api/curation", [], { live: 30000 }); const toast = useToast();
  const [st, setSt] = useState("todo"); const [by, setBy] = useState("school"); const [q, setQ] = useState(""); const [pw, setPw] = useState(""); const [big, setBig] = useState(null); const [busy, setBusy] = useState(false); const [ask, setAsk] = useState(null);
  const [sel, toggle, clear] = useSel();
  const all = d.data?.rows || []; const wallName = wallNamer(d.data?.sections || []);
  const isAt = r => r.state === "exhibition", isTodo = r => !isAt(r) && !r.sent?.at, isBack = r => !isAt(r) && !!r.sent?.at;
  const rows = filt(all.filter(st === "todo" ? isTodo : st === "at" ? isAt : st === "back" ? isBack : () => true), q, pw);
  const grp = by === "batch" && st === "todo" ? "school" : by;
  const groups = useMemo(() => groupRows(rows, grp, wallName), [rows, grp, d.data]); // eslint-disable-line
  if (!d.data) return <Loading error={d.error} />;
  const picked = rows.filter(r => sel.has(r.code));
  const canSend = picked.filter(r => ["storage", "showcase"].includes(r.state)), canBack = picked.filter(isAt);
  async function move(action, codes) { setBusy(true); try { const r = await api("/api/logistics", { body: { action, codes, note: ask?.note || null } }); toast(r.note); setAsk(null); clear(); d.reload(); } catch (x) { toast(x.message, "err"); } setBusy(false); }
  const cnt = f => all.filter(f).length;
  return <>
    <Kpis dense items={[["Selected artworks", all.length, "physical"], ["To send", cnt(isTodo), "still at the office"], ["At the exhibition site", cnt(isAt), `${cnt(r => isAt(r) && r.wall_id)} placed on a wall`, "brand"], ["Back", cnt(isBack), "returned to storage", "ok"]]} />
    <Card flush title="Exhibition: sending artworks to the site" sub="Send selected artworks out of the office to the exhibition site in numbered batches, and record them back in storage after the exhibition. Placing them on walls is in Exhibition: curation.">
      <div className="fr-tools">
        <Search value={q} onChange={setQ} placeholder="Code, title, school or place" />
        <Seg value={st} onChange={v => { setSt(v); clear(); }} items={[["todo", `To send ${cnt(isTodo)}`], ["at", `At the site ${cnt(isAt)}`], ["back", `Back ${cnt(isBack)}`], ["all", "All"]]} />
        <Seg value={by} onChange={setBy} items={[["school", "By school"], ["place", "By storage place"], ...(st !== "todo" ? [["batch", "By batch"]] : [])]} />
        {d.data.pathways.length > 1 && <select className="select" style={{ width: 170 }} value={pw} onChange={e => setPw(e.target.value)} aria-label="Pathway"><option value="">All pathways</option>{d.data.pathways.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}</select>}
      </div>
      {canAct && picked.length > 0 && <div className="fr-bar"><b>{picked.length} ticked</b><span className="sp" />
        <Btn sm v="primary" disabled={!canSend.length} onClick={() => setAsk({ action: "to_exhibition", note: "" })}>Send to the exhibition site{canSend.length ? ` (${canSend.length})` : ""}</Btn>
        <Btn sm disabled={!canBack.length} onClick={() => setAsk({ action: "from_exhibition", note: "" })}>Back to storage{canBack.length ? ` (${canBack.length})` : ""}</Btn>
        <Btn sm v="ghost" onClick={clear}>Clear</Btn></div>}
      {!groups.length ? <p className="muted" style={{ padding: 16, margin: 0 }}>{all.length ? "Nothing here." : "No selected physical artworks yet."}</p> : groups.map(([g, list]) => { const codes = list.map(r => r.code); const on = codes.every(c => sel.has(c));
        return <div key={g} className="fr-g">
          <div className="fr-gh">{canAct && <Check label="" checked={on} onChange={v => toggle(codes, v)} />}<b>{g}</b><span className="small faint">{list.length} artwork{list.length === 1 ? "" : "s"}{grp === "batch" && list[0].sent?.at ? ` · sent ${when(list[0].sent.at)}${list[0].sent.by ? ` by ${list[0].sent.by}` : ""}` : ""}</span></div>
          {list.map(r => <Row key={r.code} r={r} on={sel.has(r.code)} onToggle={v => toggle([r.code], v)} canAct={canAct} onOpen={setBig}>
            <div className="fr-need">{r.pod && <Badge tone="info">POD</Badge>}{r.photo.done_at ? <Badge tone="ok">Photographed</Badge> : <Badge>Not photographed</Badge>}{isAt(r) && <Badge tone="brand">Batch {r.sent?.batch || "–"}</Badge>}</div>
            <div className="fr-where"><b className="small">{isAt(r) ? (wallName(r.wall_id) ? `${wallName(r.wall_id).section} · ${wallName(r.wall_id).wall}` : "At the site, not placed") : r.state === "photography" ? "At photography" : r.state === "framer" ? "At the framer" : r.where || "–"}</b><span className="small faint">{r.sent?.at ? `Sent ${when(r.sent.at)}` : ""}</span></div>
          </Row>)}
        </div>; })}
    </Card>
    <Modal open={!!ask} title={ask?.action === "to_exhibition" ? `Send ${canSend.length} artwork${canSend.length === 1 ? "" : "s"} to the exhibition site` : `${canBack.length} artwork${canBack.length === 1 ? "" : "s"} back to storage`} sub={ask?.action === "to_exhibition" ? "They get the next batch number and today's time." : "They go back to the shelf they came from."} onClose={() => setAsk(null)}
      footer={<><Btn onClick={() => setAsk(null)}>Cancel</Btn><Btn v="primary" busy={busy} onClick={() => move(ask.action, (ask.action === "to_exhibition" ? canSend : canBack).map(r => r.code))}>Confirm</Btn></>}>
      {ask && <Field label="Note (optional)"><input className="input" value={ask.note} onChange={e => setAsk({ ...ask, note: e.target.value })} placeholder="For example: van, driver" /></Field>}
    </Modal>
    <Big r={big} onClose={() => setBig(null)} />
  </>;
}

// Exhibition, step 2: curation of the artworks at the site: the section and wall each one is placed on
export function Exhibition({ canAct }) {
  const d = useApi("/api/curation", [], { live: 30000 }); const toast = useToast();
  const [st, setSt] = useState("todo"); const [by, setBy] = useState("school"); const [q, setQ] = useState(""); const [pw, setPw] = useState(""); const [big, setBig] = useState(null); const [busy, setBusy] = useState(false); const [ask, setAsk] = useState(null);
  const [sel, toggle, clear] = useSel();
  const all = (d.data?.rows || []).filter(r => r.state === "exhibition"); const sections = d.data?.sections || []; const wallName = wallNamer(sections);
  const isPlaced = r => !!r.wall_id, isTodo = r => !r.wall_id;
  const rows = filt(all.filter(st === "todo" ? isTodo : st === "placed" ? isPlaced : () => true), q, pw);
  const grp = st === "todo" && by === "wall" ? "school" : by;
  const groups = useMemo(() => groupRows(rows, grp, wallName), [rows, grp, sections]); // eslint-disable-line
  if (!d.data) return <Loading error={d.error} />;
  const picked = rows.filter(r => sel.has(r.code));
  async function move(codes, wall) { setBusy(true); try { const r = await api("/api/logistics", { body: { action: "exhibit_move", codes, wall_id: wall } }); toast(r.note); setAsk(null); clear(); d.reload(); } catch (x) { toast(x.message, "err"); } setBusy(false); }
  const cnt = f => all.filter(f).length;
  return <>
    <Kpis dense items={[["At the exhibition site", all.length, "sent from the office"], ["To place", cnt(isTodo), "", cnt(isTodo) ? "warn" : ""], ["Placed", cnt(isPlaced), "", "ok"], ["Walls", sections.reduce((a, s) => a + s.walls.filter(w => w.active).length, 0), `${sections.filter(s => s.active).length} section(s)`]]} />
    <Card flush title="Exhibition curation" sub="Artworks that arrived at the exhibition site. Record the section and wall each one is placed on, and move them between walls.">
      <div className="fr-tools">
        <Search value={q} onChange={setQ} placeholder="Code, title, school or wall" />
        <Seg value={st} onChange={v => { setSt(v); clear(); }} items={[["todo", `To place ${cnt(isTodo)}`], ["placed", `Placed ${cnt(isPlaced)}`], ["all", "All"]]} />
        <Seg value={by} onChange={setBy} items={[["school", "By school"], ["place", "By storage place"], ...(st !== "todo" ? [["wall", "By wall"]] : [])]} />
        {d.data.pathways.length > 1 && <select className="select" style={{ width: 170 }} value={pw} onChange={e => setPw(e.target.value)} aria-label="Pathway"><option value="">All pathways</option>{d.data.pathways.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}</select>}
      </div>
      {canAct && picked.length > 0 && <div className="fr-bar"><b>{picked.length} ticked</b><span className="sp" />
        <Btn sm v="primary" onClick={() => setAsk({ wall: "" })}>{picked.every(isPlaced) ? "Move to another wall" : "Place on a wall"} ({picked.length})</Btn>
        <Btn sm v="ghost" onClick={clear}>Clear</Btn></div>}
      {!groups.length ? <p className="muted" style={{ padding: 16, margin: 0 }}>{all.length ? "Nothing here." : "No artworks at the exhibition site yet. Send them in Exhibition: sending."}</p> : groups.map(([g, list]) => { const codes = list.map(r => r.code); const on = codes.every(c => sel.has(c));
        return <div key={g} className="fr-g">
          <div className="fr-gh">{canAct && <Check label="" checked={on} onChange={v => toggle(codes, v)} />}<b>{g}</b><span className="small faint">{list.length} artwork{list.length === 1 ? "" : "s"}</span></div>
          {list.map(r => <Row key={r.code} r={r} on={sel.has(r.code)} onToggle={v => toggle([r.code], v)} canAct={canAct} onOpen={setBig}>
            <div className="fr-need">{r.pod && <Badge tone="info">POD</Badge>}{r.needs_framing && <Badge>{r.framed ? "Framed" : "Needs framing"}</Badge>}</div>
            <div className="fr-where"><b className="small">{wallName(r.wall_id) ? `${wallName(r.wall_id).section} · ${wallName(r.wall_id).wall}` : "Not placed yet"}</b><span className="small faint">{r.exhibit_at ? `Placed ${when(r.exhibit_at)}${r.exhibit_by ? ` · ${r.exhibit_by}` : ""}` : r.where ? `Shelf: ${r.where}` : ""}</span></div>
          </Row>)}
        </div>; })}
    </Card>
    <Walls sections={sections} canAct={canAct} onChanged={d.reload} />
    <Modal open={!!ask} title={`Place ${picked.length} artwork${picked.length === 1 ? "" : "s"}`} sub="Choose the section, then the wall." onClose={() => setAsk(null)}
      footer={<><Btn onClick={() => setAsk(null)}>Cancel</Btn><Btn v="primary" busy={busy} disabled={!ask?.wall} onClick={() => move(picked.map(r => r.code), ask.wall)}>Confirm</Btn></>}>
      {ask && <WallPicker sections={sections} value={ask.wall} onChange={v => setAsk({ ...ask, wall: v })} />}
    </Modal>
    <Big r={big} onClose={() => setBig(null)} />
  </>;
}

function Walls({ sections, canAct, onChanged }) {
  const toast = useToast(); const [ns, setNs] = useState(""); const [nw, setNw] = useState({});
  async function go(body) { try { const r = await api("/api/curation", { body }); toast(r.note); onChanged(); return true; } catch (x) { toast(x.message, "err"); return false; } }
  return <Card title="Exhibition sections and walls" sub={canAct ? "Set up the exhibition once: its sections, and the walls in each. Rename them or take them out of use." : "Set up by Logistics."}>
    {sections.length ? <div className="stack" style={{ gap: 10 }}>{sections.map(s => <div key={s.id} className="rm-card">
      <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>{canAct ? <input className="input" style={{ maxWidth: 260 }} defaultValue={s.name} onBlur={e => e.target.value.trim() && e.target.value.trim() !== s.name && go({ action: "update_section", id: s.id, name: e.target.value })} aria-label="Section name" /> : <b>{s.name}</b>}
        <span className="small faint">{s.walls.length} wall{s.walls.length === 1 ? "" : "s"}</span><span className="sp" />{canAct && <Check label="In use" checked={s.active} onChange={v => go({ action: "update_section", id: s.id, active: v })} />}</div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>{s.walls.map(w => <span key={w.id} className="row nowrap" style={{ gap: 4 }}>{canAct ? <input className="input" style={{ width: 150, height: 32, opacity: w.active ? 1 : .55 }} defaultValue={w.name} onBlur={e => e.target.value.trim() && e.target.value.trim() !== w.name && go({ action: "update_wall", id: w.id, name: e.target.value })} aria-label="Wall name" /> : <Badge>{w.name}</Badge>}{canAct && <Btn sm v="ghost" title={w.active ? "Take out of use" : "Use again"} onClick={() => go({ action: "update_wall", id: w.id, active: !w.active })}>{w.active ? "×" : "↺"}</Btn>}</span>)}
        {canAct && <span className="row nowrap" style={{ gap: 4 }}><input className="input" style={{ width: 150, height: 32 }} placeholder="New wall (e.g. Wall A)" value={nw[s.id] || ""} onChange={e => setNw({ ...nw, [s.id]: e.target.value })} /><Btn sm disabled={!(nw[s.id] || "").trim()} onClick={async () => { if (await go({ action: "add_wall", section_id: s.id, name: nw[s.id] })) setNw({ ...nw, [s.id]: "" }); }}>Add wall</Btn></span>}</div>
    </div>)}</div> : <p className="muted" style={{ margin: 0 }}>No sections yet.</p>}
    {canAct && <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><input className="input" style={{ maxWidth: 260 }} placeholder="New section (e.g. Hall 1, Visual Arts)" value={ns} onChange={e => setNs(e.target.value)} /><Btn disabled={!ns.trim()} onClick={async () => { if (await go({ action: "add_section", name: ns })) setNs(""); }}>Add section</Btn></div>}
  </Card>;
}
