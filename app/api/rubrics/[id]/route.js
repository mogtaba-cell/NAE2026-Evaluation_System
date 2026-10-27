import { route, body, bad } from "@/lib/api";
import { db, q, qc } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { audit } from "@/lib/audit";
import { cleanBands } from "@/lib/scoring";
import crypto from "crypto";
const UUID = /^[0-9a-f-]{36}$/i;
async function load(id) {
  if (!UUID.test(id)) throw bad("Rubric not found.");
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
  if (!draft) draft = await q(db().from("nae_rubric_versions").insert({ rubric_id: params.id, version: Math.max(0, ...versions.map(v => v.version)) + 1, status: "draft", criteria: pub?.criteria || [], identity_required: pub?.identity_required || false, identity_pass: pub?.identity_pass || false, grade_bands: pub?.grade_bands }).select("*").single());
  const patch = {};
  if (Array.isArray(b.criteria)) {
    // Each criterion keeps its own internal key for good (new ones get a random one), so two criteria with
    // similar names can never share a score.
    const seen = new Set();
    patch.criteria = b.criteria.map(c => {
      let key = /^[a-z0-9_]{1,40}$/.test(c.key || "") ? c.key : "";
      if (!key || seen.has(key)) key = "k_" + crypto.randomBytes(4).toString("hex");
      seen.add(key);
      return { key, label: String(c.label || "").trim(), label_ar: String(c.label_ar || "").trim(), weight: Number(c.weight) || 0, description: String(c.description || "").trim(), description_ar: String(c.description_ar || "").trim() };
    });
  }
  if (b.identity_required !== undefined) patch.identity_required = !!b.identity_required;
  if (b.identity_pass !== undefined) patch.identity_pass = !!b.identity_pass && (b.identity_required !== undefined ? !!b.identity_required : true);
  if (b.grade_bands !== undefined) { const gb = cleanBands(b.grade_bands); if (!gb) throw bad("Grade lines must be whole numbers with A above B (for example A 80, B 50)."); patch.grade_bands = gb; }
  if (b.name) await q(db().from("nae_rubrics").update({ name: b.name }).eq("id", params.id));
  await q(db().from("nae_rubric_versions").update(patch).eq("id", draft.id));
  const summary = [patch.criteria ? patch.criteria.map(c => `${c.label} ${c.weight}%`).join(", ") : null, patch.identity_required !== undefined ? `national identity ${patch.identity_required ? (patch.identity_pass ? "asked, yes required to go through" : "asked") : "not asked"}` : null, patch.grade_bands ? `A ${patch.grade_bands[0].min}, B ${patch.grade_bands[1].min}` : null].filter(Boolean).join(" · ");
  const r = await q(db().from("nae_rubrics").select("code").eq("id", params.id).single());
  await audit(session, `Draft saved: rubric ${r.code} v${draft.version}`, "rubric", params.id, summary);
  return { ok: true, draft: draft.id };
});
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
export const POST = route(["admin"], async ({ session, params, request }) => {
  const b = await body(request);
  if (b.action !== "publish") throw bad("Unknown action.");
  const S = await loadStructure();
  const rub = S.rubrics[params.id]; if (!rub) throw bad("Rubric not found.");
  const draft = rub.draft; if (!draft) throw bad("There is no draft to publish.");
  const pub = rub.published;
  if (pub && same(pub.criteria, draft.criteria) && pub.identity_required === draft.identity_required && !!pub.identity_pass === !!draft.identity_pass && same(pub.grade_bands, draft.grade_bands)) throw bad("Nothing has changed since the published version.");
  const crit = draft.criteria || [];
  const total = crit.reduce((s, c) => s + Number(c.weight || 0), 0);
  if (total !== 100) throw bad(`Weights add up to ${total}. They must add up to 100.`);
  if (crit.some(c => !c.label)) throw bad("Every criterion needs an English name.");
  if (new Set(crit.map(c => c.key)).size !== crit.length) throw bad("Two criteria share an internal key. Save the draft again and retry.");
  if (!cleanBands(draft.grade_bands)) throw bad("Set valid grade lines before publishing.");
  // in use by an open round: needs a reason (entries already scored keep their version)
  const openUse = S.subs.filter(s => [1, 2].some(no => (no === 1 ? s.rubric_r1 : (s.rubric_r2 || s.rubric_r1)) === rub.id && S.P[s.pathway_code]?.rounds?.[no]?.status === "open"));
  if (openUse.length && !String(b.reason || "").trim()) throw bad(`This rubric is in use by an open round (${openUse.map(s => s.name).join(", ")}). Give a reason to publish.`);
  const { error } = await db().rpc("nae_publish_rubric", { p_draft: draft.id, p_by: session.sub });
  if (error) throw bad(error.message);
  await audit(session, `Published rubric ${rub.code} v${draft.version}`, "rubric", params.id, ["Entries with saved scores keep the version they were scored with", b.reason].filter(Boolean).join(" · "));
  return { ok: true, note: `Published ${rub.code} v${draft.version}. Entries already scored keep their version.` };
});
