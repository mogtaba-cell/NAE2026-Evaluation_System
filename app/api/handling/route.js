import { route, body, bad, forbidden } from "@/lib/api";
import { db, q, inChunks } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { audit } from "@/lib/audit";
import { mySessionEntryIds } from "@/lib/perms";
import { applyMove, logEvents } from "@/lib/movements";
import { loadHandling, TRACKS, LISTS, DISPLAY, SIZES, sizeLabel } from "@/lib/handling";
import { planStats, cleanPlan, today, dayOf } from "@/lib/plan";
import { coverIds } from "@/lib/covers";
import { checklistXlsx, xlsxResponse } from "@/lib/checklist";
export const maxDuration = 60;

// Artworks handling: every artwork with a display option, in its track (framing, printing, production, other).
// Admins, management and coordinators fill in the details and approve; Logistics sends approved artworks in
// numbered batches and records them back. Framing also has a plan (date range → artworks to send each day).
const EDIT = ["admin", "management", "coordinator"], STAFF = ["admin", "storage"];
async function coordScope(session) {
  if (session.role !== "coordinator") return null;
  const own = await q(db().from("nae_entries").select("id").eq("coordinator_id", session.sub));
  return new Set([...own.map(x => x.id), ...(await mySessionEntryIds(session))]);
}
const day = d => d ? new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
const detailText = r => (TRACKS[r.track]?.fields || []).map(f => r.details?.[f.key] ? `${f.label}: ${r.details[f.key]}` : null).filter(Boolean).join("\n");

// the framing plan and its alerts (behind, short today, overdue from the framer, waiting for approval)
function framingPlan(plan, rows) {
  const pool = rows.filter(r => r.track === "framing"); const counted = pool.some(r => r.selected) ? pool.filter(r => r.selected || r.sent_at) : pool;
  const st = planStats(plan, counted.length, counted.map(r => dayOf(r.sent_at)));
  const t = today(); const alerts = [];
  const late = pool.filter(r => r.status === "sent" && r.due && r.due < t);
  if (late.length) alerts.push({ tone: "bad", text: `${late.length} artwork${late.length === 1 ? " is" : "s are"} late back from the framer (due ${[...new Set(late.map(r => day(r.due)))].slice(0, 3).join(", ")}).`, codes: late.map(r => r.code) });
  const dueToday = pool.filter(r => r.status === "sent" && r.due === t);
  if (dueToday.length) alerts.push({ tone: "warn", text: `${dueToday.length} artwork${dueToday.length === 1 ? " is" : "s are"} due back from the framer today.` });
  if (st && st.workday && !st.notStarted && st.short > 0) alerts.push({ tone: "warn", text: `Today's target is ${st.target} artwork${st.target === 1 ? "" : "s"} to the framer; ${st.doneToday} sent so far (${st.short} short).` });
  if (st && st.behind > 0) alerts.push({ tone: "bad", text: `Behind the plan: ${st.behind} artwork${st.behind === 1 ? "" : "s"} fewer sent than planned by yesterday.` });
  if (st && st.over && st.remaining > 0) alerts.push({ tone: "bad", text: `The framing period ended on ${day(st.end)} with ${st.remaining} artwork${st.remaining === 1 ? "" : "s"} still to send.` });
  const waiting = counted.filter(r => r.status === "draft").length;
  if (waiting) alerts.push({ tone: "info", text: `${waiting} artwork${waiting === 1 ? " is" : "s are"} waiting for details and approval before they can be sent.` });
  return { stats: st, alerts };
}

export const GET = route(["admin", "storage", "management", "leadership", "coordinator"], async ({ session, url, scope }) => {
  const S = await loadStructure(); const { has, program } = await scope(S);
  const p = Object.fromEntries(url.searchParams);
  const coordIds = await coordScope(session);
  let rows = await loadHandling(S, has, { thumbs: p.format !== "xlsx", coordIds });
  if (p.format === "xlsx") {
    const track = TRACKS[p.track] ? p.track : "framing";
    rows = rows.filter(r => r.track === track);
    if (p.batch) rows = rows.filter(r => String(r.batch) === String(p.batch));
    else if (p.status) rows = rows.filter(r => p.status === "todo" ? ["draft", "approved"].includes(r.status) : r.status === p.status);
    if (p.only === "selected") rows = rows.filter(r => r.selected || r.sent_at);
    if (!rows.length) throw bad("No artworks match these choices.");
    const by = ["place", "size", "school"].includes(p.by) ? p.by : "school";
    const SZ = { S: 1, M: 2, L: 3, XL: 4 };
    rows.sort(by === "place" ? (a, b) => a.locSort - b.locSort || a.code.localeCompare(b.code) : by === "size" ? (a, b) => (SZ[a.size_class] || 9) - (SZ[b.size_class] || 9) || a.school.localeCompare(b.school) || a.code.localeCompare(b.code) : (a, b) => a.school.localeCompare(b.school) || a.code.localeCompare(b.code));
    const group = r => by === "place" ? (r.room ? `${r.room} · ${r.shelf}` : "No storage place") : by === "size" ? (sizeLabel(r.size_class) || "Size not set") : `${r.school}${r.esis ? ` (eSIS ${r.esis})` : ""}`;
    const covers = await coverIds(rows.map(r => ({ id: r.entry_id, reference_id: r.reference_id, pathway_code: r.pathway_code, source_path: r.source_path })));
    const who = TRACKS[track].vendor || "handling";
    const buf = await checklistXlsx({
      title: `${TRACKS[track].label} checklist${p.batch ? ` · batch ${p.batch}` : ""} · ${program?.name || "NAE 2026"}`,
      subtitle: `${rows.length} artwork${rows.length === 1 ? "" : "s"} · grouped by ${by === "place" ? "storage place" : by} · made ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" })}`,
      sheet: `${TRACKS[track].label} checklist`, rows, group, covers,
      cols: [
        ["Artwork code", 14, r => r.code, { mono: true }], ["Title", 26, r => r.title], ["Student name(s)", 26, r => r.students], ["Grade", 10, r => r.grades],
        ["School", 26, r => `${r.school}${r.esis ? `\neSIS ${r.esis}` : ""}`], ["Size", 16, r => [r.size, sizeLabel(r.size_class)].filter(Boolean).join("\n")],
        ["Display option", 18, r => `${r.option_label}${r.option_note ? `\n${r.option_note}` : ""}`], ["Details", 24, r => detailText(r)], ["Current place", 18, r => r.where],
        ["Batch", 7, r => r.batch || ""], ["Sent", 10, r => day(r.sent_at)], ["Due back", 10, r => day(r.due)],
        [`Received by ${who}: name`, 16, () => "", { sign: true }], ["Signature", 14, () => "", { sign: true }], ["Date", 10, () => "", { sign: true }],
        ["Received back by the team: name", 16, () => "", { sign: true }], ["Signature", 14, () => "", { sign: true }], ["Date", 10, () => "", { sign: true }]
      ]
    });
    await audit(session, `Exported the ${TRACKS[track].label.toLowerCase()} checklist`, "logistics", null, `${rows.length} artworks${p.batch ? `, batch ${p.batch}` : ""}`);
    return xlsxResponse(buf, `${TRACKS[track].label} checklist${p.batch ? ` batch ${p.batch}` : ""} ${today()}.xlsx`);
  }
  const [options, planRow] = await Promise.all([
    q(db().from("nae_handling_options").select("*").order("kind").order("sort").order("label")),
    q(db().from("nae_plans").select("*").eq("kind", "framing").maybeSingle())
  ]);
  const pathways = [...new Set(rows.map(r => r.pathway_code))].map(c => ({ code: c, name: S.P[c]?.name || c }));
  return { rows, options, lists: LISTS, tracks: TRACKS, display: DISPLAY, sizes: SIZES, plan: planRow?.data || null, planned: framingPlan(planRow?.data, rows), pathways,
    canEdit: EDIT.includes(session.role), canAct: STAFF.includes(session.role), canLists: ["admin", "management"].includes(session.role) };
});

export const POST = route(["admin", "storage", "management", "coordinator"], async ({ session, request, scope }) => {
  const b = await body(request);
  const S = await loadStructure(); const { has } = await scope(S);
  const now = new Date().toISOString();

  // dropdown lists and the framing plan
  if (["add_option", "update_option"].includes(b.action)) {
    if (!["admin", "management"].includes(session.role)) throw forbidden("Admins and management keep the dropdown lists.");
    const label = String(b.label || "").trim().slice(0, 80);
    if (b.action === "add_option") { if (!LISTS[b.kind] || !label) throw bad("Type the option."); const n = (await q(db().from("nae_handling_options").select("id").eq("kind", b.kind))).length; await q(db().from("nae_handling_options").insert({ kind: b.kind, label, sort: n })); await audit(session, `${LISTS[b.kind]} option added: ${label}`, "logistics", null); return { ok: true, note: "Added" }; }
    const patch = {}; if (label) patch.label = label; if (b.active !== undefined) patch.active = !!b.active;
    await q(db().from("nae_handling_options").update(patch).eq("id", b.id)); return { ok: true, note: "Saved" };
  }
  if (b.action === "save_plan") {
    if (!STAFF.includes(session.role)) throw forbidden("The Logistics team sets the framing plan.");
    let plan; try { plan = cleanPlan(b); } catch (e) { throw bad(e.message); }
    await q(db().from("nae_plans").upsert({ kind: "framing", data: plan, updated_by: session.name, updated_at: now }));
    await audit(session, `Framing plan: ${plan.start} to ${plan.end}`, "logistics", null, plan.skip_weekends ? "weekends off" : "every day");
    return { ok: true, note: "Framing plan saved." };
  }

  // the artworks an action applies to
  const codes = (Array.isArray(b.codes) ? b.codes : [b.code]).filter(Boolean);
  if (!codes.length) throw bad("Pick at least one artwork.");
  const es = (await inChunks(codes, part => q(db().from("nae_entries").select("id, code, pathway_code").in("code", part)))).filter(e => has(e.pathway_code));
  const coordIds = await coordScope(session);
  const ents = coordIds ? es.filter(e => coordIds.has(e.id)) : es;
  if (!ents.length) throw bad(coordIds ? "These artworks are not yours." : "Artworks not found.");
  const hs = await inChunks(ents.map(e => e.id), part => q(db().from("nae_handling").select("*").in("entry_id", part)));
  const codeOf = id => ents.find(e => e.id === id)?.code;
  const done = [], skipped = [];

  if (["save_details", "approve", "unapprove", "set_track"].includes(b.action)) {
    if (!EDIT.includes(session.role)) throw forbidden("Admins, management and coordinators decide the handling details.");
    for (const h of hs) {
      const code = codeOf(h.entry_id);
      if (["sent", "back"].includes(h.status)) { skipped.push({ code, why: "already sent" }); continue; }
      if (b.action === "save_details") {
        const fields = TRACKS[h.track]?.fields || []; const det = { ...(h.details || {}) };
        for (const f of fields) if (b.details?.[f.key] !== undefined) det[f.key] = String(b.details[f.key] || "").trim().slice(0, f.text ? 2000 : 120);
        if (b.details?.file_path !== undefined && h.track === "production") { det.file_path = b.details.file_path || null; det.file_name = b.details.file_name || null; }
        const changed = JSON.stringify(det) !== JSON.stringify(h.details || {});
        if (!changed) { done.push(code); continue; }
        await q(db().from("nae_handling").update({ details: det, status: "draft", approved_by: null, approved_at: null, updated_by: session.name, updated_at: now }).eq("entry_id", h.entry_id));
        await logEvents(session, [{ entry_id: h.entry_id, action: `${TRACKS[h.track].label} details: ${fields.map(f => det[f.key] ? `${f.label} ${f.text ? "added" : det[f.key]}` : null).filter(Boolean).join(", ") || "cleared"}${h.status === "approved" ? " (approval needed again)" : ""}` }]);
        done.push(code);
      } else if (b.action === "approve") {
        if (h.track === "other") { skipped.push({ code, why: "choose where it goes first" }); continue; }
        const miss = (TRACKS[h.track].fields || []).filter(f => !String(h.details?.[f.key] || "").trim());
        if (miss.length) { skipped.push({ code, why: `missing ${miss.map(f => f.label.toLowerCase()).join(" and ")}` }); continue; }
        if (h.status === "approved") { done.push(code); continue; }
        await q(db().from("nae_handling").update({ status: "approved", approved_by: session.name, approved_at: now }).eq("entry_id", h.entry_id));
        await logEvents(session, [{ entry_id: h.entry_id, action: `${TRACKS[h.track].label} approved` }]); done.push(code);
      } else if (b.action === "unapprove") {
        if (h.status !== "approved") { done.push(code); continue; }
        await q(db().from("nae_handling").update({ status: "draft", approved_by: null, approved_at: null, updated_by: session.name, updated_at: now }).eq("entry_id", h.entry_id));
        await logEvents(session, [{ entry_id: h.entry_id, action: `${TRACKS[h.track].label} approval withdrawn` }]); done.push(code);
      } else if (b.action === "set_track") {
        if (!["framing", "printing", "production"].includes(b.track)) throw bad("Choose framing, printing or production.");
        if (h.track === b.track) { done.push(code); continue; }
        await q(db().from("nae_handling").update({ track: b.track, details: {}, status: "draft", approved_by: null, approved_at: null, updated_by: session.name, updated_at: now }).eq("entry_id", h.entry_id));
        await logEvents(session, [{ entry_id: h.entry_id, action: `Handling: goes to ${TRACKS[b.track].label.toLowerCase()}` }]); done.push(code);
      }
    }
  } else if (["send", "back"].includes(b.action)) {
    if (!STAFF.includes(session.role)) throw forbidden("Only the Logistics team and admins send artworks for handling.");
    const track = hs[0]?.track;
    if (hs.some(h => h.track !== track)) throw bad("Send one track at a time (framing, printing or production).");
    if (b.action === "send") {
      const ok = hs.filter(h => h.status === "approved"); hs.filter(h => h.status !== "approved").forEach(h => skipped.push({ code: codeOf(h.entry_id), why: h.status === "draft" ? "not approved yet" : "already sent" }));
      let ids = ok.map(h => h.entry_id);
      if (ids.length && track === "framing") { const r = await applyMove(session, "to_framer", ids, { vendor: b.vendor, due: b.due, note: b.note || null }); r.skipped.forEach(s => skipped.push(s)); const moved = new Set(r.done); ids = ids.filter(id => moved.has(codeOf(id))); }
      if (ids.length) {
        const mx = await q(db().from("nae_handling").select("batch").eq("track", track).not("batch", "is", null).order("batch", { ascending: false }).limit(1)); const batch = (mx[0]?.batch || 0) + 1;
        await q(db().from("nae_handling").update({ status: "sent", batch, vendor: String(b.vendor || "").trim() || null, due: b.due || null, sent_at: now, sent_by: session.name, back_at: null, back_by: null }).in("entry_id", ids));
        if (track !== "framing") await logEvents(session, ids.map(id => ({ entry_id: id, action: `Sent for ${TRACKS[track].label.toLowerCase()} (batch ${batch})${b.vendor ? ` to ${b.vendor}` : ""}`, note: b.note || null })));
        ids.forEach(id => done.push(codeOf(id)));
        await audit(session, `${TRACKS[track].label}: batch ${batch} sent (${ids.length})`, "logistics", null, ids.map(codeOf).slice(0, 40).join(", "));
        return { ok: true, batch, done, skipped, note: `Batch ${batch} sent: ${ids.length} artwork${ids.length === 1 ? "" : "s"}.${skipped.length ? ` ${skipped.length} skipped (${[...new Set(skipped.map(x => x.why))].join(", ")}).` : ""}` };
      }
    } else {
      const ok = hs.filter(h => h.status === "sent"); hs.filter(h => h.status !== "sent").forEach(h => skipped.push({ code: codeOf(h.entry_id), why: "not sent" }));
      let ids = ok.map(h => h.entry_id);
      if (ids.length && track === "framing") { const r = await applyMove(session, "from_framer", ids, { location_id: b.location_id || null, note: b.note || null }); r.skipped.forEach(s => skipped.push(s)); const moved = new Set(r.done); ids = ids.filter(id => moved.has(codeOf(id))); }
      if (ids.length) {
        await q(db().from("nae_handling").update({ status: "back", back_at: now, back_by: session.name }).in("entry_id", ids));
        if (track !== "framing") await logEvents(session, ids.map(id => ({ entry_id: id, action: `Back from ${TRACKS[track].label.toLowerCase()}`, note: b.note || null })));
        ids.forEach(id => done.push(codeOf(id)));
      }
    }
  } else throw bad("Unknown action.");
  if (done.length && !["save_details"].includes(b.action)) await audit(session, `Artworks handling: ${b.action.replace("_", " ")} (${done.length})`, "logistics", null, done.slice(0, 40).join(", "));
  const label = { save_details: "Saved", approve: "Approved", unapprove: "Approval withdrawn", set_track: "Moved", back: "Back to storage", send: "Sent" }[b.action];
  return { ok: true, done, skipped, note: `${label}: ${done.length} artwork${done.length === 1 ? "" : "s"}.${skipped.length ? ` ${skipped.length} skipped (${[...new Set(skipped.map(x => x.why))].join(", ")}).` : ""}` };
});
