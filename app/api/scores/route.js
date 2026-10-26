import { route, body, bad, forbidden } from "@/lib/api";
import { db, q } from "@/lib/db";
import { myEvaluatorId } from "@/lib/perms";
import { loadStructure, roundOf, isPhysicalRound, versionById } from "@/lib/structure";
import { weightedTotal, recompute, validateScores, pinnedVersion } from "@/lib/scoring";
import { audit } from "@/lib/audit";
import { saveFraming } from "@/lib/sessions";

// Saving a score.
// - Evaluators: their own score for an entry in their queue.
// - Coordinators: scores typed in during a live session they run, for that session's team only.
// - Admins: session scores at any time, or an online evaluator's missing score with a reason.
// A submitted score is never overwritten here: admins correct it through /api/scores/edit (with a reason).
export const POST = route(["evaluator", "coordinator", "admin"], async ({ session, request }) => {
  const b = await body(request);
  const S = await loadStructure();
  const e = await q(db().from("nae_entries").select("*").eq("code", b.entry_code).maybeSingle()); if (!e) throw bad("Entry not found.");
  const roundNo = Number(b.round_no || e.current_round);
  const round = roundOf(S, e.pathway_code, roundNo); if (!round) throw bad("No such round.");
  if (round.status !== "open" && session.role !== "admin") throw bad("This round is not open.");
  if (["withdrawn", "not_scored"].includes(e.status) && e.current_round === roundNo) throw bad("This entry was stopped (withdrawn or not scored).");
  const physical = isPhysicalRound(S, e, roundNo);
  let evaluatorId = b.evaluator_id, sess = null;

  if (session.role === "evaluator") {
    evaluatorId = await myEvaluatorId(session);
    const a = await q(db().from("nae_assignments").select("id").eq("round_id", round.id).eq("entry_id", e.id).eq("evaluator_id", evaluatorId));
    if (!a.length) throw forbidden("This entry is not in your queue.");
  } else {
    if (!evaluatorId) throw bad("Pick the evaluator.");
    if (b.session_id) {
      sess = await q(db().from("nae_sessions").select("*").eq("id", b.session_id).maybeSingle());
      if (!sess || sess.round_id !== round.id) throw bad("This session is not for this round.");
      if (session.role === "coordinator" && sess.coordinator_id !== session.sub) throw forbidden("Only the session's coordinator can enter its scores.");
      if (sess.status !== "live" && session.role !== "admin") throw bad(sess.status === "planned" ? "Start the session first." : "This session is finished. Ask an admin to correct a score.");
      const inS = await q(db().from("nae_session_entries").select("entry_id").eq("session_id", sess.id).eq("entry_id", e.id));
      if (!inS.length) throw bad("This entry is not in this session.");
      if (!(sess.evaluator_ids || []).includes(evaluatorId)) throw bad("That evaluator is not in this session's team.");
    } else {
      if (session.role !== "admin") throw forbidden("Scores can only be entered inside a scoring session you run.");
      const a = await q(db().from("nae_assignments").select("id").eq("round_id", round.id).eq("entry_id", e.id).eq("evaluator_id", evaluatorId));
      if (!a.length) throw bad("That evaluator is not assigned to this entry.");
      if (!String(b.reason || "").trim()) throw bad("Give a reason for entering a score on an evaluator's behalf.");
    }
  }
  const existing = await q(db().from("nae_scores").select("*").eq("round_id", round.id).eq("entry_id", e.id).eq("evaluator_id", evaluatorId).maybeSingle());
  if (existing?.status === "submitted") throw bad(session.role === "admin" ? "This score is already submitted. Use Change (with a reason) to correct it." : "This score is already submitted. Ask the admin to change it.");
  const result = await q(db().from("nae_results").select("locked").eq("entry_id", e.id).eq("round_no", roundNo).maybeSingle());
  if (result?.locked) throw bad(session.role === "admin" ? "This result is locked. Unlock it first (with a reason)." : "This result is locked.");

  // one rubric version per entry and round
  const pin = await pinnedVersion(S, e, roundNo);
  if (!pin) throw bad("This subpathway has no published rubric.");
  const version = versionById(S, pin.version_id).version;

  let row;
  if (b.absent) {
    if (!sess) throw bad("Absent can only be marked in a session.");
    row = { status: "absent", scores: {}, total: null, national_identity: null, submitted_at: new Date().toISOString() };
  } else {
    const submit = !!b.submit;
    let clean = b.scores || {}, total = null;
    if (submit) {
      const v = await validateScores(version.criteria, b.scores); if (v.error) throw bad(v.error); clean = v.scores;
      if (version.identity_required && typeof b.national_identity !== "boolean") throw bad("Choose yes or no for national identity.");
      total = weightedTotal(version.criteria, clean);
    }
    row = { status: submit ? "submitted" : "draft", scores: clean, total, national_identity: typeof b.national_identity === "boolean" ? b.national_identity : null, submitted_at: submit ? new Date().toISOString() : null };
  }
  if (b.clear_absent && existing?.status === "absent") row = { status: "draft", scores: {}, total: null, national_identity: null, submitted_at: null };
  await q(db().from("nae_scores").upsert({ round_id: round.id, entry_id: e.id, evaluator_id: evaluatorId, rubric_version_id: pin.version_id, comment: b.comment || null, entered_by: session.sub, session_id: b.session_id || null, updated_at: new Date().toISOString(), ...row }, { onConflict: "round_id,entry_id,evaluator_id" }));

  // framing (physical work in Round 2): one pair of boxes per artwork
  if (b.framing && roundNo === 2) await saveFraming(e.id, b.framing);

  let res = null;
  if (row.status !== "draft") {
    const ev = await q(db().from("nae_evaluators").select("name").eq("id", evaluatorId).single());
    if (row.status === "absent") await audit(session, `${ev.name} marked absent (Round ${roundNo})`, "entry", e.id, sess?.title || "");
    else await audit(session, session.role === "evaluator" ? `Score submitted (Round ${roundNo})` : `Score entered for ${ev.name} (Round ${roundNo})`, "entry", e.id, [`Total ${row.total}`, sess ? sess.title : null, b.reason || null].filter(Boolean).join(" · "));
  }
  res = await recompute(e.id, roundNo, { S });
  return { ok: true, total: row.total, result: res };
});

