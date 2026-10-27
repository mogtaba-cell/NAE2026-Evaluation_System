"use client";
// Pull list for one session: the artworks storage takes off the shelves, sorted by room and shelf so the store
// is walked once. Tick the whole list or single artworks: picked, handed over, back in storage. Print for paper.
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApi, useMeta, PageHead, Card, Loading, Btn, Empty, Badge, dshort } from "@/components/ui";
import { ArtworkBatch, ArtworkDrawer, SHORT } from "@/components/Movements";

export default function PullList() {
  const sp = useSearchParams(); const router = useRouter(); const meta = useMeta();
  const all = useApi("/api/sessions"); const lg = useApi("/api/logistics");
  const [open, setOpen] = useState(null);
  if (!all.data || !lg.data || !meta?.data) return <Loading error={all.error || lg.error} />;
  const role = meta.data.me?.role;
  const hasArt = s => Object.values(s.artworks || {}).some(n => n > 0);
  const sessions = all.data.sessions.filter(s => s.status !== "cancelled" && hasArt(s));
  const active = sessions.filter(s => ["planned", "live"].includes(s.status));
  const id = sp.get("session") || active[0]?.id || sessions[0]?.id;
  if (!id) return <><PageHead title="Pull lists" /><Empty title="No artworks requested">A pull list appears when a coordinator creates a session with physical Round 2 artworks.</Empty></>;
  const s = all.data.sessions.find(x => x.id === id);
  const rows = lg.data.rows.filter(r => r.session?.id === id || (r.session_id === id))
    .sort((a, b) => a.locSort - b.locSort || String(a.where || "").localeCompare(String(b.where || ""), undefined, { numeric: true }) || a.entry.code.localeCompare(b.entry.code));
  const n = st => rows.filter(r => st.includes(r.state)).length;
  const steps = role === "coordinator" ? ["receive", "send_back"] : ["pick", "unpick", "hand_over", "receive_back", "missing"];
  return <>
    <PageHead title={`Pull list${s ? ` · ${s.title}` : ""}`} sub={s ? [s.session_date && dshort(s.session_date), s.time_text, s.venue, s.coordinator && `coordinator ${s.coordinator}`].filter(Boolean).join(" · ") : ""}
      actions={<><select className="select no-print" style={{ width: 280 }} value={id} onChange={e => router.replace(`/pull-list?session=${e.target.value}`)}>
        {active.length > 0 && <optgroup label="Planned and live">{active.map(x => <option key={x.id} value={x.id}>{x.title}{x.session_date ? ` · ${dshort(x.session_date)}` : ""}</option>)}</optgroup>}
        {sessions.some(x => x.status === "done") && <optgroup label="Done">{sessions.filter(x => x.status === "done").map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</optgroup>}
      </select>{role !== "storage" && <Btn className="no-print" href={`/sessions/${id}`}>Session</Btn>}<Btn className="no-print" onClick={() => window.print()}>Print</Btn></>} />
    <div className="mv-pipe no-print">
      {[["Requested", ["requested"]], ["Picked", ["picked"]], ["Handed over", ["handed_over"]], ["With coordinator", ["coordinator"]], ["Returning", ["returning"]], ["Back in storage", ["storage"]], ["Missing", ["missing"]]].map(([l, st]) => <span key={l} className="chip" style={{ cursor: "default" }}>{l}<span className="n">{n(st)}</span></span>)}
    </div>
    <div className="mv-screen"><Card flush title={`Artworks · ${rows.length}`} sub={role === "coordinator" ? "Confirm what storage handed to you, and hand artworks back when they are scored." : "Tick the whole list or single artworks. Mark them picked as you take them off the shelf, then hand them over. When they come back, receive them into storage."}>
      <ArtworkBatch rows={rows} role={role} steps={steps} sessionId={id} onDone={lg.reload} onOpen={setOpen} empty="No physical artworks in this session." />
    </Card></div>
    <div className="mv-print">
      <table><thead><tr><th style={{ width: 22 }}>✓</th><th>Where</th><th>Artwork</th><th>School</th><th>Size</th><th>Status</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.entry.code}><td><span className="bx" /></td><td>{r.where || "Not shelved"}</td><td><b>{r.entry.code}</b><br />{r.entry.title_en || r.entry.group_name || ""}</td><td>{r.entry.school?.name}</td><td>{r.entry.size_text || ""}</td><td>{SHORT[r.state]}{r.damaged ? " · damaged" : ""}</td></tr>)}</tbody></table>
      <p style={{ marginTop: 16 }}>Handed over by: ____________________ &nbsp; Received by: ____________________ &nbsp; Date and time: ______________</p>
    </div>
    {open && <ArtworkDrawer row={open} role={role} onClose={() => setOpen(null)} onChanged={lg.reload} />}
  </>;
}
