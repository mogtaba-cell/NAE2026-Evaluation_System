import { route, bad } from "@/lib/api";
import { db, q } from "@/lib/db";
import { thumbnail, downloadFile } from "@/lib/drive";
import { readMockPhoto } from "@/lib/photography";
export const maxDuration = 30;

// A professional photo of an artwork from the Shared Drive (only files the photo scan linked to an artwork).
// ?id=<drive file id>&s=<size>: a preview of that size; without s: the original file.
export const GET = route(["admin", "storage", "management", "leadership", "coordinator", "proofreader", "reviewer"], async ({ url }) => {
  const id = url.searchParams.get("id") || "";
  const f = await q(db().from("nae_photo_files").select("drive_id, name, mime").eq("drive_id", id).maybeSingle());
  if (!f) throw bad("Photo not found.");
  const head = (t, extra = {}) => ({ "content-type": t || "image/jpeg", "cache-control": "private, max-age=3600", ...extra });
  if (id.startsWith("mock:")) return new Response(readMockPhoto(id), { headers: head(f.mime) });
  const s = parseInt(url.searchParams.get("s"));
  if (s) { const r = await thumbnail(id, Math.min(3200, s)); if (r) return new Response(r.body, { headers: head(r.headers.get("content-type")) }); }
  const buf = await downloadFile(id);
  return new Response(buf, { headers: head(f.mime, { "content-disposition": `inline; filename="${encodeURIComponent(f.name)}"` }) });
});
