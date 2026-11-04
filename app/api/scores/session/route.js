import { questionsOf, normAnswers, missingAnswer } from "@/lib/questions";
import { route, body, bad, forbidden } from "@/lib/api";
import { db, q } from "@/lib/db";
import { loadStructure, roundOf, versionById } from "@/lib/structure";
import { weightedTotal, recompute, validateScores, pinnedVersion } from "@/lib/scoring";
import { audit } from "@/lib/audit";
import { myEvaluatorId } from "@/lib/perms";

// Save every evaluator's score for one artwork in a scoring session at once (the coordinator types the whole
// team's sheet, then saves once). Everything is checked first: either all columns are saved or none.
//   { session_id, entry_code, items: [{ evaluator_id, scores, national_identity } | { evaluator_id, absent: true }] }
export const POST = route(["coordinator", "admin", "evaluator"], async ({ session, request }) => {
  const b = await body(request);
  const S = await loadStructure();
  const sess = await q(db().from("nae_sessions").select("*").eq("id", b.session_id).maybeSingle());
  if (!sess) throw bad("Session not found.");
  if (session.role === "coordinator" && sess.coordinator_id !== session.sub) throw forbidden("Only the session's coordinator can enter its scores.");
  const myEv = session.role === "evaluator" ? await myEvaluatorId(session) : null;
  if (session.role === "evaluator" && (!myEv || !(sess.evaluator_ids || []).includes(myEv))) throw forbidden("You are not in this session's team.");
  if (sess.status !== "live" && session.role !== "admin") throw bad(sess.status === "planned" ? "Start the session first." : "This session is finished. Ask an admin to correct a score.");
  const e = await q(db().from("nae_entries").select("*").eq("code", b.entry_code).maybeSingle()); if (!e) throw bad("Artwork not found.");
  const round = S.roundById[sess.round_id]; if (!round || round.pathway_code !== e.pathway_code) throw bad("This session is not for this artwork's round.");
  if (round.status !== "open" && session.role !== "admin") throw bad("This round is not open.");
  if (e.not_visible_at && e.not_visible_round === round.round_no) throw bad("This artwork is marked not visible. Reopen it for scoring first.");
  const inS = await q(db().from("nae_session_entries").select("entry_id").eq("session_id", sess.id).eq("entry_id", e.id));
  if (!inS.length) throw bad("This artwork is not in this session.");
  const items = Array.isArray(b.items) ? b.items.filter(i => i && i.evaluator_id) : [];
  if (!items.length) throw bad("Nothing to save.");
  const team = sess.evaluator_ids || [];
  if (items.some(i => !team.includes(i.evaluator_id))) throw bad("Someone in this sheet is not in the session's team.");
  // evaluators who type their own scores: only they save their column (the coordinator can still mark them absent)
  const self = new Set(sess.self_ids || []);
  if (session.role === "evaluator") {
    if (items.some(i => i.evaluator_id !== myEv)) throw forbidden("You can only save your own scores.");
    if (!self.has(myEv)) throw forbidden("Your coordinator enters your scores in this session.");
    if (items.some(i => i.absent)) throw bad("Ask the coordinator to mark you absent.");
  }
  if (session.role === "coordinator") { const theirs = items.filter(i => self.has(i.evaluator_id) && !i.absent); if (theirs.length) throw bad(`${theirs.length === 1 ? "That evaluator enters" : "Those evaluators enter"} their own scores on their login.`); }
  const [existing, result] = await Promise.all([
    q(db().from("nae_scores").select("evaluator_id, status").eq("round_id", round.id).eq("entry_id", e.id)),
    q(db().from("nae_results").select("locked").eq("entry_id", e.id).eq("round_no", round.round_no).maybeSingle())
  ]);
  if (result?.locked) throw bad(session.role === "admin" ? "This result is locked. Unlock it first (with a reason)." : "This result is locked.");
  const pin = await pinnedVersion(S, e, round.round_no);
  if (!pin) throw bad("This subpathway has no published rubric.");
  const version = versionById(S, pin.version_id).version; const qs = questionsOf(version);
  const evs = await q(db().from("nae_evaluators").select("id, name").in("id", items.map(i => i.evaluator_id)));
  const nameOf = id => evs.find(x => x.id === id)?.name || "Evaluator";

  // check everything before writing anything
  const now = new Date().toISOString(); const rows = [];
  for (const i of items) {
    const ex = existing.find(x => x.evaluator_id === i.evaluator_id);
    if (ex?.status === "submitted") throw bad(`${nameOf(i.evaluator_id)}'s score is already saved. ${session.role === "admin" ? "Use Change (with a reason) to correct it." : "Ask the admin to change it."}`);
    if (i.absent) { rows.push({ evaluator_id: i.evaluator_id, status: "absent", scores: {}, total: null, answers: {}, national_identity: null, submitted_at: now }); continue; }
    const v = await validateScores(version.criteria, i.scores);
    if (v.error) throw bad(`${nameOf(i.evaluator_id)}: ${v.error}`);
    const ans = normAnswers(qs, i.answers, i.national_identity); const miss = missingAnswer(qs, ans);
    if (miss) throw bad(`${nameOf(i.evaluator_id)}: ${miss.why}.`);
    rows.push({ evaluator_id: i.evaluator_id, status: "submitted", scores: v.scores, total: weightedTotal(version.criteria, v.scores), answers: ans, national_identity: typeof ans.identity === "boolean" ? ans.identity : null, comment: i.comment ? String(i.comment).trim().slice(0, 1000) || null : null, to_review: !!(i.to_review || b.to_review), submitted_at: now });
  }
  await q(db().from("nae_scores").upsert(rows.map(r => ({ round_id: round.id, entry_id: e.id, rubric_version_id: pin.version_id, entered_by: session.sub, session_id: sess.id, updated_at: now, comment: null, to_review: false, ...r })), { onConflict: "round_id,entry_id,evaluator_id" }));
  const saved = rows.filter(r => r.status === "submitted"), abs = rows.filter(r => r.status === "absent");
  await audit(session, `Scores entered for ${saved.length} evaluator${saved.length === 1 ? "" : "s"}${abs.length ? `, ${abs.length} absent` : ""} (Round ${round.round_no})`, "entry", e.id,
    [saved.map(r => `${nameOf(r.evaluator_id)} ${r.total}`).join(", "), abs.length ? `absent: ${abs.map(r => nameOf(r.evaluator_id)).join(", ")}` : null, sess.title].filter(Boolean).join(" · "));
  const res = await recompute(e.id, round.round_no, { S });
  return { ok: true, saved: saved.length, absent: abs.length, result: res };
});
