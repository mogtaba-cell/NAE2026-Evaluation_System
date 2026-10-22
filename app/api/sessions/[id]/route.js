import { route, body, bad, forbidden } from "@/lib/api";
import { db, q } from "@/lib/db";
import { loadStructure, rubricFor } from "@/lib/structure";
import { entryFiles } from "@/lib/files";
import { fileView } from "@/lib/entryview";
import { audit } from "@/lib/audit";

export const GET = route(["admin", "coordinator", "storage"], async ({ session, params, url }) => {
  const S = await loadStructure();
  const s = await q(db().from("nae_sessions").select("*, coordinator:nae_accounts(display_name)").eq("id", params.id).single());
  const r = S.roundById[s.round_id];
  const links = await q(db().from("nae_session_entries").select("position, entry:nae_entries(*, school:nae_schools(name, esis))").eq("session_id", s.id).order("position"));
  const ids = links.map(l => l.entry.id);
  const [scores, results, logistics, evs] = await Promise.all([
    q(db().from("nae_scores").select("*").eq("round_id", r.id).in("entry_id", ids)),
    q(db().from("nae_results").select("*").eq("round_no", 2).in("entry_id", ids)),
    q(db().from("nae_logistics").select("*").in("entry_id", ids)),
    q(db().from("nae_evaluators").select("id, name, account_id").in("id", s.evaluator_ids || []))
  ]);
  const cur = url.searchParams.get("entry") || null;
  const entries = [];
  for (const l of links) {
    const e = l.entry; const rub = rubricFor(S, e.pathway_code, e.sub_code, 2);
    const r1 = await q(db().from("nae_results").select("final, team, grade").eq("entry_id", e.id).eq("round_no", 1).maybeSingle());
    const full = cur ? cur === e.code : entries.length === 0;
    entries.push({ code: e.code, title_en: e.title_en, title_ar: e.title_ar, group_name: e.group_name, students_count: e.students_count, grades_text: e.grades_text, school: e.school?.name, sub: (S.P[e.pathway_code].subs.find(x => x.code === e.sub_code) || {}).name, medium: e.medium, size_text: e.size_text, description_en: e.description_en, description_ar: e.description_ar, reflections: e.reflections, r1, rubric: rub?.published ? { version_id: rub.published.id, code: rub.code, version: rub.published.version, criteria: rub.published.criteria, identity_required: rub.published.identity_required } : null, scores: scores.filter(x => x.entry_id === e.id), result: results.find(x => x.entry_id === e.id) || null, logistics: logistics.find(x => x.entry_id === e.id) || null, files: null });
  }
  const target = entries.find(x => x.code === cur) || entries.find(x => !x.result?.complete) || entries[0];
  if (target) { const e = links.find(l => l.entry.code === target.code).entry; target.files = (await entryFiles(e)).map(fileView); }
  return { session: { ...s, coordinator: s.coordinator?.display_name, pathway: S.P[r.pathway_code].name, round_no: r.round_no, round_status: r.status, threshold: 80 }, team: (s.evaluator_ids || []).map(id => evs.find(e => e.id === id)).filter(Boolean), entries, current: target?.code || null, rules: { flag_margin: r.flag_margin, spread_limit: r.spread_limit, pass_rule: r.pass_rule } };
});
export const PATCH = route(["admin", "coordinator"], async ({ session, params, request }) => {
  const b = await body(request);
  const s = await q(db().from("nae_sessions").select("*").eq("id", params.id).single());
  if (session.role === "coordinator" && s.coordinator_id !== session.sub) throw forbidden("Only the session's coordinator can change it.");
  if (!["planned", "live", "done"].includes(b.status)) throw bad("Unknown status.");
  await q(db().from("nae_sessions").update({ status: b.status }).eq("id", s.id));
  const ids = (await q(db().from("nae_session_entries").select("entry_id").eq("session_id", s.id))).map(x => x.entry_id);
  if (ids.length) await q(db().from("nae_logistics").update({ state: b.status === "live" ? "coordinator" : "storage", updated_at: new Date().toISOString() }).in("entry_id", ids).in("state", b.status === "live" ? ["storage"] : ["coordinator"]));
  await audit(session, `${s.title}: ${b.status === "live" ? "started" : b.status === "done" ? "finished, entries back to storage" : "planned"}`, "session", s.id);
  return { ok: true };
});
