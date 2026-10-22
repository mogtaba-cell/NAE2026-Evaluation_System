import { route } from "@/lib/api";
import { db, all } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
export const GET = route(["admin", "management", "leadership"], async () => {
  const S = await loadStructure();
  const res = await all(() => db().from("nae_results").select("entry_id, final, team, grade, passed, locked, identity_yes, entry:nae_entries(code, title_en, title_ar, group_name, pathway_code, sub_code, school:nae_schools(name))").eq("round_no", 2).eq("complete", true));
  const r1 = await all(() => db().from("nae_results").select("entry_id, final").eq("round_no", 1));
  const rows = res.filter(r => r.entry && r.final != null).map(r => ({ ...r, r1: r1.find(x => x.entry_id === r.entry_id)?.final ?? null, pathway: S.P[r.entry.pathway_code].name, sub: (S.P[r.entry.pathway_code].subs.find(s => s.code === r.entry.sub_code) || {}).name })).sort((a, b) => b.final - a.final);
  return { rows, pathways: S.pathways.map(p => ({ code: p.code, name: p.name, r2: S.P[p.code].rounds[2]?.status })) };
});
