import { route } from "@/lib/api";
import { db, q } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { mySessionEntryIds } from "@/lib/perms";
// Collections: one per school (older ones may be per subpathway). Each pathway is stored apart at check-in.
export const GET = route(["admin", "coordinator", "storage"], async ({ session, scope }) => {
  const S = await loadStructure();
  const { has } = await scope(S);
  const cols = await q(db().from("nae_collections").select("*, school:nae_schools(name, esis, region), loc:nae_locations(room, shelf, label), items:nae_logistics(entry_id, state, damaged, entry:nae_entries(coordinator_id, pathway_code))").order("scheduled_on", { ascending: false }));
  const accs = await q(db().from("nae_accounts").select("id, display_name").eq("role", "coordinator"));
  let list = cols.filter(c => c.pathway_code ? has(c.pathway_code) : c.items.some(i => has(i.entry?.pathway_code))).map(c => ({ ...c, pathway: c.pathway_code ? S.P[c.pathway_code]?.name : [...new Set(c.items.map(i => S.P[i.entry?.pathway_code]?.name).filter(Boolean))].join(", "), sub: c.sub_code ? (S.P[c.pathway_code]?.subs.find(s => s.code === c.sub_code) || {}).name : null, where: c.loc ? `${c.loc.label}` : null, count: c.items.length, left: c.items.filter(i => i.state === "to_collect").length, missing: c.items.filter(i => i.state === "missing").length, damaged: c.items.filter(i => i.damaged).length, coordinator: accs.find(a => a.id === c.items[0]?.entry?.coordinator_id)?.display_name || null, coordinator_id: c.items[0]?.entry?.coordinator_id || null }));
  if (session.role === "coordinator") { const mine = new Set(await mySessionEntryIds(session)); list = list.filter(c => c.items.some(i => i.entry?.coordinator_id === session.sub || mine.has(i.entry_id))); }
  return { collections: list.map(c => ({ ...c, items: undefined, loc: undefined })) };
});
