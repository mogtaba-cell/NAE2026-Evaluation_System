import { route, bad } from "@/lib/api";
import { db, q } from "@/lib/db";
import { readPhoto } from "@/lib/photostore";

// The return note of one return to a school (PDF, from the Shared Drive or Supabase)
export const GET = route(["admin", "storage"], async ({ params }) => {
  const r = await q(db().from("nae_returns").select("id, note_path, at").eq("id", params.id).maybeSingle());
  if (!r?.note_path) throw bad("There is no return note for this return.");
  const buf = await readPhoto(r.note_path);
  return new Response(buf, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="return-note-${String(r.at).slice(0, 10)}.pdf"`, "cache-control": "private, no-store" } });
});
