import { route, notFound } from "@/lib/api";
import { db, q } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { ROLES, ENTRY_COLS, artworkRows, summarize } from "@/lib/catalog";

// One student's catalog: who they are and every artwork they are part of in the current program. The key is the
// student's ESIS, or id:<row> for a student without one.
export const GET = route(ROLES, async ({ session, params, scope }) => {
  const S = await loadStructure(); const { codes } = await scope(S);
  const key = decodeURIComponent(params.key);
  const qy = db().from("nae_entry_students").select("*, entry:nae_entries!inner(id, pathway_code)").in("entry.pathway_code", codes.length ? codes : ["-"]);
  const studs = await q(key.startsWith("id:") ? qy.eq("id", key.slice(3)) : qy.eq("esis", key));
  if (!studs.length) throw notFound("Student not found in this program.");
  const ents = await q(db().from("nae_entries").select(ENTRY_COLS).in("id", [...new Set(studs.map(s => s.entry_id))]));
  const rows = await artworkRows(S, session, ents);
  const s = studs[0];
  return { student: { name_en: s.name_en, name_ar: s.name_ar, grade: s.grade, esis: s.esis, nationality: s.nationality, gender: s.gender, consent: studs.some(x => x.consent), school: ents[0]?.school || null }, summary: summarize(rows), rows };
});
