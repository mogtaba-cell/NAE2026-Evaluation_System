import { route } from "@/lib/api";
import { db, q, all, inChunks } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { ROLES } from "@/lib/catalog";

// Every school with artworks in the current program, with counts. ?q= filters by name, eSIS, region or type.
export const GET = route(ROLES, async ({ url, scope }) => {
  const S = await loadStructure(); const { codes } = await scope(S);
  const term = String(url.searchParams.get("q") || "").trim().toLowerCase();
  const ents = await all(() => db().from("nae_entries").select("id, school_id, pathway_code, current_round, status, students_count").in("pathway_code", codes.length ? codes : ["-"]));
  const passed = new Set((await inChunks(ents.filter(e => e.current_round === 2).map(e => e.id), part => q(db().from("nae_results").select("entry_id").eq("round_no", 2).eq("complete", true).eq("passed", true).in("entry_id", part)))).map(r => r.entry_id));
  const schools = await inChunks([...new Set(ents.map(e => e.school_id))], part => q(db().from("nae_schools").select("id, name, esis, region, school_type").in("id", part)));
  const rows = schools.map(s => {
    const mine = ents.filter(e => e.school_id === s.id);
    return { ...s, artworks: mine.length, students: mine.reduce((a, e) => a + (e.students_count || 0), 0), round2: mine.filter(e => e.current_round === 2).length, passedR2: mine.filter(e => passed.has(e.id)).length,
      pathways: [...new Set(mine.map(e => e.pathway_code))].map(c => S.P[c]?.name).filter(Boolean) };
  }).filter(s => !term || [s.name, s.esis, s.region, s.school_type].some(v => String(v || "").toLowerCase().includes(term)))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { rows, total: rows.length };
});
