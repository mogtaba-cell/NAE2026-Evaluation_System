import { route, body, bad } from "@/lib/api";
import { db, q } from "@/lib/db";
import { audit } from "@/lib/audit";
export const PATCH = route(["admin"], async ({ session, params, request }) => {
  const b = await body(request);
  for (const s of b.subs || []) {
    const patch = {};
    ["is_physical", "rubric_r1", "rubric_r2", "name"].forEach(k => { if (s[k] !== undefined) patch[k] = s[k] === "" ? null : s[k]; });
    if (Object.keys(patch).length) await q(db().from("nae_subpathways").update(patch).eq("pathway_code", params.code).eq("code", s.code));
  }
  if (b.status) await q(db().from("nae_pathways").update({ status: b.status }).eq("code", params.code));
  await audit(session, "Pathway settings changed", "pathway", params.code, JSON.stringify(b).slice(0, 500));
  return { ok: true };
});
