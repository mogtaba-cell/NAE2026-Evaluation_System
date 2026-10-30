import { route, body, bad } from "@/lib/api";
import { db, q, all } from "@/lib/db";
import { audit } from "@/lib/audit";
// Storage: rooms hold shelves, shelves hold rows. Every row is a slot in nae_locations (that is what artworks point
// to). Rooms can be tagged with the pathways stored there; check-in opens on that room. Admin and storage edit it.
export const GET = route(["admin", "storage", "coordinator", "management", "leadership"], async () => {
  const [rooms, shelves, slots, used] = await Promise.all([
    q(db().from("nae_rooms").select("*").order("sort").order("name")),
    q(db().from("nae_shelves").select("*").order("sort").order("name")),
    q(db().from("nae_locations").select("id, room, shelf, label, shelf_id, row_no, active, sort").order("sort")),
    all(() => db().from("nae_logistics").select("location_id").in("state", ["storage", "coordinator", "framer", "returning", "requested", "picked", "handed_over"]).not("location_id", "is", null).order("entry_id"))
  ]);
  const n = {}; used.forEach(u => { n[u.location_id] = (n[u.location_id] || 0) + 1; });
  const slotsOf = id => slots.filter(l => l.shelf_id === id).map(l => ({ id: l.id, row: l.row_no, active: l.active, count: n[l.id] || 0, label: l.label }));
  const tree = rooms.map(r => {
    const sh = shelves.filter(s => s.room_id === r.id).map(s => { const rows = slotsOf(s.id); return { ...s, slots: rows, count: rows.reduce((a, x) => a + x.count, 0) }; });
    return { ...r, shelves: sh, count: sh.reduce((a, s) => a + s.count, 0) };
  });
  return { rooms: tree, locations: slots.map(l => ({ ...l, count: n[l.id] || 0 })) };
});

// keep a shelf's row slots in line with its row count and names; artworks keep their slot when rows are removed
async function syncShelf(shelfId) {
  const s = await q(db().from("nae_shelves").select("*, room:nae_rooms(name, sort, active)").eq("id", shelfId).single());
  const have = await q(db().from("nae_locations").select("id, row_no").eq("shelf_id", s.id));
  const add = [];
  for (let i = 1; i <= s.rows; i++) if (!have.some(h => h.row_no === i)) add.push({ room: s.room.name, shelf: s.name, shelf_id: s.id, row_no: i, active: true, sort: 0 });
  if (add.length) await q(db().from("nae_locations").insert(add));
  const on = s.active && s.room.active;
  await q(db().from("nae_locations").update({ room: s.room.name, shelf: s.name, active: on }).eq("shelf_id", s.id).lte("row_no", s.rows));
  await q(db().from("nae_locations").update({ room: s.room.name, shelf: s.name, active: false }).eq("shelf_id", s.id).gt("row_no", s.rows));
  const rows = await q(db().from("nae_locations").select("id, row_no, label").eq("shelf_id", s.id));
  for (const r of rows) {
    await q(db().from("nae_locations").update({ sort: s.room.sort * 10000 + s.sort * 100 + r.row_no }).eq("id", r.id));
    await q(db().from("nae_logistics").update({ location: r.label }).eq("location_id", r.id));   // names shown on artworks
  }
}
async function syncRoom(roomId) { for (const s of await q(db().from("nae_shelves").select("id").eq("room_id", roomId))) await syncShelf(s.id); }
const rowsOf = v => { const n = parseInt(v); if (isNaN(n) || n < 1 || n > 50) throw bad("Rows: a number from 1 to 50."); return n; };

export const POST = route(["admin", "storage"], async ({ session, request }) => {
  const b = await body(request);
  const dup = e => { if (e) throw bad(e.message.includes("duplicate") ? "That name is already used here." : e.message); };
  if (b.action === "add_room") {
    const name = String(b.name || "").trim(); if (!name) throw bad("Enter the room's name.");
    const shelves = Math.min(40, Math.max(0, parseInt(b.shelves) || 0)), rows = rowsOf(b.rows || 3);
    const max = (await q(db().from("nae_rooms").select("sort").order("sort", { ascending: false }).limit(1)))[0]?.sort || 0;
    const { data: room, error } = await db().from("nae_rooms").insert({ name, pathways: Array.isArray(b.pathways) ? b.pathways : [], sort: max + 1 }).select("id").single(); dup(error);
    if (shelves) await q(db().from("nae_shelves").insert(Array.from({ length: shelves }, (_, i) => ({ room_id: room.id, name: `Shelf ${i + 1}`, rows, sort: i + 1 }))));
    await syncRoom(room.id);
    await audit(session, `Added storage room ${name}`, "location", room.id, `${shelves} shelves × ${rows} rows`);
    return { ok: true, note: `${name} added${shelves ? ` with ${shelves} shelves of ${rows} rows` : ""}.` };
  }
  if (b.action === "update_room") {
    const patch = {};
    if (b.name !== undefined) { patch.name = String(b.name).trim(); if (!patch.name) throw bad("The name can't be empty."); }
    if (b.pathways !== undefined) patch.pathways = Array.isArray(b.pathways) ? b.pathways : [];
    if (b.active !== undefined) patch.active = !!b.active;
    const { error } = await db().from("nae_rooms").update(patch).eq("id", b.id); dup(error);
    if (patch.name !== undefined || patch.active !== undefined) await syncRoom(b.id);
    await audit(session, "Storage room updated", "location", b.id, JSON.stringify(patch));
    return { ok: true };
  }
  if (b.action === "add_shelf") {
    const room = await q(db().from("nae_rooms").select("id, name").eq("id", b.room_id).single());
    const ex = await q(db().from("nae_shelves").select("name, sort, rows").eq("room_id", room.id).order("sort"));
    const name = String(b.name || "").trim() || `Shelf ${ex.length + 1}`;
    const { data: s, error } = await db().from("nae_shelves").insert({ room_id: room.id, name, rows: rowsOf(b.rows || ex[ex.length - 1]?.rows || 3), sort: (ex[ex.length - 1]?.sort || 0) + 1 }).select("id").single(); dup(error);
    await syncShelf(s.id);
    await audit(session, `Added ${name} in ${room.name}`, "location", s.id, "");
    return { ok: true, note: `${name} added to ${room.name}.` };
  }
  if (b.action === "update_shelf") {
    const patch = {};
    if (b.name !== undefined) { patch.name = String(b.name).trim(); if (!patch.name) throw bad("The name can't be empty."); }
    if (b.rows !== undefined) patch.rows = rowsOf(b.rows);
    if (b.active !== undefined) patch.active = !!b.active;
    const { error } = await db().from("nae_shelves").update(patch).eq("id", b.id); dup(error);
    await syncShelf(b.id);
    await audit(session, "Shelf updated", "location", b.id, JSON.stringify(patch));
    return { ok: true };
  }
  throw bad("Unknown action.");
});
