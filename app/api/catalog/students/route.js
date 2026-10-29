import { route } from "@/lib/api";
import { db, q, inChunks } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { ROLES } from "@/lib/catalog";

// Students of the current program, 50 a page, alphabetical. ?q= searches English or Arabic name or ESIS.
const clean = s => String(s || "").trim().replace(/[%,()*]/g, " ").trim();
export const GET = route(ROLES, async ({ url, scope }) => {
  const S = await loadStructure(); const { codes } = await scope(S);
  const term = clean(url.searchParams.get("q")); const page = Math.max(0, parseInt(url.searchParams.get("page")) || 0); const per = 50;
  let qy = db().from("nae_entry_students").select("id, name_en, name_ar, grade, esis, nationality, gender, entry:nae_entries!inner(id, code, pathway_code, status, current_round, school:nae_schools(id, name))", { count: "exact" })
    .in("entry.pathway_code", codes.length ? codes : ["-"]);
  if (term) qy = qy.or(`name_en.ilike.%${term}%,name_ar.ilike.%${term}%,esis.ilike.${term}%`);
  const { data, count, error } = await qy.order("name_en", { ascending: true, nullsFirst: false }).order("esis").range(page * per, page * per + per - 1);
  if (error) throw new Error(error.message);
  // one line per student (a student can be in several artworks)
  const keys = [...new Set(data.map(s => s.esis).filter(Boolean))];
  const more = keys.length ? await inChunks(keys, part => q(db().from("nae_entry_students").select("esis, entry:nae_entries!inner(code, pathway_code)").in("esis", part).in("entry.pathway_code", codes.length ? codes : ["-"]))) : [];
  const seen = new Set(); const rows = [];
  for (const s of data) {
    const k = s.esis || `id:${s.id}`; if (seen.has(k)) continue; seen.add(k);
    const codesOf = s.esis ? [...new Set(more.filter(m => m.esis === s.esis).map(m => m.entry.code))] : [s.entry.code];
    rows.push({ key: k, name_en: s.name_en, name_ar: s.name_ar, grade: s.grade, esis: s.esis, nationality: s.nationality, gender: s.gender, school: s.entry.school, artworks: codesOf });
  }
  return { rows, count, page, per };
});
