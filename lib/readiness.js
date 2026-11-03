import { db, q, all } from "@/lib/db";
import { roundPanel, rubricFor } from "@/lib/structure";
import { ruleProblem } from "@/lib/scoring";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const d = s => { const [, m, day] = String(s).split("-"); return `${+day} ${MON[+m - 1]}`; };

// Load what the readiness checks need, once for every pathway.
export async function readinessData() {
  const [evaluators, counts, unalloc] = await Promise.all([
    q(db().from("nae_evaluators").select("id, name, account_id, pathways, active")),
    all(() => db().from("nae_v_entry_counts").select("*")),
    all(() => db().from("nae_entries").select("pathway_code").is("coordinator_id", null))
  ]);
  return { evaluators, counts, unalloc };
}

// One set of checks, used by both the setup board and the Open button.
// hard = can't be opened until fixed. Soft ones can be opened anyway by an admin who gives a reason.
export function roundReadiness(S, round, data) {
  const p = S.P[round.pathway_code]; const no = round.round_no;
  const c = data.counts.filter(x => x.pathway_code === p.code);
  const entries = c.reduce((a, x) => a + x.n, 0);
  const subsUsed = p.subs.filter(s => c.some(x => x.sub_code === s.code && x.n > 0));
  const setup = `/setup/${p.code}`;
  const checks = [];
  const add = (key, label, ok, text, hard, fix) => checks.push({ key, label, ok: !!ok, text, hard: !!hard, fix });

  if (no === 1) add("entries", "Artworks imported", entries > 0, `${entries} entries`, false, "/import");
  if (no === 2) { const r1 = p.rounds[1]; add("order", "Round 1 opened first", r1 && r1.status !== "setup", r1 && r1.status !== "setup" ? `Round 1 is ${r1.status}` : "Open Round 1 first", true, "/rounds"); }

  const noRubric = subsUsed.filter(s => !rubricFor(S, p.code, s.code, no)?.published);
  add("rubrics", `Round ${no} rubrics`, subsUsed.length > 0 && !noRubric.length, !subsUsed.length ? "No subpathways with artworks yet" : noRubric.length ? `Missing for: ${noRubric.map(s => s.name).join(", ")}` : `${subsUsed.length} of ${subsUsed.length} subpathways have a published rubric`, true, setup);

  const inherited = subsUsed.filter(s => s.rubric_inherited);
  if (inherited.length) add("rubric_check", "Rubrics copied at import", false, `Check the rubrics of: ${inherited.map(s => s.name).join(", ")} (copied automatically from another subpathway)`, false, setup);

  if (false) {
    const noId = [];
    add("identity", "National identity question", !noId.length, noId.length ? `The rule needs identity, but these rubrics don't ask it: ${noId.map(s => s.name).join(", ")}` : "Asked by every rubric this rule needs", true, setup);
  }

  const rp = ruleProblem(round.pass_rule);
  add("rule", "Who goes through", !rp, rp || "Rule is set", true, "/rounds");

  const datesOk = round.opens_on && round.closes_on && round.closes_on >= round.opens_on;
  add("dates", "Dates", datesOk, round.opens_on ? `${d(round.opens_on)} to ${round.closes_on ? d(round.closes_on) : "?"}${round.closes_on && round.closes_on < round.opens_on ? " (closes before it opens)" : ""}` : "Dates not set", true, "/rounds");

  const online = no === 1 ? subsUsed : subsUsed.filter(s => !s.is_physical);
  const physical = no === 2 ? subsUsed.filter(s => s.is_physical) : [];
  if (online.length || !subsUsed.length) {
    const panel = roundPanel(round, data.evaluators);
    const need = round.evaluators_per_entry || 2;
    const room = data.evaluators.filter(e => e.active && !e.account_id && (e.pathways || []).includes(p.code));
    const txt = `${panel.length} evaluator${panel.length === 1 ? "" : "s"} with a login on the panel (each artwork needs ${need})`;
    add("evaluators", `Round ${no} evaluators`, panel.length >= need || room.length >= 2,
      panel.length >= need ? txt + (room.length ? `; ${room.length} more without a login for coordinator sessions` : "")
        : room.length >= 2 ? `${room.length} evaluators without a login: artworks are scored in coordinator sessions${panel.length ? ` (${panel.length} with a login too)` : ""}` : txt, false, "/rounds");
  }
  if (no === 2) add("physical", "Judged in the room", true, physical.length ? `${physical.map(s => s.name).join(", ")} (collected and scored in sessions)` : "None: every subpathway is scored online", false, setup);
  if (no === 1) { const un = data.unalloc.filter(x => x.pathway_code === p.code).length; add("allocation", "Artwork distribution", entries > 0 && un === 0, !entries ? "No artworks yet" : un ? `${un} not allocated to a coordinator` : "Every artwork allocated", false, "/allocation"); }

  return { checks, ready: checks.every(x => x.ok), hardOk: checks.every(x => x.ok || !x.hard), blockers: checks.filter(x => !x.ok) };
}
