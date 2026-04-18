import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminClient } from "@/lib/db";

const COOKIE_NAME = "nae_session";

function secretKey() {
  return new TextEncoder().encode(process.env.APP_SESSION_SECRET);
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(derived, "hex"));
}

export async function createSessionCookie(user) {
  return new SignJWT({ sub: user.id, username: user.username, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());
}

export async function verifySessionToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload;
  } catch {
    return null;
  }
}

export async function getServerSession() {
  const store = await cookies();
  return verifySessionToken(store.get(COOKIE_NAME)?.value);
}

export async function getRequestSession(request) {
  return verifySessionToken(request.cookies.get(COOKIE_NAME)?.value);
}

export async function requireRequestSession(request) {
  const session = await getRequestSession(request);
  if (!session) throw new Error("Unauthorized");
  return session;
}

export function clearSessionResponse() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", secure: true, path: "/", expires: new Date(0) });
  return response;
}

export async function attachSession(response, user) {
  const token = await createSessionCookie(user);
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
  return response;
}

export async function authenticateUser(username, password) {
  const supabase = getAdminClient();
  const { data, error } = await supabase.from("users").select("*").eq("username", username).eq("active", true).maybeSingle();
  if (error || !data) return null;
  const ok = verifyPassword(password, data.password_hash);
  return ok ? data : null;
}

export function assertAdmin(session) {
  if (!session || session.role !== "admin") throw new Error("Forbidden");
}
