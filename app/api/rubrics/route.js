import { route, body, bad } from "@/lib/api";
import { db, q } from "@/lib/db";
import { audit } from "@/lib/audit";
import { loadStructure } from "@/lib/structure";
export const GET = route(["admin", "management", "leadership", "coordinator"], async () => {
  const S = await loadStructure();
  return { rubrics: Object.values(S.rubrics).map(r => ({ ...r, usedBy: S.subs.filter(s => s.rubric_r1 === r.id || s.rubric_r2 === r.id).map(s => ({ pathway: s.pathway_code, code: s.code, name: s.name, r1: s.rubric_r1 === r.id, r2: s.rubric_r2 === r.id })) })) };
});
export const POST = route(["admin"], async ({ session, request }) => {
  const b = await body(request);
  const code = String(b.code || "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  if (!code || !b.name) throw bad("Give the rubric a code and a name.");
  const r = await q(db().from("nae_rubrics").insert({ code, name: b.name, pathway_code: b.pathway_code || null }).select("*").single());
  let criteria = [], identity = !!b.identity_required, bands = undefined;
  if (b.copyFrom) { const v = await q(db().from("nae_rubric_versions").select("*").eq("rubric_id", b.copyFrom).eq("status", "published").maybeSingle()); if (v) { criteria = v.criteria; identity = v.identity_required; bands = v.grade_bands; } }
  await q(db().from("nae_rubric_versions").insert({ rubric_id: r.id, version: 1, status: "draft", criteria, identity_required: identity, ...(bands ? { grade_bands: bands } : {}) }));
  await audit(session, `Created rubric ${code}`, "rubric", r.id);
  return { id: r.id };
});
