import { route, forbidden } from "@/lib/api";
import { db, q, all } from "@/lib/db";
import { myEvaluatorId } from "@/lib/perms";
import { loadStructure } from "@/lib/structure";
export const GET = route(["evaluator"], async ({ session }) => {
  const ev = await myEvaluatorId(session); if (!ev) throw forbidden("Your account is not linked to an evaluator yet. Ask the admin.");
  const S = await loadStructure();
  const open = S.rounds.filter(r => r.status === "open").map(r => r.id);
  if (!open.length) return { items: [], rounds: [] };
  const asg = await all(() => db().from("nae_assignments").select("round_id, entry:nae_entries(id, code, title_en, title_ar, group_name, pathway_code, sub_code, current_round, school:nae_schools(name))").eq("evaluator_id", ev).in("round_id", open));
  const scores = await all(() => db().from("nae_scores").select("entry_id, round_id, status, total, submitted_at").eq("evaluator_id", ev).in("round_id", open));
  const items = asg.filter(a => a.entry).map(a => { const s = scores.find(x => x.entry_id === a.entry.id && x.round_id === a.round_id); const r = S.roundById[a.round_id]; return { ...a.entry, round_id: a.round_id, round_no: r.round_no, pathway: S.P[r.pathway_code].name, sub: (S.P[a.entry.pathway_code].subs.find(x => x.code === a.entry.sub_code) || {}).name, closes_on: r.closes_on, myStatus: s?.status || null, myTotal: s?.total ?? null }; }).sort((a, b) => a.code.localeCompare(b.code));
  const rounds = S.rounds.filter(r => open.includes(r.id) && items.some(i => i.round_id === r.id)).map(r => ({ id: r.id, round_no: r.round_no, pathway: S.P[r.pathway_code].name, closes_on: r.closes_on }));
  return { items, rounds, evaluator_id: ev };
});
