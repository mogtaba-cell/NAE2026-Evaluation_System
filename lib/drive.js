import { SignJWT, importPKCS8 } from "jose";
import { db, q } from "@/lib/db";

// Google Drive access with a read-only service account. The account must be a member (Viewer) of the
// Shared Drive "NAE Evaluation System". Credentials come from GOOGLE_SERVICE_ACCOUNT_JSON.
const API = "https://www.googleapis.com/drive/v3";
let cached = { token: null, exp: 0 };

export const driveMock = () => process.env.DRIVE_MOCK === "1";
export function driveConfigured() { return driveMock() || !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON; }

export async function driveSettings() {
  const r = await q(db().from("nae_settings").select("value").eq("key", "drive").maybeSingle());
  return r?.value || {};
}
async function token() {
  if (cached.token && Date.now() < cached.exp - 60e3) return cached.token;
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const key = await importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/drive.readonly" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" }).setIssuer(sa.client_email).setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  const j = await r.json(); if (!r.ok) throw new Error(`Google sign-in failed: ${j.error_description || j.error || r.status}`);
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}
export async function driveGet(path, params = {}, init = {}) {
  const u = new URL(API + path);
  Object.entries({ supportsAllDrives: "true", ...params }).forEach(([k, v]) => v != null && u.searchParams.set(k, v));
  const r = await fetch(u, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${await token()}` } });
  return r;
}
export async function driveJson(path, params) {
  const r = await driveGet(path, params); const j = await r.json();
  if (!r.ok) throw new Error(`Google Drive: ${j.error?.message || r.status}`);
  return j;
}
const FIELDS = "id,name,parents,mimeType,size,modifiedTime,md5Checksum";
export async function listPage({ driveId, pageToken, q: query = "trashed = false" }) {
  return driveJson("/files", { corpora: "drive", driveId, includeItemsFromAllDrives: "true", q: query, pageSize: "1000", pageToken, fields: `nextPageToken,files(${FIELDS})` });
}
export async function listChildren(folderId, driveId) {
  const out = []; let pageToken;
  do { const j = await listPage({ driveId, pageToken, q: `'${folderId}' in parents and trashed = false` }); out.push(...j.files); pageToken = j.nextPageToken; } while (pageToken);
  return out;
}
export async function findChild(parentId, name, driveId) {
  const esc = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const j = await listPage({ driveId, q: `'${parentId}' in parents and name = '${esc}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false` });
  return j.files[0] || null;
}
export async function thumbnail(id, size = 1600) {
  const j = await driveJson(`/files/${id}`, { fields: "thumbnailLink,hasThumbnail" });
  if (!j.thumbnailLink) return null;
  const url = j.thumbnailLink.replace(/=s\d+$/, `=s${size}`);
  const r = await fetch(url, { headers: { authorization: `Bearer ${await token()}` } });
  return r.ok ? r : null;
}
export const FOLDER = "application/vnd.google-apps.folder";
export function kindOf(name, mime = "") {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (["heic", "heif"].includes(ext)) return "heic";
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) return "image";
  if (mime.startsWith("video/") || ["mp4", "mov", "m4v", "avi", "mkv", "webm", "wmv"].includes(ext)) return "video";
  if (mime.startsWith("audio/") || ["mp3", "m4a", "wav", "aac", "ogg"].includes(ext)) return "audio";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (["doc", "docx", "ppt", "pptx", "xls", "xlsx", "odt", "odp", "txt", "rtf"].includes(ext)) return "doc";
  return "other";
}
