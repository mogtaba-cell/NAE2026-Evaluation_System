import { route, body, bad } from "@/lib/api";
import { db, q, all } from "@/lib/db";
import { audit } from "@/lib/audit";
import { loadStructure } from "@/lib/structure";
import { assignEntries } from "@/lib/scoring";

const FIELDS = ["opens_on", "closes_on", "mode", "pass_rule", "evaluators_per_entry", "flag_margin", "spread_limit", "review_hours", "name"];
export const PATCH = route(["admin"], async ({ session, params, request }) => {
  const b = await body(request);
  const r = await q(db().from("nae_rounds").select("*").eq("id", params.id).single());
  if ((r.locked || r.status !== "setup") && !String(b.reason || "").trim()) throw bad("This round has started. Give a reason for the change.");
  const patch = {}; FIELDS.forEach(k => { if (b[k] !== undefined) patch[k] = b[k] === "" ? null : b[k]; });
  await q(db().from("nae_rounds").update(patch).eq("id", r.id));
  await audit(session, `Round settings changed (${r.pathway_code} Round ${r.round_no})`, "round", r.id, [JSON.stringify(patch), b.reason].filter(Boolean).join(" · "));
  return { ok: true };
});

export const POST = route(["admin"], async ({ session, params, request }) => {
  const b = await body(request);
  const S = await loadStructure();
  const r = S.roundById[params.id]; if (!r) throw bad("Round not found.");
  const tag = `${S.P[r.pathway_code].name} Round ${r.round_no}`;
  if (b.action === "open") {
    if (r.status === "open") return { ok: true };
    const subs = S.P[r.pathway_code].subs;
    const missing = subs.filter(s => { const id = r.round_no === 2 ? (s.rubric_r2 || s.rubric_r1) : s.rubric_r1; return !id || !S.rubrics[id]?.published; });
    const used = await all(() => db().from("nae_entries").select("sub_code").eq("pathway_code", r.pathway_code));
    const usedSubs = new Set(used.map(x => x.sub_code));
    const blocking = missing.filter(s => usedSubs.has(s.code));
    if (blocking.length) throw bad(`Publish a rubric first for: ${blocking.map(s => s.name).join(", ")}.`);
    if (!r.opens_on || !r.closes_on) throw bad("Set the open and close dates first.");
    await q(db().from("nae_rounds").update({ status: "open", opened_at: new Date().toISOString() }).eq("id", r.id));
    await q(db().from("nae_pathways").update({ status: "open" }).eq("code", r.pathway_code));
    const ents = await all(() => db().from("nae_entries").select("id, pathway_code, sub_code, current_round, status").eq("pathway_code", r.pathway_code).eq("current_round", r.round_no));
    const waiting = ents.filter(e => e.status === "not_open").map(e => e.id);
    for (let i = 0; i < waiting.length; i += 150) await q(db().from("nae_entries").update({ status: "to_score" }).in("id", waiting.slice(i, i + 150)));
    const n = await assignEntries(S, { ...r, status: "open" }, ents);
    await audit(session, `Opened ${tag}`, "round", r.id, `${ents.length} entries, ${n} evaluator assignments`);
    return { ok: true, note: `${tag} is open. ${ents.length} entries are ready, ${n} evaluator assignments made.` };
  }
  if (b.action === "close") {
    const ents = await all(() => db().from("nae_entries").select("id, status").eq("pathway_code", r.pathway_code).eq("current_round", r.round_no));
    const notDone = ents.filter(e => ["to_score", "in_progress", "review", "not_open"].includes(e.status));
    if (notDone.length && !String(b.reason || "").trim()) throw bad(`${notDone.length} entries are not finished. Give a reason to close anyway.`);
    await q(db().from("nae_rounds").update({ status: "closed", closed_at: new Date().toISOString(), locked: true }).eq("id", r.id));
    await q(db().from("nae_results").update({ locked: true }).eq("round_id", r.id).eq("complete", true));
    await audit(session, `Closed ${tag}`, "round", r.id, b.reason || `${ents.length} entries`);
    return { ok: true, note: `${tag} is closed and its results are locked.` };
  }
  if (b.action === "assign") {
    // Top up assignments: drop ones held by evaluators who can no longer score online (and have no score yet), then rebalance.
    if (r.status !== "open") throw bad("Open the round first.");
    const ok = new Set((await q(db().from("nae_evaluators").select("id, pathways").eq("active", true).not("account_id", "is", null))).filter(e => (e.pathways || []).includes(r.pathway_code)).map(e => e.id));
    const cur = await all(() => db().from("nae_assignments").select("id, entry_id, evaluator_id").eq("round_id", r.id));
    const scored = new Set((await all(() => db().from("nae_scores").select("entry_id, evaluator_id").eq("round_id", r.id))).map(s => s.entry_id + ":" + s.evaluator_id));
    const drop = cur.filter(a => !ok.has(a.evaluator_id) && !scored.has(a.entry_id + ":" + a.evaluator_id)).map(a => a.id);
    for (let i = 0; i < drop.length; i += 150) await q(db().from("nae_assignments").delete().in("id", drop.slice(i, i + 150)));
    const ents = await all(() => db().from("nae_entries").select("id, pathway_code, sub_code, current_round, status").eq("pathway_code", r.pathway_code).eq("current_round", r.round_no).in("status", ["to_score", "in_progress"]));
    const n = await assignEntries(S, r, ents);
    await audit(session, `Rebalanced assignments for ${tag}`, "round", r.id, `${drop.length} removed, ${n} added`);
    return { ok: true, note: `Assignments updated: ${drop.length} removed, ${n} added.` };
  }
  if (b.action === "unlock") {
    if (!String(b.reason || "").trim()) throw bad("Give a reason for unlocking.");
    await q(db().from("nae_rounds").update({ status: "open", locked: false }).eq("id", r.id));
    await q(db().from("nae_results").update({ locked: false }).eq("round_id", r.id));
    await audit(session, `Unlocked ${tag}`, "round", r.id, b.reason);
    return { ok: true, note: `${tag} is unlocked. Every change is in the audit log.` };
  }
  throw bad("Unknown action.");
});
