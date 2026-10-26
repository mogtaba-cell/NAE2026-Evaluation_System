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
  return new SignJWT({ sub: account.id, username: account.username, name: account.display_name, role: account.role, pathways: account.pathways || [], mcp: !!account.must_change_password, pw: String(account.password_hash || "").slice(0, 12) })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("12h").sign(secretKey());
}
export async function verifySessionToken(token) {
  if (!token) return null;
  try { const { payload } = await jwtVerify(token, secretKey()); return payload; } catch { return null; }
}
export async function getServerSession() {
  const store = await cookies();
  return checkLive(await verifySessionToken(store.get(COOKIE_NAME)?.value));
}
// The signed cookie only says who someone is. Their current role, pathways and whether the account is still
// switched on are read from the database (cached for 15 seconds), so switching an account off, changing its
// role or resetting its password takes effect straight away.
const live = new Map();
export function forgetAccount(id) { live.delete(id); }
async function liveAccount(id) {
  const hit = live.get(id); if (hit && hit.t > Date.now() - 15000) return hit.a;
  const { data } = await db().from("nae_accounts").select("id, username, display_name, role, pathways, active, must_change_password, password_hash").eq("id", id).maybeSingle();
  // the token is also tied to the password: a reset or change ends sessions made with the old password
  const a = data ? { ...data, pw: data.password_hash.slice(0, 12), password_hash: undefined } : null;
  live.set(id, { t: Date.now(), a }); return a;
}
export async function getRequestSession(request) {
  return checkLive(await verifySessionToken(request.cookies.get(COOKIE_NAME)?.value));
}
async function checkLive(tok) {
  if (!tok?.sub) return null;
  const a = await liveAccount(tok.sub);
  if (!a || !a.active) return null;
  if (tok.pw && tok.pw !== a.pw) return null;
  return { ...tok, username: a.username, name: a.display_name, role: a.role, pathways: a.pathways || [], mcp: !!a.must_change_password };
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
