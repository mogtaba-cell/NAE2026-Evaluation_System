"use client";
import { useEffect, useMemo, useState } from "react";
import { useApi } from "@/components/ui";

// Storage place: room, then shelf, then row. value/onChange carry the row's location id.
// pathway: open on a room tagged with that pathway (Logistics can still pick any room).
export default function LocPicker({ value, onChange, pathway, allowEmpty, emptyLabel = "Same place", compact }) {
  const d = useApi("/api/locations");
  const rooms = useMemo(() => (d.data?.rooms || []).filter(r => r.active).map(r => ({ ...r, shelves: r.shelves.filter(s => s.active).map(s => ({ ...s, slots: s.slots.filter(x => x.active) })).filter(s => s.slots.length) })).filter(r => r.shelves.length), [d.data]);
  const at = useMemo(() => { for (const r of rooms) for (const s of r.shelves) { const x = s.slots.find(x => x.id === value); if (x) return { room: r.id, shelf: s.id }; } return null; }, [rooms, value]);
  const tagged = pathway ? rooms.find(r => (r.pathways || []).includes(pathway)) : null;
  const [room, setRoom] = useState(""); const [shelf, setShelf] = useState("");
  useEffect(() => { if (at) { setRoom(at.room); setShelf(at.shelf); } else if (!value && !room && tagged) setRoom(tagged.id); }, [at, tagged?.id]);   // eslint-disable-line
  const R = rooms.find(r => r.id === room), S = R?.shelves.find(s => s.id === shelf);
  if (!d.data) return <span className="small faint">Loading places…</span>;
  if (!rooms.length) return <span className="small faint">No storage rooms yet. Add them in Artwork logistics → Storage locations.</span>;
  const sel = (label, val, set, opts, ph) => <label className={`lp-f${val ? "" : " blank"}`}><small>{label}</small>
    <select className="select" value={val} onChange={e => set(e.target.value)} aria-label={label}><option value="">{ph}</option>{opts}</select></label>;
  return <div className={`lp${compact ? " compact" : ""}`}>
    {sel("Room", room, v => { setRoom(v); setShelf(""); onChange(""); }, rooms.map(r => <option key={r.id} value={r.id}>{r.name}{(r.pathways || []).length ? ` · ${r.pathways.join(", ")}` : ""}</option>), allowEmpty ? emptyLabel : "Choose…")}
    {sel("Shelf", shelf, v => { setShelf(v); onChange(""); }, (R?.shelves || []).map(s => <option key={s.id} value={s.id}>{s.name} · {s.count} stored</option>), R ? "Choose…" : "–")}
    {sel("Row", S ? value || "" : "", v => onChange(v), (S?.slots || []).map(x => <option key={x.id} value={x.id}>Row {x.row}{x.count ? ` · ${x.count} stored` : " · empty"}</option>), S ? "Choose…" : "–")}
  </div>;
}
