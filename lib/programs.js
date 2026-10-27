import { loadStructure } from "@/lib/structure";

// Programs (NAE 2026, Oral History, Nabati Poetry ...). Each program has its own pathways; staff can be limited
// to some programs (accounts.programs; empty = all). The program someone is working in is kept in a cookie and
// every list is scoped to it.
export const PROGRAM_COOKIE = "nae2_prog";

export function allowedPrograms(S, session) {
  const visible = S.programs.filter(p => p.status !== "archived" || session.role === "admin");
  if (session.role === "admin" || !(session.programs || []).length) return visible;
  return visible.filter(p => session.programs.includes(p.id));
}
export function currentProgram(S, session, wanted) {
  const ok = allowedPrograms(S, session);
  return ok.find(p => p.id === wanted) || ok.find(p => p.status === "active") || ok[0] || null;
}
// Pathway codes of the program someone is working in (used to scope every list).
export async function programScope(request, session, S0) {
  const S = S0 || await loadStructure();
  const program = currentProgram(S, session, request.cookies.get(PROGRAM_COOKIE)?.value);
  const codes = program ? (S.PR[program.id]?.pathways || []) : [];
  return { S, program, codes, allowed: allowedPrograms(S, session), has: code => codes.includes(code) };
}
// Programs an account can work in, for checks on single records (an entry, a session ...).
export function canSeePathway(S, session, code) {
  const p = S.P[code]; if (!p) return false;
  return allowedPrograms(S, session).some(g => g.id === p.program_id);
}
