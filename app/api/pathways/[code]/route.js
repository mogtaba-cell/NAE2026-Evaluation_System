import { route, body, bad } from "@/lib/api";
import { db, q, all } from "@/lib/db";
import { audit } from "@/lib/audit";
import { loadStructure, ENTRY_COLS } from "@/lib/structure";
import { assignEntries } from "@/lib/scoring";

// Subpathway settings (rubrics per round, Physical in Round 2, name).
// Once a round of the pathway has opened, changes need a reason. A subpathway's rubric for a round can't be
// swapped once scores exist for it, and switching Physical on or off moves the waiting entries accordingly.
export const PATCH = route(["admin"], async ({ session, params, request }) => {
  const b = await body(request);
  const S = await loadStructure();
  const P = S.P[params.code]; if (!P) throw bad("Pathway not found.");
  const started = Object.values(P.rounds).some(r => r.status !== "setup");
  const reason = String(b.reason || "").trim();
  const changes = [];
  for (const s of b.subs || []) {
    const cur = P.subs.find(x => x.code === s.code); if (!cur) continue;
    const patch = {};
    ["is_physical", "rubric_r1", "rubric_r2", "name"].forEach(k => { if (s[k] !== undefined) { const v = s[k] === "" ? null : s[k]; if (v !== cur[k]) patch[k] = v; } });
    if (s.confirm_rubrics) patch.rubric_inherited = false;
    if (patch.rubric_r1 !== undefined || patch.rubric_r2 !== undefined) patch.rubric_inherited = false;
    if (!Object.keys(patch).length) continue;
    if (started && !reason && Object.keys(patch).some(k => k !== "rubric_inherited")) throw bad("A round of this pathway has opened. Give a reason for the change.");
    for (const no of [1, 2]) {
      const k = no === 1 ? "rubric_r1" : "rubric_r2"; if (patch[k] === undefined) continue;
      const r = P.rounds[no]; if (!r) continue;
      const ents = await all(() => db().from("nae_entries").select("id").eq("pathway_code", P.code).eq("sub_code", cur.code));
      const ids = ents.map(e => e.id);
      let scored = 0;
      for (let i = 0; i < ids.length && !scored; i += 150) scored += (await q(db().from("nae_scores").select("id").eq("round_id", r.id).in("entry_id", ids.slice(i, i + 150)).limit(1))).length;
      if (scored) throw bad(`${cur.name} already has Round ${no} scores, so its Round ${no} rubric can't be changed. Publish a new version of the same rubric instead.`);
    }
    await q(db().from("nae_subpathways").update(patch).eq("pathway_code", P.code).eq("code", cur.code));
    changes.push({ sub: cur.name, before: Object.fromEntries(Object.keys(patch).map(k => [k, cur[k]])), after: patch });
    if (patch.is_physical !== undefined) await resyncPhysical(S, P, cur.code, patch.is_physical, session);
  }
  if (b.status) { if (!["setup", "open", "closed"].includes(b.status)) throw bad("Unknown status."); await q(db().from("nae_pathways").update({ status: b.status }).eq("code", P.code)); changes.push({ status: b.status }); }
  if (changes.length) await audit(session, "Pathway settings changed", "pathway", P.code, [JSON.stringify(changes).slice(0, 1500), reason].filter(Boolean).join(" · "));
  return { ok: true };
});

// Entries already in Round 2 follow a change of the Physical switch: physical ones go on the collection list
// (and lose online assignments nobody has scored); online ones leave the collection list and get evaluators.
async function resyncPhysical(S, P, subCode, physical, session) {
  const r2 = P.rounds[2]; if (!r2) return;
  const ents = await all(() => db().from("nae_entries").select(ENTRY_COLS).eq("pathway_code", P.code).eq("sub_code", subCode).eq("current_round", 2));
  if (!ents.length) return;
  const ids = ents.map(e => e.id);
  const S2 = await loadStructure();
  if (physical) {
    for (let i = 0; i < ids.length; i += 150) {
      const part = ids.slice(i, i + 150);
      const done = new Set((await q(db().from("nae_scores").select("entry_id").eq("round_id", r2.id).eq("status", "submitted").in("entry_id", part))).map(x => x.entry_id));
      const move = part.filter(id => !done.has(id));
      if (move.length) await q(db().from("nae_assignments").delete().eq("round_id", r2.id).in("entry_id", move));
      await q(db().from("nae_logistics").upsert(move.map(id => ({ entry_id: id, state: "to_collect", updated_at: new Date().toISOString() })), { onConflict: "entry_id", ignoreDuplicates: true }));
    }
  } else {
    for (let i = 0; i < ids.length; i += 150) await q(db().from("nae_logistics").delete().eq("state", "to_collect").is("collection_id", null).in("entry_id", ids.slice(i, i + 150)));
    if (r2.status === "open") await assignEntries(S2, r2, ents.filter(e => ["to_score", "in_progress", "not_open"].includes(e.status)));
  }
  await audit(session, `${physical ? "Physical" : "Online"} in Round 2: ${ents.length} artworks updated`, "pathway", P.code, subCode);
}
