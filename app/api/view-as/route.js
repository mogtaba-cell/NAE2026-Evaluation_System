import { NextResponse } from "next/server";
import { getRealSession, signViewAs, VIEWAS_COOKIE } from "@/lib/auth";
import { db, q } from "@/lib/db";
import { audit } from "@/lib/audit";
const ROLE_ORDER = ["coordinator", "evaluator", "management", "storage", "leadership", "admin"];
const err = (m, s = 400) => NextResponse.json({ error: m }, { status: s });
const cookie = (res, v) => { res.cookies.set(VIEWAS_COOKIE, v || "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", ...(v ? { maxAge: 4 * 3600 } : { expires: new Date(0) }) }); return res; };
// Admins only: the people they can view the system as, grouped by role.
export async function GET(request) {
  const s = await getRealSession(request); if (!s || s.role !== "admin") return err("Admins only.", 403);
  const accs = await q(db().from("nae_accounts").select("id, username, display_name, role, active").eq("active", true).neq("id", s.sub).order("display_name"));
  return NextResponse.json({ groups: ROLE_ORDER.map(r => ({ role: r, people: accs.filter(a => a.role === r).map(a => ({ id: a.id, username: a.username, name: a.display_name })) })).filter(g => g.people.length) });
}
// Start viewing as someone.
export async function POST(request) {
  const s = await getRealSession(request); if (!s || s.role !== "admin") return err("Admins only.", 403);
  const b = await request.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/i.test(String(b.account_id || ""))) return err("Pick an account.");
  const t = await q(db().from("nae_accounts").select("id, display_name, role, active").eq("id", b.account_id).maybeSingle());
  if (!t || !t.active || t.id === s.sub) return err("Pick an active account.");
  await audit(s, `Started viewing the system as ${t.display_name} (${t.role})`, "account", t.id);
  return cookie(NextResponse.json({ ok: true, role: t.role }), await signViewAs(s, t.id));
}
// Stop: back to the admin's own view.
export async function DELETE(request) {
  const s = await getRealSession(request);
  return cookie(NextResponse.json({ ok: true, back: !!s }), null);
}
