import { route, body, bad } from "@/lib/api";
import { db, q } from "@/lib/db";
import { audit } from "@/lib/audit";
// Venues for scoring sessions. Everyone who plans or supports sessions can read them; the admin keeps the list.
export const GET = route(["admin", "storage", "coordinator", "management", "leadership"], async () => {
  const [venues, sessions] = await Promise.all([
    q(db().from("nae_venues").select("*").order("sort").order("name")),
    q(db().from("nae_sessions").select("venue_id, status").not("venue_id", "is", null))
  ]);
  const n = {}; sessions.forEach(s => { const k = s.venue_id; n[k] = n[k] || { upcoming: 0, total: 0 }; n[k].total++; if (s.status !== "done") n[k].upcoming++; });
  return { venues: venues.map(v => ({ ...v, sessions: n[v.id]?.total || 0, upcoming: n[v.id]?.upcoming || 0 })) };
});
const clean = (b, k) => b[k] === undefined ? undefined : String(b[k] ?? "").trim();
export const POST = route(["admin"], async ({ session, request }) => {
  const b = await body(request);
  const cap = b.capacity === undefined ? undefined : b.capacity === "" || b.capacity === null ? null : parseInt(b.capacity);
  if (cap !== undefined && cap !== null && (isNaN(cap) || cap < 0)) throw bad("Capacity is a number of people.");
  if (b.action === "add") {
    const name = clean(b, "name"); if (!name) throw bad("Enter the venue's name.");
    const max = (await q(db().from("nae_venues").select("sort").order("sort", { ascending: false }).limit(1)))[0]?.sort || 0;
    const { error } = await db().from("nae_venues").insert({ name, notes: clean(b, "notes") || null, capacity: cap ?? null, sort: max + 1 });
    if (error) throw bad(error.message.includes("duplicate") ? "A venue with that name already exists." : error.message);
    await audit(session, `Added session venue ${name}`, "venue", null);
    return { ok: true, note: `${name} added.` };
  }
  if (b.action === "update") {
    const patch = {};
    const name = clean(b, "name"), notes = clean(b, "notes");
    if (name !== undefined) { if (!name) throw bad("The name can't be empty."); patch.name = name; }
    if (notes !== undefined) patch.notes = notes || null;
    if (cap !== undefined) patch.capacity = cap;
    if (b.active !== undefined) patch.active = !!b.active;
    const { error } = await db().from("nae_venues").update(patch).eq("id", b.id);
    if (error) throw bad(error.message.includes("duplicate") ? "A venue with that name already exists." : error.message);
    // sessions show the venue's current name
    if (patch.name) await q(db().from("nae_sessions").update({ venue: patch.name }).eq("venue_id", b.id));
    await audit(session, "Session venue updated", "venue", b.id, JSON.stringify(patch));
    return { ok: true };
  }
  throw bad("Unknown action.");
});
