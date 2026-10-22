import { NextResponse } from "next/server";
import { db, q } from "@/lib/db";
import { hashPassword, signSession, setSessionCookie } from "@/lib/auth";
import { audit } from "@/lib/audit";
// First run only: create the first admin account when there are no accounts yet.
async function needed() { const { count } = await db().from("nae_accounts").select("id", { count: "exact", head: true }); return !count; }
export async function GET() { return NextResponse.json({ needed: await needed() }); }
export async function POST(request) {
  if (!(await needed())) return NextResponse.json({ error: "Setup is already done." }, { status: 400 });
  const b = await request.json().catch(() => ({}));
  const username = String(b.username || "").trim(), name = String(b.name || "").trim(), password = String(b.password || "");
  if (!username || !name || password.length < 10) return NextResponse.json({ error: "Enter a name, a username and a password of at least 10 characters." }, { status: 400 });
  const acc = await q(db().from("nae_accounts").insert({ username, display_name: name, role: "admin", password_hash: hashPassword(password) }).select("*").single());
  await audit({ sub: acc.id, name, role: "admin" }, "Created the first admin account", "account", acc.id);
  return setSessionCookie(NextResponse.json({ ok: true }), await signSession(acc));
}
