"use client";
import { useApi, useMeta } from "@/components/ui";
// Venue picker for sessions: the list the admin keeps in Artwork logistics → Session venues.
export default function VenueSelect({ value, onChange, current }) {
  const v = useApi("/api/venues"); const meta = useMeta();
  const list = (v.data?.venues || []).filter(x => x.active || x.id === value);
  const admin = meta?.data?.me?.role === "admin";
  return <>
    <select className="select" value={value || ""} onChange={e => onChange(e.target.value)} aria-label="Venue">
      <option value="">{v.data ? "Not set yet" : "Loading…"}</option>
      {list.map(x => <option key={x.id} value={x.id}>{x.name}{x.capacity ? ` (${x.capacity} seats)` : ""}{x.active ? "" : " (no longer in use)"}</option>)}
      {current && !value && <option disabled>Was: {current}</option>}
    </select>
    {v.data && !list.length && <span className="small faint">{admin ? <>No venues yet. Add them in <a href="/logistics?tab=venues">Artwork logistics → Session venues</a>.</> : "No venues yet. Ask the admin to add them."}</span>}
  </>;
}
