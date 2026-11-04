import { route } from "@/lib/api";
import { db, q } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { boardRows } from "@/lib/board";
import { dueAt } from "@/lib/sessiontime";

// Upcoming moves for the Logistics team: every planned or live session with physical artworks, soonest first,
// with the artworks still to bring (from which room, shelf and row) and where they go (the session's venue).
export const GET = route(["admin", "storage", "coordinator"], async ({ session, scope }) => {
  const S = await loadStructure(); const { has } = await scope(S);
  let sessions = (await q(db().from("nae_sessions").select("*, coordinator:nae_accounts(display_name)").in("status", ["planned", "live"]))).filter(s => has(S.roundById[s.round_id]?.pathway_code));
  if (session.role === "coordinator") sessions = sessions.filter(s => s.coordinator_id === session.sub);
  const out = [];
  for (const s of sessions) {
    const rows = await boardRows(S, s);
    if (!rows.length) continue;
    const r = S.roundById[s.round_id];
    out.push({ id: s.id, title: s.title, status: s.status, date: s.session_date, start: s.start_time, end: s.end_time, time: s.time_text, venue: s.venue, coordinator: s.coordinator?.display_name || "", pathway: S.P[r.pathway_code]?.name, round_no: r.round_no, due: dueAt(s),
      bring: rows.filter(x => x.lane === "waiting"), room: rows.filter(x => x.lane === "room").length, back: rows.filter(x => x.lane === "back").length, total: rows.length,
      // a strip of small photos for the session card: what is still to bring first, then the room, then handed back
      thumbs: ["waiting", "room", "back"].flatMap(k => rows.filter(x => x.lane === k && x.thumb)).slice(0, 6).map(x => ({ code: x.code, title: x.title, thumb: x.thumb })) });
  }
  out.sort((a, b) => (a.status === "live" ? 0 : 1) - (b.status === "live" ? 0 : 1) || String(a.date || "9").localeCompare(String(b.date || "9")) || String(a.start || "").localeCompare(String(b.start || "")));
  return { sessions: out };
});
