import { route, body, bad } from "@/lib/api";
import { db, q } from "@/lib/db";
import { audit } from "@/lib/audit";
export const GET = route(["admin", "coordinator", "storage"], async ({ params }) => {
  const c = await q(db().from("nae_collections").select("*, school:nae_schools(name, esis, region)").eq("id", params.id).single());
  const items = await q(db().from("nae_logistics").select("*, entry:nae_entries(code, title_en, group_name, size_text, medium, coordinator_id)").eq("collection_id", c.id));
  return { collection: c, items };
});
export const POST = route(["admin", "storage"], async ({ session, params, request }) => {
  const b = await body(request);
  const c = await q(db().from("nae_collections").select("*").eq("id", params.id).single());
  if (b.action === "schedule") { await q(db().from("nae_collections").update({ scheduled_on: b.scheduled_on || null }).eq("id", c.id)); return { ok: true }; }
  if (b.action !== "handover") throw bad("Unknown action.");
  const items = await q(db().from("nae_logistics").select("entry_id, entry:nae_entries(code)").eq("collection_id", c.id));
  const rec = b.received || {};
  if (items.some(i => !rec[i.entry.code])) throw bad("Mark every entry as received or missing.");
  const used = await q(db().from("nae_logistics").select("location").eq("state", "storage"));
  const shelfLoad = {}; used.forEach(u => { if (u.location) shelfLoad[u.location] = (shelfLoad[u.location] || 0) + 1; });
  const shelf = () => { let best = null; for (let i = 1; i <= 12; i++) { const k = `Room B · Shelf ${i}`; if (best == null || (shelfLoad[k] || 0) < (shelfLoad[best] || 0)) best = k; } shelfLoad[best] = (shelfLoad[best] || 0) + 1; return best; };
  let ok = 0, miss = 0;
  for (const i of items) {
    const st = rec[i.entry.code] === "missing" ? "missing" : "storage";
    const cond = (b.conditions || {})[i.entry.code] || (st === "missing" ? "Missing at collection" : "Good");
    await q(db().from("nae_logistics").update({ state: st, location: st === "storage" ? shelf() : null, condition: cond, updated_at: new Date().toISOString() }).eq("entry_id", i.entry_id));
    if (st === "missing") { miss++; await audit(session, "Marked missing at collection", "entry", i.entry_id, c.code); } else ok++;
  }
  await q(db().from("nae_collections").update({ status: "checked_in", handed_by: b.handed_by || null, checked_in_by: session.sub, checked_in_at: new Date().toISOString() }).eq("id", c.id));
  await audit(session, `Collection checked in (${ok} received${miss ? `, ${miss} missing` : ""})`, "collection", c.id, c.code);
  return { ok: true, note: `Checked in ${ok} entr${ok === 1 ? "y" : "ies"} to Room B${miss ? `. ${miss} marked missing.` : "."}` };
});
