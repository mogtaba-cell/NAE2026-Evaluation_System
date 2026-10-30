import { route, bad } from "@/lib/api";
import { db, all, q, inChunks } from "@/lib/db";
import { cycleOf, places, isCompetition, PLACE } from "@/lib/winners";
import { loadStructure } from "@/lib/structure";
import { audit } from "@/lib/audit";
import * as XLSX from "xlsx";
export const maxDuration = 60;

const FIELDS = {
  code: ["Artwork code", e => e.code], reference_id: ["referenceId", e => e.reference_id], registration_id: ["RegistrationId", e => e.registration_id],
  title_en: ["Title (English)", e => e.title_en], title_ar: ["Title (Arabic)", e => e.title_ar], pathway: ["Pathway", (e, S) => S.P[e.pathway_code]?.name],
  sub: ["Subpathway", (e, S) => (S.P[e.pathway_code]?.subs.find(s => s.code === e.sub_code) || {}).name], school: ["School", e => e.school?.name], esis: ["School eSIS", e => e.school?.esis],
  region: ["Region", e => e.school?.region], school_type: ["School type", e => e.school?.school_type], group: ["Group name", e => e.group_name], students: ["Number of students", e => e.students_count],
  grades: ["Grades", e => e.grades_text], medium: ["Medium", e => e.medium], size: ["Size", e => e.size_text], files: ["Files", e => e.files_count],
  r1: ["Round 1 result", e => res(e, 1)?.final ?? res(e, 1)?.team ?? null], r1g: ["Round 1 grade", e => res(e, 1)?.grade || null], r2: ["Round 2 result", e => res(e, 2)?.final ?? res(e, 2)?.team ?? null], r2g: ["Round 2 grade", e => res(e, 2)?.grade || null],
  status: ["Status", e => `Round ${e.current_round} · ${e.status.replace(/_/g, " ")}`], coordinator: ["Coordinator", (e, S, x) => x.acc[e.coordinator_id] || null], description_en: ["Description (English)", e => e.description_en], description_ar: ["Description (Arabic)", e => e.description_ar],
  shortlist: ["Shortlisted (passed Round 1)", e => res(e, 1)?.passed == null ? null : res(e, 1).passed ? "Yes" : "No"], r2p: ["Selected (passed Round 2)", e => res(e, 2)?.passed == null ? null : res(e, 2).passed ? "Yes" : "No"],
  cycle: ["Cycle", e => { const c = cycleOf([e.grades_text]).cycle; return c ? `Cycle ${c}` : null; }],
  framing: ["Needs framing", e => lgOf(e)?.needs_framing ? "Yes" : "No"], glass: ["Protective glass", e => lgOf(e)?.glass_framing ? "Yes" : "No"],
  mgmt: ["Viewed by management", e => e.mgmt_viewed_at ? "Yes" : "No"], reg: ["Artwork type", e => e.registration_type || (e.group_name ? "Group" : "Individual")]
};
const lgOf = e => Array.isArray(e.logistics) ? e.logistics[0] : e.logistics;
const res = (e, n) => (e.results || []).find(r => r.round_no === n);
function book(sheetName, rows, draft) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  if (draft) XLSX.utils.sheet_add_aoa(ws, [["DRAFT · working data, not official results"]], { origin: { r: rows.length + 2, c: 0 } });
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 30));
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
export const GET = route(["admin", "management", "leadership"], async ({ session, url, scope }) => {
  const kind = url.searchParams.get("kind") || "entries"; const pathway = url.searchParams.get("pathway") || null; const official = url.searchParams.get("official") === "1";
  const S = await loadStructure();
  const { has, codes } = await scope(S);
  if (pathway && !has(pathway)) throw bad("That pathway isn't in this program.");
  const accs = await all(() => db().from("nae_accounts").select("id, display_name")); const acc = Object.fromEntries(accs.map(a => [a.id, a.display_name]));
  let rows = [], name = kind, draft = !official;
  const loadEntries = () => all(() => { let qy = db().from("nae_entries").select("*, school:nae_schools(name, esis, region, school_type), results:nae_results(round_no, team, final, grade, passed, locked, complete), logistics:nae_logistics(needs_framing, glass_framing, damaged, state, location)").order("code"); qy = pathway ? qy.eq("pathway_code", pathway) : qy.in("pathway_code", codes.length ? codes : ["-"]); return qy; });
  if (kind === "entries" || kind === "custom") {
    const ents = await loadEntries();
    const keys = kind === "custom" ? String(url.searchParams.get("fields") || "").split(",").filter(k => FIELDS[k]) : ["code", "reference_id", "title_en", "title_ar", "pathway", "sub", "school", "esis", "region", "group", "students", "grades", "status", "coordinator"];
    if (!keys.length) throw bad("Pick at least one field.");
    rows = ents.filter(e => !official || [1, 2].every(n => !res(e, n) || res(e, n).locked)).map(e => Object.fromEntries(keys.map(k => [FIELDS[k][0], FIELDS[k][1](e, S, { acc })])));
    name = kind === "custom" ? "Custom export" : "Artworks by school";
  } else if (kind === "results") {
    const ents = await loadEntries();
    // cycles from the students' grades, and 1st to 3rd place per subpathway and cycle in competition pathways
    const studs = await inChunks(ents.map(e => e.id), ids => q(db().from("nae_entry_students").select("entry_id, grade").in("entry_id", ids)));
    const gr = {}; studs.forEach(s => (gr[s.entry_id] ||= []).push(s.grade));
    const cyc = new Map(ents.map(e => [e.id, cycleOf([...(gr[e.id] || []), e.grades_text]).cycle]));
    const won = places(ents.filter(e => isCompetition(S, e.pathway_code) && e.current_round === 2 && res(e, 2)?.complete).map(e => ({ entry_id: e.id, sub_code: e.sub_code, cycle: cyc.get(e.id), final: res(e, 2).final, selected: !!res(e, 2).passed })));
    rows = ents.filter(e => res(e, 1)?.complete || res(e, 2)?.complete).filter(e => !official || [1, 2].every(n => !res(e, n)?.complete || res(e, n).locked)).map(e => ({ "Entry code": e.code, Title: e.title_en, School: e.school?.name, Pathway: S.P[e.pathway_code]?.name, Subpathway: (S.P[e.pathway_code]?.subs.find(s => s.code === e.sub_code) || {}).name, "Round 1 result": res(e, 1)?.final ?? null, "Round 1 grade": res(e, 1)?.grade || null, Shortlisted: res(e, 1)?.passed == null ? null : res(e, 1).passed ? "Yes" : "No", "Round 2 result": res(e, 2)?.final ?? null, "Round 2 grade": res(e, 2)?.grade || null, Selected: res(e, 2)?.passed == null ? null : res(e, 2).passed ? "Yes" : "No", Cycle: cyc.get(e.id) ? `Cycle ${cyc.get(e.id)}` : null, Place: won.get(e.id) ? `${PLACE[won.get(e.id).place]}${won.get(e.id).tie ? " (tie)" : ""}` : null, "Needs framing": lgOf(e)?.needs_framing ? (lgOf(e).glass_framing ? "Yes, with glass" : "Yes") : "No", Final: [1, 2].every(n => !res(e, n)?.complete || res(e, n).locked) ? "Yes" : "No" }));
    name = "Round results";
  } else if (kind === "participation") {
    const ents = await loadEntries(); const by = {};
    ents.forEach(e => { const k = e.school?.esis || "?"; const r = by[k] = by[k] || { School: e.school?.name, "School eSIS": k, Region: e.school?.region, "School type": e.school?.school_type, Entries: 0, Students: 0 }; r.Entries++; r.Students += e.students_count || 0; });
    rows = Object.values(by).sort((a, b) => b.Entries - a.Entries); name = "Participation"; draft = false;
  } else if (kind === "reviews") {
    const rv = (await all(() => db().from("nae_reviews").select("*, entry:nae_entries(code, title_en, pathway_code)").order("flagged_at"))).filter(r => pathway ? r.entry?.pathway_code === pathway : has(r.entry?.pathway_code));
    rows = rv.filter(r => !official || r.status !== "open").map(r => ({ Entry: r.entry?.code, Title: r.entry?.title_en, Round: r.round_no, Reason: r.reason, "Flagged at": r.flagged_at, Manager: acc[r.manager_id] || null, Status: r.status, "Team at flag": r.team_at_flag, "New result": r.new_result, "Override outcome": r.new_passed == null ? null : r.new_passed ? (r.round_no === 2 ? "Selected" : "Shortlisted") : (r.round_no === 2 ? "Not selected" : "Not shortlisted"), Note: r.decision_note, "Decided at": r.decided_at }));
    name = "Review log";
  } else if (kind === "logistics") {
    const lg = (await all(() => db().from("nae_logistics").select("*, entry:nae_entries(code, title_en, pathway_code, school:nae_schools(name)), collection:nae_collections(code, scheduled_on, status)"))).filter(x => pathway ? x.entry?.pathway_code === pathway : has(x.entry?.pathway_code));
    rows = lg.map(x => ({ Entry: x.entry?.code, Title: x.entry?.title_en, School: x.entry?.school?.name, State: x.state, Location: x.location, Damaged: x.damaged ? "Yes" : "No", Condition: x.condition, "Needs framing": x.needs_framing ? "Yes" : "No", "Protective glass": x.glass_framing ? "Yes" : "No", "Missing outcome": x.missing_outcome, Collection: x.collection?.code, "Collection date": x.collection?.scheduled_on }));
    name = "Logistics status";
  } else if (kind === "consent") {
    const st = (await all(() => db().from("nae_entry_students").select("name_en, grade, esis, consent, entry:nae_entries(code, pathway_code, school:nae_schools(name))").eq("consent", true))).filter(x => pathway ? x.entry?.pathway_code === pathway : has(x.entry?.pathway_code));
    rows = st.map(s => ({ Student: s.name_en, Grade: s.grade, ESIS: s.esis, Entry: s.entry?.code, School: s.entry?.school?.name }));
    name = "Showcase consent";
  } else throw bad("Unknown report.");
  const buf = book(name, rows, draft);
  await audit(session, `Exported ${name}${draft ? " (Draft)" : " (Official)"}`, "report", kind, `${rows.length} rows`);
  return new Response(buf, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${name.replace(/[^A-Za-z0-9 ]/g, "")}${draft ? " DRAFT" : ""}.xlsx"` } });
});
