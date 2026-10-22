import { route, body, bad } from "@/lib/api";
import { db, q, all } from "@/lib/db";
import { hashPassword, tempPassword, ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
export const GET = route(["admin"], async () => {
  const [accounts, evaluators, asg, scores, reviews, entries] = await Promise.all([
    q(db().from("nae_accounts").select("id, username, display_name, email, role, pathways, active, last_login_at, must_change_password, created_at").order("display_name")),
    q(db().from("nae_evaluators").select("*").order("name")),
    all(() => db().from("nae_assignments").select("evaluator_id")),
    all(() => db().from("nae_scores").select("evaluator_id, status")),
    all(() => db().from("nae_reviews").select("manager_id, status, due_at")),
    all(() => db().from("nae_entries").select("coordinator_id, school_id"))
  ]);
  const now = Date.now();
  return {
    accounts: accounts.map(a => ({ ...a, entries: entries.filter(e => e.coordinator_id === a.id).length, schools: new Set(entries.filter(e => e.coordinator_id === a.id).map(e => e.school_id)).size, reviewsOpen: reviews.filter(r => r.manager_id === a.id && r.status === "open").length, reviewsOverdue: reviews.filter(r => r.manager_id === a.id && r.status === "open" && Date.parse(r.due_at) < now).length, reviewsDone: reviews.filter(r => r.manager_id === a.id && r.status !== "open").length })),
    evaluators: evaluators.map(e => ({ ...e, assigned: asg.filter(a => a.evaluator_id === e.id).length, submitted: scores.filter(s => s.evaluator_id === e.id && s.status === "submitted").length, account: accounts.find(a => a.id === e.account_id)?.username || null }))
  };
});
export const POST = route(["admin"], async ({ session, request }) => {
  const b = await body(request);
  const pathways = Array.isArray(b.pathways) ? b.pathways : [];
  if (b.kind === "evaluator") {
    if (!String(b.name || "").trim()) throw bad("Enter the evaluator's name.");
    const ev = await q(db().from("nae_evaluators").insert({ name: b.name.trim(), pathways }).select("*").single());
    await audit(session, `Added evaluator ${ev.name} (no login)`, "evaluator", ev.id);
    return { id: ev.id };
  }
  const username = String(b.username || "").trim(), name = String(b.display_name || "").trim();
  if (!username || !name) throw bad("Enter a name and a username.");
  if (!ROLES.includes(b.role)) throw bad("Pick a role.");
  const pw = tempPassword();
  const acc = await q(db().from("nae_accounts").insert({ username, display_name: name, email: b.email || null, role: b.role, pathways, password_hash: hashPassword(pw), must_change_password: true }).select("id").single());
  if (b.role === "evaluator") await q(db().from("nae_evaluators").insert({ name, account_id: acc.id, pathways }));
  await audit(session, `Created account ${username} (${b.role})`, "account", acc.id);
  return { id: acc.id, tempPassword: pw };
});
