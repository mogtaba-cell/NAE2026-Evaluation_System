import { db, all, inChunks, q } from "@/lib/db";
import { cycleOf, places, isCompetition } from "@/lib/winners";
// Totals for the dashboards: Shortlisted (passed Round 1), Selected in participation pathways (passed Round 2), and
// winners in competition pathways (1st to 3rd place per subpathway and cycle). Same rules as Final results.
export async function outcomeCounts(S, has) {
  const [r1, r2] = await Promise.all([
    all(() => db().from("nae_results").select("entry_id, passed, entry:nae_entries!inner(pathway_code)").eq("round_no", 1).eq("complete", true).eq("passed", true).order("entry_id")),
    all(() => db().from("nae_results").select("entry_id, final, passed, entry:nae_entries!inner(id, pathway_code, sub_code, grades_text, cycle_choice, tiebreak, current_round)").eq("round_no", 2).eq("complete", true).not("final", "is", null).order("entry_id"))
  ]);
  const r1passed = new Set(r1.filter(r => has(r.entry.pathway_code)).map(r => r.entry_id));
  const rows = r2.filter(r => has(r.entry.pathway_code) && r.entry.current_round === 2);
  const part = rows.filter(r => r.passed && !isCompetition(S, r.entry.pathway_code));
  const comp = rows.filter(r => r.passed && isCompetition(S, r.entry.pathway_code));
  const studs = comp.length ? await inChunks(comp.map(r => r.entry_id), ids => q(db().from("nae_entry_students").select("entry_id, grade").in("entry_id", ids))) : [];
  const gr = {}; studs.forEach(s => (gr[s.entry_id] ||= []).push(s.grade));
  const won = places(comp.map(r => ({ entry_id: r.entry_id, sub_code: r.entry.sub_code, cycle: cycleOf([...(gr[r.entry_id] || []), r.entry.grades_text], r.entry.cycle_choice).cycle, final: r.final, selected: true, tiebreak: r.entry.tiebreak })));
  const ws = [...won.values()];
  return { shortlisted: r1passed.size, selectedParticipation: part.length, selectedCompetition: comp.length, winners: ws.length, firsts: ws.filter(w => w.place === 1).length, ties: ws.filter(w => w.tie).length, competition: S.pathways.some(p => has(p.code) && isCompetition(S, p.code)), participation: S.pathways.some(p => has(p.code) && !isCompetition(S, p.code)) };
}
