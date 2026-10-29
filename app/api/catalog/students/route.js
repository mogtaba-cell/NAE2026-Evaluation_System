import { route } from "@/lib/api";
import { db, q, all, inChunks } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { ROLES } from "@/lib/catalog";

// Students of the current program, 50 a page. ?q= searches English or Arabic name or ESIS.
// Filters: school, pathway, grade, nationality, gender, consent (yes/no), r2 (artworks through to Round 2).
// Sort: name (A-Z / Z-A) or grade. ?facets=1 returns the values to filter by.
const clean = s => String(s || "").trim().replace(/[%,()*]/g, " ").trim();
export const GET = route(ROLES, async ({ url, scope }) => {
  const S = await loadStructure(); const { codes } = await scope(S);
  const p = Object.fromEntries(url.searchParams);
  const inProg = codes.length ? codes : ["-"];
  if (p.facets) {
    const rows = await all(() => db().from("nae_entry_students").select("grade, nationality, gender, entry:nae_entries!inner(pathway_code, school:nae_schools(id, name))").in("entry.pathway_code", inProg), 1000);
    const u = f => [...new Set(rows.map(f).filter(Boolean))];
    const gradeKey = g => { const n = parseInt(String(g).replace(/\D/g, "")); return isNaN(n) ? (/kg/i.test(g) ? -1 : 99) : n; };
    return { grades: u(r => r.grade).sort((a, b) => gradeKey(a) - gradeKey(b) || a.localeCompare(b)), nationalities: u(r => r.nationality).sort(), genders: u(r => r.gender).sort(),
      schools: Object.values(Object.fromEntries(rows.filter(r => r.entry?.school).map(r => [r.entry.school.id, r.entry.school]))).sort((a, b) => a.name.localeCompare(b.name)),
      pathways: [...new Set(rows.map(r => r.entry.pathway_code))].map(c => ({ code: c, name: S.P[c]?.name })).filter(x => x.name) };
  }
  const term = clean(p.q); const page = Math.max(0, parseInt(p.page) || 0); const per = 50;
  let qy = db().from("nae_entry_students").select("id, name_en, name_ar, grade, esis, nationality, gender, consent, entry:nae_entries!inner(id, code, pathway_code, school_id, status, current_round, school:nae_schools(id, name))", { count: "exact" })
    .in("entry.pathway_code", p.pathway ? [p.pathway].filter(x => inProg.includes(x)) : inProg);
  if (term) qy = qy.or(`name_en.ilike.%${term}%,name_ar.ilike.%${term}%,esis.ilike.${term}%`);
  if (p.school) qy = qy.eq("entry.school_id", p.school);
  if (p.grade) qy = qy.eq("grade", p.grade);
  if (p.nationality) qy = qy.eq("nationality", p.nationality);
  if (p.gender) qy = qy.eq("gender", p.gender);
  if (p.consent === "yes") qy = qy.eq("consent", true);
  if (p.consent === "no") qy = qy.or("consent.is.null,consent.eq.false");
  if (p.r2 === "yes") qy = qy.eq("entry.current_round", 2);
  if (p.r2 === "no") qy = qy.eq("entry.current_round", 1);
  const desc = p.dir === "desc";
  qy = p.sort === "grade" ? qy.order("grade", { ascending: !desc, nullsFirst: false }).order("name_en", { ascending: true }) : qy.order("name_en", { ascending: !desc, nullsFirst: false });
  const { data, count, error } = await qy.order("esis").range(page * per, page * per + per - 1);
  if (error) throw new Error(error.message);
  // one line per student (a student can be in several artworks)
  const keys = [...new Set(data.map(s => s.esis).filter(Boolean))];
  const more = keys.length ? await inChunks(keys, part => q(db().from("nae_entry_students").select("esis, entry:nae_entries!inner(code, pathway_code, current_round)").in("esis", part).in("entry.pathway_code", inProg))) : [];
  const seen = new Set(); const rows = [];
  for (const s of data) {
    const k = s.esis || `id:${s.id}`; if (seen.has(k)) continue; seen.add(k);
    const mine = s.esis ? more.filter(m => m.esis === s.esis).map(m => m.entry) : [s.entry];
    const codesOf = [...new Set(mine.map(m => m.code))];
    rows.push({ key: k, name_en: s.name_en, name_ar: s.name_ar, grade: s.grade, esis: s.esis, nationality: s.nationality, gender: s.gender, consent: s.consent, school: s.entry.school, artworks: codesOf, round2: mine.filter(m => m.current_round === 2).length });
  }
  return { rows, count, page, per };
});
