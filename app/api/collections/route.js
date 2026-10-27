import { route } from "@/lib/api";
import { db, q } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { mySessionEntryIds } from "@/lib/perms";
// Collection batches: one per school, pathway and subpathway.
export const GET = route(["admin", "coordinator", "storage"], async ({ session, scope }) => {
  const S = await loadStructure();
  const { has } = await scope(S);
  const cols = await q(db().from("nae_collections").select("*, school:nae_schools(name, esis, region), loc:nae_locations(room, shelf), items:nae_logistics(entry_id, state, damaged, entry:nae_entries(coordinator_id))").order("scheduled_on", { ascending: false }));
  const accs = await q(db().from("nae_accounts").select("id, display_name").eq("role", "coordinator"));
  let list = cols.filter(c => has(c.pathway_code)).map(c => ({ ...c, pathway: S.P[c.pathway_code]?.name, sub: c.sub_code ? (S.P[c.pathway_code]?.subs.find(s => s.code === c.sub_code) || {}).name : null, where: c.loc ? `${c.loc.room} · ${c.loc.shelf}` : null, count: c.items.length, left: c.items.filter(i => i.state === "to_collect").length, missing: c.items.filter(i => i.state === "missing").length, damaged: c.items.filter(i => i.damaged).length, coordinator: accs.find(a => a.id === c.items[0]?.entry?.coordinator_id)?.display_name || null, coordinator_id: c.items[0]?.entry?.coordinator_id || null }));
  if (session.role === "coordinator") { const mine = new Set(await mySessionEntryIds(session)); list = list.filter(c => c.items.some(i => i.entry?.coordinator_id === session.sub || mine.has(i.entry_id))); }
  return { collections: list.map(c => ({ ...c, items: undefined, loc: undefined })) };
});
