import { db, q, all, inChunks } from "@/lib/db";
import { bad } from "@/lib/api";
import { logEvents } from "@/lib/movements";
import { coverThumbs } from "@/lib/covers";

// Display options are chosen for each physical artwork during the physical evaluation. Each one sends the artwork
// to a handling track: framing, printing, production, or "other" (someone decides where it goes). Admins,
// management and coordinators fill in the details and approve; Logistics only sends an approved artwork.
import { DISPLAY, displayLabel, SIZES, sizeLabel } from "@/lib/display";
export { DISPLAY, displayLabel, SIZES, sizeLabel };
// the details each track asks for; "list" fields use the dropdown lists kept in nae_handling_options
export const TRACKS = {
  framing: { label: "Framing", vendor: "framer", fields: [{ key: "material", label: "Frame material", list: "frame_material" }, { key: "color", label: "Frame colour", list: "frame_color" }] },
  printing: { label: "Printing", vendor: "printer", fields: [{ key: "size", label: "Print size", list: "print_size" }, { key: "material", label: "Print material", list: "print_material" }] },
  production: { label: "Production", vendor: "production", fields: [{ key: "description", label: "Description", text: true }] },
  other: { label: "Other", vendor: "", fields: [] }
};
export const LISTS = { frame_material: "Frame material", frame_color: "Frame colour", print_size: "Print size", print_material: "Print material" };
const trackOf = k => DISPLAY.find(d => d.key === k)?.track || null;

// set during the physical evaluation (session sheet or score form): display option, its note and the size class
export async function saveDisplay(session, entryId, { option, note, size_class }) {
  const lg = await q(db().from("nae_logistics").select("entry_id, display_option, display_note, size_class").eq("entry_id", entryId).maybeSingle());
  if (!lg) throw bad("This artwork has no artwork record (it isn't physical).");
  const patch = { updated_at: new Date().toISOString() }; const events = [];
  if (option !== undefined) {
    const opt = option || null; if (opt && !trackOf(opt)) throw bad("Unknown display option.");
    const txt = opt === "other" ? String(note || "").trim().slice(0, 300) : null;
    if (opt === "other" && !txt) throw bad("Add a note for “Other”.");
    const h = await q(db().from("nae_handling").select("*").eq("entry_id", entryId).maybeSingle());
    const track = trackOf(opt);
    if (h && opt !== lg.display_option && ["sent", "back"].includes(h.status)) throw bad("This artwork has already been sent for handling, so its display option can't change.");
    Object.assign(patch, { display_option: opt, display_note: txt, needs_framing: ["frame_glass", "frame_plain", "photo_print"].includes(opt), glass_framing: opt === "frame_glass" });
    if (opt === lg.display_option) { if (h && txt !== h.note) await q(db().from("nae_handling").update({ note: txt, updated_at: patch.updated_at }).eq("entry_id", entryId)); }
    else if (!opt) { if (h && !["sent", "back"].includes(h.status)) await q(db().from("nae_handling").delete().eq("entry_id", entryId)); }
    else if (!h) await q(db().from("nae_handling").insert({ entry_id: entryId, track, status: "draft", updated_by: session.name, note: txt }));
    else if (h.track !== track) await q(db().from("nae_handling").update({ track, status: "draft", details: {}, approved_by: null, approved_at: null, note: txt, updated_by: session.name, updated_at: patch.updated_at }).eq("entry_id", entryId));
    else await q(db().from("nae_handling").update({ note: txt, updated_at: patch.updated_at }).eq("entry_id", entryId));
    if (opt !== lg.display_option || txt !== lg.display_note) events.push(opt ? `Display option: ${displayLabel(opt)}${txt ? ` (${txt})` : ""}` : "Display option cleared");
  }
  if (size_class !== undefined) {
    const sc = size_class || null; if (sc && !SIZES.some(s => s[0] === sc)) throw bad("Unknown size.");
    patch.size_class = sc; if (sc !== lg.size_class) events.push(sc ? `Size: ${sizeLabel(sc)}` : "Size cleared");
  }
  await q(db().from("nae_logistics").update(patch).eq("entry_id", entryId));
  if (events.length) await logEvents(session, events.map(action => ({ entry_id: entryId, action })));
  return events;
}

// every artwork with a display option, with its handling record, where it is and who it belongs to
export async function loadHandling(S, has, { thumbs = true, coordIds = null } = {}) {
  const hs = await all(() => db().from("nae_handling").select("*").order("entry_id"));
  if (!hs.length) return [];
  const ids = hs.map(h => h.entry_id);
  const [lg, res, studs] = await Promise.all([
    inChunks(ids, part => q(db().from("nae_logistics").select("entry_id, state, location, damaged, display_option, display_note, size_class, framing_vendor, framing_due, loc:nae_locations(label, room, shelf, row_no, sort), entry:nae_entries(id, code, reference_id, source_path, title_en, title_ar, group_name, pathway_code, sub_code, size_text, medium, coordinator_id, grades_text, school:nae_schools(id, name, esis))").in("entry_id", part))),
    inChunks(ids, part => q(db().from("nae_results").select("entry_id, complete, passed").eq("round_no", 2).in("entry_id", part))),
    inChunks(ids, part => q(db().from("nae_entry_students").select("entry_id, position, name_en, name_ar, grade").in("entry_id", part).order("position")))
  ]);
  const rows = lg.filter(l => l.entry && has(l.entry.pathway_code) && (!coordIds || coordIds.has(l.entry_id)));
  const th = thumbs ? await coverThumbs(rows.map(l => l.entry)) : {};
  return rows.map(l => {
    const h = hs.find(x => x.entry_id === l.entry_id); const e = l.entry; const p = S.P[e.pathway_code]; const x = res.find(y => y.entry_id === l.entry_id);
    const st = studs.filter(s => s.entry_id === l.entry_id);
    return {
      code: e.code, title: e.title_en || e.title_ar || e.group_name || "", school: e.school?.name || "", esis: e.school?.esis || "", pathway_code: e.pathway_code, pathway: p?.name || "",
      sub: (p?.subs.find(s => s.code === e.sub_code) || {}).name || "", size: e.size_text || "", medium: e.medium || "", coordinator_id: e.coordinator_id,
      students: st.map(s => s.name_en || s.name_ar).filter(Boolean).join(", ") || e.group_name || "", grades: [...new Set(st.map(s => s.grade).filter(Boolean))].join(", ") || e.grades_text || "",
      option: l.display_option, option_label: displayLabel(l.display_option), option_note: l.display_note, size_class: l.size_class,
      track: h.track, details: h.details || {}, status: h.status, approved_by: h.approved_by, approved_at: h.approved_at, updated_by: h.updated_by, updated_at: h.updated_at,
      batch: h.batch, vendor: h.vendor, sent_at: h.sent_at, sent_by: h.sent_by, due: h.due, back_at: h.back_at, back_by: h.back_by, note: h.note,
      state: l.state, where: l.loc?.label || l.location || "", room: l.loc?.room || null, shelf: l.loc?.shelf || null, row: l.loc?.row_no ?? null, locSort: l.loc?.sort ?? 1e9, damaged: !!l.damaged,
      selected: !!(x?.complete && x.passed), scored: !!x?.complete, thumb: th[e.id] || null, entry_id: e.id, reference_id: e.reference_id, source_path: e.source_path
    };
  });
}
