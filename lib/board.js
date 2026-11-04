import { db, q, inChunks } from "@/lib/db";
import { isPhysicalRound } from "@/lib/structure";
import { coverThumbs } from "@/lib/covers";

// The physical artworks of a scoring session and where each one is: waiting on the shelves, in the room (by batch),
// handed back, back on the shelves, missing. Each row has its storage place (room, shelf, row) and a small photo.
export const LANE = st => ["coordinator", "handed_over"].includes(st) ? "room" : st === "returning" ? "back" : ["requested", "picked"].includes(st) ? "waiting" : st === "storage" ? "shelved" : st === "missing" ? "missing" : "other";

export async function boardRows(S, s, { thumbs = true } = {}) {
  const r = S.roundById[s.round_id];
  const links = await q(db().from("nae_session_entries").select("position, entry:nae_entries(id, code, title_en, title_ar, group_name, size_text, medium, pathway_code, sub_code, current_round, physical_override, reference_id, source_path, school:nae_schools(name, esis))").eq("session_id", s.id).order("position"));
  const phys = links.map(l => l.entry).filter(e => isPhysicalRound(S, e, r.round_no));
  const ids = phys.map(e => e.id);
  const [lg, res] = await Promise.all([
    inChunks(ids, part => q(db().from("nae_logistics").select("entry_id, state, batch_no, damaged, condition, handed_at, returned_at, location, loc:nae_locations(room, shelf, row_no, label, sort)").in("entry_id", part))),
    inChunks(ids, part => q(db().from("nae_results").select("entry_id, complete, scored, needed").eq("round_id", r.id).in("entry_id", part)))
  ]);
  const th = thumbs ? await coverThumbs(phys) : {};
  return phys.map(e => {
    const l = lg.find(x => x.entry_id === e.id) || {}; const x = res.find(y => y.entry_id === e.id);
    // an artwork back on the shelves that still needs scores is waiting again
    let lane = LANE(l.state); if (lane === "shelved" && !x?.complete) lane = "waiting";
    return { code: e.code, title: e.title_en || e.title_ar || e.group_name || "", school: e.school?.name || "", esis: e.school?.esis || "", sub: (S.P[e.pathway_code]?.subs.find(t => t.code === e.sub_code) || {}).name, size: e.size_text, state: l.state || null, lane, batch: l.batch_no || null, where: l.loc ? `${l.loc.label}` : l.location || null, room: l.loc?.room || null, shelf: l.loc?.shelf || null, row: l.loc?.row_no ?? null, sort: l.loc?.sort ?? 9999, thumb: th[e.id] || null, damaged: !!l.damaged, scored: !!x?.complete, progress: x ? `${x.scored || 0}/${x.needed || 0}` : "", handed_at: l.handed_at, returned_at: l.returned_at };
  }).sort((a, b) => a.sort - b.sort || String(a.where || "").localeCompare(String(b.where || ""), undefined, { numeric: true }) || a.code.localeCompare(b.code));
}

