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
// Scope a query on nae_entries to what this user may see.
export function scopeEntries(query, session) {
  if (session.role === "coordinator") {
    const pw = (session.pathways || []).map(p => `"${p}"`).join(",");
    return pw ? query.or(`coordinator_id.eq.${session.sub},pathway_code.in.(${pw})`) : query.eq("coordinator_id", session.sub);
  }
  return query;
}
export async function canSeeEntry(session, entry) {
  if (CAN.entriesAll.includes(session.role) || session.role === "admin") return true;
  if (session.role === "coordinator") {
    if (entry.coordinator_id === session.sub || (session.pathways || []).includes(entry.pathway_code)) return true;
    // the coordinator running a scoring session can see every entry in it
    const s = await q(db().from("nae_session_entries").select("session:nae_sessions!inner(coordinator_id)").eq("entry_id", entry.id).eq("session.coordinator_id", session.sub).limit(1));
    return s.length > 0;
  }
  if (session.role === "evaluator") {
    const ev = await myEvaluatorId(session); if (!ev) return false;
    const a = await q(db().from("nae_assignments").select("id").eq("entry_id", entry.id).eq("evaluator_id", ev).limit(1));
    return a.length > 0;
  }
  return false;
}
export async function assertSeeEntry(session, entry) { if (!(await canSeeEntry(session, entry))) throw forbidden("You can't open this entry."); }
