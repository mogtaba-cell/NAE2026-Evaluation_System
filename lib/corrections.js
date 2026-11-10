import { db, q, all, inChunks } from "@/lib/db";
import { bad, forbidden } from "@/lib/api";
import { audit } from "@/lib/audit";
import { recompute } from "@/lib/scoring";
import { loadStructure, isPhysicalRound } from "@/lib/structure";
import { sendMail, mailConfigured } from "@/lib/mail";
import { entryFiles } from "@/lib/files";

// Corrections: when an artwork can't go on as submitted, it goes to its coordinator, who contacts the school and
// sends it back corrected to the person who asked (the session for an evaluation, the proofreader or reviewer).
// Every contact with the school is kept in the correction's log. If the school doesn't respond:
//   - artwork problems (file quality, wrong artwork) → the artwork is marked not scored
//   - text problems (missing or inappropriate narrative) → the pathway's default text is used and it goes on
export const REASONS = {
  file_quality: { label: "Artwork file quality / clarity", text: "The submitted image, video or audio file can't be evaluated clearly.", kind: "artwork" },
  artwork_mismatch: { label: "Artwork mismatch", text: "The artwork doesn't match its submission: it belongs to a different student, or a name on it doesn't match the students, title or description. Get the correct artwork image from the school.", kind: "artwork" },
  incomplete_narrative: { label: "Incomplete narrative", text: "Required text (title, description or answers) is blank, missing or incomplete.", kind: "text" },
  inappropriate: { label: "Inappropriate / flagged content", text: "Sensitive or guideline-breaking text needs revising.", kind: "text" }
};
export const SOURCES = { evaluation: "Evaluation", proofreading: "Proofreading", review: "Final review" };
export const STATUS = { open: "With the coordinator", corrected: "Corrected", defaulted: "Default text used", not_scored: "Not scored", cancelled: "Cancelled" };
export const CHANNELS = { call: "Phone call", email: "Email", whatsapp: "WhatsApp", visit: "Visit", other: "Other" };
export const QUESTION = { en: "Can this artwork be evaluated based on the quality and clarity of the submitted image, video, or audio file?", ar: "هل يمكن تقييم العمل الفني بناءً على جودة ووضوح ملف الصورة أو الفيديو أو الصوت المرفق؟" };
const now = () => new Date().toISOString();
export async function log(session, cid, kind, text = null, extra = {}) {
  await q(db().from("nae_correction_log").insert({ correction_id: cid, by_id: session?.sub || null, by_name: session?.name || "System", kind, text, ...extra }));
}
export const openFor = async entryId => q(db().from("nae_corrections").select("*").eq("entry_id", entryId).eq("status", "open").maybeSingle());

// Who gets a correction: only the coordinators an admin selected (handles_corrections). Each school stays with
// one of them, so all of a school's corrections go to the same person; a new school goes to the selected
// coordinator with the fewest schools (then the fewest open corrections). Nobody selected: admins follow it up.
export async function correctionTeam() {
  return q(db().from("nae_accounts").select("id, display_name, email, active").eq("role", "coordinator").eq("handles_corrections", true).eq("active", true).order("display_name"));
}
export async function coordinatorForSchool(session, schoolId, team) {
  team = team || await correctionTeam(); if (!team.length) return null;
  const ids = team.map(t => t.id);
  if (schoolId) { const m = await q(db().from("nae_correction_schools").select("coordinator_id").eq("school_id", schoolId).maybeSingle()); if (m && ids.includes(m.coordinator_id)) return m.coordinator_id; }
  const [maps, open] = await Promise.all([all(() => db().from("nae_correction_schools").select("school_id, coordinator_id").in("coordinator_id", ids).order("school_id")), all(() => db().from("nae_corrections").select("id, coordinator_id").eq("status", "open").in("coordinator_id", ids).order("id"))]);
  const load = id => [maps.filter(x => x.coordinator_id === id).length, open.filter(x => x.coordinator_id === id).length];
  const pick = [...team].sort((a, b) => { const [x1, x2] = load(a.id), [y1, y2] = load(b.id); return x1 - y1 || x2 - y2 || String(a.display_name).localeCompare(String(b.display_name)); })[0].id;
  if (schoolId) await q(db().from("nae_correction_schools").upsert({ school_id: schoolId, coordinator_id: pick, assigned_at: now(), assigned_by: session?.name || "System" }, { onConflict: "school_id" }));
  return pick;
}
// after the selection changes: schools of coordinators no longer selected are shared out again, with their open corrections
export async function rebalance(session) {
  const team = await correctionTeam(); const ids = team.map(t => t.id);
  const maps = await all(() => db().from("nae_correction_schools").select("school_id, coordinator_id").order("school_id"));
  const gone = maps.filter(m => !ids.includes(m.coordinator_id)).map(m => m.school_id);
  for (let i = 0; i < gone.length; i += 200) await q(db().from("nae_correction_schools").delete().in("school_id", gone.slice(i, i + 200)));
  const open = (await all(() => db().from("nae_corrections").select("id, coordinator_id, entry:nae_entries(school_id)").eq("status", "open").order("id"))).filter(c => !ids.includes(c.coordinator_id));
  let moved = 0;
  for (const c of open) {
    const to = await coordinatorForSchool(session, c.entry?.school_id, team);
    if (to !== c.coordinator_id) { await q(db().from("nae_corrections").update({ coordinator_id: to }).eq("id", c.id)); await log(session, c.id, "note", `Moved to ${team.find(t => t.id === to)?.display_name || "the admins"} (corrections coordinators changed)`); moved++; }
  }
  return moved;
}
// an admin moves a school to another corrections coordinator; its open corrections go with it
export async function moveSchool(session, schoolId, coordinatorId) {
  const team = await correctionTeam(); const to = team.find(t => t.id === coordinatorId); if (!to) throw bad("Choose one of the corrections coordinators.");
  await q(db().from("nae_correction_schools").upsert({ school_id: schoolId, coordinator_id: to.id, assigned_at: now(), assigned_by: session.name }, { onConflict: "school_id" }));
  const ents = await all(() => db().from("nae_entries").select("id").eq("school_id", schoolId).order("id"));
  const open = ents.length ? await inChunks(ents.map(e => e.id), part => q(db().from("nae_corrections").select("id, coordinator_id").eq("status", "open").in("entry_id", part))) : [];
  for (const c of open.filter(c => c.coordinator_id !== to.id)) { await q(db().from("nae_corrections").update({ coordinator_id: to.id }).eq("id", c.id)); await log(session, c.id, "note", `Moved to ${to.display_name} (school reassigned)`); }
  await audit(session, `Corrections for a school moved to ${to.display_name}`, "school", schoolId, `${open.length} open`);
  return open.length;
}

// Hide files from evaluators (the wrong artwork's files once the correct image is in), or show them again.
export async function hideFiles(session, c, files, hide = true) {
  if (!files.length) return 0;
  if (hide) await q(db().from("nae_hidden_files").upsert(files.map(f => ({ drive_id: f.drive_id, entry_id: c.entry_id, correction_id: c.id, name: f.name || null, hidden_at: now(), hidden_by: session?.name || "System" })), { onConflict: "drive_id" }));
  else await q(db().from("nae_hidden_files").delete().eq("entry_id", c.entry_id).in("drive_id", files.map(f => f.drive_id)));
  await log(session, c.id, "visibility", `${files.length === 1 ? `“${files[0].name}”` : `${files.length} files`} ${hide ? "hidden from evaluators" : "shown to evaluators again"}`);
  return files.length;
}
// once the school's correct artwork image is among the artwork's files: hide the files it replaces
export async function hideReplaced(session, c, keepIds) {
  if (c.reason !== "artwork_mismatch" || !keepIds.length) return 0;
  const e = await q(db().from("nae_entries").select("*").eq("id", c.entry_id).single());
  const files = await entryFiles(e);
  // the files there when the correction was opened (older corrections: everything except what the school sent)
  const sent = (await q(db().from("nae_correction_log").select("file_path").eq("correction_id", c.id).like("file_path", "drive:%"))).map(l => l.file_path.slice(6));
  return hideFiles(session, c, files.filter(f => !keepIds.includes(f.drive_id) && (c.files_at_open ? c.files_at_open.includes(f.drive_id) : !sent.includes(f.drive_id))));
}

async function filesNow(e) { try { return (await entryFiles(e, { withHidden: true })).map(f => f.drive_id); } catch { return null; } }

// open a correction (evaluation pauses the artwork's scoring; proofreading/review pause its proofreading)
export async function openCorrection(session, e, { source, reason, note, round_no, session_id, return_to_id }) {
  if (!SOURCES[source]) throw bad("Unknown stage.");
  if (!REASONS[reason]) throw bad("Choose the reason.");
  if (source === "evaluation" && !["file_quality", "artwork_mismatch"].includes(reason)) throw bad("Choose the reason.");
  const txt = String(note || "").trim().slice(0, 1000);
  if (!txt) throw bad("Say what's wrong, so the coordinator can ask the school.");
  if (await openFor(e.id)) throw bad("This artwork is already with its coordinator for a correction.");
  const c = await q(db().from("nae_corrections").insert({ entry_id: e.id, source, reason, note: txt, round_no: round_no || null, session_id: session_id || null, requested_by_id: session.sub, requested_by: session.name, requested_role: session.role, return_to_id: return_to_id || session.sub, coordinator_id: await coordinatorForSchool(session, e.school_id), files_at_open: await filesNow(e) }).select("*").single());
  await log(session, c.id, "opened", txt);
  if (source === "evaluation") await q(db().from("nae_entries").update({ not_visible_at: now(), not_visible_by: session.sub, not_visible_round: round_no || e.current_round, not_visible_note: `${REASONS[reason].label}: ${txt}`, updated_at: now() }).eq("id", e.id));
  else await q(db().from("nae_proof").update({ status: "with_coordinator", correction_id: c.id, updated_at: now() }).eq("entry_id", e.id));
  await audit(session, `Sent to the coordinator for correction (${SOURCES[source]}): ${REASONS[reason].label}`, "entry", e.id, txt);
  return c;
}

// where a closed correction goes back to
async function giveBack(c) {
  if (c.source === "evaluation") {
    await q(db().from("nae_entries").update({ not_visible_at: null, not_visible_by: null, not_visible_round: null, not_visible_note: null, updated_at: now() }).eq("id", c.entry_id));
    if (c.round_no) await recompute(c.entry_id, c.round_no, { S: await loadStructure() });
  } else {
    await q(db().from("nae_proof").update({ status: c.source === "review" ? "to_review" : "to_proofread", correction_id: null, returned_note: `Back from the coordinator (${REASONS[c.reason]?.label || c.reason})`, updated_at: now() }).eq("entry_id", c.entry_id));
  }
}
// the artwork stops where it is: not scored (the school didn't send the right artwork, or it is still faulty)
async function stopEntry(session, c, why) {
  const e = await q(db().from("nae_entries").select("id, code, current_round").eq("id", c.entry_id).single());
  await q(db().from("nae_entries").update({ status: "not_scored", not_visible_at: null, not_visible_by: null, not_visible_round: null, not_visible_note: null, updated_at: now() }).eq("id", e.id));
  await q(db().from("nae_reviews").update({ status: "confirmed", decided_at: now(), decided_by: session.sub, decision_note: `Closed: artwork marked not scored. ${why}` }).eq("entry_id", e.id).eq("status", "open"));
  if (c.source !== "evaluation") await q(db().from("nae_proof").update({ status: "not_scored", correction_id: null, updated_at: now() }).eq("entry_id", e.id));
  await audit(session, `Marked not scored: ${why}`, "entry", e.id, e.code);
}

// close a correction: corrected | no_response | still_faulty
export async function closeCorrection(session, c, outcome, note) {
  if (c.status !== "open") throw bad("This correction is already closed.");
  const kind = REASONS[c.reason]?.kind; const txt = String(note || "").trim().slice(0, 1000) || null;
  let status, msg;
  if (outcome === "corrected" && c.reason === "artwork_mismatch") {
    // an online artwork needs the correct artwork image from the school before it goes back
    const e = await q(db().from("nae_entries").select("id, pathway_code, sub_code, physical_override").eq("id", c.entry_id).single());
    if (!isPhysicalRound(await loadStructure(), e, c.round_no || 1)) {
      const files = await q(db().from("nae_correction_log").select("id").eq("correction_id", c.id).eq("kind", "file").limit(1));
      if (!files.length) throw bad("Add the correct artwork image from the school first (or check the artwork's folder if the school uploaded it there).");
    }
  }
  if (outcome === "corrected") { await giveBack(c); status = "corrected"; msg = c.source === "evaluation" ? "Corrected: back for scoring." : `Corrected: back to the ${c.source === "review" ? "reviewer" : "proofreader"}.`; }
  else if (outcome === "no_response" && kind === "text") {
    // the pathway's default text replaces what is missing or wrong, then it goes on
    const e = await q(db().from("nae_entries").select("id, pathway_code, manual_fields").eq("id", c.entry_id).single());
    const p = await q(db().from("nae_pathways").select("default_title_en, default_title_ar, default_description_en, default_description_ar, name").eq("code", e.pathway_code).single());
    const patch = {}; [["title_en", "default_title_en"], ["title_ar", "default_title_ar"], ["description_en", "default_description_en"], ["description_ar", "default_description_ar"]].forEach(([k, d]) => { if (String(p[d] || "").trim()) patch[k] = p[d].trim(); });
    if (!Object.keys(patch).length) throw bad(`No default text is set for ${p.name}. An admin sets it in Program setup → ${p.name}.`);
    await q(db().from("nae_entries").update({ ...patch, manual_fields: [...new Set([...(e.manual_fields || []), ...Object.keys(patch)])], updated_at: now() }).eq("id", e.id));
    await giveBack(c); status = "defaulted"; msg = "No response from the school: the pathway's default text is used, and it goes on.";
  } else if (outcome === "no_response" || outcome === "still_faulty") {
    if (outcome === "still_faulty" && kind !== "artwork") throw bad("Use this only for artwork problems.");
    await stopEntry(session, c, outcome === "no_response" ? "No response from the school" : "The new submission is still incomplete or faulty after correction");
    status = "not_scored"; msg = "Marked not scored.";
  } else throw bad("Unknown outcome.");
  await q(db().from("nae_corrections").update({ status, closed_at: now(), closed_by: session.name, outcome_note: txt, waiting_since: null }).eq("id", c.id));
  await log(session, c.id, "closed", `${STATUS[status]}${txt ? `: ${txt}` : ""}`);
  await audit(session, `Correction closed: ${STATUS[status]}`, "entry", c.entry_id, txt || "");
  return msg;
}

// who may work on a correction: admins, management, and the artwork's coordinator
export function canWork(session, c) {
  if (["admin", "management"].includes(session.role)) return true;
  if (session.role === "coordinator" && c.coordinator_id === session.sub) return true;
  throw forbidden("This correction is with another coordinator.");
}

// open corrections for a list (coordinator: theirs)
export async function openList(session, has) {
  let rows = await all(() => db().from("nae_corrections").select("*, entry:nae_entries(id, code, reference_id, source_path, title_en, title_ar, group_name, pathway_code, coordinator_id, school:nae_schools(name, esis))").order("opened_at"));
  // coordinators: the corrections given to them (whatever the pathway); others: their programs
  if (session.role === "coordinator") return rows.filter(r => r.entry && r.coordinator_id === session.sub);
  rows = rows.filter(r => r.entry && (!has || has(r.entry.pathway_code)));
  return rows;
}

// the daily reminder to each coordinator: how many corrections are open, and how many for 3 days or more
export async function remindCoordinators({ force = false } = {}) {
  if (!mailConfigured()) return { emailed: 0, note: "Email is not set up." };
  const open = await all(() => db().from("nae_corrections").select("id, coordinator_id, opened_at, entry:nae_entries(code, title_en)").eq("status", "open"));
  if (!open.length) return { emailed: 0, note: "No open corrections." };
  const accs = await q(db().from("nae_accounts").select("id, display_name, email, active, corrections_reminded_at").in("id", [...new Set(open.map(c => c.coordinator_id).filter(Boolean))]));
  const site = process.env.NAE_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  const old = Date.now() - 3 * 86400000; let emailed = 0;
  for (const a of accs) {
    if (!a.active || !a.email) continue;
    if (!force && a.corrections_reminded_at && Date.now() - Date.parse(a.corrections_reminded_at) < 20 * 3600 * 1000) continue;
    const mine = open.filter(c => c.coordinator_id === a.id); const late = mine.filter(c => Date.parse(c.opened_at) < old);
    await sendMail({ to: a.email, subject: `NAE: ${mine.length} correction${mine.length === 1 ? "" : "s"} waiting${late.length ? ` (${late.length} for 3 days or more)` : ""}`,
      text: [`Hello ${a.display_name},`, "", `You have ${mine.length} artwork${mine.length === 1 ? "" : "s"} waiting for a correction from the school.`, late.length ? `${late.length} of them ${late.length === 1 ? "has" : "have"} been waiting for 3 days or more.` : "None has been waiting for 3 days yet.", "", "Contact the schools, record each contact in the correction's log, and send the artworks back once corrected.", site ? `${site}/corrections` : "", "", "NAE Evaluation System"].join("\n") });
    await q(db().from("nae_accounts").update({ corrections_reminded_at: now() }).eq("id", a.id)); emailed++;
  }
  return { emailed, note: `Correction reminders sent to ${emailed} coordinator${emailed === 1 ? "" : "s"}.` };
}
