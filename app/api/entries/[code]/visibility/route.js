import { route, body, bad } from "@/lib/api";
import { db, q } from "@/lib/db";
import { entryAccess } from "@/lib/perms";
import { openCorrection, closeCorrection, openFor, canWork } from "@/lib/corrections";

// Older screens: "can't be evaluated" opens a correction with the coordinator (artwork file quality); "reopen"
// closes it as corrected. The Corrections page and lib/corrections.js do the work.
export const POST = route(["evaluator", "coordinator", "admin", "management"], async ({ session, params, request }) => {
  const b = await body(request);
  const e = await q(db().from("nae_entries").select("*").eq("code", decodeURIComponent(params.code)).maybeSingle()); if (!e) throw bad("Artwork not found.");
  if ((await entryAccess(session, e)) !== "full") throw bad("You can't change this artwork.");
  if (b.action === "not_visible") { await openCorrection(session, e, { source: "evaluation", reason: b.reason || "file_quality", note: b.note, round_no: Number(b.round_no || e.current_round), session_id: b.session_id || null }); return { ok: true, note: "Sent to the coordinator. Scoring is paused for this artwork." }; }
  if (b.action === "reopen") { const c = await openFor(e.id); if (!c) return { ok: true, note: "It is already open for scoring." }; canWork(session, c); return { ok: true, note: await closeCorrection(session, c, "corrected", b.note) }; }
  throw bad("Unknown action.");
});
