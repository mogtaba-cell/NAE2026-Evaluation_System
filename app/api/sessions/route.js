import { route, body, bad } from "@/lib/api";
import { db, q, all } from "@/lib/db";
import { loadStructure, isPhysicalRound } from "@/lib/structure";
import { recompute } from "@/lib/scoring";
import { audit } from "@/lib/audit";

export const GET = route(["admin", "coordinator", "storage"], async ({ session }) => {
  const S = await loadStructure();
  let qy = db().from("nae_sessions").select("*, coordinator:nae_accounts(display_name), entries:nae_session_entries(entry_id)").order("session_date", { ascending: true });
  const sessions = await q(qy);
  const evs = await q(db().from("nae_evaluators").select("id, name, account_id"));
  const ids = sessions.flatMap(s => s.entries.map(x => x.entry_id));
  const res = ids.length ? await all(() => db().from("nae_results").select("entry_id, round_id, complete").in("entry_id", ids.slice(0, 900))) : [];
  const ready = await all(() => db().from("nae_logistics").select("entry_id, state, entry:nae_entries(id, pathway_code, sub_code, current_round)").eq("state", "storage"));
  const inSess = new Set(ids);
  return {
    sessions: sessions.map(s => ({ ...s, pathway: S.P[S.roundById[s.round_id]?.pathway_code]?.name, round_no: S.roundById[s.round_id]?.round_no, coordinator: s.coordinator?.display_name, team: (s.evaluator_ids || []).map(id => evs.find(e => e.id === id)).filter(Boolean), count: s.entries.length, scored: s.entries.filter(x => res.find(r => r.entry_id === x.entry_id && r.round_id === s.round_id && r.complete)).length, mine: s.coordinator_id === session.sub })),
    ready: ready.filter(r => r.entry && !inSess.has(r.entry_id)).length,
    rounds: S.rounds.filter(r => r.round_no === 2 && ["physical", "mixed"].includes(r.mode)).map(r => ({ id: r.id, pathway_code: r.pathway_code, pathway: S.P[r.pathway_code].name, status: r.status })),
    evaluators: evs
  };
});
export const POST = route(["admin", "coordinator"], async ({ session, request }) => {
  const b = await body(request);
  const S = await loadStructure(); const r = S.roundById[b.round_id]; if (!r) throw bad("Pick the round.");
  if (!(b.evaluator_ids || []).length) throw bad("Pick at least one evaluator for the team.");
  let entryIds = b.entry_ids || [];
  if (!entryIds.length) {
    const inS = await all(() => db().from("nae_session_entries").select("entry_id"));
    const used = new Set(inS.map(x => x.entry_id));
    const pool = (await all(() => db().from("nae_logistics").select("entry_id, entry:nae_entries(id, code, pathway_code, sub_code, current_round, school_id)").in("state", ["storage"]))).filter(x => x.entry && x.entry.pathway_code === r.pathway_code && x.entry.current_round === 2 && !used.has(x.entry_id));
    pool.sort((a, b) => String(a.entry.school_id).localeCompare(String(b.entry.school_id)) || a.entry.code.localeCompare(b.entry.code));
    entryIds = pool.slice(0, Math.max(1, Number(b.count) || 9)).map(x => x.entry_id);
  }
  if (!entryIds.length) throw bad("No collected entries are waiting for a session.");
  const count = (await q(db().from("nae_sessions").select("id").eq("round_id", r.id))).length;
  const s = await q(db().from("nae_sessions").insert({ round_id: r.id, title: b.title || `${S.P[r.pathway_code].name} · Round 2 · Session ${count + 1}`, session_date: b.session_date || null, time_text: b.time_text || null, venue: b.venue || null, coordinator_id: b.coordinator_id || session.sub, evaluator_ids: b.evaluator_ids }).select("*").single());
  await q(db().from("nae_session_entries").insert(entryIds.map((id, i) => ({ session_id: s.id, entry_id: id, position: i }))));
  for (const id of entryIds) await recompute(id, 2, { S, quiet: true });
  await audit(session, `Created ${s.title}`, "session", s.id, `${entryIds.length} entries · pull list sent to storage`);
  return { id: s.id, count: entryIds.length };
});
