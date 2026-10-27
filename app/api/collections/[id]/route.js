import { route, body, bad, forbidden } from "@/lib/api";
import { db, q } from "@/lib/db";
import { audit } from "@/lib/audit";
import { loadStructure } from "@/lib/structure";
import { logEvents } from "@/lib/movements";

export const GET = route(["admin", "coordinator", "storage"], async ({ session, params }) => {
  const S = await loadStructure();
  const c = await q(db().from("nae_collections").select("*, school:nae_schools(name, esis, region), loc:nae_locations(room, shelf)").eq("id", params.id).single());
  const items = await q(db().from("nae_logistics").select("*, loc:nae_locations(room, shelf), entry:nae_entries(code, title_en, group_name, size_text, medium, coordinator_id, sub_code)").eq("collection_id", c.id));
  if (session.role === "coordinator" && !items.some(i => i.entry?.coordinator_id === session.sub)) throw forbidden("This collection isn't for your schools.");
  return { collection: { ...c, pathway: S.P[c.pathway_code]?.name, sub: c.sub_code ? (S.P[c.pathway_code]?.subs.find(s => s.code === c.sub_code) || {}).name : null, where: c.loc ? `${c.loc.room} · ${c.loc.shelf}` : null }, items: items.map(i => ({ ...i, where: i.loc ? `${i.loc.room} · ${i.loc.shelf}` : i.location, sub: (S.P[c.pathway_code]?.subs.find(s => s.code === i.entry?.sub_code) || {}).name })) };
});

// schedule | handover. At handover storage marks each artwork Received, Missing, or Not yet (stays in the batch
// for a later visit), with damage and condition, and says where the batch is stored (single artworks can go
// elsewhere). The collection is checked in once nothing is left to collect.
export const POST = route(["admin", "storage"], async ({ session, params, request }) => {
  const b = await body(request);
  const c = await q(db().from("nae_collections").select("*").eq("id", params.id).single());
  if (b.action === "schedule") { await q(db().from("nae_collections").update({ scheduled_on: b.scheduled_on || null }).eq("id", c.id)); return { ok: true }; }
  if (b.action !== "handover") throw bad("Unknown action.");
  if (c.status !== "scheduled") throw bad("This collection was already checked in.");
  const items = await q(db().from("nae_logistics").select("entry_id, state, entry:nae_entries(code)").eq("collection_id", c.id).eq("state", "to_collect"));
  const rec = b.received || {};
  const marked = items.filter(i => rec[i.entry.code] === "ok" || rec[i.entry.code] === "missing");
  if (!marked.length) throw bad("Mark at least one artwork as received or missing.");
  const anyReceived = marked.some(i => rec[i.entry.code] === "ok");
  const locIds = [b.location_id, ...Object.values(b.locations || {})].filter(Boolean);
  const locs = locIds.length ? await q(db().from("nae_locations").select("id, room, shelf, active").in("id", [...new Set(locIds)])) : [];
  if (anyReceived && !b.location_id && marked.some(i => rec[i.entry.code] === "ok" && !(b.locations || {})[i.entry.code])) throw bad("Choose where this batch is stored.");
  if (locIds.some(id => !locs.find(l => l.id === id && l.active))) throw bad("Pick an active storage location.");
  const label = id => { const l = locs.find(x => x.id === id); return l ? `${l.room} · ${l.shelf}` : null; };
  const today = new Date().toISOString().slice(0, 10), now = new Date().toISOString();
  let ok = 0, miss = 0, dmg = 0; const events = [];
  for (const i of marked) {
    const code = i.entry.code;
    const st = rec[code] === "missing" ? "missing" : "storage";
    const where = st === "storage" ? ((b.locations || {})[code] || b.location_id) : null;
    const damaged = st === "storage" && !!(b.damaged || {})[code];
    const cond = String((b.conditions || {})[code] || "").trim() || (st === "missing" ? "Missing at collection" : damaged ? "Damaged" : "Good");
    await q(db().from("nae_logistics").update({ state: st, location_id: where, location: label(where), damaged, condition: cond, collected_on: st === "storage" ? (b.collected_on || today) : null, collected_by: st === "storage" ? (b.collected_by || session.name) : null, missing_outcome: null, updated_at: now }).eq("entry_id", i.entry_id));
    events.push({ entry_id: i.entry_id, action: st === "missing" ? "Missing at collection" : "Collected and received in storage", from_state: "to_collect", to_state: st, location: label(where), handed_by: b.handed_by || null, received_by: session.name, note: cond !== "Good" ? cond : null, ref_type: "collection", ref_id: c.id });
    if (st === "missing") miss++; else { ok++; if (damaged) dmg++; }
  }
  await logEvents(session, events);
  const left = items.length - marked.length;
  await q(db().from("nae_collections").update({ status: left ? "scheduled" : "checked_in", location_id: b.location_id || c.location_id || null, handed_by: b.handed_by || c.handed_by || null, checked_in_by: session.sub, checked_in_at: now }).eq("id", c.id));
  await audit(session, `Collection ${left ? "partly " : ""}checked in (${ok} received${miss ? `, ${miss} missing` : ""}${dmg ? `, ${dmg} damaged` : ""}${left ? `, ${left} still to collect` : ""})`, "collection", c.id, `${c.code}${b.location_id ? ` · ${label(b.location_id)}` : ""}`);
  return { ok: true, note: `Checked in ${ok} artwork${ok === 1 ? "" : "s"}${b.location_id ? ` to ${label(b.location_id)}` : ""}${miss ? `, ${miss} marked missing` : ""}${left ? `. ${left} still to collect in this batch.` : "."}` };
});
