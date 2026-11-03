import { route, body, bad, forbidden } from "@/lib/api";
import { db, q } from "@/lib/db";
import { entryAccess } from "@/lib/perms";
import { audit } from "@/lib/audit";

// The coordinator's own comment on an artwork for a round (one per round, can be edited). Shown to coordinators,
// admin and management, not to evaluators.
export const POST = route(["coordinator", "admin"], async ({ session, params, request }) => {
  const b = await body(request);
  const e = await q(db().from("nae_entries").select("id, code, pathway_code, coordinator_id").eq("code", decodeURIComponent(params.code)).maybeSingle()); if (!e) throw bad("Artwork not found.");
  if ((await entryAccess(session, e)) !== "full") throw forbidden("You can't comment on this artwork.");
  const roundNo = Number(b.round_no); if (![1, 2].includes(roundNo)) throw bad("Which round?");
  const text = String(b.comment || "").trim().slice(0, 2000);
  if (!text) { await q(db().from("nae_entry_comments").delete().eq("entry_id", e.id).eq("round_no", roundNo)); await audit(session, `Coordinator comment removed (Round ${roundNo})`, "entry", e.id, ""); return { ok: true, note: "Comment removed" }; }
  await q(db().from("nae_entry_comments").upsert({ entry_id: e.id, round_no: roundNo, comment: text, author_id: session.sub, session_id: b.session_id || null, updated_at: new Date().toISOString() }, { onConflict: "entry_id,round_no" }));
  await audit(session, `Coordinator comment (Round ${roundNo})`, "entry", e.id, text.slice(0, 300));
  return { ok: true, note: "Comment saved" };
});
