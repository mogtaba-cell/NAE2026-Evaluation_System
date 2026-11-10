import { db, q, inChunks } from "@/lib/db";
import { driveMock } from "@/lib/drive";
import { mockFiles, dropHidden } from "@/lib/files";
import { fileView } from "@/lib/entryview";

// A small picture for each artwork in a list: its first image (else a HEIC or video preview) from the indexed
// submission files. entries: [{ id, reference_id, pathway_code, source_path }] → { entry id: thumbnail url }
const rank = f => ({ image: 0, heic: 1, video: 2 })[f.kind] ?? 3;
export async function coverThumbs(entries) {
  const list = (entries || []).filter(e => e?.id); if (!list.length) return {};
  const files = await dropHidden(driveMock() ? list.flatMap(e => (e.reference_id ? mockFiles(e) : []))
    : await inChunks(list.map(e => e.id), part => q(db().from("nae_entry_files").select("entry_id, drive_id, name, kind, mime, path, preview_drive_id").in("entry_id", part).in("kind", ["image", "heic", "video"]).order("name"))));
  const out = {};
  files.filter(f => ["image", "heic", "video"].includes(f.kind)).sort((a, b) => rank(a) - rank(b)).forEach(f => { if (!out[f.entry_id]) out[f.entry_id] = fileView(f).thumb; });
  return out;
}
// The pictures of each artwork (images, HEIC and video previews), for lists that show a strip of photos:
// { entry id: [{ name, kind, thumb, big, video }] }
export async function entryPictures(entries, max = 8) {
  const list = (entries || []).filter(e => e?.id); if (!list.length) return {};
  const files = await dropHidden(driveMock() ? list.flatMap(e => (e.reference_id ? mockFiles(e) : []))
    : await inChunks(list.map(e => e.id), part => q(db().from("nae_entry_files").select("entry_id, drive_id, name, kind, mime, path, preview_drive_id").in("entry_id", part).in("kind", ["image", "heic", "video"]).order("name"))));
  const out = {};
  files.filter(f => ["image", "heic", "video"].includes(f.kind)).sort((a, b) => rank(a) - rank(b)).forEach(f => {
    const v = fileView(f); const arr = out[f.entry_id] ||= [];
    if (arr.length < max) arr.push({ name: f.name, kind: f.kind, thumb: v.thumb, big: f.kind === "video" ? v.url : `${v.thumb}?s=1600`, video: f.kind === "video" });
  });
  return out;
}
// The Drive file of each artwork's cover picture, for checklists that embed a photo: { entry id: drive file id }
export async function coverIds(entries) {
  const list = (entries || []).filter(e => e?.id); if (!list.length) return {};
  const files = await dropHidden(driveMock() ? list.flatMap(e => (e.reference_id ? mockFiles(e) : []))
    : await inChunks(list.map(e => e.id), part => q(db().from("nae_entry_files").select("entry_id, drive_id, name, kind, preview_drive_id").in("entry_id", part).in("kind", ["image", "heic", "video"]).order("name"))));
  const out = {};
  files.filter(f => ["image", "heic", "video"].includes(f.kind)).sort((a, b) => rank(a) - rank(b)).forEach(f => { if (!out[f.entry_id]) out[f.entry_id] = f.preview_drive_id && f.kind !== "video" ? f.preview_drive_id : f.drive_id; });
  return out;
}
