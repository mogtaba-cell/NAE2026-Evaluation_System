import { db, q } from "@/lib/db";

// Program structure: pathways, subpathways, rounds, rubrics with their latest published version.
export async function loadStructure() {
  const [pathways, subs, rounds, rubrics, versions] = await Promise.all([
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
  return { pathways, P, subs, rounds, rubrics: rub, roundById: Object.fromEntries(rounds.map(r => [r.id, r])) };
}
export function subOf(S, pathway, sub) { return (S.P[pathway]?.subs || []).find(s => s.code === sub) || null; }
export function rubricFor(S, pathway, sub, roundNo) {
  const s = subOf(S, pathway, sub); if (!s) return null;
  const id = roundNo === 2 ? (s.rubric_r2 || s.rubric_r1) : s.rubric_r1;
  return id ? S.rubrics[id] : null;
}
export function roundOf(S, pathway, roundNo) { return S.P[pathway]?.rounds?.[roundNo] || null; }
export function isPhysicalRound(S, entry, roundNo) {
  const r = roundOf(S, entry.pathway_code, roundNo); const s = subOf(S, entry.pathway_code, entry.sub_code);
  if (!r || roundNo !== 2) return false;
  return r.mode === "physical" || (r.mode === "mixed" && !!s?.is_physical);
}
