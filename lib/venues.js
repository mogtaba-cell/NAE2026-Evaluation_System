import { db, q } from "@/lib/db";
import { bad } from "@/lib/api";
// A session's venue comes from the list the admin keeps. Returns the columns to store on the session.
export async function venueFields(id, keepId) {
  if (!id) return { venue_id: null, venue: null };
  const v = await q(db().from("nae_venues").select("id, name, active").eq("id", id).maybeSingle());
  if (!v || (!v.active && v.id !== keepId)) throw bad("Choose a venue from the list.");
  return { venue_id: v.id, venue: v.name };
}
