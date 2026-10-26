import { db, q, all, inChunks } from "@/lib/db";
import { audit, SYSTEM } from "@/lib/audit";
import { loadStructure, rubricFor, roundOf, isPhysicalRound, versionById, versionView, roundPanel, ENTRY_COLS } from "@/lib/structure";

export const DEFAULT_BANDS = [{ grade: "A", min: 80 }, { grade: "B", min: 50 }, { grade: "C", min: 0 }];
export function weightedTotal(criteria, scores) {
  let t = 0;
  for (const c of criteria || []) t += Number(scores?.[c.key] || 0) * Number(c.weight || 0);
  return Math.ceil(t / 100 - 1e-9);
}
export function gradeOf(total, bands = DEFAULT_BANDS) {
  const b = [...(bands || DEFAULT_BANDS)].sort((x, y) => y.min - x.min).find(b => total >= b.min);
  return b ? b.grade : "";
}
export const bandMin = (bands, g) => ((bands || DEFAULT_BANDS).find(b => b.grade === g) || DEFAULT_BANDS.find(b => b.grade === g) || { min: 0 }).min;
// Grade bands as entered by an admin: A and B minimums, C from 0.
export function cleanBands(b) {
  const A = Number(b?.find?.(x => x.grade === "A")?.min), B = Number(b?.find?.(x => x.grade === "B")?.min);
  if (!Number.isInteger(A) || !Number.isInteger(B) || A < 1 || A > 100 || B < 1 || B >= A) return null;
  return [{ grade: "A", min: A }, { grade: "B", min: B }, { grade: "C", min: 0 }];
}
export function passThreshold(rule, bands = DEFAULT_BANDS) {
  if (rule?.min_score != null) return Number(rule.min_score);
  if (rule?.grades?.length) { const mins = (bands || DEFAULT_BANDS).filter(b => rule.grades.includes(b.grade)).map(b => b.min); return mins.length ? Math.min(...mins) : 50; }
  return 50;
}
// The line the "close to" flag looks at: the pass mark, or the grade A line (Round 2 shortlist).
export function flagLine(round, bands) { return round?.flag_line === "A" ? bandMin(bands, "A") : passThreshold(round?.pass_rule, bands); }
export function passes(rule, { total, grade, identity }) {
  if (total == null) return null;
  if (rule?.min_score != null && total < Number(rule.min_score)) return false;
  if (rule?.grades?.length && !rule.grades.includes(grade)) return false;
  if (rule?.identity && identity !== true) return false;
  return true;
}
// A pass rule must let something through and not everything by accident.
export function ruleProblem(rule) {
  if (!rule || typeof rule !== "object") return "Set who goes through.";
  if (rule.min_score != null) { const n = Number(rule.min_score); if (!Number.isInteger(n) || n < 1 || n > 100) return "The minimum score must be a whole number from 1 to 100."; if (rule.grades?.length) return "Use either a minimum score or grades, not both."; return null; }
  if (!Array.isArray(rule.grades) || !rule.grades.length) return "Tick at least one grade, or set a minimum score.";
  if (rule.grades.some(g => !["A", "B", "C"].includes(g))) return "Grades can only be A, B or C.";
  if (rule.grades.length === 3 && !rule.identity) return "Ticking A, B and C lets every entry through.";
  return null;
}
export function ruleText(rule) {
  const p = [];
  if (rule?.min_score != null) p.push(`score ${rule.min_score} or higher`);
  if (rule?.grades?.length) p.push(`grade ${rule.grades.join(" or ")}`);
  if (rule?.identity) p.push("national identity yes from every evaluator");
  return p.join(", ") || "not set";
}

// ---------- one calculation at a time per entry ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function withLock(key, fn) {
  for (let i = 0; ; i++) {
    const { data, error } = await db().rpc("nae_try_lock", { p_key: key });
    if (error) throw new Error(error.message);
    if (data) break;
    if (i > 80) throw new Error("This entry is busy. Try again in a moment.");
    await sleep(120 + Math.random() * 120);
  }
  try { return await fn(); } finally { await db().from("nae_locks").delete().eq("key", key); }
}

// ---------- reviews ----------
async function pickManager() {
  const managers = await q(db().from("nae_accounts").select("id").eq("role", "management").eq("active", true));
  if (!managers.length) return null;
  const open = await q(db().from("nae_reviews").select("manager_id").eq("status", "open"));
  const load = Object.fromEntries(managers.map(m => [m.id, 0]));
  open.forEach(r => { if (load[r.manager_id] != null) load[r.manager_id]++; });
  return managers.map(m => m.id).sort((a, b) => load[a] - load[b])[0];
}
export async function createReview({ entryId, roundNo, reason, note, session, teamAtFlag, hours = 48 }) {
  const existing = await q(db().from("nae_reviews").select("*").eq("entry_id", entryId).eq("round_no", roundNo).eq("status", "open"));
  if (existing.length) return existing[0];
  const manager = await pickManager();
  const due = new Date(Date.now() + hours * 3600e3).toISOString();
  const { data, error } = await db().from("nae_reviews").insert({ entry_id: entryId, round_no: roundNo, reason, note: note || null, flagged_by: session?.sub || null, due_at: due, manager_id: manager, team_at_flag: teamAtFlag ?? null }).select("*").single();
  if (error) { // another request opened one at the same moment (only one open review per entry and round)
    const again = await q(db().from("nae_reviews").select("*").eq("entry_id", entryId).eq("round_no", roundNo).eq("status", "open"));
    if (again.length) return again[0]; throw new Error(error.message);
  }
  await audit(session || SYSTEM, "Flagged for management review", "entry", entryId, reason);
  return data;
}

// ---------- which rubric version an entry uses ----------
// Every score on an entry in a round uses one rubric version: the version of the first score saved for it
// (a draft counts). Entries with no score yet use the version published now.
export async function pinnedVersion(S, entry, roundNo) {
  const round = roundOf(S, entry.pathway_code, roundNo); if (!round) return null;
  const first = await q(db().from("nae_scores").select("rubric_version_id").eq("entry_id", entry.id).eq("round_id", round.id).not("rubric_version_id", "is", null).order("updated_at").limit(1));
  const hit = first[0] ? versionById(S, first[0].rubric_version_id) : null;
  if (hit) return versionView(hit.rubric, hit.version);
  const rub = rubricFor(S, entry.pathway_code, entry.sub_code, roundNo);
  return rub?.published ? versionView(rub, rub.published) : null;
}

// ---------- who counts for an entry ----------
// Online: the evaluators assigned to it; it needs at least "evaluators per entry" scores.
// Physical: the team of its current session; an evaluator can be marked absent for one entry, but at least
// 2 scores (and never fewer than half the team) are needed.
export async function scorePlan(S, entry, round) {
  if (isPhysicalRound(S, entry, round.round_no)) {
    const links = await q(db().from("nae_session_entries").select("session:nae_sessions!inner(id, evaluator_ids, round_id, status, created_at)").eq("entry_id", entry.id).eq("session.round_id", round.id).neq("session.status", "cancelled"));
    const sess = links.map(l => l.session).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    if (!sess) return { physical: true, session: null, team: [], needed: 0, min: 0 };
    const team = sess.evaluator_ids || [];
    return { physical: true, session: sess, team, needed: team.length, min: Math.min(team.length, Math.max(2, Math.ceil(team.length / 2))) };
  }
  const asg = await q(db().from("nae_assignments").select("evaluator_id").eq("round_id", round.id).eq("entry_id", entry.id));
  const team = asg.map(a => a.evaluator_id);
  const needed = Math.max(team.length, round.evaluators_per_entry || 2);
  return { physical: false, team, needed, min: needed };
}

// Recompute an entry's result for a round, raise automatic flags, move it on when complete.
export async function recompute(entryId, roundNo, opts = {}) {
  return withLock(`result:${entryId}:${roundNo}`, () => recomputeNow(entryId, roundNo, opts));
}
async function recomputeNow(entryId, roundNo, opts) {
  const S = opts.S || await loadStructure();
  const entry = await q(db().from("nae_entries").select("*").eq("id", entryId).single());
  const round = roundOf(S, entry.pathway_code, roundNo); if (!round) return null;
  const existing = await q(db().from("nae_results").select("*").eq("entry_id", entryId).eq("round_no", roundNo).maybeSingle());
  if (existing?.locked && !opts.force) return existing; // locked results change only after an admin unlocks them
  const ver = await pinnedVersion(S, entry, roundNo);
  const bands = ver?.grade_bands || DEFAULT_BANDS;
  const askIdentity = !!ver?.identity_required;
  const plan = await scorePlan(S, entry, round);
  const rows = await q(db().from("nae_scores").select("*").eq("entry_id", entryId).eq("round_id", round.id));
  const inTeam = new Set(plan.team);
  const scores = rows.filter(s => s.status === "submitted" && inTeam.has(s.evaluator_id));
  const absent = plan.physical ? rows.filter(s => s.status === "absent" && inTeam.has(s.evaluator_id)).length : 0;
  const totals = scores.map(s => s.total).filter(v => v != null);
  const team = totals.length ? Math.ceil(totals.reduce((a, b) => a + b, 0) / totals.length - 1e-9) : null;
  const answers = scores.map(s => s.national_identity);
  const identity = askIdentity ? (scores.length ? answers.every(a => a === true) : null) : null;
  const complete = plan.needed > 0 && (plan.physical ? scores.length + absent >= plan.needed && scores.length >= plan.min : scores.length >= plan.needed);
  const sig = complete ? scores.map(s => `${s.evaluator_id}:${s.total}:${s.national_identity}`).sort().join("|") : "incomplete";

  // automatic flags (each can be switched off per round)
  const reasons = [];
  if (complete && team != null) {
    if (round.flag_near !== false) { const line = flagLine(round, bands); if (Math.abs(team - line) <= round.flag_margin) reasons.push(`Within ${round.flag_margin} points of the ${round.flag_line === "A" ? "grade A line" : "pass mark"} (${line})`); }
    const spread = totals.length > 1 ? Math.max(...totals) - Math.min(...totals) : 0;
    if (round.flag_spread !== false && spread > round.spread_limit) reasons.push(`Evaluators ${spread} points apart`);
    if (round.flag_identity !== false && askIdentity && answers.includes(true) && answers.includes(false)) reasons.push("Evaluators disagree on national identity");
  }
  const flag = reasons.join("; ") || null;

  // management decisions: one applies while the scores it was made on are unchanged
  const reviews = await q(db().from("nae_reviews").select("*").eq("entry_id", entryId).eq("round_no", roundNo).order("flagged_at", { ascending: false }));
  let open = reviews.find(r => r.status === "open");
  const latest = reviews.filter(r => r.status !== "open").sort((a, b) => String(b.decided_at).localeCompare(String(a.decided_at)))[0];
  let applies = null;
  if (latest) {
    if (latest.scores_sig == null || latest.scores_sig === sig) applies = latest;                 // decided on these scores (or before tracking began)
    else if (latest.scores_sig === "incomplete" && latest.status === "overridden") applies = latest; // an early decision on the outcome stays
  }
  if (complete && !open && !existing?.locked && !applies) {
    if (flag) open = await createReview({ entryId, roundNo, reason: flag, teamAtFlag: team, hours: round.review_hours });
    else if (latest && latest.scores_sig && latest.scores_sig !== "incomplete") open = await createReview({ entryId, roundNo, reason: "Scores changed after management's decision", teamAtFlag: team, hours: round.review_hours });
  }

  let final = null, passed = null, status;
  const stopped = ["withdrawn", "not_scored"].includes(entry.status) && entry.current_round === roundNo;
  if (!complete) status = scores.length || absent ? "in_progress" : (round.status === "open" ? "to_score" : "not_open");
  else if (open) status = "review";
  else {
    const ov = applies?.status === "overridden" ? applies : null;
    final = ov && ov.new_result != null ? ov.new_result : team;
    passed = ov && ov.new_passed != null ? ov.new_passed : passes(round.pass_rule, { total: final, grade: gradeOf(final, bands), identity });
    status = roundNo === 1 ? (passed ? "through" : "not_through") : "final";
  }
  const row = { entry_id: entryId, round_no: roundNo, round_id: round.id, team, final, grade: final != null ? gradeOf(final, bands) : (team != null ? gradeOf(team, bands) : null), identity_yes: identity, scored: scores.length, needed: plan.needed, complete, passed, flag, locked: !!existing?.locked, rubric_version_id: ver?.version_id || null, scores_sig: sig, updated_at: new Date().toISOString() };
  await q(db().from("nae_results").upsert(row, { onConflict: "entry_id,round_no" }));

  // entry status and moving on (or back)
  const patch = { updated_at: new Date().toISOString() };
  if (stopped) { /* withdrawn or not scored: the entry stays stopped */ }
  else if (entry.current_round === roundNo) {
    if (status === "through" && roundNo === 1 && S.P[entry.pathway_code]?.rounds?.[2]) {
      const r2 = S.P[entry.pathway_code].rounds[2];
      patch.current_round = 2;
      patch.status = r2.status === "open" ? "to_score" : "not_open";
      if (isPhysicalRound(S, entry, 2)) {
        await q(db().from("nae_logistics").upsert({ entry_id: entryId, state: "to_collect", updated_at: new Date().toISOString() }, { onConflict: "entry_id", ignoreDuplicates: true }));
      } else if (r2.status === "open") { await assignEntries(S, r2, [{ ...entry, current_round: 2 }]); }
      if (!opts.quiet) await audit(SYSTEM, "Moved to Round 2", "entry", entryId, `Round 1 result ${final}`);
    } else patch.status = status;
  } else if (roundNo === 1 && entry.current_round === 2 && complete && status !== "through" && status !== "review") {
    // Round 1 changed to "not through" after the entry moved on
    const r2 = roundOf(S, entry.pathway_code, 2);
    const r2s = r2 ? await q(db().from("nae_scores").select("id").eq("entry_id", entryId).eq("round_id", r2.id).eq("status", "submitted")) : [];
    if (!r2s.length) {
      patch.current_round = 1; patch.status = status;
      if (r2) await q(db().from("nae_assignments").delete().eq("entry_id", entryId).eq("round_id", r2.id));
      await q(db().from("nae_logistics").delete().eq("entry_id", entryId).eq("state", "to_collect"));
      await audit(SYSTEM, "Moved back to Round 1", "entry", entryId, `Round 1 result is now ${final}`);
    } else if (!open) {
      await createReview({ entryId, roundNo: 1, reason: "Round 1 result changed after Round 2 scoring started", teamAtFlag: team, hours: round.review_hours });
    }
  }
  if (Object.keys(patch).length > 1) await q(db().from("nae_entries").update(patch).eq("id", entryId));
  return row;
}

// Balanced assignment of entries to the round's evaluator panel (online entries only).
// In Round 2, evaluators who had the entry in Round 1 are used only when there's nobody else.
export async function assignEntries(S, round, entries) {
  const list = entries.filter(e => !isPhysicalRound(S, e, round.round_no) && !["withdrawn", "not_scored"].includes(e.status));
  if (!list.length) return 0;
  const evs = roundPanel(round, await q(db().from("nae_evaluators").select("id, pathways, active, account_id")));
  if (!evs.length) return 0;
  const cur = await all(() => db().from("nae_assignments").select("evaluator_id, entry_id").eq("round_id", round.id));
  const load = Object.fromEntries(evs.map(e => [e.id, 0]));
  const has = new Set(cur.map(a => a.entry_id + ":" + a.evaluator_id));
  const per = {}; cur.forEach(a => { if (load[a.evaluator_id] != null) load[a.evaluator_id]++; per[a.entry_id] = (per[a.entry_id] || 0) + 1; });
  let before = new Set();
  if (round.round_no === 2) {
    const r1 = roundOf(S, round.pathway_code, 1);
    if (r1) before = new Set((await inChunks(list.map(e => e.id), ids => q(db().from("nae_assignments").select("entry_id, evaluator_id").eq("round_id", r1.id).in("entry_id", ids)))).map(a => a.entry_id + ":" + a.evaluator_id));
  }
  const k = Math.min(round.evaluators_per_entry || 2, evs.length);
  const rows = [];
  for (const e of list) {
    let need = k - (per[e.id] || 0);
    const order = evs.map(x => x.id).sort((a, b) => (before.has(e.id + ":" + a) - before.has(e.id + ":" + b)) || load[a] - load[b]);
    for (const id of order) { if (need <= 0) break; if (has.has(e.id + ":" + id)) continue; rows.push({ round_id: round.id, entry_id: e.id, evaluator_id: id }); load[id]++; need--; }
  }
  for (let i = 0; i < rows.length; i += 500) await q(db().from("nae_assignments").upsert(rows.slice(i, i + 500), { onConflict: "round_id,entry_id,evaluator_id", ignoreDuplicates: true }));
  return rows.length;
}
export { ENTRY_COLS };

export async function validateScores(criteria, scores) {
  const out = {};
  for (const c of criteria) { const v = scores?.[c.key]; if (v === "" || v == null) return { error: `Fill every criterion (${c.label}).` }; const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 100) return { error: `${c.label} must be a whole number from 0 to 100.` }; out[c.key] = n; }
  return { scores: out };
}
