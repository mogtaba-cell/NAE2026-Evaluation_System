import { route } from "@/lib/api";
import { db, all, inChunks, q } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { cycleOf, places, isCompetition, CYCLES } from "@/lib/winners";
// Round 2 results. Selected = passed Round 2. In competition pathways the Selected artworks of each subpathway are
// ranked per cycle (1st to 3rd place). A result is final once its round is closed (locked); until then it is provisional.
export const GET = route(["admin", "management", "leadership"], async ({ session, scope }) => {
  const S = await loadStructure();
  const { has } = await scope(S);
  const res = await all(() => db().from("nae_results").select("entry_id, final, team, grade, passed, locked, identity_yes, complete, entry:nae_entries(id, code, title_en, title_ar, group_name, grades_text, cycle_choice, tiebreak, pathway_code, sub_code, current_round, status, school:nae_schools(name))").eq("round_no", 2));
  const studs = await inChunks(res.map(r => r.entry_id), ids => q(db().from("nae_entry_students").select("entry_id, grade").in("entry_id", ids)));
  const gr = {}; studs.forEach(x => (gr[x.entry_id] ||= []).push(x.grade));
  const r1 = await inChunks(res.map(r => r.entry_id), ids => q(db().from("nae_results").select("entry_id, final, passed").eq("round_no", 1).in("entry_id", ids)));
  const lg = await inChunks(res.map(r => r.entry_id), ids => q(db().from("nae_logistics").select("entry_id, needs_framing, glass_framing, state").in("entry_id", ids)));
  const withdrawn = await all(() => db().from("nae_entries").select("id, code, title_en, group_name, pathway_code, sub_code, status, school:nae_schools(name)").eq("current_round", 2).in("status", ["withdrawn", "not_scored"]));
  const rows = res.filter(r => r.entry && has(r.entry.pathway_code) && r.entry.current_round === 2 && r.complete && r.final != null && r1.find(x => x.entry_id === r.entry_id)?.passed !== false).map(r => {
    const f = lg.find(x => x.entry_id === r.entry_id);
    const cy = cycleOf([...(gr[r.entry_id] || []), r.entry.grades_text], r.entry.cycle_choice);
    return { ...r, r1: r1.find(x => x.entry_id === r.entry_id)?.final ?? null, selected: !!r.passed, competition: isCompetition(S, r.entry.pathway_code), cycle: cy.cycle, mixed: cy.mixed, cycleOptions: cy.options, cycleChosen: cy.chosen, framing: f ? { needs: f.needs_framing, glass: f.glass_framing, state: f.state } : null, pathway: S.P[r.entry.pathway_code].name, sub: (S.P[r.entry.pathway_code].subs.find(s => s.code === r.entry.sub_code) || {}).name };
  }).sort((a, b) => (b.selected - a.selected) || b.final - a.final);
  const won = places(rows.filter(r => r.competition).map(r => ({ entry_id: r.entry_id, sub_code: r.entry.sub_code, cycle: r.cycle, final: r.final, selected: r.selected, tiebreak: r.entry.tiebreak })));
  rows.forEach(r => { const w = won.get(r.entry_id); if (w) { r.place = w.place; r.tie = w.tie; r.decided = w.decided; } });
  return {
    rows, cycles: CYCLES, can: { cycle: ["admin", "management"].includes(session.role), tie: ["admin", "management"].includes(session.role) },
    stopped: withdrawn.filter(e => has(e.pathway_code)).map(e => ({ ...e, pathway: S.P[e.pathway_code]?.name, sub: (S.P[e.pathway_code]?.subs.find(s => s.code === e.sub_code) || {}).name })),
    pathways: S.pathways.filter(p => has(p.code)).map(p => ({ code: p.code, name: p.name, competition: isCompetition(S, p.code), subs: S.P[p.code].subs.map(x => ({ code: x.code, name: x.name })), r2: S.P[p.code].rounds[2]?.status, r2locked: !!S.P[p.code].rounds[2]?.locked }))
  };
});
