import { route, body, bad } from "@/lib/api";
import { db, q, all } from "@/lib/db";
import { audit } from "@/lib/audit";
import { loadStructure, roundPanel, isPhysicalRound, ENTRY_COLS } from "@/lib/structure";
import { assignEntries, recompute, ruleProblem, passes } from "@/lib/scoring";
import { readinessData, roundReadiness } from "@/lib/readiness";

const UNFINISHED = ["to_score", "in_progress", "review", "not_open"];
const int = (v, lo, hi, name) => { const n = Number(v); if (!Number.isInteger(n) || n < lo || n > hi) throw bad(`${name} must be a whole number from ${lo} to ${hi}.`); return n; };

// Round settings. Once a round has started, every change needs a reason and is audited with the old values.
export const PATCH = route(["admin"], async ({ session, params, request }) => {
  const b = await body(request);
  const r = await q(db().from("nae_rounds").select("*").eq("id", params.id).single());
  const started = r.locked || r.status !== "setup";
  if (started && !String(b.reason || "").trim()) throw bad("This round has started. Give a reason for the change.");
  const patch = {};
  if (b.name !== undefined) patch.name = String(b.name).trim() || r.name;
  if (b.opens_on !== undefined) patch.opens_on = b.opens_on || null;
  if (b.closes_on !== undefined) patch.closes_on = b.closes_on || null;
  const o = patch.opens_on !== undefined ? patch.opens_on : r.opens_on, c = patch.closes_on !== undefined ? patch.closes_on : r.closes_on;
  if (o && c && c < o) throw bad("The closing date is before the opening date.");
  if (b.pass_rule !== undefined) { const p = ruleProblem(b.pass_rule); if (p) throw bad(p); patch.pass_rule = b.pass_rule.min_score != null ? { min_score: Number(b.pass_rule.min_score), ...(b.pass_rule.identity ? { identity: true } : {}) } : { grades: [...new Set(b.pass_rule.grades)].sort(), ...(b.pass_rule.identity ? { identity: true } : {}) }; }
  if (b.evaluators_per_entry !== undefined) patch.evaluators_per_entry = int(b.evaluators_per_entry, 1, 6, "Evaluators per entry");
  if (b.flag_near !== undefined) patch.flag_near = !!b.flag_near;
  if (b.flag_margin !== undefined) patch.flag_margin = int(b.flag_margin, 0, 20, "The \"close to\" margin");
  if (b.flag_line !== undefined) { if (!["pass", "A"].includes(b.flag_line)) throw bad("Unknown flag line."); patch.flag_line = b.flag_line; }
  if (b.flag_spread !== undefined) patch.flag_spread = !!b.flag_spread;
  if (b.spread_limit !== undefined) patch.spread_limit = int(b.spread_limit, 1, 100, "The disagreement limit");
  if (b.flag_identity !== undefined) patch.flag_identity = !!b.flag_identity;
  if (b.review_hours !== undefined) patch.review_hours = int(b.review_hours, 1, 720, "Review time");
  if (b.evaluator_ids !== undefined) {
    if (b.evaluator_ids !== null && !Array.isArray(b.evaluator_ids)) throw bad("Pick the evaluators.");
    patch.evaluator_ids = b.evaluator_ids && b.evaluator_ids.length ? [...new Set(b.evaluator_ids)] : null;
  }
  const before = Object.fromEntries(Object.keys(patch).map(k => [k, r[k]]));
  await q(db().from("nae_rounds").update(patch).eq("id", r.id));
  await audit(session, `Round settings changed (${r.pathway_code} Round ${r.round_no})`, "round", r.id, [`Was ${JSON.stringify(before)}`, `Now ${JSON.stringify(patch)}`, b.reason].filter(Boolean).join(" · "));
  // If the rule or flags changed after results were decided, say how many outcomes the new rule would change.
  let impact = 0, flagsChanged = false;
  if (started && (patch.pass_rule || "flag_near" in patch || "flag_margin" in patch || "flag_line" in patch || "flag_spread" in patch || "spread_limit" in patch || "flag_identity" in patch)) {
    const rule = patch.pass_rule || r.pass_rule;
    const res = await all(() => db().from("nae_results").select("entry_id, final, grade, identity_yes, passed, locked").eq("round_id", r.id).eq("complete", true));
    impact = res.filter(x => !x.locked && x.final != null && passes(rule, { total: x.final, grade: x.grade, identity: x.identity_yes }) !== x.passed).length;
    flagsChanged = ["flag_near", "flag_margin", "flag_line", "flag_spread", "spread_limit", "flag_identity"].some(k => k in patch) && res.some(x => !x.locked);
  }
  return { ok: true, impact, flagsChanged };
});

export const POST = route(["admin"], async ({ session, params, request }) => {
  const b = await body(request);
  const S = await loadStructure();
  const r = S.roundById[params.id]; if (!r) throw bad("Round not found.");
  const tag = `${S.P[r.pathway_code].name} Round ${r.round_no}`;
  const reason = String(b.reason || "").trim();

  if (b.action === "readiness") return roundReadiness(S, r, await readinessData());

  if (b.action === "open") {
    if (r.status === "open") return { ok: true };
    if (r.status === "closed") throw bad("This round is closed. Use Unlock (with a reason) to reopen it.");
    const rd = roundReadiness(S, r, await readinessData());
    if (!rd.hardOk) throw bad(`Not ready: ${rd.blockers.filter(x => x.hard).map(x => `${x.label} (${x.text})`).join("; ")}.`);
    if (!rd.ready && !reason) throw bad(`Not everything is ready: ${rd.blockers.map(x => x.label).join(", ")}. Give a reason to open anyway.`);
    await q(db().from("nae_rounds").update({ status: "open", opened_at: new Date().toISOString() }).eq("id", r.id));
    await q(db().from("nae_pathways").update({ status: "open" }).eq("code", r.pathway_code));
    const n = await startEntries(S, { ...r, status: "open" });
    await audit(session, `Opened ${tag}`, "round", r.id, [`${n.entries} entries, ${n.assigned} evaluator assignments`, !rd.ready ? `Opened with: ${rd.blockers.map(x => x.label).join(", ")}. Reason: ${reason}` : null].filter(Boolean).join(" · "));
    return { ok: true, note: `${tag} is open. ${n.entries} entries are ready, ${n.assigned} evaluator assignments made.` };
  }

  if (b.action === "close") {
    const ents = await all(() => db().from("nae_entries").select("id, code, status").eq("pathway_code", r.pathway_code).eq("current_round", r.round_no));
    const notDone = ents.filter(e => UNFINISHED.includes(e.status));
    if (notDone.length) throw bad(`${notDone.length} entr${notDone.length === 1 ? "y is" : "ies are"} not finished (for example ${notDone.slice(0, 3).map(e => e.code).join(", ")}). Score, reassign or mark them "not scored" first.`);
    await q(db().from("nae_rounds").update({ status: "closed", closed_at: new Date().toISOString(), locked: true }).eq("id", r.id));
    await q(db().from("nae_results").update({ locked: true }).eq("round_id", r.id).eq("complete", true));
    await audit(session, `Closed ${tag}`, "round", r.id, reason || `${ents.length} entries`);
    return { ok: true, note: `${tag} is closed. Its results are now final and locked.` };
  }

  if (b.action === "not_scored") {
    // Stop unfinished entries: chosen ones, or every unfinished one in the round.
    if (!reason) throw bad("Give a reason.");
    let ents = await all(() => db().from("nae_entries").select("id, code, status").eq("pathway_code", r.pathway_code).eq("current_round", r.round_no).in("status", UNFINISHED));
    if (Array.isArray(b.codes) && b.codes.length) ents = ents.filter(e => b.codes.includes(e.code));
    for (const part of chunk(ents.map(e => e.id), 150)) await q(db().from("nae_entries").update({ status: "not_scored", updated_at: new Date().toISOString() }).in("id", part));
    for (const part of chunk(ents.map(e => e.id), 150)) await q(db().from("nae_reviews").update({ status: "confirmed", decided_at: new Date().toISOString(), decided_by: session.sub, decision_note: `Closed: entry marked not scored. ${reason}` }).in("entry_id", part).eq("round_no", r.round_no).eq("status", "open"));
    await audit(session, `Marked ${ents.length} entries not scored (${tag})`, "round", r.id, `${ents.map(e => e.code).slice(0, 40).join(", ")} · ${reason}`);
    return { ok: true, note: `${ents.length} entr${ents.length === 1 ? "y" : "ies"} marked not scored.` };
  }

  if (b.action === "assign") {
    // Rebalance: take entries away from evaluators no longer on the panel (unless they already submitted),
    // give waiting entries to the panel, then recalculate the entries that changed.
    if (r.status !== "open") throw bad("Open the round first.");
    const panel = new Set(roundPanel(r, await q(db().from("nae_evaluators").select("id, pathways, active, account_id"))).map(e => e.id));
    const cur = await all(() => db().from("nae_assignments").select("id, entry_id, evaluator_id").eq("round_id", r.id));
    const submitted = new Set((await all(() => db().from("nae_scores").select("entry_id, evaluator_id").eq("round_id", r.id).eq("status", "submitted"))).map(s => s.entry_id + ":" + s.evaluator_id));
    const drop = cur.filter(a => !panel.has(a.evaluator_id) && !submitted.has(a.entry_id + ":" + a.evaluator_id));
    for (const part of chunk(drop.map(a => a.id), 150)) await q(db().from("nae_assignments").delete().in("id", part));
    const n = await startEntries(S, r);
    const touched = [...new Set([...drop.map(a => a.entry_id), ...n.ids])];
    for (const id of touched) await recompute(id, r.round_no, { S, quiet: true });
    const short = n.short ? ` ${n.short} entr${n.short === 1 ? "y has" : "ies have"} fewer evaluators than needed: add evaluators to the Round ${r.round_no} panel.` : "";
    await audit(session, `Rebalanced assignments for ${tag}`, "round", r.id, `${drop.length} removed, ${n.assigned} added`);
    return { ok: true, note: `Assignments updated: ${drop.length} removed, ${n.assigned} added.${short}` };
  }

  if (b.action === "recompute") {
    // Apply changed rules or flags to results already decided (locked results are left alone).
    if (!reason) throw bad("Give a reason.");
    const res = await all(() => db().from("nae_results").select("entry_id, passed").eq("round_id", r.id).eq("locked", false));
    let changed = 0;
    for (const x of res) { const n = await recompute(x.entry_id, r.round_no, { S, quiet: true }); if (n && n.passed !== x.passed) changed++; }
    await audit(session, `Recalculated ${res.length} results (${tag})`, "round", r.id, `${changed} outcomes changed · ${reason}`);
    return { ok: true, note: `${res.length} results recalculated, ${changed} outcome${changed === 1 ? "" : "s"} changed.` };
  }

  if (b.action === "unlock") {
    if (!reason) throw bad("Give a reason for unlocking.");
    await q(db().from("nae_rounds").update({ status: "open", locked: false }).eq("id", r.id));
    await q(db().from("nae_results").update({ locked: false }).eq("round_id", r.id));
    const n = await startEntries(S, { ...r, status: "open", locked: false });
    await audit(session, `Unlocked ${tag}`, "round", r.id, reason);
    return { ok: true, note: `${tag} is open again${n.assigned ? ` (${n.assigned} new assignments)` : ""}. Every change is in the audit log.` };
  }
  throw bad("Unknown action.");
});

const chunk = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
// Entries waiting in a round that has just opened (or reopened): mark them ready and give the online ones evaluators.
async function startEntries(S, r) {
  const ents = await all(() => db().from("nae_entries").select(ENTRY_COLS).eq("pathway_code", r.pathway_code).eq("current_round", r.round_no));
  const waiting = ents.filter(e => e.status === "not_open").map(e => e.id);
  for (const part of chunk(waiting, 150)) await q(db().from("nae_entries").update({ status: "to_score" }).in("id", part));
  const live = ents.filter(e => ["not_open", "to_score", "in_progress"].includes(e.status)).map(e => ({ ...e, status: e.status === "not_open" ? "to_score" : e.status }));
  const assigned = await assignEntries(S, r, live);
  const per = {}; (await all(() => db().from("nae_assignments").select("entry_id").eq("round_id", r.id))).forEach(a => { per[a.entry_id] = (per[a.entry_id] || 0) + 1; });
  const short = live.filter(e => !isPhysicalRound(S, e, r.round_no) && (per[e.id] || 0) < (r.evaluators_per_entry || 2)).length;
  return { entries: ents.length, assigned, short, ids: live.map(e => e.id) };
}
