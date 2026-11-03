import { entryPictures } from "@/lib/covers";
import { route } from "@/lib/api";
import { db, q } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { mySessionEntryIds } from "@/lib/perms";
// Collections: one per school (older ones may be per subpathway). Each pathway is stored apart at check-in.
export const GET = route(["admin", "coordinator", "storage"], async ({ session, scope, url }) => {
  const S = await loadStructure();
  const { has } = await scope(S);
  // step 2: artworks received at the office and not stored yet, by school and pathway
  if (url.searchParams.get("store")) {
    let rows = (await q(db().from("nae_logistics").select("entry_id, collected_on, damaged, condition, collection_id, entry:nae_entries(id, code, reference_id, title_en, title_ar, group_name, size_text, medium, pathway_code, sub_code, coordinator_id, source_path, school:nae_schools(id, name, esis))").eq("state", "received").order("collected_on"))).filter(r => r.entry && has(r.entry.pathway_code));
    if (session.role === "coordinator") rows = rows.filter(r => r.entry.coordinator_id === session.sub);
    const pics = await entryPictures(rows.map(r => r.entry));
    const groups = {};
    for (const r of rows) { const k = `${r.entry.school?.id || "none"}:${r.entry.pathway_code}`; (groups[k] ||= { key: k, school: r.entry.school?.name || "No school", esis: r.entry.school?.esis || "", pathway_code: r.entry.pathway_code, pathway: S.P[r.entry.pathway_code]?.name || r.entry.pathway_code, collected_on: r.collected_on, items: [] }).items.push({ code: r.entry.code, title: r.entry.title_en || r.entry.title_ar || r.entry.group_name || "", sub: (S.P[r.entry.pathway_code]?.subs.find(x => x.code === r.entry.sub_code) || {}).name || "", size: r.entry.size_text || "", medium: r.entry.medium || "", damaged: !!r.damaged, condition: r.condition, files: pics[r.entry.id] || [] }); }
    return { groups: Object.values(groups).sort((a, b) => String(a.collected_on).localeCompare(String(b.collected_on)) || a.school.localeCompare(b.school)), count: rows.length };
  }
  const cols = await q(db().from("nae_collections").select("*, school:nae_schools(name, esis, region), loc:nae_locations(room, shelf, label), items:nae_logistics(entry_id, state, damaged, entry:nae_entries(coordinator_id, pathway_code))").order("scheduled_on", { ascending: false }));
  const accs = await q(db().from("nae_accounts").select("id, display_name").eq("role", "coordinator"));
  let list = cols.filter(c => c.pathway_code ? has(c.pathway_code) : c.items.some(i => has(i.entry?.pathway_code))).map(c => ({ ...c, pathway: c.pathway_code ? S.P[c.pathway_code]?.name : [...new Set(c.items.map(i => S.P[i.entry?.pathway_code]?.name).filter(Boolean))].join(", "), sub: c.sub_code ? (S.P[c.pathway_code]?.subs.find(s => s.code === c.sub_code) || {}).name : null, where: c.loc ? `${c.loc.label}` : null, count: c.items.length, left: c.items.filter(i => i.state === "to_collect").length, toStore: c.items.filter(i => i.state === "received").length, missing: c.items.filter(i => i.state === "missing").length, damaged: c.items.filter(i => i.damaged).length, coordinator: accs.find(a => a.id === c.items[0]?.entry?.coordinator_id)?.display_name || null, coordinator_id: c.items[0]?.entry?.coordinator_id || null }));
  if (session.role === "coordinator") { const mine = new Set(await mySessionEntryIds(session)); list = list.filter(c => c.items.some(i => i.entry?.coordinator_id === session.sub || mine.has(i.entry_id))); }
  // admin: photos still kept in Supabase (Drive was unreachable when they were taken)
  const offDrive = session.role === "admin" ? (await db().from("nae_collection_photos").select("id", { count: "exact", head: true }).not("path", "like", "drive:%")).count || 0 : 0;
  return { collections: list.map(c => ({ ...c, items: undefined, loc: undefined })), offDrive };
});
