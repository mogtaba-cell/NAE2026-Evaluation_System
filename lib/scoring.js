import { db, q } from "@/lib/db";
import { audit, SYSTEM } from "@/lib/audit";
import { loadStructure, rubricFor, roundOf, isPhysicalRound } from "@/lib/structure";

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
export function passThreshold(rule, bands = DEFAULT_BANDS) {
  if (rule?.min_score != null) return Number(rule.min_score);
  if (rule?.grades?.length) { const mins = (bands || DEFAULT_BANDS).filter(b => rule.grades.includes(b.grade)).map(b => b.min); return mins.length ? Math.min(...mins) : 50; }
  return 50;
}
export function passes(rule, { total, grade, identity }) {
  if (total == null) return null;
  if (rule?.min_score != null && total < Number(rule.min_score)) return false;
  if (rule?.grades?.length && !rule.grades.includes(grade)) return false;
  if (rule?.identity && identity === false) return false;
  return true;
}
export function ruleText(rule) {
  const p = [];
  if (rule?.min_score != null) p.push(`score ${rule.min_score} or higher`);
  if (rule?.grades?.length) p.push(`grade ${rule.grades.join(" or ")}`);
  if (rule?.identity) p.push("national identity yes from every evaluator");
  return p.join(", ") || "not set";
}

async function pickManager() {
  const managers = await q(db().from("nae_accounts").select("id").eq("role", "management").eq("active", true));
  if (!managers.length) return null;
  const open = await q(db().from("nae_reviews").select("manager_id").eq("status", "open"));
  const load = Object.fromEntries(managers.map(m => [m.id, 0]));
  open.forEach(r => { if (load[r.manager_id] != null) load[r.manager_id]++; });
  return managers.map(m => m.id).sort((a, b) => load[a] - load[b])[0];
}
export async function createReview({ entryId, roundNo, reason, note, session, teamAtFlag, hours = 48 }) {
  const existing = await q(db().from("nae_reviews").select("id").eq("entry_id", entryId).eq("round_no", roundNo).eq("status", "open"));
  if (existing.length) return existing[0];
  const manager = await pickManager();
  const due = new Date(Date.now() + hours * 3600e3).toISOString();
  const rv = await q(db().from("nae_reviews").insert({ entry_id: entryId, round_no: roundNo, reason, note: note || null, flagged_by: session?.sub || null, due_at: due, manager_id: manager, team_at_flag: teamAtFlag ?? null }).select("*").single());
  await audit(session || SYSTEM, "Flagged for management review", "entry", entryId, reason);
  return rv;
}

// How many evaluator scores an entry needs in a round.
async function neededFor(entry, round, S) {
  if (isPhysicalRound(S, entry, round.round_no)) {
    const links = await q(db().from("nae_session_entries").select("session_id").eq("entry_id", entry.id));
    if (!links.length) return 0;
    const sess = await q(db().from("nae_sessions").select("evaluator_ids, round_id").in("id", links.map(l => l.session_id)));
    const s = sess.find(x => x.round_id === round.id);
    return s ? (s.evaluator_ids || []).length : 0;
  }
  const a = await q(db().from("nae_assignments").select("id").eq("round_id", round.id).eq("entry_id", entry.id));
  return a.length || round.evaluators_per_entry || 2;
}

// Recompute an entry's result for a round, raise automatic flags, move it on when complete.
export async function recompute(entryId, roundNo, opts = {}) {
  const S = opts.S || await loadStructure();
  const entry = await q(db().from("nae_entries").select("*").eq("id", entryId).single());
  const round = roundOf(S, entry.pathway_code, roundNo); if (!round) return null;
  const rubric = rubricFor(S, entry.pathway_code, entry.sub_code, roundNo);
  const bands = rubric?.published?.grade_bands || DEFAULT_BANDS;
  const scores = await q(db().from("nae_scores").select("*").eq("entry_id", entryId).eq("round_id", round.id).eq("status", "submitted"));
  const needed = await neededFor(entry, round, S);
  const totals = scores.map(s => s.total).filter(v => v != null);
  const team = totals.length ? Math.ceil(totals.reduce((a, b) => a + b, 0) / totals.length - 1e-9) : null;
  const identity = rubric?.published?.identity_required ? (scores.length ? scores.every(s => s.national_identity === true) : null) : null;
  const complete = needed > 0 && scores.length >= needed;
  const existing = await q(db().from("nae_results").select("*").eq("entry_id", entryId).eq("round_no", roundNo).maybeSingle());
  let flag = null;
  if (complete && team != null) {
    const thr = passThreshold(round.pass_rule, bands);
    const spread = totals.length > 1 ? Math.max(...totals) - Math.min(...totals) : 0;
    if (Math.abs(team - thr) <= round.flag_margin) flag = `Within ${round.flag_margin} points of the pass mark (${thr})`;
    else if (spread > round.spread_limit) flag = `Evaluators ${spread} points apart`;
  }
  const reviews = await q(db().from("nae_reviews").select("*").eq("entry_id", entryId).eq("round_no", roundNo).order("flagged_at", { ascending: false }));
  let open = reviews.find(r => r.status === "open");
  const decided = reviews.find(r => r.status !== "open");
  if (complete && flag && !open && !decided && !existing?.locked) {
    open = await createReview({ entryId, roundNo, reason: flag, teamAtFlag: team, hours: round.review_hours });
  }
  let final = null, passed = null, status;
  if (!complete) status = scores.length ? "in_progress" : (round.status === "open" ? "to_score" : "not_open");
  else if (open) status = "review";
  else {
    final = decided && decided.status === "overridden" && decided.new_result != null ? decided.new_result : team;
    passed = passes(round.pass_rule, { total: final, grade: gradeOf(final, bands), identity });
    status = roundNo === 1 ? (passed ? "through" : "not_through") : "final";
  }
  const row = { entry_id: entryId, round_no: roundNo, round_id: round.id, team, final, grade: final != null ? gradeOf(final, bands) : (team != null ? gradeOf(team, bands) : null), identity_yes: identity, scored: scores.length, needed, complete, passed, flag: flag || null, locked: existing?.locked && complete ? true : !!(complete && !open), updated_at: new Date().toISOString() };
  await q(db().from("nae_results").upsert(row, { onConflict: "entry_id,round_no" }));

  // entry status and moving on
  const patch = { updated_at: new Date().toISOString() };
  if (entry.current_round === roundNo) {
    if (status === "through" && roundNo === 1 && S.P[entry.pathway_code]?.rounds?.[2]) {
      const r2 = S.P[entry.pathway_code].rounds[2];
      patch.current_round = 2;
      patch.status = r2.status === "open" ? "to_score" : "not_open";
      if (isPhysicalRound(S, entry, 2)) {
        await q(db().from("nae_logistics").upsert({ entry_id: entryId, state: "to_collect", updated_at: new Date().toISOString() }, { onConflict: "entry_id", ignoreDuplicates: true }));
      } else if (r2.status === "open") { await assignEntries(S, r2, [{ ...entry, current_round: 2 }]); }
      if (!opts.quiet) await audit(SYSTEM, `Moved to Round 2`, "entry", entryId, `Round 1 result ${final}`);
    } else patch.status = status;
  } else if (roundNo === 1 && entry.current_round === 2 && status !== "through") {
    // Round 1 changed after the entry moved on: bring it back only if Round 2 has no scores yet
    const r2 = roundOf(S, entry.pathway_code, 2);
    const r2s = r2 ? await q(db().from("nae_scores").select("id").eq("entry_id", entryId).eq("round_id", r2.id)) : [];
    if (!r2s.length) { patch.current_round = 1; patch.status = status; await q(db().from("nae_logistics").delete().eq("entry_id", entryId).eq("state", "to_collect")); }
  }
  await q(db().from("nae_entries").update(patch).eq("id", entryId));
  return row;
}

// Balanced assignment of entries to the pathway's evaluator panel for an online round.
export async function assignEntries(S, round, entries) {
  const list = entries.filter(e => !isPhysicalRound(S, e, round.round_no));
  if (!list.length) return 0;
  const evs = (await q(db().from("nae_evaluators").select("id, pathways").eq("active", true).not("account_id", "is", null))).filter(e => (e.pathways || []).includes(round.pathway_code));
  if (!evs.length) return 0;
  const cur = await q(db().from("nae_assignments").select("evaluator_id, entry_id").eq("round_id", round.id));
  const load = Object.fromEntries(evs.map(e => [e.id, 0]));
  const has = new Set(cur.map(a => a.entry_id + ":" + a.evaluator_id));
  const per = {}; cur.forEach(a => { if (load[a.evaluator_id] != null) load[a.evaluator_id]++; per[a.entry_id] = (per[a.entry_id] || 0) + 1; });
  const k = Math.min(round.evaluators_per_entry || 2, evs.length);
  const rows = [];
  for (const e of list) {
    let need = k - (per[e.id] || 0);
    const order = evs.map(x => x.id).sort((a, b) => load[a] - load[b]);
    for (const id of order) { if (need <= 0) break; if (has.has(e.id + ":" + id)) continue; rows.push({ round_id: round.id, entry_id: e.id, evaluator_id: id }); load[id]++; need--; }
  }
  for (let i = 0; i < rows.length; i += 500) await q(db().from("nae_assignments").upsert(rows.slice(i, i + 500), { onConflict: "round_id,entry_id,evaluator_id", ignoreDuplicates: true }));
  return rows.length;
}

export async function validateScores(criteria, scores) {
  const out = {};
  for (const c of criteria) { const v = scores?.[c.key]; if (v === "" || v == null) return { error: `Fill every criterion (${c.label}).` }; const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 100) return { error: `${c.label} must be a whole number from 0 to 100.` }; out[c.key] = n; }
  return { scores: out };
}
