import fs from "fs";
import path from "path";
import { db, q, all, inChunks } from "@/lib/db";
import { driveMock, driveConfigured, driveSettings, ensurePath, listChildren, FOLDER, kindOf } from "@/lib/drive";
import { coverThumbs } from "@/lib/covers";

// Professional photography of the physical artworks. Logistics sends them in numbered batches to a space (room or
// venue in the office) and ticks them back. The photography team saves the photos in the Shared Drive:
//   06 Uploads / Photography / <eSIS> - <School name> / VA-PD-0031.jpg (more than one: VA-PD-0031-A.jpg, -B, -C ...)
// The system finds them by the artwork code and links each artwork to its photos.
export const PHOTO_ROOT = "Photography";
const clean = s => String(s || "").replace(/[\\/:*?"<>|#%]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
export const schoolFolder = sc => clean(`${sc?.esis || "No eSIS"} - ${sc?.name || "Unknown school"}`);
// "VA-PD-0031.jpg", "VA-PD-0031-A.jpg", "va-pd-0031 b.png" → { code: "VA-PD-0031", letter: "B" }
export function codeFromName(name) {
  const m = String(name || "").match(/^([A-Za-z]{2,3}-[A-Za-z]{2,4}-\d{2,6})(?:[-_ ]+([A-Za-z]{1,2}))?(?=[.\s_-]|$)/);
  return m ? { code: m[1].toUpperCase(), letter: m[2] ? m[2].toUpperCase() : "" } : null;
}
const mockDir = () => path.join(process.env.NAE_BLOB_DIR || "/tmp/nae-blob", "photography");

// every physical artwork past delivery, with its photography state and the professional photos found for it
const SKIP = ["to_collect", "received", "missing", "returned"];
export async function loadPhotography(S, has, { thumbs = true } = {}) {
  const rows = (await all(() => db().from("nae_logistics").select("entry_id, state, location, damaged, size_class, photo_batch, photo_space, photo_sent_at, photo_sent_by, photo_done_at, photo_done_by, loc:nae_locations(label, room, shelf, row_no, sort), entry:nae_entries(id, code, reference_id, source_path, title_en, title_ar, group_name, pathway_code, sub_code, size_text, medium, pod, grades_text, school:nae_schools(id, name, esis))").order("entry_id")))
    .filter(r => r.entry && has(r.entry.pathway_code) && !SKIP.includes(r.state));
  if (!rows.length) return [];
  const ids = rows.map(r => r.entry_id);
  const [res, photos, studs] = await Promise.all([
    inChunks(ids, part => q(db().from("nae_results").select("entry_id, complete, passed").eq("round_no", 2).in("entry_id", part))),
    inChunks(ids, part => q(db().from("nae_photo_files").select("drive_id, entry_id, name, mime, modified_at").in("entry_id", part).order("name"))),
    inChunks(ids, part => q(db().from("nae_entry_students").select("entry_id, position, name_en, name_ar, grade").in("entry_id", part).order("position")))
  ]);
  const th = thumbs ? await coverThumbs(rows.map(r => r.entry)) : {};
  return rows.map(r => {
    const e = r.entry; const p = S.P[e.pathway_code]; const x = res.find(y => y.entry_id === r.entry_id); const st = studs.filter(s => s.entry_id === r.entry_id);
    return {
      code: e.code, title: e.title_en || e.title_ar || e.group_name || "", school: e.school?.name || "", esis: e.school?.esis || "", school_id: e.school?.id || null,
      pathway_code: e.pathway_code, pathway: p?.name || "", sub: (p?.subs.find(s => s.code === e.sub_code) || {}).name || "", size: e.size_text || "", size_class: r.size_class, pod: !!e.pod,
      students: st.map(s => s.name_en || s.name_ar).filter(Boolean).join(", ") || e.group_name || "", grades: [...new Set(st.map(s => s.grade).filter(Boolean))].join(", ") || e.grades_text || "",
      state: r.state, where: r.loc?.label || r.location || "", room: r.loc?.room || null, shelf: r.loc?.shelf || null, row: r.loc?.row_no ?? null, locSort: r.loc?.sort ?? 1e9, damaged: !!r.damaged,
      photo: { batch: r.photo_batch, space: r.photo_space, sent_at: r.photo_sent_at, sent_by: r.photo_sent_by, done_at: r.photo_done_at, done_by: r.photo_done_by },
      photos: photos.filter(f => f.entry_id === r.entry_id).map(f => ({ id: f.drive_id, name: f.name })),
      selected: !!(x?.complete && x.passed), thumb: th[e.id] || null, entry_id: e.id, reference_id: e.reference_id, source_path: e.source_path, folder: schoolFolder(e.school)
    };
  });
}

// make 06 Uploads / Photography / <eSIS - School> for every school with physical artworks
export async function makeFolders(schools) {
  if (driveMock()) { for (const sc of schools) fs.mkdirSync(path.join(mockDir(), schoolFolder(sc)), { recursive: true }); return { made: schools.length, mock: true }; }
  if (!driveConfigured()) throw new Error("Google Drive is not connected.");
  const s = await driveSettings(); if (!s.uploads_folder_id) throw new Error("The 06 Uploads folder is not set in the Drive settings.");
  const root = await ensurePath(s.uploads_folder_id, [PHOTO_ROOT], s.shared_drive_id);
  const have = new Set((await listChildren(root, s.shared_drive_id)).filter(f => f.mimeType === FOLDER).map(f => f.name));
  let made = 0;
  for (const sc of schools) { const n = schoolFolder(sc); if (have.has(n)) continue; await ensurePath(root, [n], s.shared_drive_id); made++; }
  return { made, root };
}

// look through the Photography folders and link each photo to its artwork by the code in its name
export async function scanPhotos() {
  let files = [];
  if (driveMock()) {
    const dir = mockDir(); if (fs.existsSync(dir)) for (const sch of fs.readdirSync(dir)) { const d = path.join(dir, sch); if (!fs.statSync(d).isDirectory()) continue; for (const f of fs.readdirSync(d)) { const st = fs.statSync(path.join(d, f)); if (st.isFile()) files.push({ id: `mock:${sch}/${f}`, name: f, mimeType: /\.png$/i.test(f) ? "image/png" : "image/jpeg", size: st.size, modifiedTime: st.mtime.toISOString(), folder: sch }); } }
  } else {
    if (!driveConfigured()) throw new Error("Google Drive is not connected.");
    const s = await driveSettings(); if (!s.uploads_folder_id) throw new Error("The 06 Uploads folder is not set in the Drive settings.");
    const root = await ensurePath(s.uploads_folder_id, [PHOTO_ROOT], s.shared_drive_id);
    const kids = await listChildren(root, s.shared_drive_id);
    // school folders (one level), and photos at any depth just below them
    const walk = async (folder, name, depth) => { for (const f of await listChildren(folder, s.shared_drive_id)) { if (f.mimeType === FOLDER) { if (depth < 2) await walk(f.id, name, depth + 1); } else files.push({ ...f, folder: name }); } };
    for (const k of kids) { if (k.mimeType === FOLDER) await walk(k.id, k.name, 0); else files.push({ ...k, folder: "" }); }
  }
  files = files.filter(f => ["image", "heic"].includes(kindOf(f.name, f.mimeType || "")));
  const named = files.map(f => ({ f, c: codeFromName(f.name) })).filter(x => x.c);
  const codes = [...new Set(named.map(x => x.c.code))];
  const ents = codes.length ? await inChunks(codes, part => q(db().from("nae_entries").select("id, code").in("code", part))) : [];
  const idOf = Object.fromEntries(ents.map(e => [e.code, e.id]));
  const now = new Date().toISOString();
  const rows = named.filter(x => idOf[x.c.code]).map(({ f, c }) => ({ drive_id: f.id, entry_id: idOf[c.code], code: c.code, name: f.name, mime: f.mimeType || null, size_bytes: f.size ? Number(f.size) : null, folder: f.folder || null, modified_at: f.modifiedTime || null, seen_at: now }));
  for (let i = 0; i < rows.length; i += 300) await q(db().from("nae_photo_files").upsert(rows.slice(i, i + 300), { onConflict: "drive_id" }));
  // photos taken out of the folders are forgotten
  await q(db().from("nae_photo_files").delete().lt("seen_at", now));
  await q(db().from("nae_settings").upsert({ key: "photo_scan", value: { at: now, files: files.length, linked: rows.length, unmatched: files.length - rows.length, unmatched_names: files.filter(f => !rows.some(r => r.drive_id === f.id)).slice(0, 30).map(f => `${f.folder ? f.folder + " / " : ""}${f.name}`) } }));
  return { files: files.length, linked: rows.length, unmatched: files.length - rows.length };
}
export async function readMockPhoto(id) { const p = path.join(mockDir(), id.replace(/^mock:/, "")); if (!p.startsWith(mockDir())) throw new Error("Not found."); return fs.readFileSync(p); }
