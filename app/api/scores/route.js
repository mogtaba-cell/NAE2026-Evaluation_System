import { route, body, bad, forbidden } from "@/lib/api";
import { db, q } from "@/lib/db";
import { canSeeEntry, myEvaluatorId } from "@/lib/perms";
import { loadStructure, rubricFor, roundOf, isPhysicalRound } from "@/lib/structure";
import { weightedTotal, recompute, validateScores } from "@/lib/scoring";
import { audit } from "@/lib/audit";

export const POST = route(["evaluator", "coordinator", "admin"], async ({ session, request }) => {
  const b = await body(request);
  const S = await loadStructure();
  const e = await q(db().from("nae_entries").select("*").eq("code", b.entry_code).maybeSingle()); if (!e) throw bad("Entry not found.");
  const roundNo = Number(b.round_no || e.current_round);
  const round = roundOf(S, e.pathway_code, roundNo); if (!round) throw bad("No such round.");
  if (round.status !== "open" && session.role !== "admin") throw bad("This round is not open.");
  let evaluatorId = b.evaluator_id;
  if (session.role === "evaluator") {
    evaluatorId = await myEvaluatorId(session);
    const a = await q(db().from("nae_assignments").select("id").eq("round_id", round.id).eq("entry_id", e.id).eq("evaluator_id", evaluatorId));
    if (!a.length) throw forbidden("This entry is not in your queue.");
  } else {
    if (!(await canSeeEntry(session, e))) throw forbidden();
    if (!evaluatorId) throw bad("Pick the evaluator.");
    if (b.session_id) { const s = await q(db().from("nae_sessions").select("evaluator_ids, round_id, status").eq("id", b.session_id).single()); if (!(s.evaluator_ids || []).includes(evaluatorId)) throw bad("That evaluator is not in this session's team."); if (s.status === "done" && session.role !== "admin") throw bad("This session is finished. Ask an admin to correct a score."); }
  }
  const existing = await q(db().from("nae_scores").select("*").eq("round_id", round.id).eq("entry_id", e.id).eq("evaluator_id", evaluatorId).maybeSingle());
  if (existing?.status === "submitted" && session.role === "evaluator") throw bad("You already submitted this score. Ask the admin to change it.");
  const result = await q(db().from("nae_results").select("locked").eq("entry_id", e.id).eq("round_no", roundNo).maybeSingle());
  if (result?.locked && session.role !== "admin") throw bad("This result is locked.");
  const rub = rubricFor(S, e.pathway_code, e.sub_code, roundNo);
  const versionId = existing?.rubric_version_id || rub?.published?.id; if (!versionId) throw bad("This subpathway has no published rubric.");
  const version = rub.versions.find(v => v.id === versionId) || rub.published;
  const submit = !!b.submit;
  let clean = b.scores || {};
  if (submit) { const v = await validateScores(version.criteria, b.scores); if (v.error) throw bad(v.error); clean = v.scores; if (version.identity_required && typeof b.national_identity !== "boolean") throw bad("Choose yes or no for national identity."); }
  const total = submit ? weightedTotal(version.criteria, clean) : null;
  const row = { round_id: round.id, entry_id: e.id, evaluator_id: evaluatorId, rubric_version_id: versionId, scores: clean, national_identity: typeof b.national_identity === "boolean" ? b.national_identity : null, total, comment: b.comment || null, status: submit ? "submitted" : "draft", entered_by: session.sub, session_id: b.session_id || null, submitted_at: submit ? new Date().toISOString() : null, updated_at: new Date().toISOString() };
  await q(db().from("nae_scores").upsert(row, { onConflict: "round_id,entry_id,evaluator_id" }));
  let res = null;
  if (submit) {
    const ev = await q(db().from("nae_evaluators").select("name").eq("id", evaluatorId).single());
    await audit(session, session.role === "evaluator" ? `Round ${roundNo} score submitted` : `Round ${roundNo} score entered for ${ev.name}`, "entry", e.id, `Total ${total} · ${rub.code} v${version.version}`);
    res = await recompute(e.id, roundNo, { S });
  }
  return { ok: true, total, result: res };
});
