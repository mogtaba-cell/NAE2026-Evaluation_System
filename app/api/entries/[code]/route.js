import { route, body, bad, forbidden } from "@/lib/api";
import { db, q } from "@/lib/db";
import { entryAccess, myEvaluatorId, can } from "@/lib/perms";
import { loadStructure, roundOf, isPhysicalRound, roundPanel } from "@/lib/structure";
import { ruleText, passThreshold, pinnedVersion, flagLine, scorePlan, recompute, DEFAULT_BANDS } from "@/lib/scoring";
import { entryFiles } from "@/lib/files";
import { audit } from "@/lib/audit";
import { fileView, loadEntry } from "@/lib/entryview";

export const GET = route("*", async ({ session, params, url }) => {
  const e = await loadEntry(params.code, session);
  const access = await entryAccess(session, e);         // "full" or "view"
  const full = access === "full";
  const S = await loadStructure();
  const me = await myEvaluatorId(session);
  // a manager opening an entry counts as "viewed by management"
  if (session.role === "management" && !e.mgmt_viewed_at) {
    await q(db().from("nae_entries").update({ mgmt_viewed_at: new Date().toISOString(), mgmt_viewed_by: session.sub, mgmt_viewed_how: "opened" }).eq("id", e.id));
    e.mgmt_viewed_at = new Date().toISOString(); e.mgmt_viewed_by = session.sub; e.mgmt_viewed_how = "opened";
  }
  const showStaff = session.role !== "evaluator";
  const [students, files, results, reviews, logistics, links, history, scoreHist] = await Promise.all([
    q(db().from("nae_entry_students").select("*").eq("entry_id", e.id).order("position")),
    entryFiles(e, { refresh: url.searchParams.get("refresh") === "1" }),
    q(db().from("nae_results").select("*").eq("entry_id", e.id)),
    full && showStaff ? q(db().from("nae_reviews").select("*").eq("entry_id", e.id).order("flagged_at", { ascending: false })) : [],
    showStaff ? q(db().from("nae_logistics").select("*, collection:nae_collections(*), loc:nae_locations(room, shelf)").eq("entry_id", e.id).maybeSingle()) : null,
    showStaff ? q(db().from("nae_session_entries").select("session:nae_sessions(*)").eq("entry_id", e.id)) : [],
    full && showStaff ? q(db().from("nae_audit").select("*").in("object_id", [e.id, e.code]).order("at", { ascending: false }).limit(60)) : [],
    session.role === "admin" ? q(db().from("nae_score_history").select("*").eq("entry_id", e.id).order("at", { ascending: false })) : []
  ]);
  const accIds = [e.coordinator_id, e.mgmt_viewed_by, ...reviews.map(r => r.manager_id)].filter(Boolean);
  const accs = accIds.length ? await q(db().from("nae_accounts").select("id, display_name").in("id", accIds)) : [];
  const accName = id => accs.find(a => a.id === id)?.display_name || null;
  const evs = session.role === "admin" ? await q(db().from("nae_evaluators").select("id, name, account_id, pathways, active")) : [];
  const rounds = [];
  for (const no of [1, 2]) {
    const r = roundOf(S, e.pathway_code, no); if (!r) continue;
    if (no > e.current_round && !results.find(x => x.round_no === no)) continue;
    const ver = await pinnedVersion(S, e, no);
    const bands = ver?.grade_bands || DEFAULT_BANDS;
    const base = { round_no: no, id: r.id, name: r.name, status: r.status, physical: isPhysicalRound(S, e, no), pass_rule: r.pass_rule, pass_text: ruleText(r.pass_rule), threshold: passThreshold(r.pass_rule, bands), flag_line: flagLine(r, bands), flag_line_kind: r.flag_line, locked: r.locked, review_hours: r.review_hours, rubric: ver, bands };
    if (!full) { rounds.push({ ...base, scores: [], evaluators: [], hidden: 0, result: null, reviews: [], limited: true }); continue; }
    const scores = await q(db().from("nae_scores").select("*, evaluator:nae_evaluators(id, name, account_id), enterer:nae_accounts!nae_scores_entered_by_fkey(display_name)").eq("entry_id", e.id).eq("round_id", r.id));
    const assigned = await q(db().from("nae_assignments").select("evaluator:nae_evaluators(id, name, account_id)").eq("round_id", r.id).eq("entry_id", e.id));
    let visible = scores;
    const evaluator = session.role === "evaluator";
    if (evaluator) { const mine = scores.find(s => s.evaluator_id === me); visible = mine && mine.status === "submitted" ? scores.filter(s => s.status === "submitted") : scores.filter(s => s.evaluator_id === me); }
    const plan = session.role === "admin" ? await scorePlan(S, e, r) : null;
    rounds.push({
      ...base,
      evaluators: assigned.map(a => a.evaluator),
      panel: session.role === "admin" ? roundPanel(r, evs).map(x => ({ id: x.id, name: x.name })) : undefined,
      needed: plan?.needed,
      scores: visible.map(s => ({ id: s.id, evaluator_id: s.evaluator_id, evaluator: s.evaluator?.name, has_login: !!s.evaluator?.account_id, scores: s.scores, total: s.total, national_identity: s.national_identity, comment: s.comment, status: s.status, entered_by: s.enterer?.display_name || null, self: s.entered_by && s.evaluator?.account_id === s.entered_by, submitted_at: s.submitted_at, rubric_version_id: s.rubric_version_id })),
      hidden: 0,
      result: evaluator && visible.length < scores.filter(s => s.status === "submitted").length ? null : results.find(x => x.round_no === no) || null,
      reviews: evaluator ? [] : reviews.filter(x => x.round_no === no).map(x => ({ ...x, manager: accName(x.manager_id) }))
    });
  }
  const sub = (S.P[e.pathway_code]?.subs || []).find(s => s.code === e.sub_code);
  const lg = logistics ? { ...logistics, where: logistics.loc ? `${logistics.loc.room} · ${logistics.loc.shelf}` : logistics.location || null } : null;
  return {
    access,
    entry: { ...e, raw: undefined, search_text: undefined, pathway: S.P[e.pathway_code]?.name, sub: sub?.name, is_physical: !!sub?.is_physical, coordinator: accName(e.coordinator_id), mgmt_viewed_name: accName(e.mgmt_viewed_by) },
    students: session.role === "evaluator" ? students.map(s => ({ position: s.position, grade: s.grade, gender: s.gender, nationality: s.nationality })) : students,
    files: files.map(fileView), rounds, logistics: lg, sessions: links.map(l => l.session).filter(Boolean), history, scoreHistory: scoreHist,
    can: { editScore: can(session, "editScore") && full, flag: can(session, "flag") && full, allocate: can(session, "allocate"), download: true, markViewed: session.role !== "evaluator", admin: session.role === "admin" }
  };
});

export const PATCH = route(["admin", "coordinator", "management", "storage", "leadership"], async ({ session, params, request }) => {
  const e = await loadEntry(params.code, session); const b = await body(request); const patch = {};
  if (b.coordinator_id !== undefined) { if (session.role !== "admin") throw forbidden(); patch.coordinator_id = b.coordinator_id || null; }
  if (b.mgmt_viewed !== undefined) {
    if (b.mgmt_viewed) { patch.mgmt_viewed_at = new Date().toISOString(); patch.mgmt_viewed_by = session.sub; patch.mgmt_viewed_how = "marked"; }
    else { patch.mgmt_viewed_at = null; patch.mgmt_viewed_by = null; patch.mgmt_viewed_how = null; }
  }
  if (!Object.keys(patch).length) return { ok: true };
  await q(db().from("nae_entries").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", e.id));
  await audit(session, b.mgmt_viewed !== undefined ? (b.mgmt_viewed ? "Marked as viewed by management" : "Unmarked \"viewed by management\"") : "Entry updated", "entry", e.id, b.mgmt_viewed !== undefined ? "" : JSON.stringify(patch));
  return { ok: true };
});

// Admin: give an entry a different evaluator for one round (only someone who hasn't submitted can be replaced).
export const POST = route(["admin"], async ({ session, params, request }) => {
  const e = await loadEntry(params.code, session); const b = await body(request);
  if (b.action !== "reassign") throw bad("Unknown action.");
  const S = await loadStructure(); const r = roundOf(S, e.pathway_code, Number(b.round_no)); if (!r) throw bad("No such round.");
  if (!b.from || !b.to || b.from === b.to) throw bad("Pick who to replace and who takes over.");
  const sub = await q(db().from("nae_scores").select("status").eq("round_id", r.id).eq("entry_id", e.id).eq("evaluator_id", b.from).maybeSingle());
  if (sub?.status === "submitted") throw bad("That evaluator already submitted a score.");
  const to = await q(db().from("nae_evaluators").select("id, name, active, account_id").eq("id", b.to).single());
  if (!to.active || !to.account_id) throw bad("Pick an active evaluator with a login.");
  await q(db().from("nae_assignments").delete().eq("round_id", r.id).eq("entry_id", e.id).eq("evaluator_id", b.from));
  await q(db().from("nae_assignments").upsert({ round_id: r.id, entry_id: e.id, evaluator_id: b.to }, { onConflict: "round_id,entry_id,evaluator_id", ignoreDuplicates: true }));
  const fromEv = await q(db().from("nae_evaluators").select("name").eq("id", b.from).single());
  await audit(session, `Reassigned Round ${r.round_no}: ${fromEv.name} → ${to.name}`, "entry", e.id, b.reason || "");
  await recompute(e.id, r.round_no, { S });
  return { ok: true, note: `${to.name} now has ${e.code} for Round ${r.round_no}.` };
});
