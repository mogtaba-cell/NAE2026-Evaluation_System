import { route, body, bad, forbidden } from "@/lib/api";
import { db, q } from "@/lib/db";
import { audit } from "@/lib/audit";
import { loadStructure } from "@/lib/structure";
import { logEvents, applyMove } from "@/lib/movements";
import { canWork } from "@/lib/collections";
import { entryFiles } from "@/lib/files";
import { fileView } from "@/lib/entryview";
import { renamePhoto, writeVisitRecord, dayOf, timeOf, storeDoc } from "@/lib/photostore";
import { deliveryNotePdf } from "@/lib/deliverynote";

export const maxDuration = 60;

const PHONE = /^\+?[0-9 ()-]{7,20}$/;
export const GET = route(["admin", "coordinator", "storage"], async ({ session, params }) => {
  const S = await loadStructure();
  const c = await q(db().from("nae_collections").select("*, school:nae_schools(name, esis, region), loc:nae_locations(room, shelf, label)").eq("id", params.id).single());
  const [items, visits, photos] = await Promise.all([
    q(db().from("nae_logistics").select("*, loc:nae_locations(room, shelf, label), entry:nae_entries(id, code, title_en, title_ar, group_name, size_text, medium, coordinator_id, sub_code, pathway_code, pathway_code, reference_id, source_path, drive_folder_id, files_checked_at, files_count)").eq("collection_id", c.id)),
    q(db().from("nae_collection_visits").select("*").eq("collection_id", c.id).order("at", { ascending: false })),
    q(db().from("nae_collection_photos").select("id, kind, entry_id, visit_id, at, taken_by_name").eq("collection_id", c.id).order("at"))
  ]);
  if (session.role === "coordinator" && !items.some(i => i.entry?.coordinator_id === session.sub)) throw forbidden("This collection isn't for your schools.");
  const staff = ["admin", "storage", "coordinator"].includes(session.role);
  // the school's submitted photos of each artwork, to compare with what is handed over
  const files = await Promise.all(items.map(i => i.entry ? entryFiles(i.entry).then(fs => fs.map(fileView).filter(f => f.thumb)).catch(() => []) : []));   // coordinators reach this only for their own schools
  const ph = photos.filter(p => staff || p.kind !== "eid").map(p => ({ ...p, url: `/api/collections/photos/${p.id}` }));
  return {
    collection: { ...c, pathway: c.pathway_code ? S.P[c.pathway_code]?.name : [...new Set(items.map(i => S.P[i.entry?.pathway_code]?.name).filter(Boolean))].join(", "), sub: c.sub_code ? (S.P[c.pathway_code]?.subs.find(s => s.code === c.sub_code) || {}).name : null, where: c.loc ? `${c.loc.label}` : null },
    items: items.map((i, n) => ({ ...i, files: files[n].slice(0, 8).map(f => ({ name: f.name, kind: f.kind, thumb: f.thumb, big: f.kind === "video" ? f.url : `${f.thumb}?s=1600`, video: f.kind === "video" })), entry: { ...i.entry, source_path: undefined, drive_folder_id: undefined, reference_id: undefined }, where: i.loc ? `${i.loc.label}` : i.location, pathway_code: i.entry?.pathway_code, pathway: S.P[i.entry?.pathway_code]?.name, sub: (S.P[i.entry?.pathway_code]?.subs.find(s => s.code === i.entry?.sub_code) || {}).name, photos: ph.filter(p => p.kind === "item" && p.entry_id === i.entry_id) }))
      .sort((a, b) => a.entry.code.localeCompare(b.entry.code)),
    visits: visits.map(v => ({ ...v, contact_phone: staff ? v.contact_phone : null, photos: ph.filter(p => p.visit_id === v.id) })),
    loosePhotos: ph.filter(p => !p.visit_id && p.kind !== "item"),
    boxPhotos: ph.filter(p => p.kind === "box")
  };
});

// schedule | handover (a visit: some artworks received, some missing, some not yet; who handed them over, their phone,
// a photo of their Emirates ID and photos of the boxes, outside and inside) | correct (after check-in: received <-> missing)
export const POST = route(["admin", "storage", "coordinator"], async ({ session, params, request }) => {
  const b = await body(request);
  const S = await loadStructure();
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
      // missing works like "not yet": the artwork goes back to be collected on a later visit
      if (!note) throw bad("Say what happened (for example: not in the box after all).");
      if (!["received", "storage"].includes(lg.state)) throw bad("Only a received artwork can be put back to collect.");
      await q(db().from("nae_logistics").update({ state: "to_collect", location_id: null, location: null, collected_on: null, collected_by: null, updated_at: new Date().toISOString() }).eq("entry_id", e.id));
      await logEvents(session, [{ entry_id: e.id, action: "Not received after all: back to awaiting delivery", from_state: lg.state, to_state: "to_collect", note: `Correction after collection: ${note}`, ref_type: "collection", ref_id: c.id }]);
      if (c.status !== "scheduled") await q(db().from("nae_collections").update({ status: "scheduled" }).eq("id", c.id));
    } else if (b.to === "received") {
      if (lg.state === "to_collect") {   // not collected yet: receive it now (it is stored in the next step)
        await q(db().from("nae_logistics").update({ state: "received", location_id: null, location: null, collected_on: new Date().toISOString().slice(0, 10), collected_by: session.name, missing_outcome: null, updated_at: new Date().toISOString() }).eq("entry_id", e.id));
        await logEvents(session, [{ entry_id: e.id, action: "Received later (correction)", from_state: "to_collect", to_state: "received", note: note || null, ref_type: "collection", ref_id: c.id }]);
      } else {
        if (!b.location_id && !c.location_id) throw bad("Choose where it is stored.");
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
  const items = await q(db().from("nae_logistics").select("entry_id, state, entry:nae_entries(code, pathway_code)").eq("collection_id", c.id).eq("state", "to_collect"));
  const rec = b.received || {};
  // two choices per artwork: received, or missing; a missing one stays in the collection for the next visit
  const marked = items.filter(i => rec[i.entry.code] === "ok");
  const notIn = items.filter(i => rec[i.entry.code] !== "ok");
  if (items.some(i => !["ok", "missing"].includes(rec[i.entry.code]))) throw bad("Mark every artwork as received or missing.");
  const anyReceived = marked.length > 0;
  const contact = String(b.contact_name || "").trim(), phone = String(b.contact_phone || "").trim();
  if (anyReceived) {
    if (!contact) throw bad("Enter the name of the school representative who delivered the artworks.");
    if (!PHONE.test(phone)) throw bad("Enter the school representative's phone number (for example 050 123 4567).");
    const eid = await q(db().from("nae_collection_photos").select("id").eq("collection_id", c.id).eq("kind", "eid").is("visit_id", null).in("id", (b.photo_ids || []).length ? b.photo_ids : ["00000000-0000-0000-0000-000000000000"]));
    if (!eid.length) throw bad("Take a photo of the school representative's Emirates ID.");
    const box = await q(db().from("nae_collection_photos").select("id").eq("collection_id", c.id).eq("kind", "box").is("visit_id", null).in("id", (b.photo_ids || []).length ? b.photo_ids : ["00000000-0000-0000-0000-000000000000"]));
    if (!box.length) throw bad("Take at least one photo of the boxes (outside and inside).");
  }
  // step 1 only receives them at the office; Logistics stores them (room, shelf, row) in step 2
  const boxes = parseInt(b.boxes, 10);
  if (anyReceived && !(boxes > 0 && boxes < 1000)) throw bad("Enter how many boxes the school brought.");
  const today = new Date().toISOString().slice(0, 10), now = new Date().toISOString();
  let ok = 0, dmg = 0; const events = [];
  for (const i of marked) {
    const code = i.entry.code;
    const damaged = !!(b.damaged || {})[code];
    const cond = String((b.conditions || {})[code] || "").trim() || (damaged ? "Damaged" : "Good");
    await q(db().from("nae_logistics").update({ state: "received", location_id: null, location: null, damaged, condition: cond, collected_on: b.collected_on || today, collected_by: session.name, missing_outcome: null, updated_at: now }).eq("entry_id", i.entry_id));
    events.push({ entry_id: i.entry_id, action: "Delivered by the school: received at the office", from_state: "to_collect", to_state: "received", handed_by: contact || null, received_by: session.name, note: cond !== "Good" ? cond : null, ref_type: "collection", ref_id: c.id });
    ok++; if (damaged) dmg++;
  }
  notIn.forEach(i => events.push({ entry_id: i.entry_id, action: "Missing at collection: still to be delivered", from_state: "to_collect", to_state: "to_collect", handed_by: contact || null, note: String((b.conditions || {})[i.entry.code] || "").trim() || null, ref_type: "collection", ref_id: c.id }));
  await logEvents(session, events);
  const miss = notIn.length, left = notIn.length;
  const visit = await q(db().from("nae_collection_visits").insert({ collection_id: c.id, by_id: session.sub, by_name: session.name, contact_name: contact || null, contact_phone: phone || null, boxes: anyReceived ? boxes : null,
    received: marked.map(i => i.entry.code), missing: notIn.map(i => i.entry.code), later: [], location: null, note: String(b.note || "").trim() || null }).select("id").single());
  if ((b.photo_ids || []).length) await q(db().from("nae_collection_photos").update({ visit_id: visit.id }).eq("collection_id", c.id).is("visit_id", null).in("id", b.photo_ids));
  // in the Shared Drive: name the Emirates ID photo after the contact, a plain-text record and the confirmation note (PDF)
  const vPhotos = (b.photo_ids || []).length ? await q(db().from("nae_collection_photos").select("kind, path, mime").eq("visit_id", visit.id)) : [];
  for (const p of vPhotos.filter(p => p.kind === "eid")) await renamePhoto(p.path, `Emirates ID - ${contact || "school representative"}`);
  const school = (await q(db().from("nae_schools").select("name, esis, region").eq("id", c.school_id).maybeSingle())) || {};
  const nowD = new Date();
  const all = await q(db().from("nae_logistics").select("entry_id, state, entry:nae_entries(code, pathway_code)").eq("collection_id", c.id));
  const pwName = code => S.P[code]?.name || "Other";
  const perPathway = Object.values(all.reduce((m, i) => { const k = i.entry?.pathway_code || "?"; const g = m[k] ||= { name: pwName(k), expected: 0, delivered: 0, left: 0 }; g.expected++; if (marked.some(x => x.entry_id === i.entry_id)) g.delivered++; if (i.state === "to_collect") g.left++; return m; }, {})).sort((a, b) => a.name.localeCompare(b.name));
  const titles = await q(db().from("nae_entries").select("code, title_en, group_name").in("code", items.map(i => i.entry.code)));
  const tOf = code => { const t = titles.find(x => x.code === code); return t?.title_en || t?.group_name || ""; };
  await writeVisitRecord({ school, when: nowD, text: [
    `Delivery · ${school.name || ""} (eSIS ${school.esis || "–"})`, `Collection ${c.code}`, `Date ${dayOf(nowD)} ${timeOf(nowD).replace(/-/g, ":")} (UAE)`,
    `Received by ${session.name}`, contact ? `Delivered by ${contact}${phone ? `, ${phone}` : ""}` : "Nothing delivered", anyReceived ? `Boxes: ${boxes}` : "",
    "", `Received at the office (${marked.length}), to be stored:`, ...marked.map(i => `  ${i.entry.code}  ${pwName(i.entry.pathway_code)}${(b.damaged || {})[i.entry.code] ? "  DAMAGED" : ""}${String((b.conditions || {})[i.entry.code] || "").trim() ? `  (${String(b.conditions[i.entry.code]).trim()})` : ""}`),
    "", `Missing, still to be delivered (${notIn.length}):`, ...notIn.map(i => `  ${i.entry.code}  ${pwName(i.entry.pathway_code)}`),
    "", `Photos in this folder: ${vPhotos.filter(p => p.kind === "box").length} of the boxes, ${vPhotos.filter(p => p.kind === "eid").length} Emirates ID.`, b.note ? `Note: ${b.note}` : ""
  ].filter(x => x !== null).join("\n") });
  // the delivery confirmation note (template: "National Art Expressions: Artwork Collection Form")
  if (anyReceived) {
    try {
      const label = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(nowD);
      const pdf = await deliveryNotePdf({ school, collection: c, when: { label }, receivedBy: session.name, contact, phone, boxes, perPathway,
        received: marked.map(i => ({ code: i.entry.code, title: tOf(i.entry.code), pathway: pwName(i.entry.pathway_code), damaged: !!(b.damaged || {})[i.entry.code], condition: String((b.conditions || {})[i.entry.code] || "").trim() || ((b.damaged || {})[i.entry.code] ? "Damaged" : "Good") })),
        missing: notIn.map(i => ({ code: i.entry.code, title: tOf(i.entry.code), pathway: pwName(i.entry.pathway_code) })),
        boxPhotos: vPhotos.filter(p => p.kind === "box").slice(0, 8), eidPhotos: vPhotos.filter(p => p.kind === "eid"), note: String(b.note || "").trim() });
      const path = await storeDoc({ school, when: nowD, name: `Receiving note - ${school.esis || ""} ${school.name || ""}.pdf`, buf: pdf, mime: "application/pdf", id: visit.id });
      await q(db().from("nae_collection_visits").update({ note_path: path }).eq("id", visit.id));
    } catch (e) { console.error("delivery note not made", e.message); }
  }
  await q(db().from("nae_collections").update({ status: left ? "scheduled" : "checked_in", handed_by: contact || c.handed_by || null, checked_in_by: session.sub, checked_in_at: now }).eq("id", c.id));
  await audit(session, `Collection ${left ? (ok ? "partly " : "delivery, nothing ") : ""}checked in (${ok} received${dmg ? `, ${dmg} damaged` : ""}${miss ? `, ${miss} missing: still to be delivered` : ""})`, "collection", c.id, `${c.code}${contact ? ` · delivered by ${contact}` : ""}${anyReceived ? ` · ${boxes} box${boxes === 1 ? "" : "es"}` : ""}`);
  return { ok: true, note: `${ok ? `Received ${ok} artwork${ok === 1 ? "" : "s"}. Store them from Collections → To store` : "Delivery recorded"}${miss ? `. ${miss} missing: still to be delivered.` : "."}` };
});
