import { route } from "@/lib/api";
import { db, q, all } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { roundReadiness } from "@/lib/readiness";
import { driveConfigured, driveMock } from "@/lib/drive";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const d = s => { const [, m, day] = String(s).split("-"); return `${+day} ${MON[+m - 1]}`; };
// Everything the pages need about the program structure, in one small payload.
export const GET = route("*", async ({ session, scope }) => {
  const S = await loadStructure();
  const sc = await scope(S);
  const [accounts, evaluators, counts, unalloc] = await Promise.all([
    q(db().from("nae_accounts").select("id, username, display_name, role, pathways, programs, active").eq("active", true).order("display_name")),
    q(db().from("nae_evaluators").select("id, name, account_id, pathways, active").order("name")),
    all(() => db().from("nae_v_entry_counts").select("*")),
    all(() => db().from("nae_entries").select("pathway_code").is("coordinator_id", null))
  ]);
  const rubrics = Object.values(S.rubrics).filter(r => !r.pathway_code || sc.has(r.pathway_code)).map(r => ({ id: r.id, code: r.code, name: r.name, pathway_code: r.pathway_code, published: r.published ? { id: r.published.id, version: r.published.version, criteria: r.published.criteria, identity_required: r.published.identity_required, identity_pass: r.published.identity_pass, grade_bands: r.published.grade_bands } : null, draft: r.draft ? { id: r.draft.id, version: r.draft.version } : null }));
  const pathways = S.pathways.filter(p => sc.has(p.code)).map(p => {
    const c = counts.filter(x => x.pathway_code === p.code);
    const entries = c.reduce((a, x) => a + x.n, 0), students = c.reduce((a, x) => a + (x.students || 0), 0);
    const subs = S.P[p.code].subs.map(s => ({ ...s, entries: c.filter(x => x.sub_code === s.code).reduce((a, x) => a + x.n, 0) }));
    const rounds = Object.values(S.P[p.code].rounds).sort((a, b) => a.round_no - b.round_no);
    const evCount = evaluators.filter(e => e.active && e.account_id && (e.pathways || []).includes(p.code)).length;
    const byStatus = {}; c.forEach(x => { const k = `${x.current_round}:${x.status}`; byStatus[k] = (byStatus[k] || 0) + x.n; });
    const data = { evaluators, counts, unalloc };
    const ready = Object.fromEntries(rounds.map(r => [r.round_no, roundReadiness(S, r, data)]));
    const check = ready[1]?.checks || [];
    return { ...p, subs, rounds: rounds.map(r => ({ ...r, readiness: ready[r.round_no] })), entries, students, byStatus, check, evaluators: evCount };
  });
  return {
    me: session,
    program: sc.program ? { id: sc.program.id, code: sc.program.code, name: sc.program.name, cycle: sc.program.cycle, status: sc.program.status } : { name: "No program" },
    programs: sc.allowed.map(g => ({ id: g.id, code: g.code, name: g.name, cycle: g.cycle, status: g.status })),
    pathways, rubrics,
    accounts: session.role === "evaluator" ? [] : accounts,
    evaluators: session.role === "evaluator" ? [] : evaluators,
    drive: { configured: driveConfigured(), mock: driveMock() }
  };
});
