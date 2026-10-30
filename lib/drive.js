import { SignJWT, importPKCS8 } from "jose";
import { db, q } from "@/lib/db";

// Google Drive access with a read-only service account. The account must be a member (Viewer) of the
// Shared Drive "NAE Evaluation System". Credentials come from GOOGLE_SERVICE_ACCOUNT_JSON.
// NAE_DRIVE_API points at a stand-in Drive for local testing only; never set it on Vercel.
const API = process.env.NAE_DRIVE_API || "https://www.googleapis.com/drive/v3";
const UPLOAD = API.replace("/drive/v3", "/upload/drive/v3");
const READ = "https://www.googleapis.com/auth/drive.readonly", WRITE = "https://www.googleapis.com/auth/drive";
const cached = {};

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
// Reading uses the read-only scope. Writing (collection photos and visit records into 06 Uploads) uses the full scope;
// the service account needs the Contributor role on the Shared Drive for that (it can add and edit, never delete).
async function token(scope = READ) {
  if (process.env.NAE_DRIVE_API) return "local-test";
  const c = cached[scope];
  if (c && Date.now() < c.exp - 60e3) return c.token;
  const sa = readKey();
  const key = await importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" }).setIssuer(sa.client_email).setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  const j = await r.json(); if (!r.ok) throw new Error(`Google sign-in failed: ${j.error_description || j.error || r.status}`);
  cached[scope] = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached[scope].token;
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

// ---------- writing (collection photos, visit records) ----------
async function writeJson(url, init) {
  const r = await fetch(url, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${await token(WRITE)}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 403 || r.status === 404 ? "The website can't add files to the Shared Drive. Give its Google account the Contributor role on \"NAE Evaluation System\"." : `Google Drive: ${j.error?.message || r.status}`);
  return j;
}
export async function createFolder(parentId, name) {
  return writeJson(`${API}/files?supportsAllDrives=true&fields=id,name`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }) });
}
// find or create each folder of a path under rootId; remembered for the life of the server instance
const folderCache = new Map();
export async function ensurePath(rootId, segments, driveId) {
  let parent = rootId;
  for (const seg of segments) {
    const k = parent + "/" + seg;
    if (!folderCache.has(k)) { const f = (await findChild(parent, seg, driveId)) || (await createFolder(parent, seg)); folderCache.set(k, f.id); }
    parent = folderCache.get(k);
  }
  return parent;
}
export async function uploadFile(parentId, name, mime, buf) {
  const b = "nae" + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name, parents: [parentId] });
  const body = Buffer.concat([Buffer.from(`--${b}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\ncontent-type: ${mime}\r\n\r\n`), Buffer.isBuffer(buf) ? buf : Buffer.from(buf), Buffer.from(`\r\n--${b}--`)]);
  return writeJson(`${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id,name`, { method: "POST", headers: { "content-type": `multipart/related; boundary=${b}` }, body });
}
export async function renameFile(id, name) {
  return writeJson(`${API}/files/${id}?supportsAllDrives=true&fields=id,name`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
}
export async function fileMeta(id) { return driveJson(`/files/${id}`, { fields: "id,name,parents" }); }
export async function downloadFile(id) {
  const r = await driveGet(`/files/${id}`, { alt: "media" });
  if (!r.ok) throw new Error("Photo not found in Google Drive.");
  return Buffer.from(await r.arrayBuffer());
}
