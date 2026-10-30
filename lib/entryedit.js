import { db, q } from "@/lib/db";
import { bad, forbidden } from "@/lib/api";
import { audit } from "@/lib/audit";
import { entryAccess } from "@/lib/perms";

// Correct an artwork's details by hand (admin, management, or its coordinator): pathway and subpathway when a teacher
// submitted in the wrong place, title, description, size, medium, group, the three reflections. Changed fields are
// remembered (manual_fields) so a re-import doesn't undo them.
const TEXT = ["title_en", "title_ar", "description_en", "description_ar", "group_name", "medium", "size_text"];
const LABEL = { title_en: "Title (English)", title_ar: "Title (Arabic)", description_en: "Description (English)", description_ar: "Description (Arabic)", group_name: "Group name", medium: "Medium", size_text: "Size", registration_type: "Artwork type", reflections: "Reflections", pathway: "Pathway" };
const clean = (v, max = 4000) => { const s = String(v ?? "").trim(); return s ? s.slice(0, max) : null; };

// a coordinator may correct their own artworks, and any artwork in a planned or live session they run
export async function runsIt(session, e) {
  if (session.role !== "coordinator") return false;
  if (e.coordinator_id === session.sub && (await entryAccess(session, e)) === "full") return true;
  const links = await q(db().from("nae_session_entries").select("session:nae_sessions!inner(coordinator_id, status)").eq("entry_id", e.id).eq("session.coordinator_id", session.sub).in("session.status", ["planned", "live"]).limit(1));
  return links.length > 0;
}
export async function editDetails(session, S, e, d) {
  if (!(["admin", "management"].includes(session.role) || await runsIt(session, e))) throw forbidden("Only the admin, management, the artwork's coordinator or the coordinator running its scoring session can change its details.");
  const patch = {}, changed = [];
  for (const k of TEXT) if (d[k] !== undefined && clean(d[k]) !== (e[k] ?? null)) { patch[k] = clean(d[k]); changed.push(k); }
  if (d.registration_type !== undefined) { const t = d.registration_type === "Group" ? "Group" : "Individual"; if (t !== (e.registration_type || (e.group_name ? "Group" : "Individual"))) { patch.registration_type = t; changed.push("registration_type"); } }
  if (d.reflections && typeof d.reflections === "object") {
    const r = { influence: clean(d.reflections.influence), enjoy: clean(d.reflections.enjoy), focus: clean(d.reflections.focus) };
    const old = e.reflections || {};
    if (["influence", "enjoy", "focus"].some(k => (r[k] ?? null) !== (old[k] ?? null))) { patch.reflections = r; changed.push("reflections"); }
  }
  const pwNew = d.pathway_code || e.pathway_code, subNew = d.sub_code || e.sub_code;
  const pwChanged = pwNew !== e.pathway_code, subChanged = subNew !== e.sub_code;
  let note = "";
  if (pwChanged || subChanged) {
    const P = S.P[pwNew]; if (!P) throw bad("Pick a pathway.");
    if (P.program_id !== S.P[e.pathway_code]?.program_id) throw bad("The pathway must be in the same program.");
    if (!P.subs.some(s => s.code === subNew)) throw bad("Pick a subpathway of that pathway.");
    const scored = await q(db().from("nae_scores").select("id").eq("entry_id", e.id).eq("status", "submitted").limit(1));
    if (scored.length) throw bad("This artwork already has saved scores, so its pathway and subpathway can't change any more.");
    patch.pathway_code = pwNew; patch.sub_code = subNew; changed.push("pathway");
    // nothing was scored yet: clear drafts, and (new pathway) its place in the old pathway's rounds and planned sessions
    await q(db().from("nae_scores").delete().eq("entry_id", e.id).neq("status", "submitted"));
    if (pwChanged) {
      await q(db().from("nae_assignments").delete().eq("entry_id", e.id));
      const links = await q(db().from("nae_session_entries").select("session_id, session:nae_sessions(status)").eq("entry_id", e.id));
      const planned = links.filter(l => ["planned", "live"].includes(l.session?.status)).map(l => l.session_id);
      if (planned.length) await q(db().from("nae_session_entries").delete().eq("entry_id", e.id).in("session_id", planned));
      const r1 = P.rounds[1];
      patch.current_round = 1; patch.status = r1?.status === "open" ? "to_score" : "not_open";
      if (e.coordinator_id) { const c = await q(db().from("nae_accounts").select("pathways").eq("id", e.coordinator_id).maybeSingle()); if (c?.pathways?.length && !c.pathways.includes(pwNew)) { patch.coordinator_id = null; note = " It needs a coordinator in the new pathway (Allocation)."; } }
      note += r1?.status === "open" ? " Assign it to evaluators again from Rounds and results (Rebalance)." : "";
    }
  }
  if (!changed.length) return { ok: true, note: "Nothing changed." };
  // keep the search text in step with the new title and group
  if (changed.some(k => ["title_en", "title_ar", "group_name"].includes(k))) {
    const st = await q(db().from("nae_entry_students").select("name_en, name_ar, esis").eq("entry_id", e.id));
    const n = { ...e, ...patch };
    patch.search_text = [e.code, e.reference_id, e.registration_id, n.title_en, n.title_ar, n.group_name, e.school?.name, e.school?.esis, ...st.flatMap(s => [s.name_en, s.name_ar, s.esis])].filter(Boolean).join(" ").toLowerCase();
  }
  patch.manual_fields = [...new Set([...(e.manual_fields || []), ...changed])];
  patch.updated_at = new Date().toISOString();
  await q(db().from("nae_entries").update(patch).eq("id", e.id));
  const sub = c => (S.P[c.p]?.subs.find(s => s.code === c.s) || {}).name;
  const detail = changed.map(k => k === "pathway" ? `Pathway: ${S.P[e.pathway_code]?.name} · ${sub({ p: e.pathway_code, s: e.sub_code })} → ${S.P[pwNew]?.name} · ${sub({ p: pwNew, s: subNew })}` : k === "reflections" ? "Reflections edited" : `${LABEL[k]}: ${e[k] || "–"} → ${patch[k] || "–"}`).join("; ");
  await audit(session, `Artwork details corrected (${changed.map(k => LABEL[k] || k).join(", ")})`, "entry", e.id, `${detail}${d.reason ? ` · ${String(d.reason).slice(0, 300)}` : ""}`);
  return { ok: true, note: `Saved: ${changed.map(k => LABEL[k] || k).join(", ")}.${note}` };
}
