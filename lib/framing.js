import { db, q, all, inChunks } from "@/lib/db";
import { driveMock, thumbnail } from "@/lib/drive";
import { entryFiles } from "@/lib/files";
import { fileView } from "@/lib/entryview";

// Artworks that need framing for the showcase (ticked during Round 2 scoring), with what each needs, where it is,
// and a photo to recognise it by. Used by the Framing tab and the checklist for the framing team.
export const FRAMING_STATES = ["storage", "requested", "picked", "handed_over", "coordinator", "returning", "framer", "showcase"];
export async function loadFraming(S, has) {
  const rows = (await all(() => db().from("nae_logistics").select("entry_id, state, location, needs_framing, glass_framing, framed, framing_vendor, framing_sent_on, framing_due, framing_back_on, condition, damaged, loc:nae_locations(label, sort), entry:nae_entries(id, code, reference_id, title_en, title_ar, group_name, pathway_code, sub_code, size_text, medium, school:nae_schools(id, name, esis))").eq("needs_framing", true).order("entry_id")))
    .filter(r => r.entry && has(r.entry.pathway_code));
  if (!rows.length) return [];
  const ids = rows.map(r => r.entry_id);
  const res = await inChunks(ids, part => q(db().from("nae_results").select("entry_id, complete, passed, final, grade").eq("round_no", 2).in("entry_id", part)));
  // a photo for each: the first image (or a video/HEIC preview) from the submitted files
  let files = [];
  if (driveMock()) files = (await Promise.all(rows.map(r => entryFiles(r.entry).catch(() => [])))).flat();
  else files = await inChunks(ids, part => q(db().from("nae_entry_files").select("entry_id, drive_id, name, kind, mime, size_bytes, path, preview_drive_id").in("entry_id", part).in("kind", ["image", "heic", "video"]).order("name")));
  const rank = f => ({ image: 0, heic: 1, video: 2 })[f.kind] ?? 3;
  const cover = {}; files.filter(f => ["image", "heic", "video"].includes(f.kind)).sort((a, b) => rank(a) - rank(b)).forEach(f => { if (!cover[f.entry_id]) cover[f.entry_id] = f; });
  return rows.map(r => {
    const x = res.find(y => y.entry_id === r.entry_id); const p = S.P[r.entry.pathway_code];
    const c = cover[r.entry_id];
    return {
      code: r.entry.code, title: r.entry.title_en || r.entry.title_ar || r.entry.group_name || "", school: r.entry.school?.name || "", esis: r.entry.school?.esis || "", school_id: r.entry.school?.id || "none",
      pathway_code: r.entry.pathway_code, pathway: p?.name || "", sub: (p?.subs.find(s => s.code === r.entry.sub_code) || {}).name || "", size: r.entry.size_text || "", medium: r.entry.medium || "",
      glass: !!r.glass_framing, framed: !!r.framed, state: r.state, where: r.loc?.label || r.location || "", locSort: r.loc?.sort ?? 1e9,
      vendor: r.framing_vendor, sent_on: r.framing_sent_on, due: r.framing_due, back_on: r.framing_back_on, damaged: !!r.damaged, condition: r.condition,
      selected: !!(x?.complete && x.passed), scored: !!x?.complete, final: x?.final ?? null,
      thumb: c ? fileView(c).thumb : null, coverId: c ? (c.preview_drive_id && c.kind !== "video" ? c.preview_drive_id : c.drive_id) : null
    };
  });
}
// small JPEG/PNG of the artwork for the Excel checklist (Drive thumbnails); null when there is none
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8k5n1HwAFagJ+7kpJwwAAAABJRU5ErkJggg==", "base64");
export async function coverImage(row) {
  if (!row.coverId) return null;
  if (driveMock()) return { buffer: PNG_1PX, extension: "png" };
  try { const r = await thumbnail(row.coverId, 220); if (!r) return null; const t = r.headers.get("content-type") || ""; const ext = /png/.test(t) ? "png" : /jpe?g/.test(t) ? "jpeg" : /gif/.test(t) ? "gif" : null; if (!ext) return null; return { buffer: Buffer.from(await r.arrayBuffer()), extension: ext }; }
  catch { return null; }
}
