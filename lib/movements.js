import { db, q, inChunks } from "@/lib/db";
import { bad, forbidden } from "@/lib/api";

// Artwork movements (plan, slides 11 to 13). One shared chain that both teams see:
//   requested → picked → handed over → received by the coordinator → returning → back in storage
// plus collection, framing, showcase, return to the school and exceptions. Every change is one event in
// nae_logistics_events (who, when, from/to, where, handed by/received by, note). Any step can be done for a
// whole batch (a session or a collection) or for selected artworks.
export const STATES = {
  to_collect: "Awaiting delivery", received: "Received, to be stored", storage: "In storage", requested: "Waiting for its session", picked: "Picked from the shelf",
  handed_over: "Handed to the coordinator", coordinator: "In the session room", returning: "Handed back to storage",
  framer: "At the framer", photography: "At photography", showcase: "Ready for showcase", exhibition: "At the exhibition", returned: "Returned to the school", missing: "Missing"
};
export const SHORT = { to_collect: "Awaiting delivery", received: "To be stored", storage: "In storage", requested: "Waiting for its session", picked: "Picked", handed_over: "Handed over", coordinator: "In the session room", returning: "Handed back", framer: "At the framer", photography: "At photography", showcase: "Showcase", exhibition: "At the exhibition", returned: "Returned to school", missing: "Missing" };
const STAFF = ["admin", "storage"];
// action: [from states, to state, roles, label]
export const ACTIONS = {
  to_room:       [["requested", "picked", "storage", "handed_over"], "coordinator", STAFF, "Brought to the session room"],
  return_room:   [["coordinator", "handed_over"], "returning", ["admin", "coordinator", "storage"], "Batch done: handed back to storage"],
  pick:          [["requested"], "picked", STAFF, "Picked from the shelf"],
  unpick:        [["picked"], "requested", STAFF, "Put back (not picked)"],
  hand_over:     [["requested", "picked"], "handed_over", STAFF, "Handed to the coordinator"],
  receive:       [["handed_over"], "coordinator", ["admin", "coordinator"], "Received by the coordinator"],
  send_back:     [["coordinator", "handed_over"], "returning", ["admin", "coordinator"], "Handed back to storage"],
  receive_back:  [["returning", "coordinator", "handed_over"], "storage", STAFF, "Back on the shelves"],
  store:         [["received"], "storage", STAFF, "Stored (room, shelf and row)"],
  move:          [["storage", "showcase"], null, STAFF, "Moved"],
  to_framer:     [["storage"], "framer", STAFF, "Sent to the framer"],
  from_framer:   [["framer"], "storage", STAFF, "Back to storage from the framer"],
  showcase:      [["storage"], "showcase", STAFF, "Ready for the showcase"],
  unshowcase:    [["showcase"], "storage", STAFF, "Back in storage from the showcase list"],
  to_photo:      [["storage", "showcase"], "photography", STAFF, "Sent to photography"],
  from_photo:    [["photography"], "storage", STAFF, "Photographed: back in storage"],
  to_exhibition: [["storage", "showcase"], "exhibition", STAFF, "Sent to the exhibition site"],
  exhibit_move:  [["exhibition"], null, STAFF, "Placed in the exhibition"],
  from_exhibition: [["exhibition"], "storage", STAFF, "Back from the exhibition"],
  return_school: [["storage", "showcase", "exhibition"], "returned", STAFF, "Returned to the school"],
  missing:       [["received", "storage", "requested", "picked", "handed_over", "coordinator", "returning"], "missing", STAFF, "Marked missing"],
  found:         [["missing"], "storage", STAFF, "Found and put in storage"]
};
const NEEDS_LOCATION = ["receive_back", "from_framer", "found", "store", "from_photo", "from_exhibition"];

export async function logEvents(session, rows) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += 500) await q(db().from("nae_logistics_events").insert(rows.slice(i, i + 500).map(r => ({ actor_id: session?.sub || null, actor_name: session?.name || "System", ...r }))));
}

async function locationOf(id) {
  if (!id) return null;
  const l = await q(db().from("nae_locations").select("id, room, shelf, label, active").eq("id", id).maybeSingle());
  if (!l || !l.active) throw bad("Pick an active storage location.");
  return l;
}

// Apply one action to many artworks. Artworks not in a state the action applies to are skipped (and listed).
// opts: location_id (and per-artwork locations {code: id}), received_by, handed_by, note, vendor, due, check(entry, lg) → error text or null
export async function applyMove(session, action, entryIds, opts = {}) {
  const def = ACTIONS[action]; if (!def) throw bad("Unknown action.");
  const [from, to, roles, label] = def;
  if (!roles.includes(session.role)) throw forbidden(action === "receive" || action === "send_back" ? "Only the session's coordinator (or an admin) does this." : "Only the Logistics team and admins do this.");
  if (!entryIds.length) throw bad("Pick at least one artwork.");
  const rows = await inChunks(entryIds, ids => q(db().from("nae_logistics").select("*, entry:nae_entries(id, code, coordinator_id), loc:nae_locations(id, room, shelf, label)").in("entry_id", ids)));
  const loc = await locationOf(opts.location_id);
  if ((NEEDS_LOCATION.includes(action) || action === "move") && !loc && !Object.keys(opts.locations || {}).length && action === "move") throw bad("Choose where to move them.");
  const done = [], skipped = [], events = [];
  const now = new Date().toISOString();
  for (const r of rows) {
    const code = r.entry?.code;
    if (!from.includes(r.state)) { skipped.push({ code, why: SHORT[r.state] || r.state }); continue; }
    const why = opts.check ? await opts.check(r) : null; if (why) { skipped.push({ code, why }); continue; }
    const patch = { updated_at: now };
    if (to) patch.state = to;
    let place = null;
    const own = opts.locations?.[code] ? await locationOf(opts.locations[code]) : null;
    if (own || loc) place = own || loc;
    else if (NEEDS_LOCATION.includes(action) && r.loc) place = r.loc;          // back to where it was
    if (action === "store" && !place) { skipped.push({ code, why: "no place chosen" }); continue; }
    if (place && (to === "storage" || action === "move")) { patch.location_id = place.id; patch.location = `${place.label}`; }
    if (action === "to_room") { patch.session_id = opts.session_id || r.session_id; patch.batch_no = opts.batch || null; patch.handed_by = opts.handed_by || session.name; patch.received_by = opts.received_by || null; patch.handed_at = now; }
    if (action === "return_room") { patch.returned_at = now; }
    if (action === "hand_over") { patch.handed_by = opts.handed_by || session.name; patch.received_by = opts.received_by || null; patch.handed_at = now; }
    if (action === "receive") { patch.received_by = session.name; patch.handed_at = r.handed_at || now; }
    if (["receive_back", "found"].includes(action)) { patch.session_id = null; patch.batch_no = null; }
    if (!["pick", "unpick"].includes(action)) patch.from_session_id = null;
    if (action === "found") patch.missing_outcome = null;
    if (action === "to_framer") { patch.framing_vendor = opts.vendor || r.framing_vendor || null; patch.framing_sent_on = now.slice(0, 10); patch.framing_due = opts.due || null; patch.framing_back_on = null; }
    if (action === "from_framer") { patch.framed = true; patch.framing_back_on = now.slice(0, 10); }
    if (action === "missing") patch.missing_outcome = null;
    if (action === "to_photo") { patch.photo_batch = opts.batch || null; patch.photo_space = opts.space || null; patch.photo_sent_at = now; patch.photo_sent_by = session.name; patch.photo_done_at = null; patch.photo_done_by = null; }
    if (action === "from_photo") { patch.photo_done_at = now; patch.photo_done_by = session.name; }
    // sent out of the office to the exhibition site (in numbered batches), then placed on a wall there
    if (action === "to_exhibition") { patch.exhibit_batch = opts.batch || null; patch.exhibit_sent_at = now; patch.exhibit_sent_by = session.name; const wall = opts.walls?.[code] || opts.wall_id; patch.exhibit_wall_id = wall || null; if (wall) { patch.exhibit_at = now; patch.exhibit_by = session.name; } else { patch.exhibit_at = null; patch.exhibit_by = null; } }
    if (action === "exhibit_move") {
      const wall = opts.walls?.[code] || opts.wall_id; if (!wall) { skipped.push({ code, why: "no wall chosen" }); continue; }
      patch.exhibit_wall_id = wall; patch.exhibit_at = now; patch.exhibit_by = session.name;
    }
    if (action === "from_exhibition") { patch.exhibit_wall_id = null; }
    await q(db().from("nae_logistics").update(patch).eq("entry_id", r.entry_id));
    events.push({ entry_id: r.entry_id, action: action === "to_photo" && opts.batch ? `${label} (batch ${opts.batch}${opts.space ? `, ${opts.space}` : ""})` : (action === "to_room" || action === "to_exhibition") && opts.batch ? `${label} (batch ${opts.batch})` : opts.wallLabels?.[patch.exhibit_wall_id] ? `${label}: ${opts.wallLabels[patch.exhibit_wall_id]}` : label, from_state: r.state, to_state: to || r.state, location: patch.location || r.location || null, handed_by: patch.handed_by || (action === "send_back" ? session.name : null), received_by: patch.received_by || null, note: opts.note || null, ref_type: opts.ref_type || (r.session_id ? "session" : null), ref_id: opts.ref_id || r.session_id || null });
    done.push(code);
  }
  await logEvents(session, events);
  // back on the shelves but still listed in another planned or live session (moved there when the last one finished):
  // it is requested for that session straight away
  if (["receive_back", "found"].includes(action) && events.length) await requeue(session, events.map(x => x.entry_id));
  // back from the framer by any route: the artwork's framing handling is back too
  if (action === "from_framer" && events.length) await q(db().from("nae_handling").update({ status: "back", back_at: new Date().toISOString(), back_by: session.name }).eq("track", "framing").eq("status", "sent").in("entry_id", events.map(x => x.entry_id)));
  return { done, skipped, label };
}
async function requeue(session, entryIds) {
  const links = await inChunks(entryIds, ids => q(db().from("nae_session_entries").select("entry_id, session:nae_sessions(id, title, status)").in("entry_id", ids)));
  const by = new Map();
  links.filter(l => ["planned", "live"].includes(l.session?.status)).forEach(l => { if (!by.has(l.session.id)) by.set(l.session.id, { s: l.session, ids: [] }); by.get(l.session.id).ids.push(l.entry_id); });
  for (const { s, ids } of by.values()) await requestForSession(session, s, ids);
}

// Session links: artworks in storage become pull requests when a session is created or extended; they go back
// when removed or the session is cancelled; finishing a session sends the artworks still out back to storage.
export async function requestForSession(session, sess, entryIds) {
  if (!entryIds.length) return 0;
  const rows = await inChunks(entryIds, ids => q(db().from("nae_logistics").select("entry_id, state, location").in("entry_id", ids).eq("state", "storage")));
  if (!rows.length) return 0;
  const ids = rows.map(r => r.entry_id);
  for (let i = 0; i < ids.length; i += 150) await q(db().from("nae_logistics").update({ state: "requested", session_id: sess.id, updated_at: new Date().toISOString() }).in("entry_id", ids.slice(i, i + 150)));
  await logEvents(session, rows.map(r => ({ entry_id: r.entry_id, action: "Requested for a session", from_state: "storage", to_state: "requested", location: r.location, ref_type: "session", ref_id: sess.id, note: sess.title })));
  return rows.length;
}
// Artworks moved from one session to another while they are in the first one's room: they stay there and wait for the
// new session (Logistics brings them from that venue), instead of going back to the shelves first.
export async function transferFromRoom(session, from, to, entryIds) {
  if (!entryIds.length) return 0;
  const rows = await inChunks(entryIds, ids => q(db().from("nae_logistics").select("entry_id, state, location").in("entry_id", ids).eq("session_id", from.id).in("state", ["coordinator", "handed_over"])));
  if (!rows.length) return 0;
  const ids = rows.map(r => r.entry_id);
  for (let i = 0; i < ids.length; i += 150) await q(db().from("nae_logistics").update({ state: "requested", session_id: to.id, from_session_id: from.id, batch_no: null, updated_at: new Date().toISOString() }).in("entry_id", ids.slice(i, i + 150)));
  await logEvents(session, rows.map(r => ({ entry_id: r.entry_id, action: `Moved to ${to.title}: waits in ${from.venue || "the session room"} to be brought over`, from_state: r.state, to_state: "requested", location: from.venue || r.location, ref_type: "session", ref_id: to.id, note: from.title })));
  return rows.length;
}
export async function releaseFromSession(session, sess, entryIds, why) {
  if (!entryIds.length) return 0;
  const rows = await inChunks(entryIds, ids => q(db().from("nae_logistics").select("entry_id, state, location, from_session_id").in("entry_id", ids).eq("session_id", sess.id)));
  // still in another session's room (a transfer not brought yet): it goes back to storage from there
  const back = rows.filter(r => ["requested", "picked"].includes(r.state) && !r.from_session_id), out = rows.filter(r => ["handed_over", "coordinator"].includes(r.state) || (r.state === "requested" && r.from_session_id));
  const now = new Date().toISOString();
  if (back.length) await q(db().from("nae_logistics").update({ state: "storage", session_id: null, updated_at: now }).in("entry_id", back.map(r => r.entry_id)));
  if (out.length) await q(db().from("nae_logistics").update({ state: "returning", from_session_id: null, updated_at: now }).in("entry_id", out.map(r => r.entry_id)));
  await logEvents(session, [
    ...back.map(r => ({ entry_id: r.entry_id, action: `Pull request withdrawn (${why})`, from_state: r.state, to_state: "storage", location: r.location, ref_type: "session", ref_id: sess.id })),
    ...out.map(r => ({ entry_id: r.entry_id, action: `Handed back to storage (${why})`, from_state: r.state, to_state: "returning", location: r.location, ref_type: "session", ref_id: sess.id }))
  ]);
  return back.length + out.length;
}
