import { route, body, bad } from "@/lib/api";
import { db, q, all } from "@/lib/db";
import { audit } from "@/lib/audit";
import { loadStructure } from "@/lib/structure";
export const GET = route(["admin", "coordinator", "storage", "management", "leadership"], async ({ session }) => {
  const S = await loadStructure();
  let rows = await all(() => db().from("nae_logistics").select("*, entry:nae_entries(id, code, title_en, group_name, pathway_code, sub_code, coordinator_id, size_text, school:nae_schools(id, name, esis)), collection:nae_collections(id, code, scheduled_on, status)"));
  if (session.role === "coordinator") rows = rows.filter(r => r.entry?.coordinator_id === session.sub || (session.pathways || []).includes(r.entry?.pathway_code));
  const res = await all(() => db().from("nae_results").select("entry_id, complete").eq("round_no", 2));
  const done = new Set(res.filter(r => r.complete).map(r => r.entry_id));
  const sess = await all(() => db().from("nae_session_entries").select("entry_id, session:nae_sessions(title, session_date, status, venue)"));
  return { rows: rows.filter(r => r.entry).map(r => ({ ...r, scored: done.has(r.entry_id), sub: (S.P[r.entry.pathway_code]?.subs.find(s => s.code === r.entry.sub_code) || {}).name, session: sess.find(s => s.entry_id === r.entry_id)?.session || null })) };
});
export const POST = route(["admin", "storage", "coordinator"], async ({ session, request }) => {
  const b = await body(request);
  if (b.action === "create_collections") {
    const rows = await all(() => db().from("nae_logistics").select("entry_id, entry:nae_entries(pathway_code, school_id, school:nae_schools(esis))").eq("state", "to_collect").is("collection_id", null));
    const groups = {}; rows.forEach(r => { const k = r.entry.school_id + "|" + r.entry.pathway_code; (groups[k] = groups[k] || { school_id: r.entry.school_id, esis: r.entry.school?.esis, pathway: r.entry.pathway_code, ids: [] }).ids.push(r.entry_id); });
    let n = 0;
    for (const g of Object.values(groups)) {
      const code = `CB-${g.pathway}-${g.esis}-${Date.now().toString(36).slice(-4)}${n}`;
      const c = await q(db().from("nae_collections").insert({ code, school_id: g.school_id, pathway_code: g.pathway, scheduled_on: b.scheduled_on || null }).select("id").single());
      await q(db().from("nae_logistics").update({ collection_id: c.id }).in("entry_id", g.ids)); n++;
    }
    await audit(session, `Created ${n} collections`, "logistics", null, `${rows.length} entries`);
    return { ok: true, note: `${n} collections created, one per school.` };
  }
  if (b.action === "set_state") {
    const e = await q(db().from("nae_entries").select("id").eq("code", b.entry_code).single());
    const patch = { updated_at: new Date().toISOString() };
    if (b.state) patch.state = b.state; if (b.location !== undefined) patch.location = b.location; if (b.condition !== undefined) patch.condition = b.condition;
    await q(db().from("nae_logistics").update(patch).eq("entry_id", e.id));
    await audit(session, `Logistics updated${b.state ? ": " + b.state : ""}`, "entry", e.id, [b.location, b.condition].filter(Boolean).join(" · "));
    return { ok: true };
  }
  throw bad("Unknown action.");
});
