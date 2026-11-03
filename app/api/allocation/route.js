import { route, body, bad } from "@/lib/api";
import { db, q, all } from "@/lib/db";
import { audit } from "@/lib/audit";

async function data(pathway) {
  const ents = await all(() => db().from("nae_entries").select("id, sub_code, school_id, coordinator_id, school:nae_schools(name, esis)").eq("pathway_code", pathway).order("id"));   // a fixed order: Preview and Confirm give the same split
  const coords = await q(db().from("nae_accounts").select("id, display_name, pathways").eq("role", "coordinator").eq("active", true).order("display_name"));
  return { ents, coords };
}
function summary(ents, assign, coords, subs) {
  return coords.map(c => { const m = ents.filter(e => assign(e) === c.id); const by = {}; m.forEach(e => { by[e.sub_code] = (by[e.sub_code] || 0) + 1; }); return { id: c.id, name: c.display_name, pathways: c.pathways, schools: new Set(m.map(e => e.school_id)).size, entries: m.length, bySub: by }; });
}
// Split schools among the ticked coordinators, moving as few schools as possible: each school stays with its
// coordinator when that coordinator is ticked and still has room; only schools of unticked coordinators, unallocated
// ones, and what's needed to bring someone down to their target are moved, to whoever is furthest below target.
// A school is never split. Balanced: everyone aims for the same number of artworks.
function split(ents, coordIds, counts) {
  const by = {}; ents.forEach(e => { (by[e.school_id] = by[e.school_id] || []).push(e); });
  const size = sid => by[sid].length;
  const owner = sid => { const n = {}; by[sid].forEach(e => { if (e.coordinator_id) n[e.coordinator_id] = (n[e.coordinator_id] || 0) + 1; }); return Object.keys(n).sort((a, b) => n[b] - n[a])[0] || null; };
  const total = ents.length;
  const target = counts ? Object.fromEntries(coordIds.map(k => [k, Number(counts[k]) || 0])) : Object.fromEntries(coordIds.map(k => [k, total / coordIds.length]));
  const load = Object.fromEntries(coordIds.map(k => [k, 0])); const out = {}; const free = [];
  for (const sid of Object.keys(by)) { const o = owner(sid); if (o && coordIds.includes(o)) { out[sid] = o; load[o] += size(sid); } else free.push(sid); }
  // whoever is over their target gives back schools (the one that best fits the excess first)
  for (const k of coordIds) {
    for (;;) {
      const excess = load[k] - target[k]; if (excess <= 0) break;
      const mine = Object.keys(out).filter(sid => out[sid] === k).sort((a, b) => size(b) - size(a));
      const pick = mine.find(sid => size(sid) <= excess) || (mine.length && size(mine[mine.length - 1]) / 2 < excess ? mine[mine.length - 1] : null);
      if (!pick) break;
      delete out[pick]; load[k] -= size(pick); free.push(pick);
    }
  }
  // the freed and unallocated schools go, largest first, to whoever has the most room
  free.sort((a, b) => size(b) - size(a)).forEach(sid => {
    const pick = coordIds.reduce((m, k) => (target[k] - load[k] > target[m] - load[m] ? k : m), coordIds[0]);
    out[sid] = pick; load[pick] += size(sid);
  });
  return out;
}
export const GET = route(["admin"], async ({ url }) => {
  const pathway = url.searchParams.get("pathway"); if (!pathway) throw bad("Pick a pathway.");
  const { ents, coords } = await data(pathway);
  const schools = {}; ents.forEach(e => { const s = schools[e.school_id] = schools[e.school_id] || { id: e.school_id, name: e.school?.name, esis: e.school?.esis, entries: 0, coordinator_id: e.coordinator_id }; s.entries++; });
  return { total: ents.length, schools: Object.values(schools).sort((a, b) => b.entries - a.entries), unallocated: ents.filter(e => !e.coordinator_id).length, coordinators: summary(ents, e => e.coordinator_id, coords), allCoordinators: coords.map(c => ({ id: c.id, name: c.display_name, pathways: c.pathways })) };
});
export const POST = route(["admin"], async ({ session, request }) => {
  const b = await body(request); const pathway = b.pathway; if (!pathway) throw bad("Pick a pathway.");
  const { ents, coords } = await data(pathway);
  if (b.action === "move") {
    if (b.coordinator_id && !coords.find(c => c.id === b.coordinator_id && (c.pathways || []).includes(pathway))) throw bad("That coordinator doesn't have this pathway ticked on their account.");
    const ids = ents.filter(e => e.school_id === b.school_id).map(e => e.id);
    for (let i = 0; i < ids.length; i += 150) await q(db().from("nae_entries").update({ coordinator_id: b.coordinator_id || null }).in("id", ids.slice(i, i + 150)));
    await audit(session, `Moved a school to ${coords.find(c => c.id === b.coordinator_id)?.display_name || "nobody"}`, "school", b.school_id, `${ids.length} ${pathway} entries`);
    return { ok: true };
  }
  // only coordinators whose account has this pathway ticked
  const chosen = (b.coordinators || []).filter(id => coords.find(c => c.id === id && (c.pathways || []).includes(pathway)));
  if (!chosen.length) throw bad("Pick at least one coordinator.");
  const pool = b.all ? ents : ents.filter(e => !e.coordinator_id);
  const map = split(pool, chosen, b.mode === "counts" ? b.counts : null);
  const assign = e => map[e.school_id] !== undefined && pool.includes(e) ? map[e.school_id] : e.coordinator_id;
  const sel = coords.filter(c => chosen.includes(c.id) || ents.some(e => e.coordinator_id === c.id));
  const changed = Object.keys(map).filter(sid => pool.some(e => e.school_id === sid && e.coordinator_id !== map[sid])).length;   // schools that change coordinator
  const moving = pool.filter(e => e.coordinator_id !== map[e.school_id]);
  if (b.action === "preview") return { preview: summary(ents, assign, sel), moved: moving.length, changed };
  const byCoord = {}; moving.forEach(e => { (byCoord[map[e.school_id]] = byCoord[map[e.school_id]] || []).push(e.id); });
  for (const [k, ids] of Object.entries(byCoord)) for (let i = 0; i < ids.length; i += 150) await q(db().from("nae_entries").update({ coordinator_id: k }).in("id", ids.slice(i, i + 150)));
  await audit(session, `Distributed ${pathway}: ${moving.length} artworks moved (${changed} schools)`, "pathway", pathway, sel.map(c => c.display_name).join(", "));
  return { ok: true, note: `Saved: ${changed} school${changed === 1 ? "" : "s"} (${moving.length} artworks) changed coordinator.` };
});
