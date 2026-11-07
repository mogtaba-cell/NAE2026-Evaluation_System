import { after } from "next/server";
import { route, body, bad, forbidden } from "@/lib/api";
import { db, q } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { audit } from "@/lib/audit";
import { loadPhotography, makeFolders, scanPhotos, schoolFolder } from "@/lib/photography";
import { planStats, cleanPlan, today, dayOf } from "@/lib/plan";
import { coverIds } from "@/lib/covers";
import { checklistXlsx, xlsxResponse } from "@/lib/checklist";
import { sizeLabel } from "@/lib/display";
export const maxDuration = 60;

// Professional photography: the physical artworks, the photography plan (date range and spaces → artworks a day)
// with its alerts, the photos found in the Shared Drive, and a checklist per space (or batch).
const STAFF = ["admin", "storage"];
const day = d => d ? new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
let lastScan = 0;

function photoPlan(plan, rows) {
  const st = planStats(plan, rows.length, rows.map(r => dayOf(r.photo.done_at)));
  const t = today(); const alerts = [];
  const stuck = rows.filter(r => r.state === "photography" && dayOf(r.photo.sent_at) < t);
  if (stuck.length) alerts.push({ tone: "bad", text: `${stuck.length} artwork${stuck.length === 1 ? " has" : "s have"} been at photography since before today and ${stuck.length === 1 ? "isn't" : "aren't"} ticked back yet.` });
  if (st && st.workday && !st.notStarted && st.short > 0) alerts.push({ tone: "warn", text: `Today's target is ${st.target} artwork${st.target === 1 ? "" : "s"}${st.perSpace != null ? ` (${st.perSpace} per space)` : ""}; ${st.doneToday} photographed so far (${st.short} short).` });
  if (st && st.behind > 0) alerts.push({ tone: "bad", text: `Behind the plan: ${st.behind} artwork${st.behind === 1 ? "" : "s"} fewer photographed than planned by yesterday.` });
  if (st && st.over && st.remaining > 0) alerts.push({ tone: "bad", text: `The photography period ended on ${day(st.end)} with ${st.remaining} artwork${st.remaining === 1 ? "" : "s"} still to photograph.` });
  const noPhotos = rows.filter(r => r.photo.done_at && !r.photos.length);
  if (noPhotos.length) alerts.push({ tone: "info", text: `${noPhotos.length} photographed artwork${noPhotos.length === 1 ? " has" : "s have"} no photo in the Shared Drive yet.` });
  return { stats: st, alerts };
}

export const GET = route(["admin", "storage", "management", "leadership"], async ({ session, url, scope }) => {
  const S = await loadStructure(); const { has, program } = await scope(S);
  const p = Object.fromEntries(url.searchParams);
  let rows = await loadPhotography(S, has, { thumbs: p.format !== "xlsx" });
  if (p.only === "selected") rows = rows.filter(r => r.selected);
  if (p.format === "xlsx") {
    if (p.batch) rows = rows.filter(r => String(r.photo.batch) === String(p.batch));
    else if (p.space) rows = rows.filter(r => r.state === "photography" && r.photo.space === p.space);
    else rows = rows.filter(r => p.status === "done" ? r.photo.done_at && r.state !== "photography" : p.status === "out" ? r.state === "photography" : !r.photo.done_at && r.state !== "photography");
    if (!rows.length) throw bad("No artworks match these choices.");
    const by = p.by === "place" ? "place" : "school";
    rows.sort(by === "place" ? (a, b) => a.locSort - b.locSort || a.code.localeCompare(b.code) : (a, b) => a.school.localeCompare(b.school) || a.code.localeCompare(b.code));
    const covers = await coverIds(rows.map(r => ({ id: r.entry_id, reference_id: r.reference_id, pathway_code: r.pathway_code, source_path: r.source_path })));
    const buf = await checklistXlsx({
      title: `Photography checklist${p.space ? ` · ${p.space}` : ""}${p.batch ? ` · batch ${p.batch}` : ""} · ${program?.name || "NAE 2026"}`,
      subtitle: `${rows.length} artwork${rows.length === 1 ? "" : "s"} · save the photos in 06 Uploads / Photography / <eSIS> - <School>, named by the artwork code (more than one: CODE-A, CODE-B ...) · made ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" })}`,
      sheet: "Photography checklist", rows, covers,
      group: r => by === "place" ? (r.room ? `${r.room} · ${r.shelf}` : "No storage place") : `${r.school}${r.esis ? ` (eSIS ${r.esis})` : ""}`,
      cols: [
        ["Artwork code", 14, r => r.code, { mono: true }], ["Title", 26, r => r.title], ["Student name(s)", 24, r => r.students], ["Grade", 10, r => r.grades],
        ["School", 24, r => `${r.school}${r.esis ? `\neSIS ${r.esis}` : ""}`], ["Size", 16, r => [r.size, sizeLabel(r.size_class)].filter(Boolean).join("\n")],
        ["Storage place", 16, r => r.where], ["Batch · space", 14, r => [r.photo.batch && `Batch ${r.photo.batch}`, r.photo.space].filter(Boolean).join("\n")],
        ["Save in folder", 24, r => r.folder], ["Name the photos", 18, r => `${r.code}\n${r.code}-A, -B …`, { mono: true }], ["No. of photos", 8, () => "", { sign: true }],
        ["Received by photographer: name", 16, () => "", { sign: true }], ["Signature", 14, () => "", { sign: true }], ["Received back by the team: name", 16, () => "", { sign: true }], ["Signature", 14, () => "", { sign: true }]
      ]
    });
    await audit(session, "Exported the photography checklist", "logistics", null, `${rows.length} artworks${p.space ? `, ${p.space}` : ""}${p.batch ? `, batch ${p.batch}` : ""}`);
    return xlsxResponse(buf, `Photography checklist${p.space ? ` ${p.space}` : ""}${p.batch ? ` batch ${p.batch}` : ""} ${today()}.xlsx`);
  }
  // look for new photos in the background now and then (or on demand with "Check for photos")
  if (STAFF.includes(session.role) && Date.now() - lastScan > 10 * 60 * 1000) { lastScan = Date.now(); after(() => scanPhotos().catch(e => console.error("photo scan", e.message))); }
  const [planRow, scan] = await Promise.all([q(db().from("nae_plans").select("*").eq("kind", "photography").maybeSingle()), q(db().from("nae_settings").select("value").eq("key", "photo_scan").maybeSingle())]);
  const pathways = [...new Set(rows.map(r => r.pathway_code))].map(c => ({ code: c, name: S.P[c]?.name || c }));
  return { rows, plan: planRow?.data || null, planned: photoPlan(planRow?.data, rows), scan: scan?.value || null, pathways, canAct: STAFF.includes(session.role) };
});

export const POST = route(["admin", "storage"], async ({ session, request, scope }) => {
  const b = await body(request);
  if (b.action === "save_plan") {
    let plan; try { plan = cleanPlan(b, { spaces: true }); } catch (e) { throw bad(e.message); }
    await q(db().from("nae_plans").upsert({ kind: "photography", data: plan, updated_by: session.name, updated_at: new Date().toISOString() }));
    await audit(session, `Photography plan: ${plan.start} to ${plan.end}, ${plan.spaces.length} space(s)`, "logistics", null, plan.spaces.join(", "));
    return { ok: true, note: "Photography plan saved." };
  }
  if (b.action === "make_folders") {
    const S = await loadStructure(); const { has } = await scope(S);
    const rows = await loadPhotography(S, has, { thumbs: false });
    const schools = [...new Map(rows.filter(r => r.school_id).map(r => [r.school_id, { esis: r.esis, name: r.school }])).values()];
    if (!schools.length) throw bad("No schools with physical artworks yet.");
    let r; try { r = await makeFolders(schools); } catch (e) { throw bad(e.message); }
    await audit(session, `Photography folders: ${r.made} made`, "logistics", null, `${schools.length} schools`);
    return { ok: true, note: r.made ? `Made ${r.made} school folder${r.made === 1 ? "" : "s"} in 06 Uploads / Photography (${schools.length} schools in all). Share the Photography folder with the photography team.` : `All ${schools.length} school folders are already there.`, example: schoolFolder(schools[0]) };
  }
  if (b.action === "scan") {
    let r; try { r = await scanPhotos(); } catch (e) { throw bad(e.message); } lastScan = Date.now();
    return { ok: true, note: `Found ${r.files} photo${r.files === 1 ? "" : "s"}: ${r.linked} linked to artworks${r.unmatched ? `, ${r.unmatched} not named by an artwork code` : ""}.` };
  }
  throw bad("Unknown action.");
});
