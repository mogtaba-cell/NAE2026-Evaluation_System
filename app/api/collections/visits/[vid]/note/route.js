import { route, bad } from "@/lib/api";
import { db, q } from "@/lib/db";
import { canWork } from "@/lib/collections";
import { readPhoto } from "@/lib/photostore";
import { audit } from "@/lib/audit";

// The delivery confirmation note of one delivery (PDF), from the Shared Drive (or Supabase if Drive was unreachable).
export const GET = route(["admin", "storage", "coordinator"], async ({ session, params }) => {
  const v = await q(db().from("nae_collection_visits").select("id, collection_id, note_path, at").eq("id", params.vid).maybeSingle());
  if (!v?.note_path) throw bad("There is no receiving note for this delivery.");
  await canWork(session, v.collection_id);
  const buf = await readPhoto(v.note_path);
  await audit(session, "Opened a receiving note", "collection", v.collection_id, "");
  return new Response(buf, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="receiving-note-${String(v.at).slice(0, 10)}.pdf"`, "cache-control": "private, no-store" } });
});
