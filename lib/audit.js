import { db } from "@/lib/db";
export async function audit(session, action, objectType, objectId, detail) {
  try {
    await db().from("nae_audit").insert({ actor_id: session?.sub || null, actor_name: session?.name || "System", actor_role: session?.role || "system", action, object_type: objectType || null, object_id: objectId ? String(objectId) : null, detail: detail == null ? null : String(detail).slice(0, 2000) });
  } catch (e) { console.error("audit failed", e); }
}
export const SYSTEM = { sub: null, name: "System", role: "system" };
