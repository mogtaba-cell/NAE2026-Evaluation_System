import { route } from "@/lib/api";
import { db, q, all, inChunks } from "@/lib/db";
import { loadStructure } from "@/lib/structure";

// KPIs and charts for HQ, management and admins. Optional ?pathway= narrows everything to one pathway.
export const GET = route(["admin", "management", "leadership"], async ({ url }) => {
  const S = await loadStructure();
  const pw = url.searchParams.get("pathway") || "";
  const inPw = code => !pw || code === pw;
  const now = Date.now(), DAY = 864e5;

  const [entries, results, reviews, sessions, logistics, coords, schools] = await Promise.all([
    all(() => db().from("nae_entries").select("id, pathway_code, sub_code, school_id, current_round, status, coordinator_id, students_count")),
    all(() => db().from("nae_results").select("entry_id, round_no, complete, passed, final, team, grade, locked")),
    all(() => db().from("nae_reviews").select("entry_id, round_no, status, flagged_at, decided_at, due_at")),
    q(db().from("nae_sessions").select("id, round_id, status")),
    all(() => db().from("nae_logistics").select("entry_id, state, damaged, needs_framing")),
    q(db().from("nae_accounts").select("id, display_name, pathways").eq("role", "coordinator")),
    all(() => db().from("nae_schools").select("id, name, region, school_type"))
  ]);
  const E = entries.filter(e => inPw(e.pathway_code));
  const ids = new Set(E.map(e => e.id));
  const R = results.filter(r => ids.has(r.entry_id));
  const resMap = {}; R.forEach(r => { resMap[r.entry_id + ":" + r.round_no] = r; });
  const rOf = (id, no) => resMap[id + ":" + no];
  const sinceIso = new Date(now - 30 * DAY).toISOString();
  const roundIds = S.rounds.filter(r => inPw(r.pathway_code)).map(r => r.id);
  const scores = roundIds.length ? await all(() => db().from("nae_scores").select("submitted_at, round_id").eq("status", "submitted").gte("submitted_at", sinceIso).in("round_id", roundIds)) : [];
  const scoresTotal = roundIds.length ? (await db().from("nae_scores").select("id", { count: "exact", head: true }).eq("status", "submitted").in("round_id", roundIds)).count || 0 : 0;
  const students = E.length ? await inChunks([...ids], part => q(db().from("nae_entry_students").select("entry_id, nationality, gender").in("entry_id", part))) : [];
  const schoolById = Object.fromEntries(schools.map(s => [s.id, s]));

  // headline numbers
  const r1through = E.filter(e => rOf(e.id, 1)?.complete && rOf(e.id, 1)?.passed).length;
  const r2passed = E.filter(e => rOf(e.id, 2)?.complete && rOf(e.id, 2)?.passed).length;
  const shortlisted = E.filter(e => { const r = rOf(e.id, 2); return r?.complete && r.passed && r.grade === "A"; }).length;
  const Rv = reviews.filter(r => ids.has(r.entry_id));
  const open = Rv.filter(r => r.status === "open");
  const decided = Rv.filter(r => r.status !== "open" && r.decided_at);
  const avgHours = decided.length ? Math.round(decided.reduce((a, r) => a + (Date.parse(r.decided_at) - Date.parse(r.flagged_at)), 0) / decided.length / 36e5) : null;
  const L = logistics.filter(l => ids.has(l.entry_id));

  // funnel per pathway
  const pathways = S.pathways.filter(p => inPw(p.code)).map(p => {
    const pe = E.filter(e => e.pathway_code === p.code);
    const c = (no, f) => pe.filter(e => { const r = rOf(e.id, no); return r && f(r); }).length;
    const openR = Object.values(S.P[p.code].rounds).filter(r => r.status === "open").sort((a, b) => b.round_no - a.round_no)[0];
    return { code: p.code, name: p.name, entries: pe.length,
      stages: [["Entries", pe.length], ["Round 1 scored", c(1, r => r.complete)], ["Through to Round 2", c(1, r => r.complete && r.passed)], ["Round 2 scored", c(2, r => r.complete)], ["Passed Round 2", c(2, r => r.complete && r.passed)]],
      grades: [1, 2].map(no => ({ round: no, A: c(no, r => r.complete && r.grade === "A"), B: c(no, r => r.complete && r.grade === "B"), C: c(no, r => r.complete && r.grade === "C") })),
      stage: openR ? `Round ${openR.round_no} open` : Object.values(S.P[p.code].rounds).some(r => r.status === "closed") ? "Between rounds" : "Setup",
      progress: openR ? { round: openR.round_no, done: pe.filter(e => e.current_round === openR.round_no && rOf(e.id, openR.round_no)?.complete).length, total: pe.filter(e => e.current_round === openR.round_no && !["withdrawn"].includes(e.status)).length } : null };
  });

  // score distribution (team results), 10-point bins, per round
  const hist = [1, 2].map(no => { const b = Array(10).fill(0); R.filter(r => r.round_no === no && r.complete && (r.final ?? r.team) != null).forEach(r => { b[Math.min(9, Math.floor((r.final ?? r.team) / 10))]++; }); return { round: no, bins: b }; });

  // scores submitted per day, last 21 days (Dubai time)
  const dayKey = t => new Date(Date.parse(t) + 4 * 36e5).toISOString().slice(0, 10);
  const days = []; for (let i = 20; i >= 0; i--) days.push(new Date(now + 4 * 36e5 - i * DAY).toISOString().slice(0, 10));
  const perDay = Object.fromEntries(days.map(d => [d, 0])); scores.forEach(s => { const k = dayKey(s.submitted_at); if (k in perDay) perDay[k]++; });

  // coordinators
  const coordRows = coords.filter(c => !pw || (c.pathways || []).includes(pw) || E.some(e => e.coordinator_id === c.id)).map(c => {
    const mine = E.filter(e => e.coordinator_id === c.id);
    const scored = mine.filter(e => rOf(e.id, e.current_round)?.complete || ["through", "not_through", "final"].includes(e.status)).length;
    return { name: c.display_name, pathways: c.pathways || [], entries: mine.length, schools: new Set(mine.map(e => e.school_id)).size, scored, through: mine.filter(e => rOf(e.id, 1)?.complete && rOf(e.id, 1)?.passed).length, review: mine.filter(e => e.status === "review").length };
  }).filter(c => c.entries).sort((a, b) => b.entries - a.entries);

  // schools with the most entries through to Round 2
  const bySchool = {}; E.forEach(e => { const k = e.school_id || "none"; const g = bySchool[k] = bySchool[k] || { name: schoolById[e.school_id]?.name || "No school", entries: 0, through: 0 }; g.entries++; if (rOf(e.id, 1)?.complete && rOf(e.id, 1)?.passed) g.through++; });
  const topSchools = Object.values(bySchool).sort((a, b) => b.through - a.through || b.entries - a.entries).slice(0, 8);

  const count = (arr, f) => { const m = {}; arr.forEach(x => { const k = f(x) || "Not given"; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n); };
  return {
    pathway: pw,
    pathwayOptions: S.pathways.map(p => ({ code: p.code, name: p.name })),
    kpis: { entries: E.length, students: students.length, schools: new Set(E.map(e => e.school_id).filter(Boolean)).size, scores: scoresTotal, r1through, r2passed, shortlisted, reviewsOpen: open.length, reviewsOverdue: open.filter(r => Date.parse(r.due_at) < now).length, avgReviewHours: avgHours },
    pathways, hist,
    daily: days.map(d => ({ day: d, n: perDay[d] })),
    reviews: { open: open.length, overdue: open.filter(r => Date.parse(r.due_at) < now).length, confirmed: Rv.filter(r => r.status === "confirmed").length, overridden: Rv.filter(r => r.status === "overridden").length },
    sessions: { planned: sessions.filter(s => s.status === "planned" && roundIds.includes(s.round_id)).length, live: sessions.filter(s => s.status === "live" && roundIds.includes(s.round_id)).length, done: sessions.filter(s => s.status === "done" && roundIds.includes(s.round_id)).length },
    logistics: L.length ? [["To collect", L.filter(l => l.state === "to_collect").length], ["In storage", L.filter(l => l.state === "storage").length], ["With coordinator", L.filter(l => l.state === "coordinator").length], ["Missing", L.filter(l => l.state === "missing").length], ["At the framer", L.filter(l => l.state === "framer").length], ["Returned", L.filter(l => l.state === "returned").length]].map(([label, n]) => ({ label, n })) : [],
    logisticsExtra: { damaged: L.filter(l => l.damaged).length, framing: L.filter(l => l.needs_framing).length, total: L.length },
    coordinators: coordRows, topSchools,
    participation: { region: count(E, e => schoolById[e.school_id]?.region), type: count(E, e => schoolById[e.school_id]?.school_type), gender: count(students, s => s.gender), nationality: count(students, s => s.nationality) }
  };
});
