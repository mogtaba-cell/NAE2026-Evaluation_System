import { db, q, all, inChunks } from "@/lib/db";
import { driveConfigured, driveMock, driveSettings, listPage, listChildren, findChild, kindOf, FOLDER, changesStart, listChanges } from "@/lib/drive";

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
export function mockFiles(entry) {
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

// ---------- index of the Shared Drive, run in steps from the admin page ----------
// A mirror of the Drive (nae_drive_items) is kept between runs. A routine run reads only the changes since the
// last run (Drive changes API), so it takes seconds. A full run (first time, on request, or weekly) lists the whole
// drive in two parallel chains (folders, files). Each step works for up to ~40 s, then hands back to the browser.
const BUDGET = 40e3, FULL_EVERY = 7 * 864e5;
const itemRow = (f, runId) => ({ id: f.id, name: f.name, parent: (f.parents || [])[0] || null, is_folder: f.mimeType === FOLDER, mime: f.mimeType, size_bytes: f.size ? Number(f.size) : null, modified_at: f.modifiedTime || null, md5: f.md5Checksum || null, run_id: runId });
async function pool(tasks, n = 4) { const out = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, async () => { while (i < tasks.length) { const k = i++; out[k] = await tasks[k](); } })); return out; }
const chunks = (list, size) => { const out = []; for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size)); return out; };
// read a whole table in parallel pages
async function readAll(table, cols, filter = x => x) {
  const { count, error } = await filter(db().from(table).select("*", { count: "exact", head: true }));
  if (error) throw new Error(error.message);
  const pages = Array.from({ length: Math.ceil((count || 0) / 1000) }, (_, k) => () => q(filter(db().from(table).select(cols)).order("id").range(k * 1000, k * 1000 + 999)));
  return (await pool(pages, 6)).flat();
}
async function indexMeta() { return (await q(db().from("nae_settings").select("value").eq("key", "drive_index").maybeSingle()))?.value || {}; }
const sameTime = (a, b) => (a ? Date.parse(a) : 0) === (b ? Date.parse(b) : 0);

export async function indexStep(run) {
  const s = await driveSettings();
  const st = run.state || {};
  const t0 = Date.now(), timeLeft = () => Date.now() - t0 < BUDGET;
  if (driveMock()) { return { done: true, summary: { note: "Test mode: files are generated, nothing to index." } }; }

  if (!st.phase || st.phase === "start") {
    const meta = await indexMeta();
    const quick = !st.full && meta.token && meta.full_at && Date.now() - Date.parse(meta.full_at) < FULL_EVERY;
    if (quick) return { state: { phase: "changes", mode: "changes", pageToken: meta.token, count: 0 }, summary: { mode: "changes", listed: 0 } };
    // remember where the change log stands before listing, so anything added while we list is picked up next time
    const newToken = await changesStart(s.shared_drive_id);
    return { state: { phase: "list", mode: "full", newToken, count: 0, chains: [{ q: `trashed = false and mimeType = '${FOLDER}'` }, { q: `trashed = false and mimeType != '${FOLDER}'` }].map(c => ({ ...c, pageToken: null, done: false })) }, summary: { mode: "full", listed: 0 } };
  }

  if (st.phase === "list") {
    let count = st.count || 0;
    const chains = st.chains.map(c => ({ ...c }));
    // each chain pages through its part of the drive; the next page is fetched while the last one is written
    await Promise.all(chains.map(async c => {
      let next = c.done ? null : listPage({ driveId: s.shared_drive_id, pageToken: c.pageToken || undefined, q: c.q });
      while (next) {
        const j = await next;
        c.pageToken = j.nextPageToken || null; c.done = !j.nextPageToken;
        next = !c.done && timeLeft() ? listPage({ driveId: s.shared_drive_id, pageToken: c.pageToken, q: c.q }) : null;
        const rows = j.files.map(f => itemRow(f, run.id));
        if (rows.length) await q(db().from("nae_drive_items").upsert(rows, { onConflict: "id" }));
        count += rows.length;
      }
    }));
    const done = chains.every(c => c.done);
    return { state: { ...st, phase: done ? "match" : "list", chains, count }, summary: { listed: count } };
  }

  if (st.phase === "changes") {
    let pageToken = st.pageToken, count = st.count || 0, newToken = null;
    try {
      while (pageToken && !newToken && timeLeft()) {
        const j = await listChanges({ driveId: s.shared_drive_id, pageToken });
        const ch = (j.changes || []).filter(c => c.changeType !== "drive");
        const gone = ch.filter(c => c.removed || !c.file || c.file.trashed).map(c => c.fileId);
        const keep = Object.values(Object.fromEntries(ch.filter(c => !(c.removed || !c.file || c.file.trashed)).map(c => [c.fileId, itemRow(c.file, run.id)])));
        await Promise.all([
          ...chunks(keep, 1000).map(part => q(db().from("nae_drive_items").upsert(part, { onConflict: "id" }))),
          ...chunks([...new Set(gone)], 150).map(part => q(db().from("nae_drive_items").delete().in("id", part)))
        ]);
        count += ch.length; pageToken = j.nextPageToken || null; newToken = j.newStartPageToken || null;
      }
    } catch (e) {
      // the saved point can expire; fall back to a full listing
      console.error("drive changes failed, doing a full index", e.message);
      return { state: { phase: "start", full: true }, summary: { mode: "full" } };
    }
    return { state: { ...st, phase: newToken ? "match" : "changes", pageToken, newToken, count }, summary: { listed: count } };
  }

  if (st.phase === "match") {
    // a full run saw every live item; anything it did not see is gone from the drive
    if (st.mode === "full") await q(db().from("nae_drive_items").delete().or(`run_id.is.null,run_id.neq.${run.id}`));
    const [cur, entries, links, schools, pw, subs, oldFiles, oldUnmatched] = await Promise.all([
      readAll("nae_drive_items", "id,name,parent,is_folder,mime,size_bytes,modified_at"),
      all(() => db().from("nae_entries").select("id, code, source_key, pathway_code, sub_code, group_name, school_id").order("id")),
      all(() => db().from("nae_folder_links").select("*").order("path_key")),
      all(() => db().from("nae_schools").select("id, esis").order("id")),
      q(db().from("nae_pathways").select("code,name")), q(db().from("nae_subpathways").select("pathway_code,code,name")),
      readAll("nae_entry_files", "id,entry_id,drive_id,name,mime,size_bytes,kind,path,modified_at,preview_drive_id,preview_mime,match_method"),
      all(() => db().from("nae_unmatched_folders").select("path_key,path,drive_id,files_count,reason,suggested_entry_id").order("path_key"))
    ]);
    const byId = new Map(cur.map(i => [i.id, i]));
    // folder paths, worked out once per folder
    const pathCache = new Map();
    const pathOf = (id, root) => { const k = id + "|" + root; if (pathCache.has(k)) return pathCache.get(k); const it = byId.get(id); let r = null; if (it && it.parent === root) r = it.name; else if (it && it.parent && it.parent !== id) { const pp = pathOf(it.parent, root); r = pp == null ? null : pp + "/" + it.name; } pathCache.set(k, r); return r; };
    const entryById = new Map(entries.map(e => [e.id, e]));
    const byKey = new Map(entries.filter(e => e.source_key).map(e => [e.source_key, e]));
    const linkByKey = new Map(links.map(l => [l.path_key, l]));
    const files = cur.filter(i => !i.is_folder);
    const previews = new Map();
    files.forEach(f => { const p = pathOf(f.parent, s.previews_folder_id); if (p == null) return; previews.set(pathKey(p) + "/" + f.name.replace(/\.preview\.[a-z0-9]+$/i, "").toLowerCase(), f); });
    // which artwork a folder belongs to: the deepest folder on its path that an artwork (or a manual link) points to
    const folderMatch = new Map();
    const matchFolder = parent => {
      if (folderMatch.has(parent)) return folderMatch.get(parent);
      const p = pathOf(parent, s.submissions_folder_id); let r = null;
      if (p != null) {
        const segs = p.split("/"), keys = segs.map(normSeg); let entry = null, method = null;
        for (let d = segs.length; d >= 1 && !entry && method !== "ignored"; d--) {
          const k = keys.slice(0, d).filter(Boolean).join("/");
          const l = linkByKey.get(k);
          if (l) { if (l.ignored) method = "ignored"; else { entry = entryById.get(l.entry_id) || null; method = "manual"; } }
          else if (byKey.has(k)) { entry = byKey.get(k); method = "artlink"; }
        }
        r = { p, segs, pk: keys.filter(Boolean).join("/"), entry, method };
      }
      folderMatch.set(parent, r); return r;
    };
    const fileRows = [], folderFiles = {}, unmatched = {};
    for (const f of files) {
      const m = matchFolder(f.parent); if (!m || m.method === "ignored") continue;
      if (m.entry) {
        const pv = previews.get(m.pk + "/" + f.name.toLowerCase());
        fileRows.push({ entry_id: m.entry.id, drive_id: f.id, name: f.name, mime: f.mime, size_bytes: f.size_bytes, kind: kindOf(f.name, f.mime || ""), path: m.p, modified_at: f.modified_at, preview_drive_id: pv ? pv.id : null, preview_mime: pv ? pv.mime : null, match_method: m.method });
        folderFiles[m.entry.id] = (folderFiles[m.entry.id] || 0) + 1;
      } else {
        const leaf = m.segs.slice(0, Math.min(5, m.segs.length)).join("/");
        const k = pathKey(leaf); unmatched[k] = unmatched[k] || { path_key: k, path: leaf, drive_id: f.parent, files_count: 0, reason: m.segs.length < 5 ? "File outside an artwork folder" : "No artwork has this folder" };
        unmatched[k].files_count++;
      }
    }
    // suggestions: same pathway, school and subpathway, closest group name
    const schoolByEsis = new Map(schools.map(x => [String(x.esis), x.id]));
    const pwByName = new Map(pw.map(x => [normSeg(x.name), x])), subByKey = new Map(subs.map(x => [x.pathway_code + "|" + normSeg(x.name), x]));
    const cands = new Map(); entries.forEach(e => { for (const k of [`${e.pathway_code}|${e.school_id}|${e.sub_code}`, `${e.pathway_code}|${e.school_id}|*`, `${e.pathway_code}|*|${e.sub_code}`, `${e.pathway_code}|*|*`]) { if (!cands.has(k)) cands.set(k, []); cands.get(k).push(e); } });
    for (const u of Object.values(unmatched)) {
      const [lib, sch, sub, , leaf] = u.path.split("/");
      const p = pwByName.get(normSeg(lib)), sid = schoolByEsis.get(String(sch)), sb = p ? subByKey.get(p.code + "|" + normSeg(sub)) : null;
      const list = p ? cands.get(`${p.code}|${sid || "*"}|${sb ? sb.code : "*"}`) || [] : [];
      const words = new Set(normSeg(leaf || "").split(" "));
      let best = null, bestScore = 0;
      for (const e of list) { const w = normSeg(e.group_name || "").split(" "); const sc = w.filter(x => words.has(x)).length / Math.max(1, w.length); if (sc > bestScore) { best = e; bestScore = sc; } }
      u.suggested_entry_id = best ? best.id : null;
      if (!sid && sch) u.reason = `School code "${sch}" is not in the import`;
    }
    // write only what changed since the last run
    const now = new Date().toISOString();
    const um = Object.values(unmatched), oldU = new Map(oldUnmatched.map(u => [u.path_key, u]));
    const uWrite = um.filter(u => { const o = oldU.get(u.path_key); return !o || o.path !== u.path || o.drive_id !== u.drive_id || o.files_count !== u.files_count || o.reason !== u.reason || (o.suggested_entry_id || null) !== u.suggested_entry_id; }).map(u => ({ ...u, seen_at: now }));
    const uGone = oldUnmatched.filter(o => !unmatched[o.path_key]).map(o => o.path_key);
    const oldF = new Map(oldFiles.map(r => [r.drive_id, r]));
    const fWrite = fileRows.filter(r => { const o = oldF.get(r.drive_id); return !o || ["entry_id", "name", "mime", "kind", "path", "preview_drive_id", "preview_mime", "match_method"].some(k => (o[k] ?? null) !== (r[k] ?? null)) || Number(o.size_bytes ?? -1) !== Number(r.size_bytes ?? -1) || !sameTime(o.modified_at, r.modified_at); }).map(r => ({ ...r, synced_at: now }));
    const keep = new Set(fileRows.map(r => r.drive_id));
    const fGone = oldFiles.filter(r => !keep.has(r.drive_id)).map(r => r.id);
    await pool([
      ...chunks(uGone, 100).map(part => () => q(db().from("nae_unmatched_folders").delete().in("path_key", part))),
      ...chunks(fGone, 150).map(part => () => q(db().from("nae_entry_files").delete().in("id", part)))
    ], 4);
    await pool([
      ...chunks(uWrite, 1000).map(part => () => q(db().from("nae_unmatched_folders").upsert(part, { onConflict: "path_key" }))),
      ...chunks(fWrite, 1000).map(part => () => q(db().from("nae_entry_files").upsert(part, { onConflict: "drive_id" })))
    ], 4);
    await q(db().rpc("nae_recount_files"));
    const meta = await indexMeta();
    await q(db().from("nae_settings").upsert({ key: "drive_index", value: { ...meta, token: st.newToken || meta.token, full_at: st.mode === "full" ? now : meta.full_at, last_at: now } }, { onConflict: "key" }));
    const zero = entries.filter(e => !folderFiles[e.id]);
    return { done: true, summary: { items: cur.length, files: fileRows.length, entries_with_files: Object.keys(folderFiles).length, entries_without_files: zero.length, unmatched_folders: um.length, previews: previews.size, changed: fWrite.length + fGone.length } };
  }
  return { done: true };
}
