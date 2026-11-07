import { db, q, all, inChunks } from "@/lib/db";
import { driveMock } from "@/lib/drive";
import { entryFiles } from "@/lib/files";
import { fileView } from "@/lib/entryview";

// Selected artworks (passed Round 2) that are physical: professional photography (in batches) and the exhibition
// (which section and wall each one hangs on). Each row carries a photo to recognise the artwork by.
export async function loadSelected(S, has) {
  const res = await all(() => db().from("nae_results").select("entry_id").eq("round_no", 2).eq("complete", true).eq("passed", true));
  const ids = res.map(r => r.entry_id); if (!ids.length) return [];
  const rows = (await inChunks(ids, part => q(db().from("nae_logistics").select("entry_id, state, location, damaged, framed, needs_framing, photo_batch, photo_sent_at, photo_sent_by, photo_done_at, photo_done_by, exhibit_wall_id, exhibit_at, exhibit_by, exhibit_batch, exhibit_sent_at, exhibit_sent_by, loc:nae_locations(label, room, shelf, sort), entry:nae_entries(id, code, title_en, title_ar, group_name, pathway_code, sub_code, size_text, medium, pod, school:nae_schools(name, esis))").in("entry_id", part))))
    .filter(r => r.entry && has(r.entry.pathway_code));
  if (!rows.length) return [];
  let files = [];
  if (driveMock()) files = (await Promise.all(rows.map(r => entryFiles(r.entry).catch(() => [])))).flat();
  else files = await inChunks(rows.map(r => r.entry_id), part => q(db().from("nae_entry_files").select("entry_id, drive_id, name, kind, mime, size_bytes, path, preview_drive_id").in("entry_id", part).in("kind", ["image", "heic", "video"]).order("name")));
  const rank = f => ({ image: 0, heic: 1, video: 2 })[f.kind] ?? 3;
  const cover = {}; files.filter(f => ["image", "heic", "video"].includes(f.kind)).sort((a, b) => rank(a) - rank(b)).forEach(f => { if (!cover[f.entry_id]) cover[f.entry_id] = f; });
  return rows.map(r => {
    const p = S.P[r.entry.pathway_code]; const c = cover[r.entry_id];
    return {
      code: r.entry.code, title: r.entry.title_en || r.entry.title_ar || r.entry.group_name || "", school: r.entry.school?.name || "", esis: r.entry.school?.esis || "",
      pathway_code: r.entry.pathway_code, pathway: p?.name || "", sub: (p?.subs.find(s => s.code === r.entry.sub_code) || {}).name || "", size: r.entry.size_text || "", medium: r.entry.medium || "", pod: !!r.entry.pod,
      state: r.state, where: r.loc?.label || r.location || "", locSort: r.loc?.sort ?? 1e9, damaged: !!r.damaged, framed: !!r.framed, needs_framing: !!r.needs_framing,
      photo: { batch: r.photo_batch, sent_at: r.photo_sent_at, sent_by: r.photo_sent_by, done_at: r.photo_done_at, done_by: r.photo_done_by },
      wall_id: r.exhibit_wall_id, exhibit_at: r.exhibit_at, exhibit_by: r.exhibit_by, sent: { batch: r.exhibit_batch, at: r.exhibit_sent_at, by: r.exhibit_sent_by }, room: r.loc?.room || null, shelf: r.loc?.shelf || null,
      thumb: c ? fileView(c).thumb : null
    };
  });
}
export async function loadWalls() {
  const [secs, walls] = await Promise.all([q(db().from("nae_exhibit_sections").select("*").order("sort").order("name")), q(db().from("nae_exhibit_walls").select("*").order("sort").order("name"))]);
  return secs.map(s => ({ ...s, walls: walls.filter(w => w.section_id === s.id) }));
}
