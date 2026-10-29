import { route, body, bad, forbidden } from "@/lib/api";
import { db, q } from "@/lib/db";
import { audit } from "@/lib/audit";
import { loadStructure } from "@/lib/structure";
import { logEvents, applyMove } from "@/lib/movements";
import { canWork } from "@/lib/collections";
import { entryFiles } from "@/lib/files";
import { fileView } from "@/lib/entryview";

const PHONE = /^\+?[0-9 ()-]{7,20}$/;
export const GET = route(["admin", "coordinator", "storage"], async ({ session, params }) => {
  const S = await loadStructure();
  const c = await q(db().from("nae_collections").select("*, school:nae_schools(name, esis, region), loc:nae_locations(room, shelf)").eq("id", params.id).single());
  const [items, visits, photos] = await Promise.all([
    q(db().from("nae_logistics").select("*, loc:nae_locations(room, shelf), entry:nae_entries(id, code, title_en, title_ar, group_name, size_text, medium, coordinator_id, sub_code, pathway_code, reference_id, source_path, drive_folder_id, files_checked_at, files_count)").eq("collection_id", c.id)),
    q(db().from("nae_collection_visits").select("*").eq("collection_id", c.id).order("at", { ascending: false })),
    q(db().from("nae_collection_photos").select("id, kind, entry_id, visit_id, at, taken_by_name").eq("collection_id", c.id).order("at"))
  ]);
  if (session.role === "coordinator" && !items.some(i => i.entry?.coordinator_id === session.sub)) throw forbidden("This collection isn't for your schools.");
  const staff = ["admin", "storage", "coordinator"].includes(session.role);
  // the school's submitted photos of each artwork, to compare with what is handed over
  const files = await Promise.all(items.map(i => i.entry ? entryFiles(i.entry).then(fs => fs.map(fileView).filter(f => f.thumb)).catch(() => []) : []));   // coordinators reach this only for their own schools
  const ph = photos.filter(p => staff || p.kind !== "eid").map(p => ({ ...p, url: `/api/collections/photos/${p.id}` }));
  return {
    collection: { ...c, pathway: S.P[c.pathway_code]?.name, sub: c.sub_code ? (S.P[c.pathway_code]?.subs.find(s => s.code === c.sub_code) || {}).name : null, where: c.loc ? `${c.loc.room} · ${c.loc.shelf}` : null },
    items: items.map((i, n) => ({ ...i, files: files[n].slice(0, 8).map(f => ({ name: f.name, kind: f.kind, thumb: f.thumb, big: f.kind === "video" ? f.url : `${f.thumb}?s=1600`, video: f.kind === "video" })), entry: { ...i.entry, source_path: undefined, drive_folder_id: undefined, reference_id: undefined }, where: i.loc ? `${i.loc.room} · ${i.loc.shelf}` : i.location, sub: (S.P[c.pathway_code]?.subs.find(s => s.code === i.entry?.sub_code) || {}).name, photos: ph.filter(p => p.kind === "item" && p.entry_id === i.entry_id) }))
      .sort((a, b) => a.entry.code.localeCompare(b.entry.code)),
    visits: visits.map(v => ({ ...v, contact_phone: staff ? v.contact_phone : null, photos: ph.filter(p => p.visit_id === v.id) })),
    loosePhotos: ph.filter(p => !p.visit_id && p.kind !== "item")
  };
});

// schedule | handover (a visit: some artworks received, some missing, some not yet; who handed them over, their phone,
// a photo of their Emirates ID and photos of the artworks) | correct (after check-in: received <-> missing)
export const POST = route(["admin", "storage", "coordinator"], async ({ session, params, request }) => {
  const b = await body(request);
  const c = await q(db().from("nae_collections").select("*").eq("id", params.id).single());
  await canWork(session, c.id);
  // a coordinator works on their own schools' collections with the same rights as storage there
  const actor = session.role === "coordinator" ? { ...session, role: "storage" } : session;
  if (b.action === "schedule") { await q(db().from("nae_collections").update({ scheduled_on: b.scheduled_on || null }).eq("id", c.id)); return { ok: true }; }

  if (b.action === "correct") {
    const e = await q(db().from("nae_entries").select("id, code").eq("code", b.entry_code).maybeSingle());
    const lg = e ? await q(db().from("nae_logistics").select("state, collection_id").eq("entry_id", e.id).maybeSingle()) : null;
    if (!lg || lg.collection_id !== c.id) throw bad("That artwork is not in this collection.");
    const note = String(b.note || "").trim();
    if (b.to === "missing") {
      if (!note) throw bad("Say what happened (for example: not in the box after all).");
      const r = await applyMove(actor, "missing", [e.id], { note: `Correction after collection: ${note}`, ref_type: "collection", ref_id: c.id });
      if (!r.done.length) throw bad(`It can't be marked missing now (${r.skipped[0]?.why || "it is in use"}).`);
    } else if (b.to === "received") {
      if (!b.location_id && !c.location_id) throw bad("Choose where it is stored.");
      if (lg.state === "to_collect") {   // not collected yet: receive it now
        const loc = await q(db().from("nae_locations").select("id, room, shelf").eq("id", b.location_id || c.location_id).single());
        await q(db().from("nae_logistics").update({ state: "storage", location_id: loc.id, location: `${loc.room} · ${loc.shelf}`, collected_on: new Date().toISOString().slice(0, 10), collected_by: session.name, missing_outcome: null, updated_at: new Date().toISOString() }).eq("entry_id", e.id));
        await logEvents(session, [{ entry_id: e.id, action: "Received later (correction)", from_state: "to_collect", to_state: "storage", location: `${loc.room} · ${loc.shelf}`, note: note || null, ref_type: "collection", ref_id: c.id }]);
      } else {
        const r = await applyMove(actor, "found", [e.id], { location_id: b.location_id || c.location_id, note: note ? `Correction after collection: ${note}` : "Correction after collection: received", ref_type: "collection", ref_id: c.id });
        if (!r.done.length) throw bad(`It can't be marked received (${r.skipped[0]?.why || "not missing"}).`);
      }
    } else throw bad("Choose received or missing.");
    await audit(session, `Collection corrected: ${e.code} marked ${b.to}`, "collection", c.id, note);
    const left = (await q(db().from("nae_logistics").select("entry_id").eq("collection_id", c.id).eq("state", "to_collect"))).length;
    if (!left && c.status === "scheduled") await q(db().from("nae_collections").update({ status: "checked_in", checked_in_by: session.sub, checked_in_at: new Date().toISOString() }).eq("id", c.id));
    return { ok: true, note: `${e.code} marked ${b.to}.` };
  }

  if (b.action !== "handover") throw bad("Unknown action.");
  if (c.status !== "scheduled") throw bad("This collection was already checked in.");
  const items = await q(db().from("nae_logistics").select("entry_id, state, entry:nae_entries(code)").eq("collection_id", c.id).eq("state", "to_collect"));
  const rec = b.received || {};
  const marked = items.filter(i => rec[i.entry.code] === "ok" || rec[i.entry.code] === "missing");
  if (!marked.length) throw bad("Mark at least one artwork as received or missing.");
  const anyReceived = marked.some(i => rec[i.entry.code] === "ok");
  const contact = String(b.contact_name || "").trim(), phone = String(b.contact_phone || "").trim();
  if (anyReceived) {
    if (!contact) throw bad("Enter the name of the school contact who handed the artworks over.");
    if (!PHONE.test(phone)) throw bad("Enter the school contact's phone number (for example 050 123 4567).");
    const eid = await q(db().from("nae_collection_photos").select("id").eq("collection_id", c.id).eq("kind", "eid").is("visit_id", null).in("id", (b.photo_ids || []).length ? b.photo_ids : ["00000000-0000-0000-0000-000000000000"]));
    if (!eid.length) throw bad("Take a photo of the school contact's Emirates ID.");
  }
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
    await q(db().from("nae_logistics").update({ state: st, location_id: where, location: label(where), damaged, condition: cond, collected_on: st === "storage" ? (b.collected_on || today) : null, collected_by: st === "storage" ? session.name : null, missing_outcome: null, updated_at: now }).eq("entry_id", i.entry_id));
    events.push({ entry_id: i.entry_id, action: st === "missing" ? "Missing at collection" : "Collected and received in storage", from_state: "to_collect", to_state: st, location: label(where), handed_by: contact || null, received_by: session.name, note: cond !== "Good" ? cond : null, ref_type: "collection", ref_id: c.id });
    if (st === "missing") miss++; else { ok++; if (damaged) dmg++; }
  }
  await logEvents(session, events);
  const left = items.length - marked.length;
  const visit = await q(db().from("nae_collection_visits").insert({ collection_id: c.id, by_id: session.sub, by_name: session.name, contact_name: contact || null, contact_phone: phone || null,
    received: marked.filter(i => rec[i.entry.code] === "ok").map(i => i.entry.code), missing: marked.filter(i => rec[i.entry.code] === "missing").map(i => i.entry.code),
    later: items.filter(i => !marked.includes(i)).map(i => i.entry.code), location: label(b.location_id), note: String(b.note || "").trim() || null }).select("id").single());
  if ((b.photo_ids || []).length) await q(db().from("nae_collection_photos").update({ visit_id: visit.id }).eq("collection_id", c.id).is("visit_id", null).in("id", b.photo_ids));
  await q(db().from("nae_collections").update({ status: left ? "scheduled" : "checked_in", location_id: b.location_id || c.location_id || null, handed_by: contact || c.handed_by || null, checked_in_by: session.sub, checked_in_at: now }).eq("id", c.id));
  await audit(session, `Collection ${left ? "partly " : ""}checked in (${ok} received${miss ? `, ${miss} missing` : ""}${dmg ? `, ${dmg} damaged` : ""}${left ? `, ${left} still to collect` : ""})`, "collection", c.id, `${c.code}${contact ? ` · handed over by ${contact}` : ""}${b.location_id ? ` · ${label(b.location_id)}` : ""}`);
  return { ok: true, note: `Checked in ${ok} artwork${ok === 1 ? "" : "s"}${b.location_id ? ` to ${label(b.location_id)}` : ""}${miss ? `, ${miss} marked missing` : ""}${left ? `. ${left} still to collect in this batch.` : "."}` };
});
