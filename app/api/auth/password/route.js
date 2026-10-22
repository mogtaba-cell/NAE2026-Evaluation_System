import { route, body, bad } from "@/lib/api";
import { db, q } from "@/lib/db";
import { hashPassword, verifyPassword, signSession, setSessionCookie } from "@/lib/auth";
import { NextResponse } from "next/server";
export const POST = route("*", async ({ request, session }) => {
  const b = await body(request);
  const acc = await q(db().from("nae_accounts").select("*").eq("id", session.sub).single());
  if (!verifyPassword(String(b.current || ""), acc.password_hash)) throw bad("Your current password is not right.");
  if (String(b.next || "").length < 10) throw bad("Use at least 10 characters.");
  const upd = await q(db().from("nae_accounts").update({ password_hash: hashPassword(b.next), must_change_password: false }).eq("id", acc.id).select("*").single());
  return setSessionCookie(NextResponse.json({ ok: true }), await signSession(upd));
});
