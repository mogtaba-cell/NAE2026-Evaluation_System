import { db, q } from "@/lib/db";
import { forbidden } from "@/lib/api";

// Storage and admins: every collection. Coordinators: collections that hold artworks of their schools.
export async function canWork(session, collectionId) {
  if (session.role !== "coordinator") return true;
  const mine = await q(db().from("nae_logistics").select("entry_id, entry:nae_entries!inner(coordinator_id)").eq("collection_id", collectionId).eq("entry.coordinator_id", session.sub).limit(1));
  if (!mine.length) throw forbidden("This collection isn't for your schools.");
  return true;
}
