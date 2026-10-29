import { route, body, bad } from "@/lib/api";
import { db, q } from "@/lib/db";
import { audit } from "@/lib/audit";
import { recompute } from "@/lib/scoring";
// Unlock (or lock again) one entry's result for a round. Locked results are final; unlocking needs a reason.
export const POST = route(["admin"], async ({ session, request }) => {
  const b = await body(request);
  const reason = String(b.reason || "").trim(); if (!reason) throw bad("Give a reason.");
  const e = await q(db().from("nae_entries").select("id, code").eq("code", b.entry_code).maybeSingle()); if (!e) throw bad("Artwork not found.");
  const roundNo = Number(b.round_no);
  const r = await q(db().from("nae_results").select("*").eq("entry_id", e.id).eq("round_no", roundNo).maybeSingle()); if (!r) throw bad("This artwork has no result for that round yet.");
  if (b.action === "unlock") {
    await q(db().from("nae_results").update({ locked: false }).eq("entry_id", e.id).eq("round_no", roundNo));
    await audit(session, `Result unlocked (Round ${roundNo})`, "entry", e.id, reason);
    return { ok: true, note: `${e.code} Round ${roundNo} is unlocked. Corrections can be made now.` };
  }
  if (b.action === "lock") {
    const res = await recompute(e.id, roundNo, {});
    if (!res?.complete) throw bad("Only a complete result can be locked.");
    await q(db().from("nae_results").update({ locked: true }).eq("entry_id", e.id).eq("round_no", roundNo));
    await audit(session, `Result locked (Round ${roundNo})`, "entry", e.id, reason);
    return { ok: true, note: `${e.code} Round ${roundNo} is locked again.` };
  }
  throw bad("Unknown action.");
});
