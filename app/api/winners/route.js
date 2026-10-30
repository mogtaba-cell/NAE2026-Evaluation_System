import { route, body, bad, forbidden } from "@/lib/api";
import { db, q } from "@/lib/db";
import { audit } from "@/lib/audit";
import { loadStructure } from "@/lib/structure";
import { cycleOf, isCompetition } from "@/lib/winners";

// cycle: place a group whose students are in two cycles in one of them (admin, management, or its coordinator)
// tie: decide the order of Selected artworks with the same Round 2 result in one subpathway and cycle (admin, management)
async function gradesOf(entryIds) {
  const st = await q(db().from("nae_entry_students").select("entry_id, grade").in("entry_id", entryIds));
  const g = {}; st.forEach(s => (g[s.entry_id] ||= []).push(s.grade)); return g;
}
export const POST = route(["admin", "management", "coordinator"], async ({ session, request, scope }) => {
  const b = await body(request); const S = await loadStructure(); const { has } = await scope(S);
  if (b.action === "cycle") {
    const e = await q(db().from("nae_entries").select("id, code, pathway_code, coordinator_id, grades_text, cycle_choice").eq("code", String(b.code || "").toUpperCase()).maybeSingle());
    if (!e || !has(e.pathway_code)) throw bad("No artwork has that code.");
    if (session.role === "coordinator" && e.coordinator_id !== session.sub) throw forbidden("Only the artwork's coordinator, management or the admin can choose its cycle.");
    const g = await gradesOf([e.id]); const cy = cycleOf([...(g[e.id] || []), e.grades_text]);
    const choice = b.cycle ? Number(b.cycle) : null;
    if (!cy.mixed) throw bad("Its students are all in one cycle, so there is nothing to choose.");
    if (choice && !cy.options.includes(choice)) throw bad(`Its students are in Cycle ${cy.options.join(" and Cycle ")}. Choose one of those.`);
    await q(db().from("nae_entries").update({ cycle_choice: choice, tiebreak: null, updated_at: new Date().toISOString() }).eq("id", e.id));
    await audit(session, choice ? `Placed in Cycle ${choice} (students in two cycles)` : "Cycle back to automatic (the higher one)", "entry", e.id, e.code);
    return { ok: true, note: `${e.code} competes in Cycle ${choice || Math.max(...cy.options)}.` };
  }
  if (b.action === "tie") {
    if (!["admin", "management"].includes(session.role)) throw forbidden("Only management or the admin decide a tie.");
    const codes = (b.codes || []).map(c => String(c).toUpperCase());
    if (codes.length < 2) throw bad("A tie needs at least two artworks.");
    const es = await q(db().from("nae_entries").select("id, code, pathway_code, sub_code, grades_text, cycle_choice, current_round, results:nae_results(round_no, final, passed, complete)").in("code", codes));
    if (es.length !== codes.length || es.some(e => !has(e.pathway_code))) throw bad("Some of those artworks were not found.");
    const g = await gradesOf(es.map(e => e.id));
    const info = es.map(e => { const r2 = (e.results || []).find(r => r.round_no === 2); return { e, r2, cycle: cycleOf([...(g[e.id] || []), e.grades_text], e.cycle_choice).cycle }; });
    const f = info[0];
    if (info.some(x => !isCompetition(S, x.e.pathway_code) || !x.r2?.complete || !x.r2.passed)) throw bad("Only Selected artworks in a competition pathway are placed.");
    if (info.some(x => x.e.pathway_code !== f.e.pathway_code || x.e.sub_code !== f.e.sub_code || x.cycle !== f.cycle || x.r2.final !== f.r2.final)) throw bad("These artworks are not tied: they must share the subpathway, the cycle and the Round 2 result.");
    const clear = !!b.clear;
    for (const [i, c] of codes.entries()) await q(db().from("nae_entries").update({ tiebreak: clear ? null : i + 1 }).eq("code", c));
    await audit(session, clear ? `Tie reopened (${codes.join(", ")})` : `Tie decided: ${codes.join(" before ")}`, "entry", f.e.id, `Round 2 result ${f.r2.final}${b.note ? ` · ${b.note}` : ""}`);
    return { ok: true, note: clear ? "The tie is open again." : `Order saved: ${codes.join(", then ")}.` };
  }
  throw bad("Unknown action.");
});
