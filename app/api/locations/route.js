import { route, body, bad } from "@/lib/api";
import { db, q, all } from "@/lib/db";
import { audit } from "@/lib/audit";
// Storage locations (room + shelf). Dummy rooms until GVC confirms the real ones; admin and storage can edit.
export const GET = route(["admin", "storage", "coordinator", "management", "leadership"], async () => {
  const locs = await q(db().from("nae_locations").select("*").order("sort").order("room").order("shelf"));
  const used = await all(() => db().from("nae_logistics").select("location_id").in("state", ["storage", "coordinator", "framer"]).not("location_id", "is", null));
  const n = {}; used.forEach(u => { n[u.location_id] = (n[u.location_id] || 0) + 1; });
  return { locations: locs.map(l => ({ ...l, label: `${l.room} · ${l.shelf}`, count: n[l.id] || 0 })) };
});
export const POST = route(["admin", "storage"], async ({ session, request }) => {
  const b = await body(request);
  if (b.action === "add") {
    const room = String(b.room || "").trim(), shelf = String(b.shelf || "").trim();
    if (!room || !shelf) throw bad("Enter a room and a shelf (or area).");
    const max = (await q(db().from("nae_locations").select("sort").order("sort", { ascending: false }).limit(1)))[0]?.sort || 0;
    const { error } = await db().from("nae_locations").insert({ room, shelf, sort: max + 1 });
    if (error) throw bad(error.message.includes("duplicate") ? "That location already exists." : error.message);
    await audit(session, `Added storage location ${room} · ${shelf}`, "location", null);
    return { ok: true };
  }
  if (b.action === "update") {
    const patch = {};
    if (b.room !== undefined) patch.room = String(b.room).trim();
    if (b.shelf !== undefined) patch.shelf = String(b.shelf).trim();
    if (b.active !== undefined) patch.active = !!b.active;
    if (patch.room === "" || patch.shelf === "") throw bad("Room and shelf can't be empty.");
    await q(db().from("nae_locations").update(patch).eq("id", b.id));
    await audit(session, "Storage location updated", "location", b.id, JSON.stringify(patch));
    return { ok: true };
  }
  throw bad("Unknown action.");
});
