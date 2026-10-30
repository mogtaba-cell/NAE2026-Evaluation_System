import { route, body, bad } from "@/lib/api";
import { db, q } from "@/lib/db";
import { hashPassword, tempPassword, ROLES, forgetAccount } from "@/lib/auth";
import { audit } from "@/lib/audit";
export const PATCH = route(["admin"], async ({ session, params, request }) => {
  const b = await body(request); const patch = {};
  if (b.display_name) patch.display_name = String(b.display_name).trim();
  if (b.email !== undefined) patch.email = b.email || null;
  if (b.role) { if (!ROLES.includes(b.role)) throw bad("Unknown role."); patch.role = b.role; }
  if (Array.isArray(b.pathways)) patch.pathways = b.pathways;
  if (Array.isArray(b.programs)) patch.programs = b.programs;
  if (b.auto_mark_viewed !== undefined) patch.auto_mark_viewed = !!b.auto_mark_viewed;
  if (b.active !== undefined) { if (params.id === session.sub && !b.active) throw bad("You can't switch off your own account."); patch.active = !!b.active; }
  let pw = null;
  if (b.reset_password) { pw = tempPassword(); patch.password_hash = hashPassword(pw); patch.must_change_password = true; }
  const acc = await q(db().from("nae_accounts").update(patch).eq("id", params.id).select("id, username, role, display_name, pathways").single());
  if (acc.role === "evaluator") { const ev = await q(db().from("nae_evaluators").select("id").eq("account_id", acc.id).maybeSingle()); if (!ev) await q(db().from("nae_evaluators").insert({ name: acc.display_name, account_id: acc.id, pathways: acc.pathways })); else if (patch.pathways || patch.display_name) await q(db().from("nae_evaluators").update({ ...(patch.pathways ? { pathways: patch.pathways } : {}), ...(patch.display_name ? { name: patch.display_name } : {}) }).eq("id", ev.id)); }
  // An evaluator record follows its login: switched off (or no longer an evaluator) means no new entries.
  if (patch.active !== undefined || patch.role) { const a2 = await q(db().from("nae_accounts").select("active, role").eq("id", acc.id).single()); await q(db().from("nae_evaluators").update({ active: !!a2.active && a2.role === "evaluator" }).eq("account_id", acc.id)); }
  forgetAccount(acc.id);
  await audit(session, pw ? `Reset password for ${acc.username}` : `Updated account ${acc.username}`, "account", acc.id, JSON.stringify({ ...patch, password_hash: undefined }));
  return { ok: true, tempPassword: pw };
});
