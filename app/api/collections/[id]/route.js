import { route, body, bad, forbidden } from "@/lib/api";
import { db, q } from "@/lib/db";
import { audit } from "@/lib/audit";
import { loadStructure } from "@/lib/structure";
export const GET = route(["admin", "coordinator", "storage"], async ({ session, params }) => {
  const S = await loadStructure();
  const c = await q(db().from("nae_collections").select("*, school:nae_schools(name, esis, region), loc:nae_locations(room, shelf)").eq("id", params.id).single());
  const items = await q(db().from("nae_logistics").select("*, loc:nae_locations(room, shelf), entry:nae_entries(code, title_en, group_name, size_text, medium, coordinator_id, sub_code)").eq("collection_id", c.id));
  if (session.role === "coordinator" && !items.some(i => i.entry?.coordinator_id === session.sub)) throw forbidden("This collection isn't for your schools.");
  return { collection: { ...c, pathway: S.P[c.pathway_code]?.name, sub: c.sub_code ? (S.P[c.pathway_code]?.subs.find(s => s.code === c.sub_code) || {}).name : null, where: c.loc ? `${c.loc.room} · ${c.loc.shelf}` : null }, items: items.map(i => ({ ...i, where: i.loc ? `${i.loc.room} · ${i.loc.shelf}` : i.location, sub: (S.P[c.pathway_code]?.subs.find(s => s.code === i.entry?.sub_code) || {}).name })) };
});
// schedule | handover. At handover storage marks each artwork received or missing (and damaged), and says
// where the batch is stored; single artworks can go somewhere else.
export const POST = route(["admin", "storage"], async ({ session, params, request }) => {
  const b = await body(request);
  const c = await q(db().from("nae_collections").select("*").eq("id", params.id).single());
  if (b.action === "schedule") { await q(db().from("nae_collections").update({ scheduled_on: b.scheduled_on || null }).eq("id", c.id)); return { ok: true }; }
  if (b.action !== "handover") throw bad("Unknown action.");
  if (c.status !== "scheduled") throw bad("This collection was already checked in.");
  const items = await q(db().from("nae_logistics").select("entry_id, entry:nae_entries(code)").eq("collection_id", c.id));
  const rec = b.received || {};
  if (items.some(i => !rec[i.entry.code])) throw bad("Mark every artwork as received or missing.");
  const anyReceived = items.some(i => rec[i.entry.code] !== "missing");
  const locIds = [b.location_id, ...Object.values(b.locations || {})].filter(Boolean);
  const locs = locIds.length ? await q(db().from("nae_locations").select("id, room, shelf, active").in("id", [...new Set(locIds)])) : [];
  if (anyReceived && !b.location_id) throw bad("Choose where this batch is stored.");
  if (locIds.some(id => !locs.find(l => l.id === id && l.active))) throw bad("Pick an active storage location.");
  const label = id => { const l = locs.find(x => x.id === id); return l ? `${l.room} · ${l.shelf}` : null; };
  let ok = 0, miss = 0, dmg = 0;
  for (const i of items) {
    const code = i.entry.code;
    const st = rec[code] === "missing" ? "missing" : "storage";
    const where = st === "storage" ? ((b.locations || {})[code] || b.location_id) : null;
    const damaged = st === "storage" && !!(b.damaged || {})[code];
    const cond = String((b.conditions || {})[code] || "").trim() || (st === "missing" ? "Missing at collection" : damaged ? "Damaged" : "Good");
    await q(db().from("nae_logistics").update({ state: st, location_id: where, location: label(where), damaged, condition: cond, missing_outcome: st === "missing" ? "collect_later" : null, updated_at: new Date().toISOString() }).eq("entry_id", i.entry_id));
    if (st === "missing") { miss++; await audit(session, "Marked missing at collection", "entry", i.entry_id, c.code); } else { ok++; if (damaged) dmg++; }
  }
  await q(db().from("nae_collections").update({ status: "checked_in", location_id: b.location_id || null, handed_by: b.handed_by || null, checked_in_by: session.sub, checked_in_at: new Date().toISOString() }).eq("id", c.id));
  await audit(session, `Collection checked in (${ok} received${miss ? `, ${miss} missing` : ""}${dmg ? `, ${dmg} damaged` : ""})`, "collection", c.id, `${c.code}${b.location_id ? ` · ${label(b.location_id)}` : ""}`);
  return { ok: true, note: `Checked in ${ok} artwork${ok === 1 ? "" : "s"}${b.location_id ? ` to ${label(b.location_id)}` : ""}${miss ? `. ${miss} marked missing (to collect later).` : "."}` };
});
