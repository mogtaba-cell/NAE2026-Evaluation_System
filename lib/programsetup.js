import { db, q } from "@/lib/db";

// Building a program's structure: pathways (each with Round 1 and Round 2), subpathways, and copies of
// another program's pathways with their rubrics and round settings.
const initials = s => String(s || "").replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(w => w && !/^(and|of|the|&)$/i.test(w)).map(w => w[0]).join("").toUpperCase();

// A pathway code nobody uses yet: the pathway's initials, prefixed by the program code when it's not the first
// program (NAE 2026 keeps VA, DA ...; Oral History's Literary Arts becomes OH26LA).
export function suggestPathwayCode(S, program, name, first = false) {
  const base = ((first ? "" : program.code) + (initials(name) || "PW")).replace(/[^A-Z0-9]/g, "").slice(0, 10) || "PW";
  let code = base, i = 2; const taken = new Set(S.pathways.map(p => p.code));
  while (taken.has(code)) code = base.slice(0, 9) + i++;
  return code;
}
export function suggestSubCode(existing, name) {
  const base = (initials(name) || "SP").slice(0, 3).padEnd(2, "X");
  let code = base, i = 2; const taken = new Set(existing.map(s => s.code));
  while (taken.has(code)) code = base.slice(0, 2) + i++;
  return code;
}

const ROUND_DEFAULTS = [
  { round_no: 1, name: "Round 1", mode: "online", pass_rule: { min_score: 75 }, flag_line: "pass" },
  { round_no: 2, name: "Round 2", mode: "mixed", pass_rule: { min_score: 75 }, flag_line: "A" }
];
const ROUND_COPY = ["name", "mode", "pass_rule", "evaluators_per_entry", "flag_margin", "spread_limit", "review_hours", "flag_near", "flag_spread", "flag_identity", "flag_line"];

export async function addPathway(S, program, { name, code, eval_type }) {
  const sort = S.pathways.length + 1;
  const p = await q(db().from("nae_pathways").insert({ code, name, program_id: program.id, eval_type: eval_type === "Competition" ? "Competition" : "Participation", sort, status: "setup" }).select("*").single());
  await q(db().from("nae_rounds").insert(ROUND_DEFAULTS.map(r => ({ ...r, pathway_code: code }))));
  return p;
}

// Copy one pathway (subpathways, rubrics, round settings; no entries, dates or panels) into a program.
export async function copyPathway(S, srcCode, program, { withRubrics = true } = {}) {
  const src = S.P[srcCode]; if (!src) return null;
  const code = suggestPathwayCode(S, program, src.name);
  await q(db().from("nae_pathways").insert({ code, name: src.name, program_id: program.id, eval_type: src.eval_type, sort: S.pathways.length + 1, status: "setup" }));
  S.pathways.push({ code, name: src.name, program_id: program.id }); // keep later code suggestions unique
  const rounds = Object.values(src.rounds);
  await q(db().from("nae_rounds").insert((rounds.length ? rounds : ROUND_DEFAULTS).map(r => ({ ...Object.fromEntries(ROUND_COPY.filter(k => r[k] !== undefined).map(k => [k, r[k]])), round_no: r.round_no, pathway_code: code }))));
  // rubrics: one copy per rubric the subpathways use, with its published version
  const map = {};
  if (withRubrics) {
    const used = [...new Set(src.subs.flatMap(s => [s.rubric_r1, s.rubric_r2]).filter(Boolean))];
    for (const id of used) {
      const r = S.rubrics[id]; if (!r) continue;
      let rcode = `${program.code}_${r.code}`.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 40), n = 2;
      while (Object.values(S.rubrics).some(x => x.code === rcode)) rcode = `${rcode.slice(0, 37)}_${n++}`;
      const nr = await q(db().from("nae_rubrics").insert({ code: rcode, name: `${r.name} (${program.name})`, pathway_code: code }).select("*").single());
      S.rubrics[nr.id] = { ...nr, versions: [] };
      const v = r.published || r.draft;
      if (v) await q(db().from("nae_rubric_versions").insert({ rubric_id: nr.id, version: 1, status: r.published ? "published" : "draft", criteria: v.criteria, identity_required: v.identity_required, identity_pass: !!v.identity_pass, grade_bands: v.grade_bands, published_at: r.published ? new Date().toISOString() : null }));
      map[id] = nr.id;
    }
  }
  if (src.subs.length) await q(db().from("nae_subpathways").insert(src.subs.map(s => ({ pathway_code: code, code: s.code, name: s.name, is_physical: s.is_physical, sort: s.sort, rubric_r1: map[s.rubric_r1] || null, rubric_r2: map[s.rubric_r2] || null }))));
  return code;
}
