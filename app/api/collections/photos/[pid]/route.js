import { route, bad, forbidden } from "@/lib/api";
import { db, q } from "@/lib/db";
import { getBlob, delBlob } from "@/lib/blob";
import { audit } from "@/lib/audit";
import { canWork } from "@/lib/collections";

// Show one collection photo to signed-in staff. Emirates ID photos: storage team and admins only, and every view is
// recorded in the audit log. Nothing is cached by the browser.
export const GET = route(["admin", "storage", "coordinator", "management", "leadership"], async ({ session, params }) => {
  const p = await q(db().from("nae_collection_photos").select("*").eq("id", params.pid).maybeSingle()); if (!p) throw bad("Photo not found.");
  if (p.kind === "eid") {
    if (!["admin", "storage", "coordinator"].includes(session.role)) throw forbidden("Emirates ID photos are visible to the storage team, admins and the school's coordinator only.");
    await audit(session, "Viewed an Emirates ID photo", "collection", p.collection_id, "");
  }
  if (session.role === "coordinator") await canWork(session, p.collection_id);
  const buf = await getBlob(p.path);
  return new Response(buf, { headers: { "content-type": p.mime || "image/jpeg", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
});
// Remove a photo taken by mistake (before or after the handover).
export const DELETE = route(["admin", "storage", "coordinator"], async ({ session, params }) => {
  const p = await q(db().from("nae_collection_photos").select("*").eq("id", params.pid).maybeSingle()); if (!p) throw bad("Photo not found.");
  if (session.role !== "admin" && p.taken_by !== session.sub) throw forbidden("Only the person who took it, or an admin, can remove a photo.");
  await delBlob(p.path); await q(db().from("nae_collection_photos").delete().eq("id", p.id));
  await audit(session, `Collection photo removed (${p.kind === "eid" ? "Emirates ID" : "artwork"})`, "collection", p.collection_id, "");
  return { ok: true };
});
