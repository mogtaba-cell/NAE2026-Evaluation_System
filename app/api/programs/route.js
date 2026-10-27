import { NextResponse } from "next/server";
import { route, body, bad, forbidden } from "@/lib/api";
import { db, q, all } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { PROGRAM_COOKIE, allowedPrograms } from "@/lib/programs";
import { audit } from "@/lib/audit";
import { copyPathway } from "@/lib/programsetup";

// Programs with their pathways and progress (admin), or just the ones a person can work in.
export const GET = route("*", async ({ session }) => {
  const S = await loadStructure();
  const counts = await all(() => db().from("nae_v_entry_counts").select("*"));
  const list = (session.role === "admin" ? S.programs : allowedPrograms(S, session)).map(g => {
    const pws = S.PR[g.id].pathways.map(c => S.P[c]);
    const entries = counts.filter(x => S.PR[g.id].pathways.includes(x.pathway_code)).reduce((a, x) => a + x.n, 0);
    const open = pws.flatMap(p => Object.values(p.rounds)).filter(r => r.status === "open").length;
    return { ...g, pathways: pws.map(p => ({ code: p.code, name: p.name, eval_type: p.eval_type, subs: p.subs.length, rounds: Object.values(p.rounds).map(r => ({ round_no: r.round_no, status: r.status })) })), entries, openRounds: open };
  });
  return { programs: list };
});

const CODE = /^[A-Z0-9]{2,10}$/;
// Create a program; optionally copy the structure (pathways, subpathways, rubrics, round settings) of another.
export const POST = route(["admin"], async ({ session, request }) => {
  const b = await body(request);
  const code = String(b.code || "").trim().toUpperCase(), name = String(b.name || "").trim();
  if (!name) throw bad("Give the program a name.");
  if (!CODE.test(code)) throw bad("The program code is 2 to 10 letters or numbers, for example OH26.");
  const S = await loadStructure();
  if (S.programs.some(p => p.code === code)) throw bad("That program code is taken.");
  const g = await q(db().from("nae_programs").insert({ code, name, cycle: b.cycle || null, starts_on: b.starts_on || null, ends_on: b.ends_on || null, status: "setup", owner_ids: Array.isArray(b.owner_ids) ? b.owner_ids : [], notes: b.notes || null, sort: S.programs.length + 1 }).select("*").single());
  let copied = 0;
  if (b.copy_from) {
    const src = S.programs.find(p => p.id === b.copy_from); if (!src) throw bad("Pick the program to copy from.");
    for (const pc of S.PR[src.id].pathways) { await copyPathway(S, pc, g, { withRubrics: b.copy_rubrics !== false }); copied++; }
  }
  await audit(session, `Created program ${name}`, "program", g.id, copied ? `Copied ${copied} pathways from ${S.programs.find(p => p.id === b.copy_from)?.name}` : "");
  return { id: g.id, copied };
});

// Switch the program you are working in (kept in a cookie).
export const PUT = route("*", async ({ session, request }) => {
  const b = await body(request);
  const S = await loadStructure();
  const g = allowedPrograms(S, session).find(p => p.id === b.id);
  if (!g) throw forbidden("You don't have access to that program.");
  const res = NextResponse.json({ ok: true, name: g.name });
  res.cookies.set(PROGRAM_COOKIE, g.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 180 });
  return res;
});
