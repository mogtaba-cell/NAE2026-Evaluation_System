import { route } from "@/lib/api";
import { thumbnail } from "@/lib/drive";
import { fileAccess, mockSvg } from "@/lib/fileaccess";
export const maxDuration = 30;
export const GET = route("*", async ({ session, params, url }) => {
  const id = decodeURIComponent(params.id);
  const a = await fileAccess(session, id);
  if (a.mock) return new Response(mockSvg(a.entry, a.i, a.entry.code), { headers: { "content-type": "image/svg+xml", "cache-control": "private, max-age=3600" } });
  const size = Math.min(3200, parseInt(url.searchParams.get("s")) || 1600);
  const r = await thumbnail(a.file.preview_drive_id && a.file.kind !== "video" ? a.file.preview_drive_id : a.driveId, size);
  if (!r) return new Response("No preview image yet.", { status: 404 });
  return new Response(r.body, { headers: { "content-type": r.headers.get("content-type") || "image/jpeg", "cache-control": "private, max-age=3600" } });
});
