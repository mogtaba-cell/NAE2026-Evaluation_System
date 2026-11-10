import { route, body, bad, forbidden } from "@/lib/api";
import { db, q, all, inChunks } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { entryAccess } from "@/lib/perms";
import { entryFiles } from "@/lib/files";
import { fileView } from "@/lib/entryview";
import { editDetails } from "@/lib/entryedit";
import { coverThumbs } from "@/lib/covers";
import { REASONS, SOURCES, STATUS, CHANNELS, QUESTION, openCorrection, closeCorrection, canWork, log, openList, correctionTeam, rebalance, moveSchool, hideFiles, hideReplaced } from "@/lib/corrections";
import { audit } from "@/lib/audit";

// Corrections with the coordinators. GET: the list (coordinators see theirs), or one with its log (?id=).
// POST: open (evaluation, proofreading, review), log a contact, waiting for the school, edit the text, check for
// new files, close (corrected / no response / still faulty).
const VIEW = ["admin", "management", "coordinator", "leadership"];
export const GET = route(VIEW, async ({ session, url, scope }) => {
  const S = await loadStructure(); const { has } = await scope(S);
  const id = url.searchParams.get("id");
  // the corrections coordinators and the schools each one has (admin, management)
  if (url.searchParams.get("team")) {
    if (!["admin", "management"].includes(session.role)) throw forbidden();
    const [coords, maps, open] = await Promise.all([
      q(db().from("nae_accounts").select("id, display_name, active, handles_corrections").eq("role", "coordinator").order("display_name")),
      all(() => db().from("nae_correction_schools").select("school_id, coordinator_id, assigned_at, school:nae_schools(name, esis)").order("school_id")),
      all(() => db().from("nae_corrections").select("id, coordinator_id, entry:nae_entries(school_id)").eq("status", "open").order("id"))
    ]);
    return { coordinators: coords.map(a => ({ ...a, schools: maps.filter(m => m.coordinator_id === a.id).length, open: open.filter(c => c.coordinator_id === a.id).length })),
      schools: maps.map(m => ({ school_id: m.school_id, name: m.school?.name || "", esis: m.school?.esis || "", coordinator_id: m.coordinator_id, open: open.filter(c => c.entry?.school_id === m.school_id).length })).sort((a, b) => a.name.localeCompare(b.name)),
      unassigned: open.filter(c => !c.coordinator_id).length };
  }
  const meta = { reasons: REASONS, sources: SOURCES, statuses: STATUS, channels: CHANNELS, question: QUESTION };
  if (id) {
    const c = await q(db().from("nae_corrections").select("*").eq("id", id).maybeSingle()); if (!c) throw bad("Correction not found.");
    const e = await q(db().from("nae_entries").select("*, school:nae_schools(name, esis, region)").eq("id", c.entry_id).single());
    // coordinators: the ones given to them; the artwork's own or session coordinator can follow it (read only)
    if (session.role === "coordinator" && c.coordinator_id !== session.sub && (await entryAccess(session, e)) !== "full") throw forbidden("This correction is with another coordinator.");
    const [lg, students, files, sess, p] = await Promise.all([
      q(db().from("nae_correction_log").select("*").eq("correction_id", c.id).order("at")),
      q(db().from("nae_entry_students").select("position, name_en, name_ar, grade").eq("entry_id", e.id).order("position")),
      entryFiles(e, { withHidden: true }).catch(() => []),
      c.session_id ? q(db().from("nae_sessions").select("id, title, status").eq("id", c.session_id).maybeSingle()) : null,
      q(db().from("nae_pathways").select("name, eval_type, default_title_en, default_title_ar, default_description_en, default_description_ar").eq("code", e.pathway_code).single())
    ]);
    const hidden = files.length ? await q(db().from("nae_hidden_files").select("drive_id, hidden_by, hidden_at").eq("entry_id", e.id)) : [];
    const others = await q(db().from("nae_corrections").select("id, reason, source, status, opened_at, closed_at").eq("entry_id", e.id).neq("id", c.id).order("opened_at", { ascending: false }));
    return { ...meta, correction: c, log: lg, others, session: sess, entry: { ...e, raw: undefined, search_text: undefined, pathway: p.name, sub: (S.P[e.pathway_code]?.subs.find(s => s.code === e.sub_code) || {}).name, competition: p.eval_type === "Competition" }, students, files: files.map(f => ({ ...fileView(f), hidden: hidden.find(h => h.drive_id === f.drive_id) || null })),
      defaults: { title_en: p.default_title_en, title_ar: p.default_title_ar, description_en: p.default_description_en, description_ar: p.default_description_ar },
      can: { work: session.role !== "leadership" && (["admin", "management"].includes(session.role) || c.coordinator_id === session.sub) } };
  }
  const rows = await openList(session, has);
  const th = await coverThumbs(rows.filter(r => r.status === "open").map(r => r.entry));
  const lastLog = rows.length ? await inChunks(rows.map(r => r.id), part => q(db().from("nae_correction_log").select("correction_id, at, kind").in("correction_id", part).order("at", { ascending: false }))) : [];
  const coords = await q(db().from("nae_accounts").select("id, display_name").eq("role", "coordinator"));
  return { ...meta, rows: rows.map(r => ({ id: r.id, code: r.entry.code, title: r.entry.title_en || r.entry.title_ar || r.entry.group_name || "", school: r.entry.school?.name || "", esis: r.entry.school?.esis || "", pathway: S.P[r.entry.pathway_code]?.name || "",
    source: r.source, reason: r.reason, note: r.note, status: r.status, opened_at: r.opened_at, closed_at: r.closed_at, waiting_since: r.waiting_since, requested_by: r.requested_by, coordinator: coords.find(a => a.id === r.coordinator_id)?.display_name || "No coordinator",
    last: lastLog.find(x => x.correction_id === r.id)?.at || r.opened_at, contacts: lastLog.filter(x => x.correction_id === r.id && ["contacted", "replied"].includes(x.kind)).length, thumb: th[r.entry.id] || null })) };
});

export const POST = route(["admin", "management", "coordinator", "evaluator", "proofreader", "reviewer"], async ({ session, request }) => {
  const b = await body(request);
  if (b.action === "team" || b.action === "move_school") {
    if (!["admin", "management"].includes(session.role)) throw forbidden();
    if (b.action === "move_school") { const n = await moveSchool(session, b.school_id, b.coordinator_id); return { ok: true, note: `School moved${n ? `, with ${n} open correction${n === 1 ? "" : "s"}` : ""}.` }; }
    const ids = Array.isArray(b.ids) ? b.ids.map(String) : [];
    const coords = await q(db().from("nae_accounts").select("id, handles_corrections").eq("role", "coordinator"));
    const on = coords.filter(a => ids.includes(a.id)).map(a => a.id), off = coords.filter(a => !ids.includes(a.id) && a.handles_corrections).map(a => a.id);
    if (on.length) await q(db().from("nae_accounts").update({ handles_corrections: true }).in("id", on));
    if (off.length) await q(db().from("nae_accounts").update({ handles_corrections: false }).in("id", off));
    const moved = await rebalance(session);
    await audit(session, "Corrections coordinators changed", "account", null, `${on.length} selected`);
    return { ok: true, note: `${on.length} coordinator${on.length === 1 ? " handles" : "s handle"} corrections.${moved ? ` ${moved} open correction${moved === 1 ? "" : "s"} shared out again.` : ""}` };
  }
  if (b.action === "open") {
    const e = await q(db().from("nae_entries").select("*").eq("code", b.code || "").maybeSingle()); if (!e) throw bad("Artwork not found.");
    let return_to_id = null;
    if (b.source === "evaluation") {
      if ((await entryAccess(session, e)) !== "full" || ["proofreader", "reviewer"].includes(session.role)) throw forbidden("You can't send this artwork for correction.");
    } else {
      const p = await q(db().from("nae_proof").select("*").eq("entry_id", e.id).maybeSingle()); if (!p) throw bad("This artwork is not in proofreading.");
      const mine = b.source === "review" ? p.reviewer_id === session.sub : p.proofreader_id === session.sub;
      if (!["admin", "management"].includes(session.role) && !mine) throw forbidden("This artwork is assigned to someone else.");
      if (p.status !== (b.source === "review" ? "to_review" : "to_proofread")) throw bad("This artwork isn't at that stage.");
      return_to_id = (b.source === "review" ? p.reviewer_id : p.proofreader_id) || session.sub;
    }
    const c = await openCorrection(session, e, { source: b.source, reason: b.reason, note: b.note, round_no: b.round_no ? Number(b.round_no) : e.current_round, session_id: b.session_id || null, return_to_id });
    return { ok: true, id: c.id, note: c.coordinator_id ? "Sent to the coordinator. It comes back here once corrected." : "Sent for correction. No corrections coordinator is set yet: an admin follows it up in Corrections." };
  }
  const c = await q(db().from("nae_corrections").select("*").eq("id", b.id || "").maybeSingle()); if (!c) throw bad("Correction not found.");
  if (!["admin", "management", "coordinator"].includes(session.role)) throw forbidden();
  canWork(session, c);
  if (b.action === "log") {
    if (!["contacted", "replied", "note"].includes(b.kind)) throw bad("Unknown entry.");
    const text = String(b.text || "").trim().slice(0, 1000); if (!text && b.kind === "note") throw bad("Write the note.");
    await log(session, c.id, b.kind, text || null, { channel: CHANNELS[b.channel] ? b.channel : null });
    if (b.kind === "contacted" && !c.waiting_since && c.status === "open") await q(db().from("nae_corrections").update({ waiting_since: new Date().toISOString() }).eq("id", c.id));
    return { ok: true, note: "Added to the log." };
  }
  if (c.status !== "open") throw bad("This correction is closed.");
  if (b.action === "waiting") {
    await q(db().from("nae_corrections").update({ waiting_since: b.on ? (c.waiting_since || new Date().toISOString()) : null }).eq("id", c.id));
    await log(session, c.id, "waiting", b.on ? "Waiting for the school's response" : "No longer waiting for the school");
    return { ok: true, note: b.on ? "Marked as waiting for the school." : "Not waiting any more." };
  }
  if (b.action === "details") {
    const e = await q(db().from("nae_entries").select("*").eq("id", c.entry_id).single());
    const d = { ...(b.details || {}) }; delete d.pathway_code; delete d.sub_code; delete d.registration_type;
    const r = await editDetails(session, await loadStructure(), e, d, { correction: true });
    await log(session, c.id, "details", r?.note || "Details updated");
    return { ok: true, note: r?.note || "Saved." };
  }
  if (b.action === "check_files") {
    const e = await q(db().from("nae_entries").select("*").eq("id", c.entry_id).single());
    const before = (await entryFiles(e, { withHidden: true })).map(f => f.drive_id); const files = await entryFiles(e, { refresh: true, withHidden: true });
    const added = files.filter(f => !before.includes(f.drive_id)); const n = added.length;
    if (n > 0) await log(session, c.id, "file", `${n} new file${n === 1 ? "" : "s"} found in the artwork's folder`);
    const hid = n > 0 ? await hideReplaced(session, c, added.map(f => f.drive_id)) : 0;
    return { ok: true, note: n > 0 ? `${n} new file${n === 1 ? "" : "s"} found.${hid ? ` ${hid} earlier file${hid === 1 ? " is" : "s are"} now hidden from evaluators.` : ""}` : `No new files (${files.length} in all).` };
  }
  if (b.action === "file_visibility") {
    const e = await q(db().from("nae_entries").select("*").eq("id", c.entry_id).single());
    const f = (await entryFiles(e, { withHidden: true })).find(x => x.drive_id === b.drive_id); if (!f) throw bad("File not found.");
    await hideFiles(session, c, [f], !!b.hidden);
    return { ok: true, note: b.hidden ? "Hidden from evaluators." : "Shown to evaluators again." };
  }
  if (b.action === "close") return { ok: true, note: await closeCorrection(session, c, b.outcome, b.note) };
  throw bad("Unknown action.");
});
