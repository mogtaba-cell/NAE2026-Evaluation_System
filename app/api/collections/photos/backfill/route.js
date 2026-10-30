import { route, bad } from "@/lib/api";
import { db, q } from "@/lib/db";
import { audit } from "@/lib/audit";
import { driveReady, moveToDrive } from "@/lib/photostore";
export const maxDuration = 60;
// Admin: copy collection photos still kept in Supabase into the Shared Drive, 20 at a time (the page repeats it).
export const POST = route(["admin"], async ({ session }) => {
  if (!driveReady()) throw bad("Google Drive is not connected.");
  const rows = await q(db().from("nae_collection_photos").select("id, kind, path, mime, taken_by_name, at, collection:nae_collections(school:nae_schools(name, esis))").not("path", "like", "drive:%").order("at").limit(20));
  let moved = 0;
  for (const p of rows) {
    const path = await moveToDrive({ path: p.path, school: p.collection?.school, kind: p.kind, mime: p.mime, by: p.taken_by_name, at: p.at });
    await q(db().from("nae_collection_photos").update({ path }).eq("id", p.id)); moved++;
  }
  const { count } = await db().from("nae_collection_photos").select("id", { count: "exact", head: true }).not("path", "like", "drive:%");
  if (moved) await audit(session, `Copied ${moved} collection photos to Google Drive`, "collection", null, "");
  return { ok: true, moved, left: count || 0 };
});
