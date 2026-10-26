import { db, q, inChunks } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { assignEntries } from "@/lib/scoring";
import { pathFromArtLink, pathKey, normSeg } from "@/lib/files";

const val = v => { if (v == null) return null; const s = String(v).trim(); return s === "" || s.toUpperCase() === "NULL" ? null : s; };
const split = v => (val(v) || "").split(";").map(x => x.trim());
const num = v => { const n = parseFloat(val(v)); return isNaN(n) ? null : n; };
const toIso = v => { if (!val(v)) return null; const d = new Date(String(v).includes("T") ? v : String(v).replace(" ", "T")); return isNaN(d) ? null : d.toISOString(); };
const fmt = n => (Math.round(n * 10) / 10).toString();

export const COLUMNS = ["RegistrationId", "referenceId", "Submission date", "ArtPathwayNameEn", "ArtPathwayNameAr", "ArtSubPathwayNameEn", "ArtSubPathwayNameAr", "School Type", "School Region", "School eSIS", "School Name English", "ArtLink", "ArtWorkTitleEn", "ArtWorkTitleAr", "Did anyone or anything influence your idea (family, artist, place)?", "What was the most enjoyable part of creating your work?", "What elements did you focus on, and why?", "ArtWorkDescrEn", "ArtWorkDescrAr", "GroupName", "NumberOfStudents", "ParticipatingStudentsNamesEn", "ParticipatingStudentsNamesAr", "ParticipatingStudentsGrades", "ParticipatingStudentsESISNumbers", "ParticipatingStudentsConsents", "ParticipatingStudentsNationalities", "ParticipatingStudentsGenders", "RegistrationType", "ArtWorkMedium", "ArtWorkDimension", "Length", "Breadth", "Width"];

function gradesSummary(list) {
  const n = [...new Set(list.filter(Boolean).map(g => { const m = g.match(/Grade\s*(\d+)/i); return m ? `Grade ${+m[1]}` : g; }))];
  const nums = n.map(g => (g.match(/^Grade (\d+)$/) || [])[1]).filter(Boolean).map(Number);
  if (!n.length) return null; if (n.length === 1) return n[0];
  if (nums.length === n.length) return `Grades ${Math.min(...nums)} to ${Math.max(...nums)}`;
  return n.slice(0, 3).join(", ") + (n.length > 3 ? "…" : "");
}
function sizeText(pw, L, B, W, dimText) {
  if (val(dimText)) return val(dimText);
  if (L == null || W == null) return null;
  if (L > 300 || W > 300) return L >= 100 && W >= 100 ? `${fmt(L)} × ${fmt(W)} px` : null;
  if (L <= 2 && W <= 2) return null;
  return `${fmt(L)} × ${fmt(W)} cm${B && B > 2 ? ` × ${fmt(B)} cm` : ""}`;
}
function newSubCode(name, taken) {
  const w = normSeg(name).split(" ").filter(Boolean);
  let c = ((w[0] || "X")[0] + (w[1] ? w[1][0] : (w[0] || "XX")[1] || "X")).toUpperCase();
  let i = 2; const base = c; while (taken.has(c)) c = base[0] + (i++);
  return c;
}

// Import one chunk of rows (objects keyed by the export's column names). New rows become entries.
// Rows whose referenceId already exists only update their details: scores and history are never touched.
export async function importRows(rows, session) {
  const t0 = Date.now();
  const [S, counters] = await Promise.all([loadStructure(), db().rpc("nae_code_counters").then(r => r.data || null)]);
  const pwByName = {}; S.pathways.forEach(p => { pwByName[normSeg(p.name)] = p; });
  const errors = [], newSubs = [];
  let created = 0, updated = 0;
  const refs = rows.map(r => val(r.referenceId)).filter(Boolean);
  const existing = await inChunks(refs, ids => q(db().from("nae_entries").select("id, reference_id, code, pathway_code, sub_code").in("reference_id", ids)));
  const exByRef = Object.fromEntries(existing.map(e => [e.reference_id, e]));
  // schools
  const schoolRows = {};
  rows.forEach(r => { const esis = val(r["School eSIS"]); if (esis) schoolRows[esis] = { esis, name: val(r["School Name English"]) || esis, school_type: val(r["School Type"]), region: val(r["School Region"]), updated_at: new Date().toISOString() }; });
  const schools = Object.values(schoolRows).length ? await q(db().from("nae_schools").upsert(Object.values(schoolRows), { onConflict: "esis" }).select("id, esis, name")) : [];
  const schoolByEsis = Object.fromEntries(schools.map(s => [s.esis, s]));
  // coordinators already looking after a school keep it
  const schoolCoord = {};
  if (schools.length) {
    const held = await inChunks(schools.map(s => s.id), ids => q(db().from("nae_entries").select("school_id, pathway_code, coordinator_id").in("school_id", ids).not("coordinator_id", "is", null)));
    held.forEach(h => { schoolCoord[h.school_id + ":" + h.pathway_code] = h.coordinator_id; });
  }
  const nextNo = {};
  if (counters) counters.forEach(c => { nextNo[c.pathway_code + "-" + c.sub_code] = c.next_no; });
  const toAssign = [];
  // 1) Build every row in memory. Only new subpathways and new code counters need a round trip here.
  const inserts = [], updates = [], studentsByRef = {};
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], rowNo = r.__row || i + 2;
    try {
      const ref = val(r.referenceId); if (!ref) throw new Error("Missing referenceId");
      if (studentsByRef[ref]) throw new Error(`referenceId ${ref} appears twice in this file`);
      const pw = pwByName[normSeg(val(r.ArtPathwayNameEn))]; if (!pw) throw new Error(`Unknown pathway "${val(r.ArtPathwayNameEn) || ""}"`);
      const subName = val(r.ArtSubPathwayNameEn) || "General";
      let sub = (S.P[pw.code].subs || []).find(s => normSeg(s.name) === normSeg(subName));
      if (!sub) {
        const taken = new Set(S.P[pw.code].subs.map(s => s.code));
        const like = S.P[pw.code].subs[0];
        sub = await q(db().from("nae_subpathways").insert({ pathway_code: pw.code, code: newSubCode(subName, taken), name: subName, is_physical: false, rubric_r1: like?.rubric_r1 || null, rubric_r2: like?.rubric_r2 || null, rubric_inherited: !!(like?.rubric_r1 || like?.rubric_r2), sort: 50 + S.P[pw.code].subs.length }).select("*").single());
        S.P[pw.code].subs.push(sub); newSubs.push(`${pw.name} · ${subName}`);
      }
      const school = schoolByEsis[val(r["School eSIS"])] || null;
      const names = split(r.ParticipatingStudentsNamesEn), namesAr = split(r.ParticipatingStudentsNamesAr), grades = split(r.ParticipatingStudentsGrades), esis = split(r.ParticipatingStudentsESISNumbers), cons = split(r.ParticipatingStudentsConsents), nats = split(r.ParticipatingStudentsNationalities), gens = split(r.ParticipatingStudentsGenders);
      const n = Math.max(names.filter(Boolean).length, esis.filter(Boolean).length);
      const students = Array.from({ length: n }, (_, k) => ({ position: k + 1, name_en: names[k] || null, name_ar: namesAr[k] || null, grade: grades[k] || null, esis: esis[k] || null, nationality: nats[k] || null, gender: gens[k] || null, consent: cons[k] === "1" ? true : cons[k] === "0" ? false : null }));
      const link = val(r.ArtLink); const sp = pathFromArtLink(link);
      const group = val(r.GroupName);
      const title = val(r.ArtWorkTitleEn), titleAr = val(r.ArtWorkTitleAr);
      const details = {
        reference_id: ref, registration_id: val(r.RegistrationId), submitted_at: toIso(r["Submission date"]),
        school_id: school?.id || null, title_en: title, title_ar: titleAr,
        description_en: val(r.ArtWorkDescrEn), description_ar: val(r.ArtWorkDescrAr),
        reflections: { influence: val(r["Did anyone or anything influence your idea (family, artist, place)?"]), enjoy: val(r["What was the most enjoyable part of creating your work?"]), focus: val(r["What elements did you focus on, and why?"]) },
        group_name: group, registration_type: val(r.RegistrationType), students_count: parseInt(val(r.NumberOfStudents)) || n || 1, grades_text: gradesSummary(grades),
        medium: val(r.ArtWorkMedium), size_text: sizeText(pw.code, num(r.Length), num(r.Breadth), num(r.Width), r.ArtWorkDimension),
        art_link: link, source_path: sp, source_key: sp ? pathKey(sp) : null,
        search_text: [ref, val(r.RegistrationId), title, titleAr, group, school?.name, school?.esis, ...names, ...namesAr, ...esis].filter(Boolean).join(" ").toLowerCase(),
        raw: r, updated_at: new Date().toISOString()
      };
      const ex = exByRef[ref];
      if (ex) {
        // details only; the code, status, round and coordinator are kept
        updates.push({ ...details, code: ex.code, pathway_code: pw.code, sub_code: sub.code, search_text: ex.code.toLowerCase() + " " + details.search_text, __row: rowNo });
      } else {
        const key = pw.code + "-" + sub.code;
        if (nextNo[key] == null) nextNo[key] = counters ? 1 : await q(db().rpc("nae_next_codes", { p_pathway: pw.code, p_sub: sub.code, p_count: 1 }));
        const code = `${key}-${String(nextNo[key]++).padStart(4, "0")}`;
        const r1 = S.P[pw.code].rounds[1];
        inserts.push({ ...details, code, pathway_code: pw.code, sub_code: sub.code, current_round: 1, status: r1?.status === "open" ? "to_score" : "not_open", coordinator_id: school ? (schoolCoord[school.id + ":" + pw.code] || null) : null, search_text: code.toLowerCase() + " " + details.search_text, __row: rowNo });
      }
      studentsByRef[ref] = students;
    } catch (e) { errors.push({ row: rowNo, message: e.message }); }
  }
  // 2) Write in bulk: a few round trips per batch instead of several per row.
  const write = async (list, kind) => {
    const ids = {};
    for (let i = 0; i < list.length; i += 100) {
      const part = list.slice(i, i + 100);
      try {
        const res = await q(db().from("nae_entries").upsert(part.map(({ __row, ...x }) => x), { onConflict: "reference_id" }).select("id, reference_id, pathway_code, sub_code, current_round, status, physical_override"));
        res.forEach(x => { ids[x.reference_id] = x; });
        if (kind === "insert") created += res.length; else updated += res.length;
      } catch (e) { part.forEach(x => errors.push({ row: x.__row, message: e.message })); }
    }
    return ids;
  };
  const insIds = await write(inserts, "insert");
  const updIds = await write(updates, "update");
  const all = { ...insIds, ...updIds };
  // students: replaced per batch in one database step, so a failure never leaves an entry without its students
  const allRefs = Object.keys(all);
  for (let i = 0; i < allRefs.length; i += 100) {
    const part = allRefs.slice(i, i + 100);
    const rowsJ = part.flatMap(ref => (studentsByRef[ref] || []).map(s => ({ ...s, entry_id: all[ref].id })));
    const { error } = await db().rpc("nae_replace_students", { p_entry_ids: part.map(ref => all[ref].id), p_rows: rowsJ });
    if (error) part.forEach(ref => errors.push({ row: null, message: `Students for ${ref} were not updated: ${error.message}` }));
  }
  for (const x of Object.values(insIds)) { const r1 = S.P[x.pathway_code]?.rounds[1]; if (r1?.status === "open") toAssign.push({ ...x, round: r1 }); }
  const byRound = {}; toAssign.forEach(x => { (byRound[x.round.id] = byRound[x.round.id] || { round: x.round, list: [] }).list.push(x); });
  for (const g of Object.values(byRound)) await assignEntries(S, g.round, g.list);
  const ms = Date.now() - t0;
  console.log(`import: ${rows.length} rows (${created} new, ${updated} updated, ${errors.length} errors) in ${ms} ms`);
  return { created, updated, errors, newSubs, ms };
}
