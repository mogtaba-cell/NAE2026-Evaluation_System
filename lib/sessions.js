import { db, q, all, inChunks } from "@/lib/db";
import { bad } from "@/lib/api";
import { isPhysicalRound } from "@/lib/structure";

// Entries waiting for a scoring session in a round. Several sessions can run at once; an entry is in one
// planned or live session at a time, and a fully scored entry is never offered again.
// - Physical artworks (Round 2): must be checked in to storage.
// - Online entries (scored from their files, for example with evaluators who have no login): any entry still
//   to be scored in that round.
export async function sessionPool(S, round) {
  const ENT = "id, code, title_en, pathway_code, sub_code, current_round, status, physical_override, school_id, coordinator_id, school:nae_schools(id, name, esis)";
  const stored = await all(() => db().from("nae_logistics").select(`entry_id, location, loc:nae_locations(room, shelf, label, sort), entry:nae_entries(${ENT})`).eq("state", "storage"));
  const physical = stored.filter(x => x.entry && x.entry.pathway_code === round.pathway_code && x.entry.current_round === round.round_no && isPhysicalRound(S, x.entry, round.round_no));
  const online = (round.status === "open" ? await all(() => db().from("nae_entries").select(ENT).eq("pathway_code", round.pathway_code).eq("current_round", round.round_no).in("status", ["to_score", "in_progress"])) : [])
    .filter(e => !isPhysicalRound(S, e, round.round_no)).map(e => ({ entry_id: e.id, entry: e, online: true }));
  const rows = [...physical, ...online].filter(x => !["withdrawn", "not_scored"].includes(x.entry.status));
  if (!rows.length) return [];
  const links = await inChunks(rows.map(x => x.entry_id), ids => q(db().from("nae_session_entries").select("entry_id, session:nae_sessions(status, round_id)").in("entry_id", ids)));
  const res = await inChunks(rows.map(x => x.entry_id), ids => q(db().from("nae_results").select("entry_id, complete").eq("round_id", round.id).in("entry_id", ids)));
  const done = new Set(res.filter(r => r.complete).map(r => r.entry_id));
  // online entries already given to evaluators with a login are scored from their queues, not in a session
  const onl = rows.filter(x => x.online).map(x => x.entry_id);
  const asg = onl.length ? await inChunks(onl, ids => q(db().from("nae_assignments").select("entry_id").eq("round_id", round.id).in("entry_id", ids))) : [];
  asg.forEach(a => done.add(a.entry_id));
  const busy = new Set(links.filter(l => l.session && l.session.round_id === round.id && ["planned", "live"].includes(l.session.status)).map(l => l.entry_id));
  return rows.filter(x => !busy.has(x.entry_id) && !done.has(x.entry_id));
}

// The order artworks go into a session: physical ones by storage place (room, shelf, row) so Logistics brings
// neighbours in the same batch, then online ones by school.
const placeSort = x => x.loc?.sort ?? 1e9;
export function sessionOrder(list) {
  return [...list].sort((a, b) => (!!a.online - !!b.online) || (!a.online ? placeSort(a) - placeSort(b) : 0) || String(a.entry.school?.name || "").localeCompare(String(b.entry.school?.name || "")) || a.entry.code.localeCompare(b.entry.code));
}
// "Number of artworks": the next n waiting artworks, optionally the coordinator's own first. Physical ones are taken
// in shelf order, so the session's artworks sit close together.
export function takeNext(pool, n, { coordinatorId, mineFirst } = {}) {
  const ordered = sessionOrder(pool);
  const first = mineFirst && coordinatorId ? ordered.filter(x => x.entry.coordinator_id === coordinatorId) : [];
  const rest = ordered.filter(x => !first.includes(x));
  return sessionOrder([...first, ...rest].slice(0, n));
}

export async function saveFraming(entryId, f) {
  const needs = !!f.needs, glass = !!f.needs && !!f.glass;
  // only physical artworks have a logistics record; framing is about them
  await q(db().from("nae_logistics").update({ needs_framing: needs, glass_framing: glass, updated_at: new Date().toISOString() }).eq("entry_id", entryId));
}

// evaluators who enter their own scores: in the team, with a login
export async function selfIds(list, team) {
  const want = [...new Set((Array.isArray(list) ? list : []).filter(x => team.includes(x)))]; if (!want.length) return [];
  const evs = await q(db().from("nae_evaluators").select("id, name, account_id").in("id", want));
  const noLogin = evs.filter(e => !e.account_id); if (noLogin.length) throw bad(`${noLogin.map(e => e.name).join(", ")} ${noLogin.length === 1 ? "has" : "have"} no login yet. Create logins in People and logins first.`);
  return want;
}
