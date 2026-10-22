import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import crypto from "crypto";
import { db } from "@/lib/db";

export const COOKIE_NAME = "nae2_session";
export const ROLES = ["admin", "coordinator", "evaluator", "management", "storage", "leadership"];
export const ROLE_LABEL = { admin: "Admin", coordinator: "Coordinator", evaluator: "Evaluator", management: "Management", storage: "Storage team", leadership: "Leadership" };

const secretKey = () => { const s = process.env.APP_SESSION_SECRET; if (!s) throw new Error("APP_SESSION_SECRET is not set."); return new TextEncoder().encode(s); };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex"), b = Buffer.from(derived, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export function tempPassword() {
  const words = ["Falcon", "Pearl", "Ghaf", "Dhow", "Sadu", "Oasis", "Dune", "Majlis", "Liwa", "Corniche"];
  return `${words[crypto.randomInt(words.length)]}-${crypto.randomInt(1000, 9999)}-${crypto.randomBytes(2).toString("hex")}`;
}

export async function signSession(account) {
  return new SignJWT({ sub: account.id, username: account.username, name: account.display_name, role: account.role, pathways: account.pathways || [], mcp: !!account.must_change_password })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("12h").sign(secretKey());
}
export async function verifySessionToken(token) {
  if (!token) return null;
  try { const { payload } = await jwtVerify(token, secretKey()); return payload; } catch { return null; }
}
export async function getServerSession() {
  const store = await cookies();
  return verifySessionToken(store.get(COOKIE_NAME)?.value);
}
export async function getRequestSession(request) {
  return verifySessionToken(request.cookies.get(COOKIE_NAME)?.value);
}
export function setSessionCookie(response, token) {
  response.cookies.set(COOKIE_NAME, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
  return response;
}
export function clearSessionCookie(response) {
  response.cookies.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: new Date(0) });
  return response;
}
export async function authenticate(username, password) {
  const { data } = await db().from("nae_accounts").select("*").ilike("username", username).eq("active", true).maybeSingle();
  if (!data || !verifyPassword(password, data.password_hash)) return null;
  return data;
}
