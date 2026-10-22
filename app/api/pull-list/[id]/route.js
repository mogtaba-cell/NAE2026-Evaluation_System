import { route } from "@/lib/api";
import { db, q } from "@/lib/db";
export const GET = route(["admin", "coordinator", "storage"], async ({ params }) => {
  const s = await q(db().from("nae_sessions").select("*").eq("id", params.id).single());
  const links = await q(db().from("nae_session_entries").select("entry:nae_entries(id, code, title_en, size_text, school:nae_schools(name))").eq("session_id", s.id));
  const lg = await q(db().from("nae_logistics").select("entry_id, state, location").in("entry_id", links.map(l => l.entry.id)));
  const rows = links.map(l => ({ ...l.entry, ...(lg.find(x => x.entry_id === l.entry.id) || {}) })).sort((a, b) => String(a.location || "").localeCompare(String(b.location || ""), undefined, { numeric: true }));
  return { session: s, rows };
});
