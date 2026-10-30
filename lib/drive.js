import { SignJWT, importPKCS8 } from "jose";
import { db, q } from "@/lib/db";

// Google Drive access with a read-only service account. The account must be a member (Viewer) of the
// Shared Drive "NAE Evaluation System". Credentials come from GOOGLE_SERVICE_ACCOUNT_JSON.
// NAE_DRIVE_API points at a stand-in Drive for local testing only; never set it on Vercel.
const API = process.env.NAE_DRIVE_API || "https://www.googleapis.com/drive/v3";
let cached = { token: null, exp: 0 };

export const driveMock = () => process.env.DRIVE_MOCK === "1";
export function driveConfigured() { return driveMock() || !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON; }

export async function driveSettings() {
  const r = await q(db().from("nae_settings").select("value").eq("key", "drive").maybeSingle());
  return r?.value || {};
}
// Read the service-account key from Vercel. Tolerates a key pasted twice, extra text around it, or base64.
export function readKey() {
  let raw = String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set in Vercel.");
  if (!raw.includes("{")) { try { raw = Buffer.from(raw, "base64").toString("utf8").trim(); } catch {} }
  let sa = null;
  try { sa = JSON.parse(raw); } catch {
    const start = raw.indexOf("{"); let depth = 0, inStr = false, esc = false;
    for (let i = start; start >= 0 && i < raw.length; i++) {
      const c = raw[i];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true; else if (c === "{") depth++; else if (c === "}" && --depth === 0) { try { sa = JSON.parse(raw.slice(start, i + 1)); } catch {} break; }
    }
  }
  if (!sa || !sa.client_email || !sa.private_key) throw new Error("The Google key in Vercel (GOOGLE_SERVICE_ACCOUNT_JSON) can't be read. Paste the key file's contents once, exactly as downloaded, then redeploy.");
  return sa;
}
// Quick health check for the admin page: can we sign in, and can we see the Shared Drive?
export async function driveCheck() {
  if (driveMock()) return { ok: true, mock: true };
  try {
    const sa = readKey(); const s = await driveSettings();
    const r = await driveGet(`/drives/${s.shared_drive_id}`, { fields: "id,name" }); const j = await r.json();
    if (!r.ok) return { ok: false, email: sa.client_email, error: r.status === 404 ? `The Shared Drive is not shared with ${sa.client_email}. Add it as Viewer on "NAE Evaluation System".` : (j.error?.message || `Google Drive error ${r.status}`) };
    return { ok: true, email: sa.client_email, drive: j.name };
  } catch (e) { return { ok: false, error: e.message }; }
}
async function token() {
  if (process.env.NAE_DRIVE_API) return "local-test";
  if (cached.token && Date.now() < cached.exp - 60e3) return cached.token;
  const sa = readKey();
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
// Changes since a saved point, so a routine index only reads what the sync computer added, moved or removed.
export async function changesStart(driveId) {
  return (await driveJson("/changes/startPageToken", { driveId })).startPageToken;
}
export async function listChanges({ driveId, pageToken }) {
  return driveJson("/changes", { driveId, pageToken, includeItemsFromAllDrives: "true", includeRemoved: "true", pageSize: "1000",
    fields: `nextPageToken,newStartPageToken,changes(changeType,fileId,removed,file(${FIELDS},trashed))` });
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
