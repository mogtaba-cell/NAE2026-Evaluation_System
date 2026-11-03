"use client";
import { useMemo, useState } from "react";
import { api, useApi, useToast, Card, Btn, Badge, Loading, Modal, Field, Check, Seg, Search, Kpis, when } from "@/components/ui";

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

export function Photography({ canAct }) {
  const d = useApi("/api/curation", [], { live: 30000 }); const toast = useToast();
  const [st, setSt] = useState("todo"); const [q, setQ] = useState(""); const [pw, setPw] = useState(""); const [big, setBig] = useState(null); const [busy, setBusy] = useState(false); const [ask, setAsk] = useState(null);
  const [sel, toggle, clear] = useSel();
  const all = d.data?.rows || [];
  const isTodo = r => !r.photo.done_at && r.state !== "photography", isOut = r => r.state === "photography", isDone = r => !!r.photo.done_at && r.state !== "photography";
  const rows = filt(all.filter(st === "todo" ? isTodo : st === "out" ? isOut : st === "done" ? isDone : () => true), q, pw);
  const groups = useMemo(() => {
    const key = r => st === "out" || st === "done" ? (r.photo.batch ? `Batch ${r.photo.batch}` : "No batch") : (r.where ? r.where.split(" · ").slice(0, 2).join(" · ") : "Not on a shelf");
    const m = new Map(); [...rows].sort((a, b) => (b.photo.batch || 0) - (a.photo.batch || 0) || a.locSort - b.locSort || a.code.localeCompare(b.code)).forEach(r => { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return [...m.entries()];
  }, [rows, st]);
  if (!d.data) return <Loading error={d.error} />;
  const picked = rows.filter(r => sel.has(r.code));
  const canSend = picked.filter(r => ["storage", "showcase"].includes(r.state) && !isOut(r)), canBack = picked.filter(isOut);
  async function move(action, codes) { setBusy(true); try { const r = await api("/api/logistics", { body: { action, codes, note: ask?.note || null } }); toast(r.note); setAsk(null); clear(); d.reload(); } catch (x) { toast(x.message, "err"); } setBusy(false); }
  const cnt = f => all.filter(f).length;
  return <>
    <Kpis dense items={[["Selected artworks", all.length, "physical"], ["To photograph", cnt(isTodo), ""], ["At photography", cnt(isOut), `${new Set(all.filter(isOut).map(r => r.photo.batch)).size} batch(es)`, cnt(isOut) ? "warn" : ""], ["Photographed", cnt(isDone), "", "ok"]]} />
    <Card flush title="Professional photography" sub="Selected artworks are photographed professionally. Send them to the photographer in batches (each batch gets a number and the time), then tick them back when done.">
      <div className="fr-tools">
        <Search value={q} onChange={setQ} placeholder="Code, title, school or place" />
        <Seg value={st} onChange={v => { setSt(v); clear(); }} items={[["todo", `To photograph ${cnt(isTodo)}`], ["out", `At photography ${cnt(isOut)}`], ["done", `Photographed ${cnt(isDone)}`], ["all", "All"]]} />
        {d.data.pathways.length > 1 && <select className="select" style={{ width: 170 }} value={pw} onChange={e => setPw(e.target.value)} aria-label="Pathway"><option value="">All pathways</option>{d.data.pathways.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}</select>}
      </div>
      {canAct && picked.length > 0 && <div className="fr-bar"><b>{picked.length} ticked</b><span className="sp" />
        <Btn sm v="primary" disabled={!canSend.length} onClick={() => setAsk({ action: "to_photo", note: "" })}>Send to photography{canSend.length ? ` (${canSend.length})` : ""}</Btn>
        <Btn sm disabled={!canBack.length} onClick={() => setAsk({ action: "from_photo", note: "" })}>Photographed: back to storage{canBack.length ? ` (${canBack.length})` : ""}</Btn>
        <Btn sm v="ghost" onClick={clear}>Clear</Btn></div>}
      {!groups.length ? <p className="muted" style={{ padding: 16, margin: 0 }}>{all.length ? "Nothing here." : "No selected physical artworks yet. They appear here once Round 2 results are in."}</p> : groups.map(([g, list]) => { const codes = list.map(r => r.code); const on = codes.every(c => sel.has(c));
        const b0 = list[0].photo; return <div key={g} className="fr-g">
          <div className="fr-gh">{canAct && <Check label="" checked={on} onChange={v => toggle(codes, v)} />}<b>{g}</b><span className="small faint">{list.length} artwork{list.length === 1 ? "" : "s"}{(st === "out" || st === "done") && b0.sent_at ? ` · sent ${when(b0.sent_at)}${b0.sent_by ? ` by ${b0.sent_by}` : ""}` : ""}</span></div>
          {list.map(r => <Row key={r.code} r={r} on={sel.has(r.code)} onToggle={v => toggle([r.code], v)} canAct={canAct} onOpen={setBig}>
            <div className="fr-need">{r.pod && <Badge tone="info">POD</Badge>}{r.damaged && <Badge tone="bad">Damaged</Badge>}{isDone(r) ? <Badge tone="ok">Photographed</Badge> : isOut(r) ? <Badge tone="warn">Batch {r.photo.batch}</Badge> : null}</div>
            <div className="fr-where"><b className="small">{isOut(r) ? "At photography" : r.where || "–"}</b><span className="small faint">{r.photo.done_at ? `Done ${when(r.photo.done_at)}${r.photo.done_by ? ` · ${r.photo.done_by}` : ""}` : r.photo.sent_at ? `Sent ${when(r.photo.sent_at)}` : ""}</span></div>
          </Row>)}
        </div>; })}
    </Card>
    <Modal open={!!ask} title={ask?.action === "to_photo" ? `Send ${canSend.length} artwork${canSend.length === 1 ? "" : "s"} to photography` : `${canBack.length} artwork${canBack.length === 1 ? "" : "s"} photographed`} sub={ask?.action === "to_photo" ? "They get the next batch number and today's time." : "They go back to the shelf they came from."} onClose={() => setAsk(null)}
      footer={<><Btn onClick={() => setAsk(null)}>Cancel</Btn><Btn v="primary" busy={busy} onClick={() => move(ask.action, (ask.action === "to_photo" ? canSend : canBack).map(r => r.code))}>Confirm</Btn></>}>
      {ask && <Field label="Note (optional)"><input className="input" value={ask.note} onChange={e => setAsk({ ...ask, note: e.target.value })} placeholder={ask.action === "to_photo" ? "For example: photographer, studio" : "For example: all photos received"} /></Field>}
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

export function Exhibition({ canAct }) {
  const d = useApi("/api/curation", [], { live: 30000 }); const toast = useToast();
  const [st, setSt] = useState("todo"); const [q, setQ] = useState(""); const [pw, setPw] = useState(""); const [big, setBig] = useState(null); const [busy, setBusy] = useState(false); const [ask, setAsk] = useState(null);
  const [sel, toggle, clear] = useSel();
  const all = d.data?.rows || []; const sections = d.data?.sections || [];
  const wallName = id => { for (const s of sections) { const w = s.walls.find(x => x.id === id); if (w) return { section: s.name, wall: w.name, sort: s.sort * 1000 + w.sort }; } return null; };
  const isAt = r => r.state === "exhibition", isTodo = r => !isAt(r);
  const rows = filt(all.filter(st === "todo" ? isTodo : st === "at" ? isAt : () => true), q, pw);
  const groups = useMemo(() => {
    const key = r => isAt(r) ? (wallName(r.wall_id) ? `${wallName(r.wall_id).section} · ${wallName(r.wall_id).wall}` : "Wall not set") : `${r.school}${r.esis ? ` · eSIS ${r.esis}` : ""}`;
    const srt = (a, b) => isAt(a) && isAt(b) ? (wallName(a.wall_id)?.sort ?? 1e9) - (wallName(b.wall_id)?.sort ?? 1e9) || a.code.localeCompare(b.code) : a.school.localeCompare(b.school) || a.code.localeCompare(b.code);
    const m = new Map(); [...rows].sort(srt).forEach(r => { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return [...m.entries()];
  }, [rows, sections]); // eslint-disable-line
  if (!d.data) return <Loading error={d.error} />;
  const picked = rows.filter(r => sel.has(r.code));
  const canTake = picked.filter(r => ["storage", "showcase"].includes(r.state)), canMove = picked.filter(isAt);
  async function move(action, codes, extra = {}) { setBusy(true); try { const r = await api("/api/logistics", { body: { action, codes, ...extra } }); toast(r.note); setAsk(null); clear(); d.reload(); } catch (x) { toast(x.message, "err"); } setBusy(false); }
  const cnt = f => all.filter(f).length;
  return <>
    <Kpis dense items={[["Selected artworks", all.length, "physical"], ["To place", cnt(isTodo), ""], ["At the exhibition", cnt(isAt), "", "ok"], ["Walls", sections.reduce((a, s) => a + s.walls.filter(w => w.active).length, 0), `${sections.filter(s => s.active).length} section(s)`]]} />
    <Card flush title="Exhibition curation" sub="Take selected artworks to the exhibition and record the section and wall each one hangs on. Move them between walls, or back to storage after the exhibition.">
      <div className="fr-tools">
        <Search value={q} onChange={setQ} placeholder="Code, title, school or wall" />
        <Seg value={st} onChange={v => { setSt(v); clear(); }} items={[["todo", `To place ${cnt(isTodo)}`], ["at", `At the exhibition ${cnt(isAt)}`], ["all", "All"]]} />
        {d.data.pathways.length > 1 && <select className="select" style={{ width: 170 }} value={pw} onChange={e => setPw(e.target.value)} aria-label="Pathway"><option value="">All pathways</option>{d.data.pathways.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}</select>}
      </div>
      {canAct && picked.length > 0 && <div className="fr-bar"><b>{picked.length} ticked</b><span className="sp" />
        <Btn sm v="primary" disabled={!canTake.length} onClick={() => setAsk({ action: "to_exhibition", wall: "" })}>Take to the exhibition{canTake.length ? ` (${canTake.length})` : ""}</Btn>
        <Btn sm disabled={!canMove.length} onClick={() => setAsk({ action: "exhibit_move", wall: "" })}>Move to another wall{canMove.length ? ` (${canMove.length})` : ""}</Btn>
        <Btn sm disabled={!canMove.length} onClick={() => setAsk({ action: "from_exhibition" })}>Back to storage{canMove.length ? ` (${canMove.length})` : ""}</Btn>
        <Btn sm v="ghost" onClick={clear}>Clear</Btn></div>}
      {!groups.length ? <p className="muted" style={{ padding: 16, margin: 0 }}>{all.length ? "Nothing here." : "No selected physical artworks yet."}</p> : groups.map(([g, list]) => { const codes = list.map(r => r.code); const on = codes.every(c => sel.has(c));
        return <div key={g} className="fr-g">
          <div className="fr-gh">{canAct && <Check label="" checked={on} onChange={v => toggle(codes, v)} />}<b>{g}</b><span className="small faint">{list.length} artwork{list.length === 1 ? "" : "s"}</span></div>
          {list.map(r => <Row key={r.code} r={r} on={sel.has(r.code)} onToggle={v => toggle([r.code], v)} canAct={canAct} onOpen={setBig}>
            <div className="fr-need">{r.pod && <Badge tone="info">POD</Badge>}{r.photo.done_at ? <Badge tone="ok">Photographed</Badge> : <Badge>Not photographed</Badge>}{r.needs_framing && <Badge>{r.framed ? "Framed" : "Needs framing"}</Badge>}</div>
            <div className="fr-where"><b className="small">{isAt(r) ? (wallName(r.wall_id) ? `${wallName(r.wall_id).section} · ${wallName(r.wall_id).wall}` : "Wall not set") : r.state === "photography" ? "At photography" : r.where || "–"}</b><span className="small faint">{isAt(r) && r.exhibit_at ? `Placed ${when(r.exhibit_at)}${r.exhibit_by ? ` · ${r.exhibit_by}` : ""}` : ""}</span></div>
          </Row>)}
        </div>; })}
    </Card>
    <Walls sections={sections} canAct={canAct} onChanged={d.reload} />
    <Modal open={!!ask} title={ask?.action === "to_exhibition" ? `Take ${canTake.length} artwork${canTake.length === 1 ? "" : "s"} to the exhibition` : ask?.action === "exhibit_move" ? `Move ${canMove.length} artwork${canMove.length === 1 ? "" : "s"}` : `${canMove.length} artwork${canMove.length === 1 ? "" : "s"} back to storage`} sub={ask?.action === "from_exhibition" ? "They go back to the shelf they came from." : "Choose the section, then the wall."} onClose={() => setAsk(null)}
      footer={<><Btn onClick={() => setAsk(null)}>Cancel</Btn><Btn v="primary" busy={busy} disabled={ask?.action !== "from_exhibition" && !ask?.wall} onClick={() => move(ask.action, (ask.action === "to_exhibition" ? canTake : canMove).map(r => r.code), ask.wall ? { wall_id: ask.wall } : {})}>Confirm</Btn></>}>
      {ask && ask.action !== "from_exhibition" && <WallPicker sections={sections} value={ask.wall} onChange={v => setAsk({ ...ask, wall: v })} />}
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
