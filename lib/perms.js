import { db, q } from "@/lib/db";
import { forbidden } from "@/lib/api";

// One place for who can see and do what.
export const CAN = {
  setup: ["admin"],
  import: ["admin"],
  people: ["admin"],
  allocate: ["admin"],
  rounds: ["admin"],
  editScore: ["admin"],
  reviewDecide: ["admin", "management"],
  flag: ["admin", "coordinator", "management"],
  sessions: ["admin", "coordinator"],
  logistics: ["admin", "coordinator", "storage"],
  reports: ["admin", "management", "leadership"],
  audit: ["admin"],
  files: ["admin"],
  entriesAll: ["admin", "management", "leadership", "storage"]
};
export const can = (session, what) => CAN[what]?.includes(session.role);
export function must(session, what) { if (!can(session, what)) throw forbidden(); }

export async function myEvaluatorId(session) {
  if (session.role !== "evaluator") return null;
  const r = await q(db().from("nae_evaluators").select("id").eq("account_id", session.sub).maybeSingle());
  return r?.id || null;
}
// Entries a coordinator runs a scoring session for (they can see and score those, whoever's school it is).
export async function mySessionEntryIds(session) {
  if (session.role !== "coordinator") return [];
  const rows = await q(db().from("nae_session_entries").select("entry_id, session:nae_sessions!inner(coordinator_id, status)").eq("session.coordinator_id", session.sub).neq("session.status", "cancelled"));
  return rows.map(r => r.entry_id);
}
// Scope a query on nae_entries to what this user works on. Coordinators: their allocated schools plus the
// entries in sessions they run. ("All entries" for coordinators is a view-only list and skips this.)
// (async parts are fetched first, then applied: a query builder must never be awaited before it's finished)
export async function scopeEntries(query, session) {
  const ids = session.role === "coordinator" ? (await mySessionEntryIds(session)).slice(0, 300) : [];
  return { q: applyScope(query, session, ids) };
}
export function applyScope(query, session, ids = []) {
  if (session.role !== "coordinator") return query;
  return ids.length ? query.or(`coordinator_id.eq.${session.sub},id.in.(${ids.join(",")})`) : query.eq("coordinator_id", session.sub);
}
// What a user may do with an entry: "full" (details, scores, actions), "view" (details and files only) or null.
// Staff limited to some programs only see entries of those programs.
const pwProgram = new Map();
async function programOfPathway(code) {
  const hit = pwProgram.get(code); if (hit && hit.t > Date.now() - 60000) return hit.v;
  const r = await q(db().from("nae_pathways").select("program_id").eq("code", code).maybeSingle());
  pwProgram.set(code, { t: Date.now(), v: r?.program_id || null }); return r?.program_id || null;
}
export async function inMyPrograms(session, pathwayCode) {
  if (session.role === "admin" || !(session.programs || []).length) return true;
  return session.programs.includes(await programOfPathway(pathwayCode));
}
export async function entryAccess(session, entry) {
  if (!(await inMyPrograms(session, entry.pathway_code))) return null;
  if (session.role === "admin" || session.role === "management" || session.role === "leadership") return "full";
  if (session.role === "storage") return "view";
  if (session.role === "coordinator") {
    if (entry.coordinator_id === session.sub) return "full";
    const s = await q(db().from("nae_session_entries").select("session:nae_sessions!inner(coordinator_id, status)").eq("entry_id", entry.id).eq("session.coordinator_id", session.sub).neq("session.status", "cancelled").limit(1));
    return s.length ? "full" : "view";
  }
  if (session.role === "evaluator") {
    const ev = await myEvaluatorId(session); if (!ev) return null;
    const a = await q(db().from("nae_assignments").select("id").eq("entry_id", entry.id).eq("evaluator_id", ev).limit(1));
    return a.length ? "full" : null;
  }
  return null;
}
export async function canSeeEntry(session, entry) { return !!(await entryAccess(session, entry)); }
export async function canWorkOnEntry(session, entry) { return (await entryAccess(session, entry)) === "full"; }
export async function assertSeeEntry(session, entry) { if (!(await canSeeEntry(session, entry))) throw forbidden("You can't open this entry."); }
