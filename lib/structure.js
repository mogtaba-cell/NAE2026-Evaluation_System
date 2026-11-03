import { questionsOf } from "@/lib/questions";
import { db, q } from "@/lib/db";

// Program structure: pathways, subpathways, rounds, rubrics with their latest published version.
// Kept for a few seconds per server instance (every page needs it); any change request clears it.
let cached = null, cachedAt = 0;
export function clearStructureCache() { cached = null; }
export function loadStructure() {
  if (cached && Date.now() - cachedAt < 5000) return cached;
  cachedAt = Date.now();
  cached = loadStructureNow().catch(e => { cached = null; throw e; });
  return cached;
}
async function loadStructureNow() {
  const [programs, pathways, subs, rounds, rubrics, versions] = await Promise.all([
    q(db().from("nae_programs").select("*").order("sort").order("created_at")),
    q(db().from("nae_pathways").select("*").order("sort")),
    q(db().from("nae_subpathways").select("*").order("sort")),
    q(db().from("nae_rounds").select("*").order("round_no")),
    q(db().from("nae_rubrics").select("*").order("code")),
    q(db().from("nae_rubric_versions").select("*").order("version"))
  ]);
  const rub = {};
  rubrics.forEach(r => { rub[r.id] = { ...r, versions: [], published: null, draft: null }; });
  versions.forEach(v => { const r = rub[v.rubric_id]; if (!r) return; r.versions.push(v); if (v.status === "published") r.published = v; if (v.status === "draft") r.draft = v; });
  const P = {};
  pathways.forEach(p => { P[p.code] = { ...p, subs: [], rounds: {} }; });
  subs.forEach(s => { if (P[s.pathway_code]) P[s.pathway_code].subs.push(s); });
  rounds.forEach(r => { if (P[r.pathway_code]) P[r.pathway_code].rounds[r.round_no] = r; });
  const PR = {};
  programs.forEach(g => { PR[g.id] = { ...g, pathways: pathways.filter(p => p.program_id === g.id).map(p => p.code) }; });
  return { programs, PR, pathways, P, subs, rounds, rubrics: rub, roundById: Object.fromEntries(rounds.map(r => [r.id, r])) };
}
export function subOf(S, pathway, sub) { return (S.P[pathway]?.subs || []).find(s => s.code === sub) || null; }
export function rubricFor(S, pathway, sub, roundNo) {
  const s = subOf(S, pathway, sub); if (!s) return null;
  const id = roundNo === 2 ? (s.rubric_r2 || s.rubric_r1) : s.rubric_r1;
  return id ? S.rubrics[id] : null;
}
export function roundOf(S, pathway, roundNo) { return S.P[pathway]?.rounds?.[roundNo] || null; }
// Round 1 is always online. In Round 2 a subpathway's Physical switch decides; a missing artwork the admin
// chose to score from its files is treated as online.
export function isPhysicalRound(S, entry, roundNo) {
  if (roundNo !== 2) return false;
  const s = subOf(S, entry.pathway_code, entry.sub_code);
  return !!s?.is_physical && entry.physical_override !== "online";
}
// A rubric version by id, wherever it is.
export function versionById(S, id) {
  if (!id) return null;
  for (const r of Object.values(S.rubrics)) { const v = r.versions.find(x => x.id === id); if (v) return { rubric: r, version: v }; }
  return null;
}
// The compact form the pages use.
export function versionView(rubric, v) {
  if (!v) return null;
  const questions = questionsOf(v); const idq = questions.find(q => q.key === "identity");
  return { version_id: v.id, code: rubric?.code, version: v.version, criteria: v.criteria || [], questions, identity_required: !!idq, identity_pass: !!idq?.pass_yes, grade_bands: v.grade_bands || null, status: v.status };
}
// Evaluators who may get online entries in a round: the round's chosen panel, or (if none chosen) every
// evaluator with a login in that pathway. Only active evaluators with a login can score online.
export function roundPanel(round, evaluators) {
  const ok = evaluators.filter(e => e.active && e.account_id);
  return round.evaluator_ids?.length ? ok.filter(e => round.evaluator_ids.includes(e.id)) : ok.filter(e => (e.pathways || []).includes(round.pathway_code));
}
export const ENTRY_COLS = "id, code, pathway_code, sub_code, current_round, status, physical_override, school_id, coordinator_id";
