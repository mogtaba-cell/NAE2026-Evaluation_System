"use client";
import { useMemo, useState } from "react";
import { api, useApi, useToast, Card, Btn, Badge, Banner, Loading, Modal, Field, Check, Seg, Search, Kpis, download, dshort } from "@/components/ui";
import LocPicker from "@/components/LocPicker";

// Framing for the showcase: every artwork ticked "needs framing", with a photo, what it needs and where it is,
// grouped by school or by storage place, plus a checklist (Excel, with photos) for the framing team.
const STATE = { storage: "In storage", requested: "Waiting for its session", picked: "Picked", handed_over: "Handed over", coordinator: "In the session room", returning: "Handed back", framer: "At the framer", showcase: "Showcase" };
export default function Framing({ canAct }) {
  const d = useApi("/api/framing", [], { live: 30000 }); const toast = useToast();
  const [only, setOnly] = useState("selected"); const [pw, setPw] = useState(""); const [st, setSt] = useState("storage"); const [by, setBy] = useState("school"); const [q, setQ] = useState("");
  const [sel, setSel] = useState(new Set()); const [ask, setAsk] = useState(null); const [busy, setBusy] = useState(false); const [big, setBig] = useState(null);
  const all = d.data?.rows || [];
  const base = all.filter(r => (only === "all" || r.selected) && (!pw || r.pathway_code === pw));
  const inState = r => st === "all" || (st === "storage" ? r.state !== "framer" && !r.framed : st === "framer" ? r.state === "framer" : r.framed);
  const t = q.trim().toLowerCase();
  const rows = base.filter(r => inState(r) && (!t || [r.code, r.title, r.school, r.esis, r.where].some(v => String(v || "").toLowerCase().includes(t))));
  const groups = useMemo(() => {
    const key = r => by === "place" ? (r.where ? r.where.split(" · ").slice(0, 2).join(" · ") : "No storage place") : `${r.school}${r.esis ? ` · eSIS ${r.esis}` : ""}`;
    const sorted = [...rows].sort(by === "place" ? (a, b) => a.locSort - b.locSort || a.code.localeCompare(b.code) : (a, b) => a.school.localeCompare(b.school) || a.code.localeCompare(b.code));
    const m = new Map(); sorted.forEach(r => { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return [...m.entries()];
  }, [rows, by]);
  if (!d.data) return <Loading error={d.error} />;
  const toggle = (codes, on) => { const n = new Set(sel); codes.forEach(c => on ? n.add(c) : n.delete(c)); setSel(n); };
  const picked = rows.filter(r => sel.has(r.code));
  const canSend = picked.filter(r => r.state === "storage"), canBack = picked.filter(r => r.state === "framer");
  async function move(action, extra) { setBusy(true); try { const r = await api("/api/logistics", { body: { action, codes: (action === "to_framer" ? canSend : canBack).map(r => r.code), ...extra } }); toast(r.note); setAsk(null); setSel(new Set()); d.reload(); } catch (e) { toast(e.message, "err"); } setBusy(false); }
  const exportXlsx = () => download(`/api/framing?${new URLSearchParams({ format: "xlsx", only, pathway: pw, state: st, by })}`).catch(e => toast(e.message, "err"));
  const cnt = f => base.filter(f).length;
  return <>
    <Kpis dense items={[["Need framing", cnt(() => true), only === "all" ? "all marked" : "selected artworks"], ["With protective glass", cnt(r => r.glass), "", "warn"], ["To send", cnt(r => r.state !== "framer" && !r.framed), "not at the framer yet"], ["At the framer", cnt(r => r.state === "framer"), "", "brand"], ["Framed", cnt(r => r.framed), "back from the framer", "ok"]]} />
    <Card flush title="Framing for the showcase" sub="Ticked during Round 2 scoring. Check each artwork against its photo, send them in batches and tick them back when framed. The checklist goes to the framing team." right={<Btn v="primary" onClick={exportXlsx}>Export checklist (Excel)</Btn>}>
      <div className="fr-tools">
        <Search value={q} onChange={setQ} placeholder="Code, title, school or place" />
        <Seg value={st} onChange={setSt} items={[["storage", `To send ${cnt(r => r.state !== "framer" && !r.framed)}`], ["framer", `At the framer ${cnt(r => r.state === "framer")}`], ["back", `Framed ${cnt(r => r.framed)}`], ["all", "All"]]} />
        <Seg value={by} onChange={setBy} items={[["school", "By school"], ["place", "By storage place"]]} />
        <select className="select" style={{ width: 170 }} value={pw} onChange={e => setPw(e.target.value)} aria-label="Pathway"><option value="">All pathways</option>{d.data.pathways.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}</select>
        <Check label="Selected artworks only" checked={only === "selected"} onChange={v => setOnly(v ? "selected" : "all")} />
      </div>
      {canAct && picked.length > 0 && <div className="fr-bar"><b>{picked.length} ticked</b><span className="sp" />
        <Btn sm v="primary" disabled={!canSend.length} onClick={() => setAsk({ action: "to_framer", vendor: "", due: "" })}>Send to framer{canSend.length ? ` (${canSend.length})` : ""}</Btn>
        <Btn sm disabled={!canBack.length} onClick={() => setAsk({ action: "from_framer", location_id: "" })}>Back from framer{canBack.length ? ` (${canBack.length})` : ""}</Btn>
        <Btn sm v="ghost" onClick={() => setSel(new Set())}>Clear</Btn></div>}
      {!groups.length ? <p className="muted" style={{ padding: 16, margin: 0 }}>{all.length ? "Nothing here with these filters." : "No artwork has been marked for framing yet. Coordinators tick it while scoring Round 2."}</p> : groups.map(([g, list]) => { const codes = list.map(r => r.code); const on = codes.every(c => sel.has(c)); return <div key={g} className="fr-g">
        <div className="fr-gh">{canAct && <Check label="" checked={on} onChange={v => toggle(codes, v)} />}<b>{g}</b><span className="small faint">{list.length} artwork{list.length === 1 ? "" : "s"}{list.some(r => r.glass) ? ` · ${list.filter(r => r.glass).length} with glass` : ""}</span></div>
        {list.map(r => <div key={r.code} className={`fr-r${sel.has(r.code) ? " on" : ""}`}>
          {canAct ? <Check label="" checked={sel.has(r.code)} onChange={v => toggle([r.code], v)} /> : <span />}
          <button type="button" className="fr-th" onClick={() => r.thumb && setBig(r)} aria-label={`Photo of ${r.code}`}>{r.thumb ? <img src={`${r.thumb}?s=200`} alt="" loading="lazy" /> : <span className="small faint">No photo</span>}</button>
          <div className="fr-main"><span><a className="code" href={`/entries/${r.code}`}>{r.code}</a> <span dir="auto">{r.title}</span></span>
            <span className="small faint">{[r.pathway && `${r.pathway}${r.sub ? ` · ${r.sub}` : ""}`, r.size, r.medium].filter(Boolean).join(" · ")}</span>
            {by === "place" && <span className="small faint">{r.school}</span>}</div>
          <div className="fr-need">{r.glass ? <Badge tone="warn">Frame + protective glass</Badge> : <Badge tone="info">Frame</Badge>}{r.damaged && <Badge tone="bad">Damaged</Badge>}</div>
          <div className="fr-where"><b className="small">{r.where || "–"}</b><span className="small faint">{r.framed ? `Framed${r.back_on ? ` · back ${dshort(r.back_on)}` : ""}` : r.state === "framer" ? `At the framer${r.vendor ? ` (${r.vendor})` : ""}${r.due ? ` · due ${dshort(r.due)}` : ""}` : STATE[r.state] || r.state}</span></div>
        </div>)}
      </div>; })}
    </Card>
    <Modal open={!!ask} title={ask?.action === "to_framer" ? `Send ${canSend.length} artwork${canSend.length === 1 ? "" : "s"} to the framer` : `${canBack.length} artwork${canBack.length === 1 ? "" : "s"} back from the framer`} onClose={() => setAsk(null)}
      footer={<><Btn onClick={() => setAsk(null)}>Cancel</Btn><Btn v="primary" busy={busy} onClick={() => move(ask.action, ask.action === "to_framer" ? { vendor: ask.vendor || null, due: ask.due || null } : { location_id: ask.location_id || null })}>Confirm</Btn></>}>
      {ask && (ask.action === "to_framer" ? <div className="stack" style={{ gap: 12 }}>
        <Field label="Framing company (optional)"><input className="input" value={ask.vendor} onChange={e => setAsk({ ...ask, vendor: e.target.value })} /></Field>
        <Field label="Due back (optional)"><input type="date" className="input" style={{ maxWidth: 200 }} value={ask.due} onChange={e => setAsk({ ...ask, due: e.target.value })} /></Field>
        <p className="small faint" style={{ margin: 0 }}>Tip: export the checklist first and send it with the artworks.</p>
      </div> : <Field label="Store them in" help="Leave the room empty to put each one back where it was."><LocPicker value={ask.location_id} onChange={v => setAsk({ ...ask, location_id: v })} allowEmpty emptyLabel="Back where each was" /></Field>)}
    </Modal>
    <Modal open={!!big} wide title={big ? `${big.code} · ${big.title}` : ""} sub={big ? `${big.school} · ${big.glass ? "Frame + protective glass" : "Frame"}` : ""} onClose={() => setBig(null)} footer={<Btn onClick={() => setBig(null)}>Close</Btn>}>
      {big && <img src={`${big.thumb}?s=1600`} alt="" style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", background: "var(--wash2)", borderRadius: 12 }} />}
    </Modal>
  </>;
}
