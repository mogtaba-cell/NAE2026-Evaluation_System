import { route, body } from "@/lib/api";
import { db, q } from "@/lib/db";
import { audit } from "@/lib/audit";
export const PATCH = route(["admin"], async ({ session, params, request }) => {
  const b = await body(request); const patch = {};
  if (b.name) patch.name = String(b.name).trim();
  if (Array.isArray(b.pathways)) patch.pathways = b.pathways;
  if (b.active !== undefined) patch.active = !!b.active;
  await q(db().from("nae_evaluators").update(patch).eq("id", params.id));
  await audit(session, "Updated evaluator", "evaluator", params.id, JSON.stringify(patch));
  return { ok: true };
});
