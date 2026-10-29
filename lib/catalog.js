import { db, q, all, inChunks } from "@/lib/db";
import { mySessionEntryIds } from "@/lib/perms";

// Shared by the school and student catalogs: artworks with their status and results, and who may see results.
export const ROLES = ["admin", "coordinator", "management", "leadership"];
export const ENTRY_COLS = "id, code, title_en, title_ar, group_name, registration_type, students_count, grades_text, pathway_code, sub_code, current_round, status, files_count, coordinator_id, school_id, school:nae_schools(id, name, esis, region, school_type)";

// Coordinators see results only for artworks they work on (their schools or their sessions), as in Artworks.
export async function resultVisibility(session) {
  if (session.role !== "coordinator") return () => true;
  const own = new Set(await mySessionEntryIds(session));
  return e => e.coordinator_id === session.sub || own.has(e.id);
}

export async function artworkRows(S, session, entries) {
  const ids = entries.map(e => e.id);
  const [res, lg, accs] = await Promise.all([
    inChunks(ids, part => q(db().from("nae_results").select("entry_id, round_no, team, final, grade, passed, complete, scored, needed").in("entry_id", part))),
    inChunks(ids, part => q(db().from("nae_logistics").select("entry_id, state").in("entry_id", part))),
    q(db().from("nae_accounts").select("id, display_name").eq("role", "coordinator"))
  ]);
  const see = await resultVisibility(session);
  return entries.map(e => {
    const show = see(e);
    return { ...e, pathway: S.P[e.pathway_code]?.name, sub: (S.P[e.pathway_code]?.subs.find(s => s.code === e.sub_code) || {}).name,
      coordinator: accs.find(a => a.id === e.coordinator_id)?.display_name || null,
      results: show ? res.filter(r => r.entry_id === e.id) : [], limited: !show,
      logistics: lg.find(l => l.entry_id === e.id)?.state || null };
  }).sort((a, b) => a.code.localeCompare(b.code));
}

export function summarize(rows) {
  const r2 = rows.filter(e => e.current_round === 2).length;
  const passed = rows.filter(e => (e.results || []).some(r => r.round_no === 2 && r.complete && r.passed)).length;
  return { artworks: rows.length, students: rows.reduce((a, e) => a + (e.students_count || 0), 0), round2: r2, passedR2: passed, withdrawn: rows.filter(e => e.status === "withdrawn").length };
}
