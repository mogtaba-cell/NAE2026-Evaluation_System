import { route, body, bad, forbidden } from "@/lib/api";
import { db, q, inChunks } from "@/lib/db";
import { loadStructure, isPhysicalRound } from "@/lib/structure";
import { applyMove } from "@/lib/movements";
import { audit } from "@/lib/audit";
import { boardRows } from "@/lib/board";

// The live board of one scoring session, shared by its coordinator and the Logistics team.
// Lanes: waiting on the shelves -> in the room (batch 1, 2, ...) -> handed back -> back on the shelves.
// Logistics brings the next batch (a number of artworks in shelf order, or ticked ones); the coordinator hands a batch
// back when it is scored; Logistics confirms it is back on the shelves. Every move is recorded on each artwork.
async function load(id, session) {
  const s = await q(db().from("nae_sessions").select("*, coordinator:nae_accounts(display_name)").eq("id", id).maybeSingle());
  if (!s) throw bad("Session not found.");
  if (session.role === "coordinator" && s.coordinator_id !== session.sub) throw forbidden("This session is run by another coordinator.");
  return s;
}
export const GET = route(["admin", "coordinator", "storage"], async ({ session, params, scope }) => {
  const S = await loadStructure(); await scope(S);
  const s = await load(params.id, session);
  const rows = await boardRows(S, s);
  const r = S.roundById[s.round_id];
  return { session: { id: s.id, title: s.title, status: s.status, date: s.session_date, time: s.time_text, start: s.start_time, end: s.end_time, venue: s.venue, coordinator: s.coordinator?.display_name, pathway: S.P[r.pathway_code]?.name, round_no: r.round_no, mine: s.coordinator_id === session.sub }, rows, nextBatch: Math.max(s.batches || 0, ...rows.map(x => x.batch || 0)) + 1 };
});

// bring (storage: next N in shelf order, or given codes) | back (coordinator/storage: a batch or given codes) |
// shelve (storage: confirm back on the shelves) | missing (storage)
export const POST = route(["admin", "coordinator", "storage"], async ({ session, params, request }) => {
  const b = await body(request);
  const S = await loadStructure();
  const s = await load(params.id, session);
  if (s.status === "cancelled") throw bad("This session was cancelled.");
  const rows = await boardRows(S, s, { thumbs: false });
  const staff = ["admin", "storage"].includes(session.role);
  const pickCodes = (lane, extra) => { const want = Array.isArray(b.codes) && b.codes.length ? new Set(b.codes) : null; return rows.filter(x => x.lane === lane && (!want || want.has(x.code)) && (!extra || extra(x))); };
  const ids = async list => list.length ? (await inChunks(list.map(x => x.code), part => q(db().from("nae_entries").select("id, code").in("code", part)))).map(x => x.id) : [];
  let action, list, opts = { ref_type: "session", ref_id: s.id }, what;
  if (b.action === "bring") {
    if (!staff) throw forbidden("The Logistics team brings artworks to the room.");
    if (s.status === "done") throw bad("This session is finished.");
    list = pickCodes("waiting");
    if (!b.codes?.length) list = list.slice(0, Math.max(1, Math.min(200, Number(b.count) || 10)));
    const batch = Math.max(s.batches || 0, ...rows.map(x => x.batch || 0)) + 1;
    await q(db().from("nae_sessions").update({ batches: batch }).eq("id", s.id));
    const coord = s.coordinator?.display_name || null;
    action = "to_room"; opts = { ...opts, session_id: s.id, batch, received_by: coord }; what = `Batch ${batch} brought to the room`;
  } else if (b.action === "back") {
    if (session.role === "coordinator" && s.coordinator_id !== session.sub) throw forbidden();
    list = pickCodes("room", b.batch ? x => x.batch === Number(b.batch) : null);
    action = "return_room"; what = b.batch ? `Batch ${b.batch} handed back to storage` : "Artworks handed back to storage";
  } else if (b.action === "shelve") {
    if (!staff) throw forbidden("The Logistics team confirms artworks are back on the shelves.");
    list = [...pickCodes("back"), ...(b.from_room ? pickCodes("room", b.batch ? x => x.batch === Number(b.batch) : null) : [])];
    action = "receive_back"; opts = { ...opts, location_id: b.location_id || null }; what = "Back on the shelves";
  } else if (b.action === "missing") {
    if (!staff) throw forbidden();
    list = rows.filter(x => (b.codes || []).includes(x.code) && ["waiting", "room", "back"].includes(x.lane));
    action = "missing"; opts = { ...opts, note: b.note || `Not found for ${s.title}` }; what = "Marked missing";
  } else throw bad("Unknown action.");
  if (!list.length) throw bad("No artworks to move.");
  const r = await applyMove(session, action, await ids(list), opts);
  if (r.done.length) await audit(session, `${s.title}: ${what} (${r.done.length})`, "session", s.id, r.done.slice(0, 40).join(", "));
  return { ok: true, done: r.done.length, note: `${what}: ${r.done.length} artwork${r.done.length === 1 ? "" : "s"}.${r.skipped.length ? ` ${r.skipped.length} skipped.` : ""}` };
});
