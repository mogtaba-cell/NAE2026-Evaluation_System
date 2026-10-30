// Naming: an artwork that passes Round 1 is Shortlisted; one that passes Round 2 is Selected.
// Competition pathways also have winners: in each subpathway, the Selected artworks are ranked by their Round 2
// result within each cycle, and the top three take 1st, 2nd and 3rd place.
export const CYCLES = [
  { n: 1, name: "Cycle 1", grades: "KG to Grade 5", max: 5 },
  { n: 2, name: "Cycle 2", grades: "Grades 6 to 8", max: 8 },
  { n: 3, name: "Cycle 3", grades: "Grades 9 to 13", max: 99 }
];
export const PLACE = { 1: "1st place", 2: "2nd place", 3: "3rd place" };

// "Grade 7" -> 7, "KG2" / "FS2" / "Early Years" -> 0, "Year 4/Grade3" -> 3, "Year 7" (British) -> 6, "8" -> 8
export function gradeNum(t) {
  const s = String(t || "");
  let m = s.match(/grade\s*(\d{1,2})/i); if (m) return +m[1];
  if (/\b(kg|fs|early|pre|nursery)/i.test(s)) return 0;
  m = s.match(/year\s*(\d{1,2})/i); if (m) return Math.max(0, +m[1] - 1);
  m = s.match(/^\s*(\d{1,2})\s*$/); if (m) return +m[1];
  return null;
}
export const cycleOfGrade = g => g == null ? null : CYCLES.find(c => g <= c.max).n;

// An artwork's cycle comes from its students' grades (or the grade on the registration). A group with students in
// two cycles goes in the higher one unless admin, its coordinator or management chose the other (choice).
export function cycleOf(gradeTexts, choice) {
  const nums = gradeTexts.flatMap(t => String(t || "").replace(/grades\s*(\d+)\s*(?:to|-|–)\s*(\d+)/gi, "Grade $1, Grade $2").split(/[,;]/)).map(gradeNum).filter(n => n != null);
  if (!nums.length) return { cycle: null, mixed: false, options: [], chosen: false };
  const options = [...new Set(nums.map(cycleOfGrade))].sort();
  const chosen = options.length > 1 && options.includes(Number(choice));
  return { cycle: chosen ? Number(choice) : Math.max(...options), mixed: options.length > 1, options, chosen };
}

// rows: [{ entry_id, sub_code, cycle, final, selected, tiebreak }] -> Map(entry_id -> { place, tie, decided })
// Equal results share the place (the next place is skipped) unless admin or management decided the order (tiebreak:
// lower goes first). tie = still undecided; decided = the order among equal results was chosen.
export function places(rows) {
  const groups = {};
  rows.filter(r => r.selected && r.cycle && r.final != null).forEach(r => { (groups[`${r.sub_code}|${r.cycle}`] ||= []).push(r); });
  const tb = r => r.tiebreak ?? 999;
  const out = new Map();
  for (const g of Object.values(groups)) {
    g.sort((a, b) => b.final - a.final || tb(a) - tb(b));
    const pl = [];
    g.forEach((r, i) => {
      const same = i > 0 && g[i - 1].final === r.final && tb(g[i - 1]) === tb(r);
      const place = pl[i] = same ? pl[i - 1] : i + 1;
      if (place > 3) return;
      const eq = g.filter(x => x !== r && x.final === r.final);
      out.set(r.entry_id, { place, tie: eq.some(x => tb(x) === tb(r)), decided: eq.length > 0 && eq.every(x => tb(x) !== tb(r)), group: `${r.sub_code}|${r.cycle}|${r.final}` });
    });
  }
  return out;
}
export const isCompetition = (S, pathwayCode) => S.P[pathwayCode]?.eval_type === "Competition";
