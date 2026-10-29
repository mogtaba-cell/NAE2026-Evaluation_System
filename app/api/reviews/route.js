import { route, body, bad, forbidden } from "@/lib/api";
import { db, q, all, inChunks } from "@/lib/db";
import { createReview } from "@/lib/scoring";
import { canWorkOnEntry, can, mySessionEntryIds } from "@/lib/perms";
import { loadStructure, roundOf } from "@/lib/structure";

export const GET = route(["admin", "management", "coordinator", "leadership"], async ({ session, url, scope: inProgram }) => {
  const scope = url.searchParams.get("scope") || (session.role === "management" ? "mine" : "all");
  const status = url.searchParams.get("status") || "open";
  let qy = db().from("nae_reviews").select("*, entry:nae_entries(id, code, title_en, group_name, pathway_code, sub_code, coordinator_id, school:nae_schools(name))").order(status === "open" ? "due_at" : "decided_at", { ascending: status === "open" });
  qy = status === "open" ? qy.eq("status", "open") : qy.neq("status", "open");
  if (scope === "mine") qy = qy.eq("manager_id", session.sub);
  let rows = await all(() => qy);
  if (session.role === "coordinator") { const mine = new Set(await mySessionEntryIds(session)); rows = rows.filter(r => r.entry && (r.entry.coordinator_id === session.sub || mine.has(r.entry_id))); }
  const S = await loadStructure();
  const { has } = await inProgram(S);
  rows = rows.filter(r => r.entry && has(r.entry.pathway_code));
  const scores = await inChunks(rows.map(r => r.entry_id), ids => q(db().from("nae_scores").select("entry_id, round_id, total, status").in("entry_id", ids).eq("status", "submitted")));
  const accs = await q(db().from("nae_accounts").select("id, display_name, role"));
  const name = id => accs.find(a => a.id === id)?.display_name || null;
  const managers = accs.filter(a => a.role === "management").map(m => ({ id: m.id, name: m.display_name }));
  const all2 = (await all(() => db().from("nae_reviews").select("manager_id, status, due_at, decided_at, flagged_at, entry:nae_entries(pathway_code)"))).filter(r => has(r.entry?.pathway_code));
  const now = Date.now();
  const load = managers.map(m => ({ ...m, open: all2.filter(r => r.manager_id === m.id && r.status === "open").length, overdue: all2.filter(r => r.manager_id === m.id && r.status === "open" && Date.parse(r.due_at) < now).length, decided: all2.filter(r => r.manager_id === m.id && r.status !== "open").length }));
  return {
    rows: rows.map(r => { const rd = roundOf(S, r.entry.pathway_code, r.round_no); return { ...r, manager: name(r.manager_id), flagged_by_name: r.flagged_by ? name(r.flagged_by) : "System", decided_by_name: name(r.decided_by), totals: scores.filter(s => s.entry_id === r.entry_id && s.round_id === rd?.id).map(s => s.total) }; }),
    managers: load, totals: { open: all2.filter(r => r.status === "open").length, overdue: all2.filter(r => r.status === "open" && Date.parse(r.due_at) < now).length, decided: all2.filter(r => r.status !== "open").length, overridden: (await q(db().from("nae_reviews").select("id").eq("status", "overridden"))).length }
  };
});
export const POST = route(["admin", "coordinator", "management"], async ({ session, request }) => {
  const b = await body(request);
  const e = await q(db().from("nae_entries").select("*").eq("code", b.entry_code).maybeSingle()); if (!e) throw bad("Artwork not found.");
  if (!(await canWorkOnEntry(session, e))) throw forbidden();
  if (!String(b.reason || "").trim()) throw bad("Pick a reason.");
  const S = await loadStructure(); const r = roundOf(S, e.pathway_code, Number(b.round_no || e.current_round));
  const res = await q(db().from("nae_results").select("team").eq("entry_id", e.id).eq("round_no", r.round_no).maybeSingle());
  const rv = await createReview({ entryId: e.id, roundNo: r.round_no, reason: b.reason, note: b.note, session, teamAtFlag: res?.team, hours: r.review_hours });
  await q(db().from("nae_entries").update({ status: "review" }).eq("id", e.id).eq("current_round", r.round_no));
  const m = rv.manager_id ? await q(db().from("nae_accounts").select("display_name").eq("id", rv.manager_id).single()) : null;
  return { ok: true, note: `Flagged. Assigned to ${m?.display_name || "a manager"}, due in ${r.review_hours} hours.` };
});
