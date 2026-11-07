import { putBlob, getBlob, delBlob } from "@/lib/blob";
import { driveConfigured, driveMock, driveSettings, ensurePath, uploadFile, renameFile, fileMeta, downloadFile } from "@/lib/drive";

// Collection photos (boxes, Emirates IDs) and visit records live in the GVC Shared Drive, filed so anyone can trace them:
//   06 Uploads (in-system) / Collections / <eSIS> <School> / <YYYY-MM-DD> / 09-31-05 Box · Sam.jpg
// The database keeps "drive:<file id>". If Google Drive can't be reached the photo is kept in Supabase for now
// (path without "drive:") and an admin can copy it across later from Collections.
const TZ = "Asia/Dubai";
const parts = d => Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(d).map(p => [p.type, p.value]));
export const dayOf = (d = new Date()) => { const p = parts(d); return `${p.year}-${p.month}-${p.day}`; };
export const timeOf = (d = new Date()) => { const p = parts(d); return `${p.hour}-${p.minute}-${p.second}`; };
const clean = s => String(s || "").replace(/[\\/:*?"<>|#%]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
export const KIND_NAME = { box: "Box", eid: "Emirates ID", item: "Artwork", other: "Photo" };

export function driveReady() { return driveConfigured() && !driveMock(); }
async function folderFor(school, when) {
  const s = await driveSettings();
  if (!s.uploads_folder_id) throw new Error("The 06 Uploads folder is not set in the Drive settings.");
  const schoolDir = clean(`${school?.esis || "No eSIS"} ${school?.name || "Unknown school"}`);
  return ensurePath(s.uploads_folder_id, ["Collections", schoolDir, dayOf(when)], s.shared_drive_id);
}
export async function storePhoto({ school, kind, buf, mime, by, id }) {
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  if (driveReady()) {
    try {
      const when = new Date(); const dir = await folderFor(school, when);
      const f = await uploadFile(dir, `${timeOf(when)} ${KIND_NAME[kind] || "Photo"} - ${clean(by)}.${ext}`, mime, buf);
      return `drive:${f.id}`;
    } catch (e) { console.error("drive upload failed, keeping the photo in Supabase", e.message); }
  }
  const key = `collections/${id}.${ext}`; await putBlob(key, buf, mime); return key;
}
export async function readPhoto(path) { return path.startsWith("drive:") ? downloadFile(path.slice(6)) : getBlob(path); }
// removing keeps the file in Drive (the account can't delete), renamed so it is clearly not part of the record
export async function removePhoto(path) {
  if (!path.startsWith("drive:")) return delBlob(path);
  try { const m = await fileMeta(path.slice(6)); if (!m.name.startsWith("REMOVED ")) await renameFile(m.id, `REMOVED ${m.name}`); } catch (e) { console.error("drive rename failed", e.message); }
}
export async function renamePhoto(path, label) {
  if (!path.startsWith("drive:")) return;
  try { const m = await fileMeta(path.slice(6)); const ext = (m.name.match(/\.[a-z0-9]+$/i) || [".jpg"])[0]; const t = m.name.slice(0, 8); await renameFile(m.id, `${t} ${clean(label)}${ext}`); } catch (e) { console.error("drive rename failed", e.message); }
}
export async function writeVisitRecord({ school, text, when = new Date() }) {
  if (!driveReady()) return null;
  try { const dir = await folderFor(school, when); const f = await uploadFile(dir, `${timeOf(when)} Delivery record.txt`, "text/plain; charset=UTF-8", Buffer.from(text, "utf8")); return f.id; }
  catch (e) { console.error("visit record not written", e.message); return null; }
}
// move a photo kept in Supabase into Drive (admin "copy to Drive")
export async function moveToDrive({ path, school, kind, mime, by, at }) {
  const buf = await getBlob(path); const when = at ? new Date(at) : new Date();
  const dir = await folderFor(school, when);
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const f = await uploadFile(dir, `${timeOf(when)} ${KIND_NAME[kind] || "Photo"} - ${clean(by)}.${ext}`, mime, buf);
  await delBlob(path).catch(() => {});
  return `drive:${f.id}`;
}
// a document for a delivery (the confirmation note PDF): in the school's folder for that day, or kept in Supabase
export async function storeDoc({ school, when = new Date(), name, buf, mime, id }) {
  if (driveReady()) {
    try { const dir = await folderFor(school, when); const f = await uploadFile(dir, `${timeOf(when)} ${clean(name)}`, mime, buf); return `drive:${f.id}`; }
    catch (e) { console.error("drive upload failed, keeping the document in Supabase", e.message); }
  }
  const key = `collections/notes/${id}.pdf`; await putBlob(key, buf, mime); return key;
}
// any other file the team adds (production details for an artwork, ...): 06 Uploads / <segments> / name, or Supabase
export async function storeUpload({ segments, name, buf, mime, key }) {
  if (driveReady()) {
    try { const s = await driveSettings(); if (!s.uploads_folder_id) throw new Error("no uploads folder"); const dir = await ensurePath(s.uploads_folder_id, segments.map(clean), s.shared_drive_id); const f = await uploadFile(dir, `${timeOf(new Date())} ${clean(name)}`, mime, buf); return `drive:${f.id}`; }
    catch (e) { console.error("drive upload failed, keeping the file in Supabase", e.message); }
  }
  await putBlob(key, buf, mime); return key;
}
