import { venueFields } from "@/lib/venues";
import { route, body, bad, forbidden } from "@/lib/api";
import { db, q, all, inChunks } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { sessionPool, sessionOrder, takeNext } from "@/lib/sessions";
import { requestForSession } from "@/lib/movements";
import { recompute } from "@/lib/scoring";
import { audit } from "@/lib/audit";

export const GET = route(["admin", "coordinator", "storage"], async ({ session, scope, url }) => {
  const S = await loadStructure();
  const { has } = await scope(S);
  // ?pool=ROUND_ID: the single entries waiting for a session in that round, to pick artworks one by one
  const poolId = url.searchParams.get("pool");
  if (poolId) {
    const r = S.roundById[poolId]; if (!r || !has(r.pathway_code)) return { entries: [] };
    const pool = await sessionPool(S, r);
    const subName = c => (S.P[r.pathway_code].subs.find(x => x.code === c) || {}).name;
    return { entries: sessionOrder(pool).map(x => ({ id: x.entry_id, code: x.entry.code, title: x.entry.title_en, school_id: x.entry.school_id || "none", school: x.entry.school?.name || "No school", sub_code: x.entry.sub_code, sub: subName(x.entry.sub_code), online: !!x.online, where: x.loc ? `${x.loc.label}` : x.location || null, mine: x.entry.coordinator_id === session.sub }))
      .map((e, i) => ({ ...e, order: i })) };
  }
  const sessions = (await q(db().from("nae_sessions").select("*, coordinator:nae_accounts(display_name), entries:nae_session_entries(entry_id, pulled)").order("session_date", { ascending: true }))).filter(s => has(S.roundById[s.round_id]?.pathway_code));
  const lgs = await inChunks(sessions.map(s => s.id), part => q(db().from("nae_logistics").select("session_id, state").in("session_id", part)));
  const evs = await q(db().from("nae_evaluators").select("id, name, account_id, pathways, active").order("name"));
  const ids = sessions.flatMap(s => s.entries.map(x => x.entry_id));
  const res = await inChunks(ids, part => q(db().from("nae_results").select("entry_id, round_id, complete").in("entry_id", part)));
  // any round that is not closed: Round 2 physical artworks, and online entries scored by evaluators without a login
  const rounds = S.rounds.filter(r => has(r.pathway_code) && r.status !== "closed" && (r.status === "open" || (r.round_no === 2 && S.P[r.pathway_code].subs.some(s => s.is_physical))));
  const pools = {};
  // working out what's waiting is the slow part: only when asked (?pools=1, the New session form and banner)
  if (url.searchParams.get("pools")) for (const r of rounds) {
    const pool = await sessionPool(S, r);
    const bySchool = {};
    pool.forEach(x => { const k = x.entry.school_id || "none"; const g = bySchool[k] = bySchool[k] || { school_id: x.entry.school_id, name: x.entry.school?.name || "No school", esis: x.entry.school?.esis, count: 0, physical: 0, subs: {}, physSubs: {}, mine: false }; g.count++; if (!x.online) { g.physical++; g.physSubs[x.entry.sub_code] = (g.physSubs[x.entry.sub_code] || 0) + 1; } g.subs[x.entry.sub_code] = (g.subs[x.entry.sub_code] || 0) + 1; if (x.entry.coordinator_id === session.sub) g.mine = true; });
    pools[r.id] = Object.values(bySchool).sort((a, b) => (b.mine - a.mine) || a.name.localeCompare(b.name));
  }
  const visible = sessions.filter(s => session.role !== "coordinator" || s.coordinator_id === session.sub);
  return {
    sessions: visible.map(s => ({ ...s, pathway: S.P[S.roundById[s.round_id]?.pathway_code]?.name, round_no: S.roundById[s.round_id]?.round_no, coordinator: s.coordinator?.display_name, team: (s.evaluator_ids || []).map(id => evs.find(e => e.id === id)).filter(Boolean).map(e => ({ id: e.id, name: e.name })), count: s.entries.length, pulled: s.entries.filter(x => x.pulled).length, scored: s.entries.filter(x => res.find(r => r.entry_id === x.entry_id && r.round_id === s.round_id && r.complete)).length, mine: s.coordinator_id === session.sub, artworks: lgs.filter(l => l.session_id === s.id).reduce((m, l) => { m[l.state] = (m[l.state] || 0) + 1; return m; }, {}), entries: undefined })),
    ready: Object.values(pools).reduce((a, p) => a + p.reduce((b, g) => b + g.count, 0), 0),
    rounds: rounds.map(r => ({ id: r.id, round_no: r.round_no, pathway_code: r.pathway_code, pathway: S.P[r.pathway_code].name, status: r.status, subs: S.P[r.pathway_code].subs.map(s => ({ code: s.code, name: s.name, physical: r.round_no === 2 && s.is_physical })) })),
    pools,
    evaluators: evs.filter(e => e.active).map(e => ({ id: e.id, name: e.name, account_id: e.account_id, pathways: e.pathways })),
    coordinators: session.role === "admin" ? await q(db().from("nae_accounts").select("id, display_name, pathways").eq("role", "coordinator").eq("active", true).order("display_name")) : []
  };
});

export const POST = route(["admin", "coordinator"], async ({ session, request }) => {
  const b = await body(request);
  const S = await loadStructure(); const r = S.roundById[b.round_id]; if (!r || r.status === "closed") throw bad("Pick an open round.");
  const team = [...new Set(b.evaluator_ids || [])];
  if (!team.length) throw bad("Pick at least one evaluator for the team.");
  const evs = await q(db().from("nae_evaluators").select("id, active").in("id", team));
  if (evs.length !== team.length || evs.some(e => !e.active)) throw bad("Pick active evaluators only.");
  let coordinatorId = session.sub;
  if (session.role === "admin") {
    if (!b.coordinator_id) throw bad("Pick the coordinator who runs the session.");
    const c = await q(db().from("nae_accounts").select("id, role, active").eq("id", b.coordinator_id).maybeSingle());
    if (!c || c.role !== "coordinator" || !c.active) throw bad("Pick an active coordinator.");
    coordinatorId = c.id;
  }
  // entries: whole schools picked from the waiting pool (optionally only some subpathways), or given entries
  // checked against the same pool
  const pool = await sessionPool(S, r);
  let picked;
  if (Number(b.count) > 0) {
    // a number of artworks: optionally one subpathway set and one kind (physical / online), the coordinator's own first
    const subs = Array.isArray(b.sub_codes) && b.sub_codes.length ? new Set(b.sub_codes) : null;
    const cand = pool.filter(x => (!subs || subs.has(x.entry.sub_code)) && (b.kind === "physical" ? !x.online : b.kind === "online" ? x.online : true));
    picked = takeNext(cand, Math.min(500, Number(b.count)), { coordinatorId, mineFirst: b.mine_first !== false });
  } else if (Array.isArray(b.entry_ids) && b.entry_ids.length) {
    const ok = new Set(pool.map(x => x.entry_id));
    if (b.entry_ids.some(id => !ok.has(id))) throw bad("Some of those artworks are not waiting for a session.");
    picked = pool.filter(x => b.entry_ids.includes(x.entry_id));
  } else {
    const schools = new Set(b.school_ids || []); if (!schools.size) throw bad("Pick at least one school.");
    const subs = Array.isArray(b.sub_codes) && b.sub_codes.length ? new Set(b.sub_codes) : null;
    picked = pool.filter(x => schools.has(x.entry.school_id || "none") && (!subs || subs.has(x.entry.sub_code)));
  }
  if (!picked.length) throw bad("No waiting artworks match. Check the schools and subpathways.");
  picked = sessionOrder(picked);
  const where = await venueFields(b.venue_id);
  const count = (await q(db().from("nae_sessions").select("id").eq("round_id", r.id))).length;
  const s = await q(db().from("nae_sessions").insert({ round_id: r.id, title: String(b.title || "").trim() || `${S.P[r.pathway_code].name} · Round ${r.round_no} · Session ${count + 1}`, session_date: b.session_date || null, time_text: b.time_text || null, ...where, coordinator_id: coordinatorId, evaluator_ids: team }).select("*").single());
  await q(db().from("nae_session_entries").insert(picked.map((x, i) => ({ session_id: s.id, entry_id: x.entry_id, position: i }))));
  const requested = await requestForSession(session, s, picked.filter(x => !x.online).map(x => x.entry_id));
  for (const x of picked) await recompute(x.entry_id, r.round_no, { S, quiet: true });
  await audit(session, `Created ${s.title}`, "session", s.id, `${picked.length} artworks${requested ? ` · ${requested} physical, on the Logistics session board` : ""}`);
  return { id: s.id, count: picked.length, physical: requested, online: picked.filter(x => x.online).length };
});
