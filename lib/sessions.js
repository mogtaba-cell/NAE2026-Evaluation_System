import { db, q, all, inChunks } from "@/lib/db";
import { isPhysicalRound } from "@/lib/structure";

// Artworks in storage that are waiting for a session in a round: physical, in Round 2, not in a planned or
// live session, and not already fully scored in a finished one. Several sessions can run at once.
export async function sessionPool(S, round) {
  const rows = (await all(() => db().from("nae_logistics").select("entry_id, location, loc:nae_locations(room, shelf), entry:nae_entries(id, code, title_en, pathway_code, sub_code, current_round, status, physical_override, school_id, coordinator_id, school:nae_schools(id, name, esis))").eq("state", "storage")))
    .filter(x => x.entry && x.entry.pathway_code === round.pathway_code && x.entry.current_round === round.round_no && isPhysicalRound(S, x.entry, round.round_no) && !["withdrawn", "not_scored"].includes(x.entry.status));
  if (!rows.length) return [];
  const links = await inChunks(rows.map(x => x.entry_id), ids => q(db().from("nae_session_entries").select("entry_id, session:nae_sessions(status, round_id)").in("entry_id", ids)));
  const res = await inChunks(rows.map(x => x.entry_id), ids => q(db().from("nae_results").select("entry_id, complete").eq("round_id", round.id).in("entry_id", ids)));
  const done = new Set(res.filter(r => r.complete).map(r => r.entry_id));
  const busy = new Set(links.filter(l => l.session && l.session.round_id === round.id && ["planned", "live"].includes(l.session.status)).map(l => l.entry_id));
  return rows.filter(x => !busy.has(x.entry_id) && !done.has(x.entry_id));
}

export async function saveFraming(entryId, f) {
  const needs = !!f.needs, glass = !!f.needs && !!f.glass;
  // only physical artworks have a logistics record; framing is about them
  await q(db().from("nae_logistics").update({ needs_framing: needs, glass_framing: glass, updated_at: new Date().toISOString() }).eq("entry_id", entryId));
}
