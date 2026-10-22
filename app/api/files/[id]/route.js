import { route, notFound, forbidden } from "@/lib/api";
import { db, q } from "@/lib/db";
import { canSeeEntry } from "@/lib/perms";
import { driveGet, driveMock } from "@/lib/drive";
import { audit } from "@/lib/audit";
import { fileAccess, mockSvg } from "@/lib/fileaccess";

export const maxDuration = 60;
const CHUNK = 8 * 1024 * 1024;

export const GET = route("*", async ({ session, params, request, url }) => {
  const id = decodeURIComponent(params.id);
  const a = await fileAccess(session, id);
  const download = url.searchParams.get("download") === "1";
  if (download && session.role !== "admin") throw forbidden("Only admins can download originals.");
  if (a.mock) {
    if (a.kind === "image") return new Response(mockSvg(a.entry, a.i, a.entry.code), { headers: { "content-type": "image/svg+xml", "cache-control": "private, max-age=3600" } });
    if (a.kind === "pdf") { const pdf = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj 4 0 obj<</Length 60>>stream\nBT /F1 24 Tf 72 760 Td (Test document for this entry) Tj ET\nendstream endobj 5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"; return new Response(pdf, { headers: { "content-type": "application/pdf" } }); }
    return new Response("Test mode has no video files.", { status: 404 });
  }
  const headers = {};
  const range = request.headers.get("range");
  const size = Number(a.isPreview ? 0 : a.file.size_bytes || 0);
  const isMedia = ["video", "audio"].includes(a.file.kind) || /^video|^audio/.test(a.file.preview_mime || "");
  if (range) {
    const m = range.match(/bytes=(\d+)-(\d*)/);
    if (m && isMedia) { const start = +m[1]; let end = m[2] ? +m[2] : start + CHUNK - 1; if (end - start + 1 > CHUNK) end = start + CHUNK - 1; headers.range = `bytes=${start}-${end}`; }
    else headers.range = range;
  } else if (isMedia && size > CHUNK) headers.range = `bytes=0-${CHUNK - 1}`;
  const r = await driveGet(`/files/${id}`, { alt: "media" }, { headers });
  if (!r.ok && r.status !== 206) return new Response("Could not load the file from Google Drive.", { status: r.status === 404 ? 404 : 502 });
  const out = new Headers();
  ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"].forEach(h => { const v = r.headers.get(h); if (v) out.set(h, v); });
  out.set("accept-ranges", "bytes"); out.set("cache-control", "private, max-age=600");
  if (download) { out.set("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(a.file.name)}`); await audit(session, "Downloaded original", "entry", a.entry.id, a.file.name); }
  return new Response(r.body, { status: r.status, headers: out });
});
