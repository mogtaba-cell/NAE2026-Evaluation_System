import { route } from "@/lib/api";
import { db, q, all } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { driveConfigured, driveMock } from "@/lib/drive";

// Everything the pages need about the program structure, in one small payload.
export const GET = route("*", async ({ session }) => {
  const S = await loadStructure();
  const [accounts, evaluators, counts, unalloc, program] = await Promise.all([
    q(db().from("nae_accounts").select("id, username, display_name, role, pathways, active").eq("active", true).order("display_name")),
    q(db().from("nae_evaluators").select("id, name, account_id, pathways, active").order("name")),
    all(() => db().from("nae_v_entry_counts").select("*")),
    all(() => db().from("nae_entries").select("pathway_code").is("coordinator_id", null)),
    q(db().from("nae_settings").select("value").eq("key", "program").maybeSingle())
  ]);
  const rubrics = Object.values(S.rubrics).map(r => ({ id: r.id, code: r.code, name: r.name, pathway_code: r.pathway_code, published: r.published ? { id: r.published.id, version: r.published.version, criteria: r.published.criteria, identity_required: r.published.identity_required, grade_bands: r.published.grade_bands } : null, draft: r.draft ? { id: r.draft.id, version: r.draft.version } : null }));
  const pathways = S.pathways.map(p => {
    const c = counts.filter(x => x.pathway_code === p.code);
    const entries = c.reduce((a, x) => a + x.n, 0), students = c.reduce((a, x) => a + (x.students || 0), 0);
    const subs = S.P[p.code].subs.map(s => ({ ...s, entries: c.filter(x => x.sub_code === s.code).reduce((a, x) => a + x.n, 0) }));
    const rounds = Object.values(S.P[p.code].rounds).sort((a, b) => a.round_no - b.round_no);
    const r1 = S.P[p.code].rounds[1];
    const used = subs.filter(s => s.entries > 0 || p.track === "Expressions");
    const rubricsOk = used.filter(s => s.rubric_r1 && S.rubrics[s.rubric_r1]?.published).length;
    const evCount = evaluators.filter(e => e.active && (e.pathways || []).includes(p.code)).length;
    const unallocated = unalloc.filter(x => x.pathway_code === p.code).length;
    const byStatus = {}; c.forEach(x => { const k = `${x.current_round}:${x.status}`; byStatus[k] = (byStatus[k] || 0) + x.n; });
    const check = [
      { key: "entries", label: "Entries imported", ok: entries > 0, text: `${entries} entries` },
      { key: "rubrics", label: "Rubrics", ok: used.length > 0 && rubricsOk === used.length, text: `${rubricsOk} of ${used.length} subpathways` },
      { key: "rounds", label: "Rounds", ok: !!(r1 && r1.opens_on && r1.closes_on), text: r1 && r1.opens_on ? `${r1.mode}, ${r1.opens_on} to ${r1.closes_on || "?"}` : "Dates not set" },
      { key: "evaluators", label: "Evaluators", ok: evCount > 0, text: `${evCount} on the panel` },
      { key: "allocation", label: "Allocation", ok: entries > 0 && unallocated === 0, text: unallocated ? `${unallocated} not allocated` : "Every entry allocated" }
    ];
    return { ...p, subs, rounds, entries, students, byStatus, check, evaluators: evCount };
  });
  return {
    me: session,
    program: program?.value || { name: "NAE 2026" },
    pathways, rubrics,
    accounts: session.role === "evaluator" ? [] : accounts,
    evaluators: session.role === "evaluator" ? [] : evaluators,
    drive: { configured: driveConfigured(), mock: driveMock() }
  };
});
