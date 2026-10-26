import { db, q } from "@/lib/db";
import { notFound, forbidden } from "@/lib/api";
import { canSeeEntry } from "@/lib/perms";
import { driveMock } from "@/lib/drive";

export async function fileAccess(session, id) {
  if (driveMock() && id.startsWith("mock:")) {
    const [, entryId, i, kind] = id.split(":");
    const e = await q(db().from("nae_entries").select("*").eq("id", entryId).maybeSingle());
    if (!e) throw notFound(); if (!(await canSeeEntry(session, e))) throw forbidden();
    return { mock: true, kind, i: +i, entry: e };
  }
  // Drive ids are letters, digits, - and _ only. Anything else is refused before it reaches the database or Drive.
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(id)) throw notFound("File not found.");
  const sel = "*, entry:nae_entries(*)";
  let f = await q(db().from("nae_entry_files").select(sel).eq("drive_id", id).limit(1).maybeSingle());
  let isPreview = false;
  if (!f) { f = await q(db().from("nae_entry_files").select(sel).eq("preview_drive_id", id).limit(1).maybeSingle()); isPreview = !!f; }
  if (!f || !f.entry) throw notFound("File not found.");
  if (!(await canSeeEntry(session, f.entry))) throw forbidden();
  // Always use the id stored in the index, never the one from the link.
  return { file: f, entry: f.entry, isPreview, driveId: isPreview ? f.preview_drive_id : f.drive_id };
}
export function mockSvg(entry, i, label) {
  const hue = ([...entry.reference_id].reduce((a, c) => a + c.charCodeAt(0), 0) * 37 + i * 50) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200"><rect width="1600" height="1200" fill="hsl(${hue},14%,84%)"/><rect x="200" y="150" width="1200" height="900" fill="hsl(${hue},10%,93%)" stroke="rgba(0,0,0,.12)"/><rect x="330" y="280" width="940" height="640" fill="hsl(${hue},22%,58%)"/><text x="40" y="1160" font-family="monospace" font-size="34" fill="rgba(0,0,0,.5)">${label} · test image</text></svg>`;
}

