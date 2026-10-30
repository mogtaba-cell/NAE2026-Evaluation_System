"use client";
// Session boards: for each scoring session with physical artworks, what is waiting on the shelves, what is in the
// room (by batch) and what was handed back. Storage and the session's coordinator work on the same board; it
// refreshes itself. Print gives a paper pull list in shelf order.
import { useRouter, useSearchParams } from "next/navigation";
import { useApi, useMeta, PageHead, Loading, Btn, Empty, Badge, dshort } from "@/components/ui";
import SessionBoard from "@/components/SessionBoard";

const STATUS = { live: ["In progress", "info"], planned: ["Planned", ""], done: ["Done", "ok"] };
export default function SessionBoards() {
  const sp = useSearchParams(); const router = useRouter(); const meta = useMeta();
  const all = useApi("/api/sessions", [], { live: true });
  const id0 = sp.get("session");
  const board = useApi(id0 ? `/api/sessions/${id0}/board` : null, [], { live: 8000 });
  if (!all.data || !meta?.data) return <Loading error={all.error} />;
  const role = meta.data.me?.role;
  const hasArt = s => Object.values(s.artworks || {}).some(n => n > 0);
  const sessions = all.data.sessions.filter(s => s.status !== "cancelled" && hasArt(s));
  const active = sessions.filter(s => ["planned", "live"].includes(s.status)).sort((a, b) => (a.status === "live" ? 0 : 1) - (b.status === "live" ? 0 : 1) || String(a.session_date || "9").localeCompare(String(b.session_date || "9")));
  const id = id0 || active[0]?.id || sessions[0]?.id;
  if (!id) return <><PageHead title="Session boards" /><Empty title="No sessions with physical artworks">A board appears when a coordinator creates a scoring session with physical Round 2 artworks.</Empty></>;
  if (!id0) { router.replace(`/pull-list?session=${id}`); return <Loading />; }
  const s = all.data.sessions.find(x => x.id === id);
  const rows = board.data?.rows || [];
  const waiting = rows.filter(r => r.lane === "waiting");
  return <>
    <PageHead title="Session boards" sub="Logistics brings each session's artworks into the room in batches and takes each batch back when it's scored. The coordinator sees the same board." actions={<>{s && role !== "storage" && <Btn className="no-print" href={`/sessions/${id}`}>Score sheet</Btn>}<Btn className="no-print" onClick={() => window.print()}>Print pull list</Btn></>} />
    <div className="sess-tabs no-print">{active.map(x => { const a = x.artworks || {}; const room = (a.coordinator || 0) + (a.handed_over || 0), back = a.returning || 0, wait = (a.requested || 0) + (a.picked || 0); return <button key={x.id} type="button" className={`sess-tab${x.id === id ? " on" : ""}`} onClick={() => router.replace(`/pull-list?session=${x.id}`)}>
      <span className="row nowrap" style={{ gap: 6 }}><b>{x.title}</b><Badge tone={STATUS[x.status]?.[1]}>{STATUS[x.status]?.[0]}</Badge></span>
      <span className="small faint">{[x.session_date && dshort(x.session_date), x.time_text, x.venue, x.coordinator].filter(Boolean).join(" · ")}</span>
      <span className="small">{[wait && `${wait} waiting`, room && `${room} in the room`, back && `${back} handed back`].filter(Boolean).join(" · ") || "Nothing to move"}</span>
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
