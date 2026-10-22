import { route, body, bad } from "@/lib/api";
import { db, q, qc } from "@/lib/db";
import { audit } from "@/lib/audit";
async function load(id) {
  const r = await q(db().from("nae_rubrics").select("*").eq("id", id).single());
  const versions = await q(db().from("nae_rubric_versions").select("*").eq("rubric_id", id).order("version"));
  const subs = await q(db().from("nae_subpathways").select("pathway_code, code, name, rubric_r1, rubric_r2").or(`rubric_r1.eq.${id},rubric_r2.eq.${id}`));
  const { count } = await qc(db().from("nae_scores").select("id", { count: "exact", head: true }).in("rubric_version_id", versions.map(v => v.id).concat(["00000000-0000-0000-0000-000000000000"])));
  return { rubric: r, versions, subs, scored: count };
}
export const GET = route(["admin", "management", "leadership", "coordinator"], async ({ params }) => load(params.id));
export const PATCH = route(["admin"], async ({ session, params, request }) => {
  const b = await body(request);
  const versions = await q(db().from("nae_rubric_versions").select("*").eq("rubric_id", params.id).order("version"));
  let draft = versions.find(v => v.status === "draft");
  const pub = versions.filter(v => v.status === "published").pop();
  if (!draft) draft = await q(db().from("nae_rubric_versions").insert({ rubric_id: params.id, version: Math.max(0, ...versions.map(v => v.version)) + 1, status: "draft", criteria: pub?.criteria || [], identity_required: pub?.identity_required || false, grade_bands: pub?.grade_bands }).select("*").single());
  const patch = {};
  if (Array.isArray(b.criteria)) patch.criteria = b.criteria.map((c, i) => ({ key: c.key || String(c.label || "c" + i).toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30) || "c" + i, label: String(c.label || "").trim(), weight: Number(c.weight) || 0, description: c.description || "" }));
  if (b.identity_required !== undefined) patch.identity_required = !!b.identity_required;
  if (b.grade_bands) patch.grade_bands = b.grade_bands;
  if (b.name) await q(db().from("nae_rubrics").update({ name: b.name }).eq("id", params.id));
  await q(db().from("nae_rubric_versions").update(patch).eq("id", draft.id));
  return { ok: true, draft: draft.id };
});
export const POST = route(["admin"], async ({ session, params, request }) => {
  const b = await body(request);
  if (b.action !== "publish") throw bad("Unknown action.");
  const versions = await q(db().from("nae_rubric_versions").select("*").eq("rubric_id", params.id).order("version"));
  const draft = versions.find(v => v.status === "draft"); if (!draft) throw bad("There is no draft to publish.");
  const total = (draft.criteria || []).reduce((s, c) => s + Number(c.weight || 0), 0);
  if (total !== 100) throw bad(`Weights add up to ${total}. They must add up to 100.`);
  if ((draft.criteria || []).some(c => !c.label)) throw bad("Every criterion needs a name.");
  await q(db().from("nae_rubric_versions").update({ status: "retired" }).eq("rubric_id", params.id).eq("status", "published"));
  await q(db().from("nae_rubric_versions").update({ status: "published", published_at: new Date().toISOString(), published_by: session.sub }).eq("id", draft.id));
  const r = await q(db().from("nae_rubrics").select("code").eq("id", params.id).single());
  await audit(session, `Published rubric ${r.code} v${draft.version}`, "rubric", params.id, "Entries with saved scores keep the version they were scored with");
  return { ok: true, note: `Published ${r.code} v${draft.version}. Entries already scored keep their version.` };
});
