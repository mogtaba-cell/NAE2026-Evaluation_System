import { route, body, bad } from "@/lib/api";
import { db, q } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { audit } from "@/lib/audit";
import { addPathway, copyPathway, suggestPathwayCode, suggestSubCode } from "@/lib/programsetup";

const STATUSES = ["setup", "active", "closed", "archived"];
async function load(id) {
  const S = await loadStructure();
  const g = S.programs.find(p => p.id === id); if (!g) throw bad("Program not found.");
  return { S, g };
}

// Program details (name, cycle, window, status, owners).
export const PATCH = route(["admin"], async ({ session, params, request }) => {
  const b = await body(request); const { S, g } = await load(params.id);
  const patch = {};
  if (b.name !== undefined) { if (!String(b.name).trim()) throw bad("Give the program a name."); patch.name = String(b.name).trim(); }
  ["cycle", "starts_on", "ends_on", "notes"].forEach(k => { if (b[k] !== undefined) patch[k] = b[k] || null; });
  if (b.status !== undefined) { if (!STATUSES.includes(b.status)) throw bad("Unknown status."); patch.status = b.status; }
  if (Array.isArray(b.owner_ids)) patch.owner_ids = b.owner_ids;
  if (patch.starts_on && patch.ends_on && patch.ends_on < patch.starts_on) throw bad("The program ends before it starts.");
  if (patch.status === "archived" && S.PR[g.id].pathways.some(c => Object.values(S.P[c].rounds).some(r => r.status === "open"))) throw bad("Close the open rounds before archiving the program.");
  await q(db().from("nae_programs").update(patch).eq("id", g.id));
  await audit(session, `Program ${g.name} updated`, "program", g.id, JSON.stringify(patch));
  return { ok: true };
});

// Structure: add, copy, edit or remove pathways and subpathways.
export const POST = route(["admin"], async ({ session, params, request }) => {
  const b = await body(request); const { S, g } = await load(params.id);
  const mine = c => S.P[c] && S.P[c].program_id === g.id;
  const hasEntries = async (pw, sub) => { let qy = db().from("nae_entries").select("id", { count: "exact", head: true }).eq("pathway_code", pw); if (sub) qy = qy.eq("sub_code", sub); const { count } = await qy; return count > 0; };

  if (b.action === "suggest_code") return { code: suggestPathwayCode(S, g, b.name || "", S.programs[0]?.id === g.id && !S.PR[g.id].pathways.length) };

  if (b.action === "add_pathway") {
    const name = String(b.name || "").trim(); if (!name) throw bad("Give the pathway a name.");
    if (S.PR[g.id].pathways.some(c => S.P[c].name.toLowerCase() === name.toLowerCase())) throw bad(`${g.name} already has a pathway called ${name}.`);
    const code = String(b.code || suggestPathwayCode(S, g, name)).trim().toUpperCase();
    if (!/^[A-Z0-9]{2,10}$/.test(code)) throw bad("The pathway code is 2 to 10 letters or numbers.");
    if (S.P[code]) throw bad("That pathway code is used by another program. Codes are unique across programs because they start every entry code.");
    await addPathway(S, g, { name, code, eval_type: b.eval_type });
    await audit(session, `Added pathway ${name} to ${g.name}`, "program", g.id, code);
    return { code };
  }
  if (b.action === "copy_pathways") {
    const codes = (b.codes || []).filter(c => S.P[c] && S.P[c].program_id !== g.id);
    if (!codes.length) throw bad("Pick at least one pathway from another program.");
    const made = []; for (const c of codes) made.push(await copyPathway(S, c, g, { withRubrics: b.with_rubrics !== false }));
    await audit(session, `Copied ${made.length} pathways into ${g.name}`, "program", g.id, codes.join(", "));
    return { codes: made };
  }
  if (b.action === "edit_pathway") {
    if (!mine(b.code)) throw bad("That pathway isn't in this program.");
    const patch = {};
    if (b.name !== undefined) { const n = String(b.name).trim(); if (!n) throw bad("Give the pathway a name."); patch.name = n; }
    if (b.eval_type !== undefined) patch.eval_type = b.eval_type === "Competition" ? "Competition" : "Participation";
    await q(db().from("nae_pathways").update(patch).eq("code", b.code));
    await audit(session, `Pathway ${b.code} updated`, "program", g.id, JSON.stringify(patch));
    return { ok: true };
  }
  if (b.action === "remove_pathway") {
    if (!mine(b.code)) throw bad("That pathway isn't in this program.");
    if (await hasEntries(b.code)) throw bad("This pathway has entries, so it can't be removed.");
    if (Object.values(S.P[b.code].rounds).some(r => r.status !== "setup")) throw bad("A round of this pathway has opened, so it can't be removed.");
    await q(db().from("nae_subpathways").update({ rubric_r1: null, rubric_r2: null }).eq("pathway_code", b.code));
    await q(db().from("nae_subpathways").delete().eq("pathway_code", b.code));
    await q(db().from("nae_rounds").delete().eq("pathway_code", b.code));
    await q(db().from("nae_rubrics").update({ pathway_code: null }).eq("pathway_code", b.code));
    await q(db().from("nae_pathways").delete().eq("code", b.code));
    await audit(session, `Removed pathway ${S.P[b.code].name} from ${g.name}`, "program", g.id, b.code);
    return { ok: true };
  }
  if (b.action === "add_sub") {
    if (!mine(b.pathway_code)) throw bad("That pathway isn't in this program.");
    const name = String(b.name || "").trim(); if (!name) throw bad("Give the subpathway a name.");
    const subs = S.P[b.pathway_code].subs;
    if (subs.some(s => s.name.toLowerCase() === name.toLowerCase())) throw bad("This pathway already has that subpathway.");
    const code = String(b.code || suggestSubCode(subs, name)).trim().toUpperCase();
    if (!/^[A-Z0-9]{2,4}$/.test(code)) throw bad("The subpathway code is 2 to 4 letters or numbers.");
    if (subs.some(s => s.code === code)) throw bad("That subpathway code is taken in this pathway.");
    await q(db().from("nae_subpathways").insert({ pathway_code: b.pathway_code, code, name, is_physical: !!b.is_physical, sort: 50 + subs.length, rubric_r1: b.rubric_r1 || null, rubric_r2: b.rubric_r2 || null }));
    await audit(session, `Added subpathway ${name} to ${S.P[b.pathway_code].name} (${g.name})`, "program", g.id, code);
    return { code };
  }
  if (b.action === "remove_sub") {
    if (!mine(b.pathway_code)) throw bad("That pathway isn't in this program.");
    if (await hasEntries(b.pathway_code, b.code)) throw bad("This subpathway has entries, so it can't be removed.");
    await q(db().from("nae_subpathways").delete().eq("pathway_code", b.pathway_code).eq("code", b.code));
    await audit(session, `Removed subpathway ${b.code} from ${b.pathway_code}`, "program", g.id);
    return { ok: true };
  }
  throw bad("Unknown action.");
});
