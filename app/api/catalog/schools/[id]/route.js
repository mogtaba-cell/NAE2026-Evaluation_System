import { route, notFound } from "@/lib/api";
import { db, q, all } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { ROLES, ENTRY_COLS, artworkRows, summarize } from "@/lib/catalog";

// One school's catalog: its artworks in the current program (status, results, where the artwork is) and its students.
export const GET = route(ROLES, async ({ session, params, scope }) => {
  const S = await loadStructure(); const { codes } = await scope(S);
  const school = await q(db().from("nae_schools").select("*").eq("id", params.id).maybeSingle());
  if (!school) throw notFound("School not found.");
  const ents = await all(() => db().from("nae_entries").select(ENTRY_COLS).eq("school_id", school.id).in("pathway_code", codes.length ? codes : ["-"]));
  const rows = await artworkRows(S, session, ents);
  const studs = ents.length ? await all(() => db().from("nae_entry_students").select("entry_id, name_en, name_ar, grade, esis, nationality, gender, consent").in("entry_id", ents.map(e => e.id))) : [];
  const byKey = {};
  studs.forEach(s => { const k = s.esis || `${s.name_en || s.name_ar}`; const g = byKey[k] = byKey[k] || { key: s.esis || null, name_en: s.name_en, name_ar: s.name_ar, grade: s.grade, esis: s.esis, nationality: s.nationality, gender: s.gender, consent: s.consent, codes: [] }; const e = ents.find(x => x.id === s.entry_id); if (e) g.codes.push(e.code); });
  return { school, summary: summarize(rows), rows, students: Object.values(byKey).sort((a, b) => String(a.name_en || a.name_ar).localeCompare(String(b.name_en || b.name_ar))) };
});
