import { route, body, bad, forbidden } from "@/lib/api";
import { db, q } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { entryAccess } from "@/lib/perms";
import { recompute } from "@/lib/scoring";
import { audit } from "@/lib/audit";

// "Artwork not visible, will not be evaluated": an evaluator or the coordinator stops the scoring of an artwork whose
// files can't be seen properly. It shows as an exception for its coordinator, who fixes the files and reopens it
// for scoring (or withdraws the artwork from its round on the artwork page).
export const POST = route(["evaluator", "coordinator", "admin", "management"], async ({ session, params, request }) => {
  const b = await body(request);
  const e = await q(db().from("nae_entries").select("*").eq("code", decodeURIComponent(params.code)).maybeSingle()); if (!e) throw bad("Artwork not found.");
  if ((await entryAccess(session, e)) !== "full") throw forbidden("You can't change this artwork.");
  const S = await loadStructure();
  if (b.action === "not_visible") {
    const note = String(b.note || "").trim().slice(0, 500); if (!note) throw bad("Say what's wrong with the files.");
    const roundNo = Number(b.round_no || e.current_round);
    if (e.not_visible_at) return { ok: true, note: "Already with the coordinator." };
    await q(db().from("nae_entries").update({ not_visible_at: new Date().toISOString(), not_visible_by: session.sub, not_visible_round: roundNo, not_visible_note: note, updated_at: new Date().toISOString() }).eq("id", e.id));
    await audit(session, `Marked not visible (Round ${roundNo})`, "entry", e.id, note);
    return { ok: true, note: "Sent to the coordinator. Scoring is paused for this artwork." };
  }
  if (b.action === "reopen") {
    if (!["admin", "coordinator", "management"].includes(session.role)) throw forbidden("The coordinator reopens it.");
    if (!e.not_visible_at) return { ok: true, note: "It is already open for scoring." };
    await q(db().from("nae_entries").update({ not_visible_at: null, not_visible_by: null, not_visible_round: null, not_visible_note: null, updated_at: new Date().toISOString() }).eq("id", e.id));
    await audit(session, "Reopened for scoring (files fixed)", "entry", e.id, String(b.note || "").trim().slice(0, 300));
    if (e.not_visible_round) await recompute(e.id, e.not_visible_round, { S });
    return { ok: true, note: "Reopened. Evaluators can score it again." };
  }
  throw bad("Unknown action.");
});
