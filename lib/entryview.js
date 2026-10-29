import { db, q } from "@/lib/db";
import { notFound } from "@/lib/api";
import { assertSeeEntry } from "@/lib/perms";

export function fileView(f) {
  const id = encodeURIComponent(f.drive_id);
  const pv = f.preview_drive_id ? encodeURIComponent(f.preview_drive_id) : null;
  return { id: f.drive_id, name: f.name, kind: f.kind, mime: f.mime, size: f.size_bytes, path: f.path, url: `/api/files/${pv || id}`, original: `/api/files/${id}?download=1`, thumb: ["image", "heic", "video"].includes(f.kind) ? `/api/files/${id}/thumb` : null, preview: !!pv, previewMime: f.preview_mime };
}
export async function loadEntry(code, session) {
  const e = await q(db().from("nae_entries").select("*, school:nae_schools(id, name, esis, region, school_type)").eq("code", code).maybeSingle());
  if (!e) throw notFound("Artwork not found.");
  await assertSeeEntry(session, e);
  return e;
}

