import { route, body, bad } from "@/lib/api";
import { db, q } from "@/lib/db";
import { loadStructure, versionById, rubricFor } from "@/lib/structure";
import { weightedTotal, recompute, validateScores } from "@/lib/scoring";
import { audit } from "@/lib/audit";
// Admin correction of a submitted score, with a reason. The old values are kept in the score history.
export const POST = route(["admin"], async ({ session, request }) => {
  const b = await body(request);
  const reason = String(b.reason || "").trim(); if (!reason) throw bad("Give a reason for the change.");
  const s = await q(db().from("nae_scores").select("*, evaluator:nae_evaluators(name), round:nae_rounds(*), entry:nae_entries(id, code, pathway_code, sub_code)").eq("id", b.score_id).single());
  const res0 = await q(db().from("nae_results").select("locked").eq("entry_id", s.entry.id).eq("round_no", s.round.round_no).maybeSingle());
  if (res0?.locked) throw bad("This result is locked. Unlock it first (with a reason).");
  const S = await loadStructure();
  const hit = versionById(S, s.rubric_version_id);
  const version = hit?.version || rubricFor(S, s.entry.pathway_code, s.entry.sub_code, s.round.round_no)?.published;
  if (!version) throw bad("The rubric for this score can't be found.");
  const v = await validateScores(version.criteria, b.scores); if (v.error) throw bad(v.error);
  const total = weightedTotal(version.criteria, v.scores);
  const identity = typeof b.national_identity === "boolean" ? b.national_identity : s.national_identity;
  if (version.identity_required && typeof identity !== "boolean") throw bad("Choose yes or no for national identity.");
  const after = { scores: v.scores, total, national_identity: identity, status: "submitted" };
  await q(db().from("nae_scores").update({ ...after, submitted_at: s.submitted_at || new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", s.id));
  await q(db().from("nae_score_history").insert({ score_id: s.id, entry_id: s.entry.id, round_id: s.round.id, evaluator_id: s.evaluator_id, before: { scores: s.scores, total: s.total, national_identity: s.national_identity, status: s.status }, after, reason, changed_by: session.sub }));
  await audit(session, `Score changed for ${s.evaluator.name} (Round ${s.round.round_no})`, "entry", s.entry.id, `Was ${s.total ?? "none"}${s.national_identity != null ? ` (identity ${s.national_identity ? "yes" : "no"})` : ""}, now ${total}${identity != null ? ` (identity ${identity ? "yes" : "no"})` : ""}. Reason: ${reason}`);
  const res = await recompute(s.entry.id, s.round.round_no, { S });
  return { ok: true, total, result: res };
});
