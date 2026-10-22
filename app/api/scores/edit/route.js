import { route, body, bad } from "@/lib/api";
import { db, q } from "@/lib/db";
import { loadStructure, rubricFor, roundOf } from "@/lib/structure";
import { weightedTotal, recompute, validateScores } from "@/lib/scoring";
import { audit } from "@/lib/audit";
// Admin correction of a submitted score. The old value is kept in the audit log with the reason.
export const POST = route(["admin"], async ({ session, request }) => {
  const b = await body(request);
  if (!String(b.reason || "").trim()) throw bad("Give a reason for the change.");
  const s = await q(db().from("nae_scores").select("*, evaluator:nae_evaluators(name), round:nae_rounds(*), entry:nae_entries(id, code, pathway_code, sub_code)").eq("id", b.score_id).single());
  const S = await loadStructure();
  const rub = rubricFor(S, s.entry.pathway_code, s.entry.sub_code, s.round.round_no);
  const version = rub.versions.find(v => v.id === s.rubric_version_id) || rub.published;
  const v = await validateScores(version.criteria, b.scores); if (v.error) throw bad(v.error);
  const total = weightedTotal(version.criteria, v.scores);
  await q(db().from("nae_scores").update({ scores: v.scores, total, national_identity: typeof b.national_identity === "boolean" ? b.national_identity : s.national_identity, status: "submitted", submitted_at: s.submitted_at || new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", s.id));
  if (s.round.locked) await q(db().from("nae_results").update({ locked: false }).eq("entry_id", s.entry.id).eq("round_no", s.round.round_no));
  await audit(session, `Score changed for ${s.evaluator.name} (Round ${s.round.round_no})`, "entry", s.entry.id, `Was ${s.total}, now ${total}. ${JSON.stringify(s.scores)} → ${JSON.stringify(v.scores)}. Reason: ${b.reason}`);
  const res = await recompute(s.entry.id, s.round.round_no, { S });
  return { ok: true, total, result: res };
});
