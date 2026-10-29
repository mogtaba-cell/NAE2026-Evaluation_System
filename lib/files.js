import { db, q, all, inChunks } from "@/lib/db";
import { driveConfigured, driveMock, driveSettings, listPage, listChildren, findChild, kindOf, FOLDER } from "@/lib/drive";

// ---------- paths ----------
// SharePoint folder from the ArtLink column: ...AllItems.aspx?id=%2Fsites%2FADEKTransfer%2FNationalArts%2F2026%2FVisual%20Expressions%2F9214%2F...
export function pathFromArtLink(link) {
  if (!link) return null;
  try {
    const u = new URL(String(link).trim());
    let id = u.searchParams.get("id") || u.searchParams.get("RootFolder");
    if (!id) { const m = decodeURIComponent(u.pathname).match(/\/NationalArts\/\d{4}\/(.+)$/i); id = m ? "/x/x/x/x/" + m[1] : null; }
    if (!id) return null;
    const parts = id.split("/").filter(Boolean);
    const i = parts.findIndex(p => /^\d{4}$/.test(p) && parts[parts.indexOf(p) - 1] && /nationalarts/i.test(parts[parts.indexOf(p) - 1]));
    const rest = i >= 0 ? parts.slice(i + 1) : parts.slice(4);
    return rest.length ? rest.join("/") : null;
  } catch { return null; }
}
export function normSeg(s) {
  return String(s || "").toLowerCase().replace(/[&+]/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").split(" ").filter(w => w && w !== "and").join(" ");
}
export const pathKey = p => String(p || "").split("/").map(normSeg).filter(Boolean).join("/");

// ---------- per-entry lookup (works without the full index) ----------
async function resolveFolder(path, root, driveId) {
  let parent = root;
  for (const seg of path.split("/")) { const f = await findChild(parent, seg, driveId); if (!f) return null; parent = f.id; }
  return parent;
}
async function listTree(folderId, driveId, prefix = "", depth = 0) {
  const items = await listChildren(folderId, driveId); const out = [];
  for (const it of items) {
    if (it.mimeType === FOLDER) { if (depth < 2) out.push(...(await listTree(it.id, driveId, prefix + it.name + "/", depth + 1))); }
    else out.push({ ...it, rel: prefix + it.name });
  }
  return out;
}
function mockFiles(entry) {
  const h = [...entry.reference_id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const pw = entry.pathway_code, n = 1 + (h % 3);
  const list = [];
  if (["VE", "DE", "VA", "DA"].includes(pw)) for (let i = 0; i < n; i++) list.push({ name: `IMG_${1000 + (h % 8000) + i}.jpg`, kind: "image", mime: "image/svg+xml" });
  if (pw === "PE" || pw === "PA" || h % 4 === 0) list.push({ name: "Performance.mp4", kind: "video", mime: "video/mp4" });
  if (pw === "LE" || pw === "LA") list.push({ name: "Text.pdf", kind: "pdf", mime: "application/pdf" });
  if (h % 29 === 0) return [];
  return list.map((f, i) => ({ id: `mock-${entry.id}-${i}`, drive_id: `mock:${entry.id}:${i}:${f.kind}`, entry_id: entry.id, name: f.name, kind: f.kind, mime: f.mime, size_bytes: 1500000 + (h % 900) * 1000 * (i + 1), path: entry.source_path, preview_drive_id: null, match_method: "artlink" }));
}
const NEEDS_PREVIEW = new Set(["video", "heic", "doc"]);
export async function entryFiles(entry, { refresh = false } = {}) {
  if (driveMock()) { const m = mockFiles(entry); if (entry.files_count !== m.length) await db().from("nae_entries").update({ files_count: m.length, files_checked_at: new Date().toISOString() }).eq("id", entry.id); return m; }
  const cachedRows = await q(db().from("nae_entry_files").select("*").eq("entry_id", entry.id).order("path").order("name"));
  if (!driveConfigured() || !entry.source_path) return cachedRows;
  const fresh = entry.files_checked_at && Date.now() - Date.parse(entry.files_checked_at) < 10 * 60e3;
  if (fresh && !refresh) return cachedRows;
  try {
    const s = await driveSettings();
    const folder = entry.drive_folder_id || await resolveFolder(entry.source_path, s.submissions_folder_id, s.shared_drive_id);
    const now = new Date().toISOString();
    if (!folder) { await q(db().from("nae_entries").update({ files_checked_at: now, files_count: cachedRows.length }).eq("id", entry.id)); return cachedRows; }
    const items = await listTree(folder, s.shared_drive_id);
    const rows = items.map(it => ({ entry_id: entry.id, drive_id: it.id, name: it.name, mime: it.mimeType, size_bytes: it.size ? Number(it.size) : null, kind: kindOf(it.name, it.mimeType), path: entry.source_path + (it.rel.includes("/") ? "/" + it.rel.slice(0, it.rel.lastIndexOf("/")) : ""), modified_at: it.modifiedTime, match_method: "artlink", synced_at: now }));
    const keepPreview = Object.fromEntries(cachedRows.map(r => [r.drive_id, r]));
    rows.forEach(r => { const k = keepPreview[r.drive_id]; if (k) { r.preview_drive_id = k.preview_drive_id; r.preview_mime = k.preview_mime; } });
    // Files that need a converted preview (video, HEIC, Word/PowerPoint): look in 02 Previews under the same path.
    if (s.previews_folder_id && rows.some(r => NEEDS_PREVIEW.has(r.kind) && !r.preview_drive_id)) {
      const pf = await resolveFolder(entry.source_path, s.previews_folder_id, s.shared_drive_id).catch(() => null);
      if (pf) {
        const pv = {}; (await listTree(pf, s.shared_drive_id)).forEach(it => { pv[it.rel.replace(/\.preview\.[a-z0-9]+$/i, "").toLowerCase()] = it; });
        rows.forEach((r, i) => { if (r.preview_drive_id) return; const hit = pv[items[i].rel.toLowerCase()]; if (hit) { r.preview_drive_id = hit.id; r.preview_mime = hit.mimeType; } });
      }
    }
    if (rows.length) await q(db().from("nae_entry_files").upsert(rows, { onConflict: "drive_id" }));
    const gone = cachedRows.filter(r => !rows.find(x => x.drive_id === r.drive_id) && r.match_method === "artlink").map(r => r.id);
    if (gone.length) await q(db().from("nae_entry_files").delete().in("id", gone));
    await q(db().from("nae_entries").update({ drive_folder_id: folder, files_checked_at: now, files_count: rows.length }).eq("id", entry.id));
    return await q(db().from("nae_entry_files").select("*").eq("entry_id", entry.id).order("path").order("name"));
  } catch (e) { console.error("drive lookup failed", e.message); return cachedRows; }
}

// ---------- full index of the Shared Drive, run in steps from the admin page ----------
export async function indexStep(run) {
  const s = await driveSettings();
  const st = run.state || {};
  if (driveMock()) { return { done: true, summary: { note: "Test mode: files are generated, nothing to index." } }; }
  if (!st.phase || st.phase === "list") {
    let pageToken = st.pageToken, pages = 0, count = st.count || 0;
    do {
      const j = await listPage({ driveId: s.shared_drive_id, pageToken });
      const rows = j.files.map(f => ({ id: f.id, name: f.name, parent: (f.parents || [])[0] || null, is_folder: f.mimeType === FOLDER, mime: f.mimeType, size_bytes: f.size ? Number(f.size) : null, modified_at: f.modifiedTime, md5: f.md5Checksum || null, run_id: run.id, seen_at: new Date().toISOString() }));
      for (let i = 0; i < rows.length; i += 500) await q(db().from("nae_drive_items").upsert(rows.slice(i, i + 500), { onConflict: "id" }));
      count += rows.length; pageToken = j.nextPageToken; pages++;
    } while (pageToken && pages < 6);
    return { state: { phase: pageToken ? "list" : "match", pageToken, count }, summary: { listed: count } };
  }
  if (st.phase === "match") {
    const items = await all(() => db().from("nae_drive_items").select("id,name,parent,is_folder,mime,size_bytes,modified_at,run_id"));
    const cur = items.filter(i => i.run_id === run.id);
    const stale = items.filter(i => i.run_id !== run.id).map(i => i.id);
    for (let i = 0; i < stale.length; i += 150) await q(db().from("nae_drive_items").delete().in("id", stale.slice(i, i + 150)));
    const byId = Object.fromEntries(cur.map(i => [i.id, i]));
    const pathCache = {};
    const pathOf = (id, root) => { const k = id + "|" + root; if (pathCache[k] !== undefined) return pathCache[k]; const it = byId[id]; let r = null; if (!it) r = null; else if (it.parent === root) r = it.name; else { const pp = pathOf(it.parent, root); r = pp == null ? null : pp + "/" + it.name; } pathCache[k] = r; return r; };
    const entries = await all(() => db().from("nae_entries").select("id, code, source_key, pathway_code, sub_code, group_name, school_id, registration_type"));
    const links = await all(() => db().from("nae_folder_links").select("*"));
    const byKey = {}; entries.forEach(e => { if (e.source_key) byKey[e.source_key] = e; });
    const linkByKey = Object.fromEntries(links.map(l => [l.path_key, l]));
    const previews = {};
    cur.filter(i => !i.is_folder).forEach(f => { const p = pathOf(f.parent, s.previews_folder_id); if (p == null) return; const base = f.name.replace(/\.preview\.[a-z0-9]+$/i, ""); previews[pathKey(p) + "/" + base.toLowerCase()] = f; });
    const fileRows = [], folderFiles = {}, unmatched = {};
    const now = new Date().toISOString();
    for (const f of cur.filter(i => !i.is_folder)) {
      const p = pathOf(f.parent, s.submissions_folder_id); if (p == null) continue;
      const segs = p.split("/");
      let entry = null, method = null;
      for (let d = segs.length; d >= 1 && !entry; d--) {
        const k = pathKey(segs.slice(0, d).join("/"));
        if (linkByKey[k]) { if (linkByKey[k].ignored) { method = "ignored"; break; } entry = entries.find(e => e.id === linkByKey[k].entry_id); method = "manual"; }
        else if (byKey[k]) { entry = byKey[k]; method = "artlink"; }
      }
      if (method === "ignored") continue;
      if (entry) {
        const pv = previews[pathKey(p) + "/" + f.name.toLowerCase()];
        fileRows.push({ entry_id: entry.id, drive_id: f.id, name: f.name, mime: f.mime, size_bytes: f.size_bytes, kind: kindOf(f.name, f.mime || ""), path: p, modified_at: f.modified_at, preview_drive_id: pv ? pv.id : null, preview_mime: pv ? pv.mime : null, match_method: method, synced_at: now });
        folderFiles[entry.id] = (folderFiles[entry.id] || 0) + 1;
      } else {
        const leaf = segs.slice(0, Math.min(5, segs.length)).join("/");
        const k = pathKey(leaf); unmatched[k] = unmatched[k] || { path_key: k, path: leaf, drive_id: f.parent, files_count: 0, reason: segs.length < 5 ? "File outside an artwork folder" : "No artwork has this folder", seen_at: now };
        unmatched[k].files_count++;
      }
    }
    // suggestions: same pathway, school and subpathway, closest group name
    const schools = await all(() => db().from("nae_schools").select("id, esis"));
    const schoolByEsis = Object.fromEntries(schools.map(x => [String(x.esis), x.id]));
    const pw = await q(db().from("nae_pathways").select("code,name")); const subs = await q(db().from("nae_subpathways").select("pathway_code,code,name"));
    for (const u of Object.values(unmatched)) {
      const [lib, sch, sub, , leaf] = u.path.split("/");
      const p = pw.find(x => normSeg(x.name) === normSeg(lib)); const sid = schoolByEsis[String(sch)];
      const sb = subs.find(x => p && x.pathway_code === p.code && normSeg(x.name) === normSeg(sub));
      const cands = entries.filter(e => p && e.pathway_code === p.code && (!sid || e.school_id === sid) && (!sb || e.sub_code === sb.code));
      const words = new Set(normSeg(leaf || "").split(" "));
      const score = e => { const w = normSeg(e.group_name || "").split(" "); return w.filter(x => words.has(x)).length / Math.max(1, w.length); };
      const best = cands.sort((a, b) => score(b) - score(a))[0];
      u.suggested_entry_id = best && score(best) > 0 ? best.id : null;
      if (!sid && sch) u.reason = `School code "${sch}" is not in the import`;
    }
    await q(db().from("nae_unmatched_folders").delete().neq("path_key", ""));
    const um = Object.values(unmatched);
    for (let i = 0; i < um.length; i += 500) await q(db().from("nae_unmatched_folders").insert(um.slice(i, i + 500)));
    for (let i = 0; i < fileRows.length; i += 500) await q(db().from("nae_entry_files").upsert(fileRows.slice(i, i + 500), { onConflict: "drive_id" }));
    const keep = new Set(fileRows.map(r => r.drive_id));
    const existing = await all(() => db().from("nae_entry_files").select("id, drive_id"));
    const drop = existing.filter(r => !keep.has(r.drive_id)).map(r => r.id);
    for (let i = 0; i < drop.length; i += 150) await q(db().from("nae_entry_files").delete().in("id", drop.slice(i, i + 150)));
    await q(db().rpc("nae_recount_files"));
    const counts = Object.keys(folderFiles); const zero = entries.filter(e => !folderFiles[e.id]);
    return { done: true, summary: { items: cur.length, files: fileRows.length, entries_with_files: counts.length, entries_without_files: zero.length, unmatched_folders: um.length, previews: Object.keys(previews).length } };
  }
  return { done: true };
}
