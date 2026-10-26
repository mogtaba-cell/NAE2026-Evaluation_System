import { route, body, bad, forbidden } from "@/lib/api";
import { db, q } from "@/lib/db";
import { audit } from "@/lib/audit";
async function load(id, session) {
  const s = await q(db().from("nae_sessions").select("*").eq("id", id).maybeSingle()); if (!s) throw bad("Session not found.");
  if (session.role === "coordinator" && s.coordinator_id !== session.sub) throw forbidden("This session is run by another coordinator.");
  return s;
}
// The pull list for storage: the session's artworks sorted by where they are. Ticks are saved.
export const GET = route(["admin", "coordinator", "storage"], async ({ session, params }) => {
  const s = await load(params.id, session);
  const links = await q(db().from("nae_session_entries").select("pulled, entry:nae_entries(id, code, title_en, size_text, school:nae_schools(name))").eq("session_id", s.id));
  const lg = links.length ? await q(db().from("nae_logistics").select("entry_id, state, location, damaged, condition, loc:nae_locations(room, shelf, sort)").in("entry_id", links.map(l => l.entry.id))) : [];
  const rows = links.map(l => { const x = lg.find(y => y.entry_id === l.entry.id) || {}; return { ...l.entry, pulled: l.pulled, state: x.state, damaged: x.damaged, condition: x.condition, where: x.loc ? `${x.loc.room} · ${x.loc.shelf}` : x.location || null, sort: x.loc?.sort ?? 9999 }; })
    .sort((a, b) => a.sort - b.sort || String(a.where || "").localeCompare(String(b.where || ""), undefined, { numeric: true }) || a.code.localeCompare(b.code));
  return { session: s, rows };
});
export const POST = route(["admin", "storage"], async ({ session, params, request }) => {
  const b = await body(request);
  const s = await load(params.id, session);
  const e = await q(db().from("nae_entries").select("id").eq("code", b.entry_code).single());
  await q(db().from("nae_session_entries").update({ pulled: !!b.pulled }).eq("session_id", s.id).eq("entry_id", e.id));
  if (b.pulled) await audit(session, "Pulled for session", "entry", e.id, s.title);
  return { ok: true };
});
