import { route, body, notFound, forbidden } from "@/lib/api";
import { db, q } from "@/lib/db";
import { assertSeeEntry, myEvaluatorId, can } from "@/lib/perms";
import { loadStructure, rubricFor, roundOf, isPhysicalRound } from "@/lib/structure";
import { ruleText, passThreshold } from "@/lib/scoring";
import { entryFiles } from "@/lib/files";
import { audit } from "@/lib/audit";
import { fileView, loadEntry } from "@/lib/entryview";

export const GET = route("*", async ({ session, params, url }) => {
  const e = await loadEntry(params.code, session);
  const S = await loadStructure();
  const me = await myEvaluatorId(session);
  const [students, files, results, reviews, logistics, links, history] = await Promise.all([
    q(db().from("nae_entry_students").select("*").eq("entry_id", e.id).order("position")),
    entryFiles(e, { refresh: url.searchParams.get("refresh") === "1" }),
    q(db().from("nae_results").select("*").eq("entry_id", e.id)),
    q(db().from("nae_reviews").select("*").eq("entry_id", e.id).order("flagged_at", { ascending: false })),
    q(db().from("nae_logistics").select("*, collection:nae_collections(*)").eq("entry_id", e.id).maybeSingle()),
    q(db().from("nae_session_entries").select("session:nae_sessions(*)").eq("entry_id", e.id)),
    session.role === "evaluator" ? [] : q(db().from("nae_audit").select("*").in("object_id", [e.id, e.code]).order("at", { ascending: false }).limit(60))
  ]);
  const accIds = [e.coordinator_id, ...reviews.map(r => r.manager_id)].filter(Boolean);
  const accs = accIds.length ? await q(db().from("nae_accounts").select("id, display_name").in("id", accIds)) : [];
  const accName = id => accs.find(a => a.id === id)?.display_name || null;
  const rounds = [];
  for (const no of [1, 2]) {
    const r = roundOf(S, e.pathway_code, no); if (!r) continue;
    if (no > e.current_round && !results.find(x => x.round_no === no)) continue;
    const rub = rubricFor(S, e.pathway_code, e.sub_code, no);
    const scores = await q(db().from("nae_scores").select("*, evaluator:nae_evaluators(id, name, account_id), enterer:nae_accounts!nae_scores_entered_by_fkey(display_name)").eq("entry_id", e.id).eq("round_id", r.id));
    const assigned = await q(db().from("nae_assignments").select("evaluator:nae_evaluators(id, name, account_id)").eq("round_id", r.id).eq("entry_id", e.id));
    let visible = scores;
    if (session.role === "evaluator") { const mine = scores.find(s => s.evaluator_id === me); visible = mine && mine.status === "submitted" ? scores.filter(s => s.status === "submitted") : scores.filter(s => s.evaluator_id === me); }
    rounds.push({
      round_no: no, id: r.id, name: r.name, status: r.status, mode: r.mode, physical: isPhysicalRound(S, e, no), pass_rule: r.pass_rule, pass_text: ruleText(r.pass_rule),
      threshold: passThreshold(r.pass_rule, rub?.published?.grade_bands), locked: r.locked,
      rubric: rub?.published ? { code: rub.code, version: rub.published.version, version_id: rub.published.id, criteria: rub.published.criteria, identity_required: rub.published.identity_required } : null,
      evaluators: assigned.map(a => a.evaluator),
      scores: visible.map(s => ({ id: s.id, evaluator_id: s.evaluator_id, evaluator: s.evaluator?.name, has_login: !!s.evaluator?.account_id, scores: s.scores, total: s.total, national_identity: s.national_identity, comment: s.comment, status: s.status, entered_by: s.enterer?.display_name || null, self: s.entered_by && s.evaluator?.account_id === s.entered_by, submitted_at: s.submitted_at, rubric_version_id: s.rubric_version_id })),
      hidden: scores.length - visible.length,
      result: session.role === "evaluator" && visible.length < scores.length ? null : results.find(x => x.round_no === no) || null,
      reviews: reviews.filter(x => x.round_no === no).map(x => ({ ...x, manager: accName(x.manager_id) }))
    });
  }
  const sub = (S.P[e.pathway_code]?.subs || []).find(s => s.code === e.sub_code);
  return {
    entry: { ...e, raw: undefined, search_text: undefined, pathway: S.P[e.pathway_code]?.name, sub: sub?.name, is_physical: !!sub?.is_physical, coordinator: accName(e.coordinator_id) },
    students: session.role === "evaluator" ? students.map(s => ({ position: s.position, grade: s.grade, gender: s.gender, nationality: s.nationality })) : students,
    files: files.map(fileView), rounds, logistics, sessions: links.map(l => l.session).filter(Boolean), history,
    can: { editScore: can(session, "editScore"), flag: can(session, "flag"), allocate: can(session, "allocate"), download: session.role === "admin" }
  };
});

export const PATCH = route(["admin"], async ({ session, params, request }) => {
  const e = await loadEntry(params.code, session); const b = await body(request); const patch = {};
  if (b.coordinator_id !== undefined) patch.coordinator_id = b.coordinator_id || null;
  if (!Object.keys(patch).length) return { ok: true };
  await q(db().from("nae_entries").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", e.id));
  await audit(session, "Entry updated", "entry", e.id, JSON.stringify(patch));
  return { ok: true };
});
