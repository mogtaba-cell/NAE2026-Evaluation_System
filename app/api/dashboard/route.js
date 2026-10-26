import { route } from "@/lib/api";
import { db, q, qc, all } from "@/lib/db";
import { loadStructure } from "@/lib/structure";

export const GET = route("*", async ({ session }) => {
  const S = await loadStructure();
  const now = Date.now();
  const counts = await all(() => db().from("nae_v_entry_counts").select("*"));
  const total = counts.reduce((a, x) => a + x.n, 0), students = counts.reduce((a, x) => a + (x.students || 0), 0);
  const { count: schools } = await qc(db().from("nae_schools").select("id", { count: "exact", head: true }));
  const prog = await q(db().rpc("nae_scoring_progress"));
  const pathways = S.pathways.map(p => {
    const c = counts.filter(x => x.pathway_code === p.code); const n = c.reduce((a, x) => a + x.n, 0);
    const openR = Object.values(S.P[p.code].rounds).filter(r => r.status === "open").sort((a, b) => b.round_no - a.round_no)[0];
    const pr = openR ? prog.find(x => x.round_id === openR.id) : null;
    const st = {}; c.forEach(x => { st[x.status] = (st[x.status] || 0) + x.n; });
    return { code: p.code, name: p.name, entries: n, round: openR ? openR.round_no : null, roundStatus: openR ? "open" : (Object.values(S.P[p.code].rounds).some(r => r.status === "closed") ? "between" : "setup"), closes_on: openR?.closes_on, assigned: pr?.assigned || 0, submitted: pr?.submitted || 0, status: st };
  });
  const reviews = await q(db().from("nae_reviews").select("id, entry_id, manager_id, status, due_at, reason, flagged_at, entry:nae_entries(code, title_en)").eq("status", "open").order("due_at"));
  const out = { role: session.role, total, students, schools, pathways, reviews: { open: reviews.length, overdue: reviews.filter(r => Date.parse(r.due_at) < now).length } };
  if (["admin", "storage", "coordinator", "leadership"].includes(session.role)) {
    const lg = await all(() => db().from("nae_logistics").select("state, location, condition, damaged, needs_framing, collection_id, entry:nae_entries(coordinator_id, code)"));
    out.logistics = { total: lg.length, to_collect: lg.filter(x => x.state === "to_collect").length, unbatched: lg.filter(x => x.state === "to_collect" && !x.collection_id).length, storage: lg.filter(x => x.state === "storage").length, coordinator: lg.filter(x => x.state === "coordinator").length, missing: lg.filter(x => x.state === "missing").length, damaged: lg.filter(x => x.damaged).length, framer: lg.filter(x => x.state === "framer").length, framing: lg.filter(x => x.needs_framing).length, returned: lg.filter(x => x.state === "returned").length, shelves: lg.filter(x => x.state === "storage").reduce((m, x) => { m[x.location || "Not shelved"] = (m[x.location || "Not shelved"] || 0) + 1; return m; }, {}) };
    if (session.role === "coordinator") { const mine = lg.filter(x => x.entry?.coordinator_id === session.sub); out.logistics.mineMissing = mine.filter(x => x.state === "missing").map(x => x.entry.code); }
  }
  const sessions = await q(db().from("nae_sessions").select("id, title, session_date, time_text, venue, status, coordinator_id, evaluator_ids, entries:nae_session_entries(entry_id)").order("session_date"));
  out.sessions = sessions.filter(s => s.status !== "cancelled" && (session.role !== "coordinator" || s.coordinator_id === session.sub)).map(s => ({ ...s, count: s.entries.length, entries: undefined, mine: s.coordinator_id === session.sub }));
  // rounds still open after their closing date (dates don't close rounds by themselves)
  const today = new Date().toISOString().slice(0, 10);
  out.lateRounds = S.rounds.filter(r => r.status === "open" && r.closes_on && r.closes_on < today).map(r => ({ id: r.id, pathway: S.P[r.pathway_code]?.name, round_no: r.round_no, closes_on: r.closes_on }));
  if (session.role === "admin") {
    const [unalloc, nofiles, unmatched, toCollect] = await Promise.all([
      qc(db().from("nae_entries").select("pathway_code", { count: "exact" }).is("coordinator_id", null).limit(5000)),
      qc(db().from("nae_entries").select("id", { count: "exact", head: true }).eq("files_count", 0)),
      qc(db().from("nae_unmatched_folders").select("path_key", { count: "exact", head: true })),
      qc(db().from("nae_collections").select("id", { count: "exact", head: true }).eq("status", "scheduled"))
    ]);
    const byPw = {}; unalloc.data.forEach(x => { byPw[x.pathway_code] = (byPw[x.pathway_code] || 0) + 1; });
    out.attention = { unallocated: byPw, nofiles: nofiles.count, unmatched: unmatched.count, collectionsScheduled: toCollect.count, oldestOverdue: reviews.find(r => Date.parse(r.due_at) < now) || null };
    const act = await q(db().from("nae_audit").select("*").order("at", { ascending: false }).limit(8));
    const eids = [...new Set(act.filter(x => x.object_type === "entry" && x.object_id).map(x => x.object_id))];
    const codes = eids.length ? await q(db().from("nae_entries").select("id, code").in("id", eids)) : [];
    out.activity = act.map(x => ({ ...x, entry_code: codes.find(c => c.id === x.object_id)?.code || null }));
  }
  if (session.role === "coordinator") {
    const mine = await all(() => db().from("nae_entries").select("id, code, title_en, status, current_round, files_count, school_id, school:nae_schools(name), results:nae_results(round_no, passed, complete)").eq("coordinator_id", session.sub));
    const st = {}; mine.forEach(e => { const k = `${e.current_round}:${e.status}`; st[k] = (st[k] || 0) + 1; });
    const cols = await q(db().from("nae_collections").select("id, code, scheduled_on, status, school:nae_schools(name), items:nae_logistics(entry_id, entry:nae_entries(coordinator_id))").eq("status", "scheduled"));
    const r2pass = mine.filter(e => (e.results || []).some(r => r.round_no === 2 && r.complete && r.passed)).length;
    out.mine = { entries: mine.length, schools: new Set(mine.map(e => e.school_id)).size, status: st, r2passed: r2pass, nofiles: mine.filter(e => !e.files_count).slice(0, 12), collections: cols.filter(c => c.items.some(i => i.entry?.coordinator_id === session.sub)).map(c => ({ id: c.id, code: c.code, scheduled_on: c.scheduled_on, school: c.school?.name, count: c.items.length })) };
  }
  if (session.role === "management") {
    const mine = await q(db().from("nae_reviews").select("id, status, due_at, decided_at, reason, entry:nae_entries(code, title_en)").eq("manager_id", session.sub).order("due_at"));
    out.mine = { open: mine.filter(r => r.status === "open"), decided: mine.filter(r => r.status !== "open").length, overridden: mine.filter(r => r.status === "overridden").length };
  }
  if (session.role === "leadership" || session.role === "admin") {
    out.students_stats = await q(db().from("nae_v_student_stats").select("*"));
    out.school_stats = await q(db().from("nae_v_school_stats").select("*"));
  }
  return out;
});
