import { route } from "@/lib/api";
import { db, all, inChunks, q } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
// Round 2 results. The shortlist is grade A and passed Round 2. A result is final once its round is closed
// (locked); until then it is provisional.
export const GET = route(["admin", "management", "leadership"], async () => {
  const S = await loadStructure();
  const res = await all(() => db().from("nae_results").select("entry_id, final, team, grade, passed, locked, identity_yes, complete, entry:nae_entries(id, code, title_en, title_ar, group_name, pathway_code, sub_code, current_round, status, school:nae_schools(name))").eq("round_no", 2));
  const r1 = await inChunks(res.map(r => r.entry_id), ids => q(db().from("nae_results").select("entry_id, final, passed").eq("round_no", 1).in("entry_id", ids)));
  const lg = await inChunks(res.map(r => r.entry_id), ids => q(db().from("nae_logistics").select("entry_id, needs_framing, glass_framing, state").in("entry_id", ids)));
  const withdrawn = await all(() => db().from("nae_entries").select("id, code, title_en, group_name, pathway_code, sub_code, status, school:nae_schools(name)").eq("current_round", 2).in("status", ["withdrawn", "not_scored"]));
  const rows = res.filter(r => r.entry && r.entry.current_round === 2 && r.complete && r.final != null && r1.find(x => x.entry_id === r.entry_id)?.passed !== false).map(r => {
    const f = lg.find(x => x.entry_id === r.entry_id);
    return { ...r, r1: r1.find(x => x.entry_id === r.entry_id)?.final ?? null, shortlisted: !!(r.passed && r.grade === "A"), framing: f ? { needs: f.needs_framing, glass: f.glass_framing, state: f.state } : null, pathway: S.P[r.entry.pathway_code].name, sub: (S.P[r.entry.pathway_code].subs.find(s => s.code === r.entry.sub_code) || {}).name };
  }).sort((a, b) => (b.shortlisted - a.shortlisted) || b.final - a.final);
  return {
    rows,
    stopped: withdrawn.map(e => ({ ...e, pathway: S.P[e.pathway_code]?.name, sub: (S.P[e.pathway_code]?.subs.find(s => s.code === e.sub_code) || {}).name })),
    pathways: S.pathways.map(p => ({ code: p.code, name: p.name, r2: S.P[p.code].rounds[2]?.status, r2locked: !!S.P[p.code].rounds[2]?.locked }))
  };
});
