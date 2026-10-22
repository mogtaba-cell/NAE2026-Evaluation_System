import { route } from "@/lib/api";
import { db, q, all } from "@/lib/db";
export const GET = route(["admin", "coordinator", "storage"], async () => {
  const cols = await q(db().from("nae_collections").select("*, school:nae_schools(name, esis, region), items:nae_logistics(entry_id, state, entry:nae_entries(coordinator_id))").order("scheduled_on", { ascending: false }));
  const accs = await q(db().from("nae_accounts").select("id, display_name").eq("role", "coordinator"));
  return { collections: cols.map(c => ({ ...c, count: c.items.length, missing: c.items.filter(i => i.state === "missing").length, coordinator: accs.find(a => a.id === c.items[0]?.entry?.coordinator_id)?.display_name || null, coordinator_id: c.items[0]?.entry?.coordinator_id || null, items: undefined })) };
});
