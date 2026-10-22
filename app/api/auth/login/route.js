import { NextResponse } from "next/server";
import { authenticate, signSession, setSessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
export async function POST(request) {
  const b = await request.json().catch(() => ({}));
  const username = String(b.username || "").trim(), password = String(b.password || "");
  if (!username || !password) return NextResponse.json({ error: "Enter your username and password." }, { status: 400 });
  const acc = await authenticate(username, password);
  if (!acc) return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
  await db().from("nae_accounts").update({ last_login_at: new Date().toISOString() }).eq("id", acc.id);
  const res = NextResponse.json({ ok: true, role: acc.role, mustChange: acc.must_change_password });
  await audit({ sub: acc.id, name: acc.display_name, role: acc.role }, "Signed in", "account", acc.id);
  return setSessionCookie(res, await signSession(acc));
}
