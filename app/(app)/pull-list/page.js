"use client";
// Session boards: for each scoring session with physical artworks, what is waiting on the shelves, what is in the
// room (by batch) and what was handed back. Storage and the session's coordinator work on the same board; it
// refreshes itself. Print gives a paper pull list in shelf order.
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useApi, useMeta, PageHead, Loading, Btn, Empty, Badge, Seg, dshort } from "@/components/ui";
import { timeText, isOverdue, overdueText } from "@/lib/sessiontime";
import SessionBoard from "@/components/SessionBoard";

const STATUS = { live: ["In progress", "info"], planned: ["Planned", ""], done: ["Done", "ok"] };
export default function SessionBoards() {
  const sp = useSearchParams(); const router = useRouter(); const meta = useMeta();
  const all = useApi("/api/sessions", [], { live: true });
  const id0 = sp.get("session"); const view = sp.get("view") === "plan" ? "plan" : "board";
  const board = useApi(id0 ? `/api/sessions/${id0}/board` : null, [], { live: 8000 });
  const plan = useApi(view === "board" ? "/api/sessions/plan" : null, [], { live: 30000 });
  const strip = sid => plan.data?.sessions?.find(p => p.id === sid);
  if (!all.data || !meta?.data) return <Loading error={all.error} />;
  const role = meta.data.me?.role;
  const hasArt = s => Object.values(s.artworks || {}).some(n => n > 0);
  const sessions = all.data.sessions.filter(s => s.status !== "cancelled" && hasArt(s));
  const active = sessions.filter(s => ["planned", "live"].includes(s.status)).sort((a, b) => (a.status === "live" ? 0 : 1) - (b.status === "live" ? 0 : 1) || String(a.session_date || "9").localeCompare(String(b.session_date || "9")));
  const id = id0 || active[0]?.id || sessions[0]?.id;
  const switcher = <div className="no-print" style={{ margin: "12px 0" }}><Seg value={view} onChange={v => router.replace(v === "plan" ? "/pull-list?view=plan" : "/pull-list")} items={[["plan", "Upcoming moves"], ["board", "Session boards"]]} /></div>;
  if (view === "plan") return <><PageHead title="Session boards" sub="Every upcoming session with physical artworks, soonest first: what to bring, from which shelf, to which venue." actions={<Btn className="no-print" onClick={() => window.print()}>Print</Btn>} />{switcher}<Plan onOpen={sid => router.replace(`/pull-list?session=${sid}`)} /></>;
  if (!id) return <><PageHead title="Session boards" />{switcher}<Empty title="No sessions with physical artworks">A board appears when a coordinator creates a scoring session with physical Round 2 artworks.</Empty></>;
  if (!id0) { router.replace(`/pull-list?session=${id}`); return <Loading />; }
  const s = all.data.sessions.find(x => x.id === id);
  const rows = board.data?.rows || [];
  const waiting = rows.filter(r => r.lane === "waiting");
  return <>
    <PageHead title="Session boards" sub="Logistics brings each session's artworks into the room in batches and takes each batch back when it's scored. The coordinator sees the same board." actions={<>{s && role !== "storage" && <Btn className="no-print" href={`/sessions/${id}`}>Score sheet</Btn>}<Btn className="no-print" onClick={() => window.print()}>Print pull list</Btn></>} />
    {switcher}
    {plan.data?.sessions && <XferAlert sessions={plan.data.sessions} onOpen={sid => router.replace(`/pull-list?session=${sid}`)} />}
    <div className="sess-tabs no-print">{active.map(x => { const a = x.artworks || {}; const room = (a.coordinator || 0) + (a.handed_over || 0), back = a.returning || 0, wait = (a.requested || 0) + (a.picked || 0); return <button key={x.id} type="button" className={`sess-tab${x.id === id ? " on" : ""}`} onClick={() => router.replace(`/pull-list?session=${x.id}`)}>
      <span className="sess-venue">{x.venue || "Venue not set"}</span>
      <span className="small">{[x.session_date && dshort(x.session_date), timeText(x.start_time, x.end_time) || x.time_text].filter(Boolean).join(" · ")}{isOverdue(x) ? <span style={{ color: "var(--bad)" }}> · {overdueText(x)}</span> : ""}</span>
      <span className="row nowrap" style={{ gap: 6 }}><span className="small faint">{x.title}{x.coordinator ? ` · ${x.coordinator}` : ""}</span><Badge tone={STATUS[x.status]?.[1]}>{STATUS[x.status]?.[0]}</Badge></span>
      <span className="small">{[wait && `${wait} waiting`, room && `${room} in the room`, back && `${back} handed back`].filter(Boolean).join(" · ") || "Nothing to move"}</span>
      {(() => { const p = strip(x.id); if (!p?.thumbs?.length) return null; const more = p.total - p.thumbs.length; return <span className="sess-strip" aria-hidden="true">{p.thumbs.map(t => <img key={t.code} src={`${t.thumb}?s=120`} alt="" loading="lazy" title={`${t.code} ${t.title || ""}`} />)}{more > 0 && <span className="more">+{more}</span>}</span>; })()}
    </button>; })}
      {sessions.some(x => x.status === "done") && <select className="select" style={{ width: 220, alignSelf: "center" }} value={active.some(x => x.id === id) ? "" : id} onChange={e => e.target.value && router.replace(`/pull-list?session=${e.target.value}`)}><option value="">Finished sessions…</option>{sessions.filter(x => x.status === "done").map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select>}
    </div>
    <div className="no-print"><SessionBoard key={id} sessionId={id} role={role} /></div>
    <div className="mv-print">
      <h2>Pull list · {s?.title}</h2>
      <p>{[s?.session_date && dshort(s.session_date), s?.time_text, s?.venue, s?.coordinator && `coordinator ${s.coordinator}`].filter(Boolean).join(" · ")}</p>
      <table><thead><tr><th style={{ width: 22 }}>✓</th><th>Where</th><th>Artwork</th><th>School</th><th>Size</th><th>Batch</th></tr></thead>
        <tbody>{waiting.map(r => <tr key={r.code}><td><span className="bx" /></td><td>{r.where || "Not shelved"}</td><td><b>{r.code}</b><br />{r.title}</td><td>{r.school}</td><td>{r.size || ""}</td><td></td></tr>)}</tbody></table>
      <p style={{ marginTop: 16 }}>Handed over by: ____________________ &nbsp; Received by: ____________________ &nbsp; Date and time: ______________</p>
    </div>
  </>;
}

// Upcoming moves: each session (venue on top), and the artworks to bring there, grouped by room and shelf.
function Plan({ onOpen }) {
  const d = useApi("/api/sessions/plan", [], { live: 30000 }); const [big, setBig] = useState(null); const [by, setBy] = useState("place");
  if (!d.data) return <Loading error={d.error} />;
  const ss = d.data.sessions;
  if (!ss.length) return <Empty title="Nothing to move">No planned or live session has physical artworks.</Empty>;
  const toBring = ss.reduce((a, x) => a + x.bring.length, 0);
  return <div className="stack" style={{ gap: 14 }}>
    <div className="row plan-top" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}><p className="small faint" style={{ margin: 0 }}>{ss.length} session{ss.length === 1 ? "" : "s"} · {toBring} artwork{toBring === 1 ? "" : "s"} still to bring{ss.some(x => x.bring.some(r => r.from_venue)) ? " (from the shelves, or from another session's room)" : " from the shelves"}.</p><span className="sp" /><Seg value={by} onChange={setBy} items={[["place", "By storage place"], ["school", "By school"]]} /></div>
    <XferAlert sessions={ss} onOpen={onOpen} />
    <div className="plan-grid">{ss.map(x => { const groups = new Map(); const school = r => `${r.school || "No school"}${r.esis ? ` · eSIS ${r.esis}` : ""}`;
      // by storage place: room · shelf in shelf order (rows inside); by school: each school's artworks together, in shelf order
      const list = by === "school" ? [...x.bring].sort((a, b) => String(a.school).localeCompare(String(b.school)) || a.sort - b.sort || a.code.localeCompare(b.code)) : x.bring;
      list.forEach(r => { const g = by === "school" ? school(r) : r.room ? `${r.room} · ${r.shelf}` : r.from_venue ? `${r.from_venue} (still in the room of ${r.from_title})` : "Not shelved"; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); });
      return <section key={x.id} className={`card plan-card${x.bring.some(r => r.from_venue) ? " has-xfer" : ""}`}>
        <div className="plan-h"><div className="stack s4" style={{ minWidth: 0 }}><span className="plan-venue">{x.venue || "Venue not set"}</span>
          <span className="small">{[x.date && dshort(x.date), timeText(x.start, x.end) || x.time].filter(Boolean).join(" · ")}{isOverdue({ ...x, session_date: x.date, end_time: x.end }) ? <span style={{ color: "var(--bad)" }}> · {overdueText({ ...x, session_date: x.date, end_time: x.end })}</span> : ""}</span>
          <span className="small faint">{x.title} · {x.coordinator}</span></div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}><Badge tone={STATUS[x.status]?.[1]}>{STATUS[x.status]?.[0]}</Badge><span className="small">{[x.bring.length && `${x.bring.length} to bring`, x.room && `${x.room} in the room`, x.back && `${x.back} handed back`].filter(Boolean).join(" · ") || "Nothing to bring"}</span><Btn sm className="no-print" onClick={() => onOpen(x.id)}>Open board</Btn></div></div>
        {[...groups.entries()].map(([g, rs]) => <div key={g} className={`plan-g${rs.some(r => r.from_venue) && by !== "school" ? " xfer" : ""}`}><div className="plan-gh"><b>{by === "school" ? g : `From ${g}`}</b><span className="small faint">→ {x.venue || "the session room"} · {rs.length}</span></div>
          {rs.map(r => <div key={r.code} className={`plan-r${r.from_venue ? " xfer" : ""}`}><span className="bx" /><button type="button" className="sb-th" onClick={() => r.thumb && setBig(r)}>{r.thumb ? <img src={`${r.thumb}?s=120`} alt="" loading="lazy" /> : <span>–</span>}</button>
            <div className="sb-main"><span className="code">{r.code}</span><span className="t" dir="auto">{r.title}</span><span className="m small faint">{[by === "school" ? null : r.school, r.size].filter(Boolean).join(" · ")}</span></div>
            <span className="small strong plan-where">{r.from_venue ? (by === "school" ? `In ${r.from_venue}` : "In that room") : by === "school" ? (r.room ? [r.room, r.shelf, r.row != null && `Row ${r.row}`].filter(Boolean).join(" · ") : r.where || "Not shelved") : r.row != null ? `Row ${r.row}` : r.where || "–"}</span></div>)}</div>)}
        {!x.bring.length && <p className="small faint" style={{ margin: 0 }}>Everything for this session is already in the room or back.</p>}
      </section>; })}</div>
    {big && <div className="no-print" onClick={() => setBig(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}><img src={`${big.thumb}?s=1600`} alt="" style={{ maxWidth: "90vw", maxHeight: "85vh", borderRadius: 8 }} /></div>}
  </div>;
}

// Artworks still in the room of a session that finished with them unscored: Logistics brings them from that room to
// the session they moved to. Shown in red on both views until they are brought.
function XferAlert({ sessions, onOpen }) {
  const list = (sessions || []).map(x => ({ x, rs: x.bring.filter(r => r.from_venue) })).filter(g => g.rs.length);
  if (!list.length) return null;
  const n = list.reduce((a, g) => a + g.rs.length, 0);
  return <div className="banner bad xfer-alert no-print"><div className="stack s4" style={{ flex: 1, minWidth: 0 }}>
    <b>{n} artwork{n === 1 ? "" : "s"} to collect from another session's room</b>
    <span className="small">A session finished with artworks not scored; they moved to another session but are still in the old room. Bring them from there:</span>
    {list.map(({ x, rs }) => { const from = [...new Set(rs.map(r => `${r.from_venue} (${r.from_title})`))].join(", "); return <div key={x.id} className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}><span className="small"><b>{rs.length}</b> from {from} → <b>{x.venue || "venue not set"}</b> · {x.title}</span>{onOpen && <button type="button" className="btn sm" onClick={() => onOpen(x.id)}>Open board</button>}</div>; })}
  </div></div>;
}
