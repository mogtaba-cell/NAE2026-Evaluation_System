import { route, body, bad, forbidden } from "@/lib/api";
import { db, q } from "@/lib/db";
import { loadStructure, roundOf } from "@/lib/structure";
import { recompute, passThreshold, ruleText, pinnedVersion, flagLine, DEFAULT_BANDS } from "@/lib/scoring";
import { entryFiles } from "@/lib/files";
import { fileView } from "@/lib/entryview";
import { audit } from "@/lib/audit";

export const GET = route(["admin", "management", "leadership"], async ({ params }) => {
  const rv = await q(db().from("nae_reviews").select("*").eq("id", params.id).single());
  const e = await q(db().from("nae_entries").select("*, school:nae_schools(name, esis)").eq("id", rv.entry_id).single());
  const S = await loadStructure(); const r = roundOf(S, e.pathway_code, rv.round_no); const ver = await pinnedVersion(S, e, rv.round_no); const bands = ver?.grade_bands || DEFAULT_BANDS;
  const scores = await q(db().from("nae_scores").select("*, evaluator:nae_evaluators(name)").eq("entry_id", e.id).eq("round_id", r.id).eq("status", "submitted"));
  const result = await q(db().from("nae_results").select("*").eq("entry_id", e.id).eq("round_no", rv.round_no).maybeSingle());
  const files = (await entryFiles(e)).map(fileView);
  const accs = await q(db().from("nae_accounts").select("id, display_name, role").in("role", ["management", "admin", "coordinator"]));
  const name = id => accs.find(a => a.id === id)?.display_name || null;
  return { review: { ...rv, manager: name(rv.manager_id), flagged_by_name: rv.flagged_by ? name(rv.flagged_by) : "System", decided_by_name: name(rv.decided_by) }, entry: { ...e, raw: undefined, search_text: undefined, pathway: S.P[e.pathway_code].name, sub: (S.P[e.pathway_code].subs.find(x => x.code === e.sub_code) || {}).name }, round: { round_no: r.round_no, pass_text: ruleText(r.pass_rule), threshold: passThreshold(r.pass_rule, bands), flag_line: flagLine(r, bands), flag_line_kind: r.flag_line, spread_limit: r.spread_limit, identity: !!r.pass_rule?.identity }, rubric: ver, criteria: ver?.criteria || [], bands, scores: scores.map(s => ({ evaluator: s.evaluator?.name, scores: s.scores, total: s.total, national_identity: s.national_identity, comment: s.comment })), result, files, managers: accs.filter(a => a.role === "management").map(a => ({ id: a.id, name: a.display_name })) };
});
export const POST = route(["admin", "management"], async ({ session, params, request }) => {
  const b = await body(request);
  const rv = await q(db().from("nae_reviews").select("*").eq("id", params.id).single());
  if (rv.status !== "open") throw bad("This review is already decided.");
  if (session.role === "management" && rv.manager_id !== session.sub) throw forbidden("This review is assigned to someone else.");
  if (b.action === "delegate") {
    if (!b.manager_id) throw bad("Pick a manager.");
    const m = await q(db().from("nae_accounts").select("id, role, active").eq("id", b.manager_id).maybeSingle());
    if (!m || m.role !== "management" || !m.active) throw bad("Pick an active management account.");
    await q(db().from("nae_reviews").update({ manager_id: b.manager_id }).eq("id", rv.id));
    await audit(session, "Review delegated", "entry", rv.entry_id, b.note || "");
    return { ok: true, note: "Delegated. The due time stays the same." };
  }
  // the decision is tied to the scores it was made on: if they change later, the entry comes back for review
  const res0 = await q(db().from("nae_results").select("scores_sig, complete").eq("entry_id", rv.entry_id).eq("round_no", rv.round_no).maybeSingle());
  const patch = { decided_at: new Date().toISOString(), decided_by: session.sub, decision_note: b.note || null, scores_sig: res0?.complete ? res0.scores_sig : "incomplete" };
  if (b.action === "confirm") patch.status = "confirmed";
  else if (b.action === "override") {
    if (!String(b.note || "").trim()) throw bad("Give a reason for the override.");
    if (b.outcome !== "pass" && b.outcome !== "fail") throw bad("Choose whether the artwork goes through.");
    patch.status = "overridden"; patch.new_passed = b.outcome === "pass";
    if (b.new_result !== undefined && b.new_result !== "" && b.new_result !== null) { const v = parseInt(b.new_result, 10); if (isNaN(v) || v < 0 || v > 100) throw bad("Enter a result from 0 to 100, or leave it empty."); patch.new_result = v; }
  }
  else throw bad("Unknown action.");
  await q(db().from("nae_reviews").update(patch).eq("id", rv.id));
  const res = await recompute(rv.entry_id, rv.round_no);
  await audit(session, patch.status === "overridden" ? `Overridden: ${patch.new_passed ? "goes through" : "does not go through"}${patch.new_result != null ? `, result ${patch.new_result}` : ""}` : "Result confirmed", "entry", rv.entry_id, b.note || "");
  const e = await q(db().from("nae_entries").select("code, current_round, status").eq("id", rv.entry_id).single());
  const next = await q(db().from("nae_reviews").select("id").eq("status", "open").eq("manager_id", session.sub).order("due_at").limit(1));
  return { ok: true, result: res, next: next[0]?.id || null, note: `${patch.status === "overridden" ? "Overridden" : `Confirmed${res?.final != null ? ` ${res.final}` : ""}`}. ${e.code} ${!res?.complete ? "will be decided when its scores are complete" : rv.round_no === 1 ? (res?.passed ? "goes through to Round 2" : "stops after Round 1") : res?.passed ? "passes Round 2" : "does not pass Round 2"}.` };
});
