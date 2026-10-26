import { route } from "@/lib/api";
import { driveGet, driveJson, driveMock } from "@/lib/drive";
import { audit } from "@/lib/audit";
import { fileAccess, mockSvg } from "@/lib/fileaccess";
import { promises as fs } from "fs";

export const maxDuration = 60;
// Vercel Functions can't send more than 4.5 MB in one response, so files are always served in pieces of
// at most 4 MB. Video and audio players ask for pieces by themselves; the site's viewer and download button
// fetch large files piece by piece too.
const CHUNK = 4 * 1000 * 1000;

function plan(rangeHeader, size) {
  let start = 0, end = size - 1, partial = false;
  const m = String(rangeHeader || "").match(/bytes=(\d*)-(\d*)/);
  if (m && (m[1] !== "" || m[2] !== "")) {
    partial = true;
    if (m[1] === "") start = Math.max(0, size - Number(m[2]));
    else { start = Number(m[1]); if (m[2] !== "") end = Math.min(Number(m[2]), size - 1); }
  }
  if (start >= size && size > 0) return { bad: true };
  if (end - start + 1 > CHUNK) { end = start + CHUNK - 1; partial = true; }
  return { start, end, partial };
}
function respond({ body, size, p, type, name, download }) {
  const h = new Headers({ "content-type": type || "application/octet-stream", "accept-ranges": "bytes", "cache-control": "private, max-age=600", "content-length": String(p.end - p.start + 1) });
  if (p.partial) h.set("content-range", `bytes ${p.start}-${p.end}/${size}`);
  if (download) h.set("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  return new Response(body, { status: p.partial ? 206 : 200, headers: h });
}

export const GET = route("*", async ({ session, params, request, url }) => {
  const id = decodeURIComponent(params.id);
  const a = await fileAccess(session, id);
  const download = url.searchParams.get("download") === "1";
  const range = request.headers.get("range");

  if (a.mock) {
    if (a.kind === "image") return new Response(mockSvg(a.entry, a.i, a.entry.code), { headers: { "content-type": "image/svg+xml", "cache-control": "private, max-age=3600" } });
    if (a.kind === "pdf") { const pdf = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj 4 0 obj<</Length 60>>stream\nBT /F1 24 Tf 72 760 Td (Test document for this entry) Tj ET\nendstream endobj 5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"; return new Response(pdf, { headers: { "content-type": "application/pdf" } }); }
    // Local testing only: MOCK_VIDEO points to a video file on the test machine.
    const file = process.env.MOCK_VIDEO; if (!file) return new Response("Test mode has no video files.", { status: 404 });
    const buf = await fs.readFile(file); const p = plan(range, buf.length);
    if (p.bad) return new Response(null, { status: 416, headers: { "content-range": `bytes */${buf.length}` } });
    if (download && p.start === 0) await audit(session, "Downloaded original", "entry", a.entry.id, "Performance (test file)");
    return respond({ body: buf.subarray(p.start, p.end + 1), size: buf.length, p, type: file.endsWith(".webm") ? "video/webm" : "video/mp4", name: "Performance" + (file.endsWith(".webm") ? ".webm" : ".mp4"), download });
  }

  // size and type: from the index when known, otherwise from Drive (previews are not in the index)
  let size = Number(a.isPreview ? 0 : a.file.size_bytes || 0), type = a.isPreview ? a.file.preview_mime : a.file.mime;
  if (!size || !type) { const m = await driveJson(`/files/${a.driveId}`, { fields: "size,mimeType" }); size = Number(m.size || 0); type = type || m.mimeType; }
  if (!size) return new Response("This file is empty or still uploading.", { status: 404 });
  const p = plan(range, size);
  if (p.bad) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  const r = await driveGet(`/files/${a.driveId}`, { alt: "media" }, { headers: { range: `bytes=${p.start}-${p.end}` } });
  if (!r.ok && r.status !== 206) return new Response("Could not load the file from Google Drive.", { status: r.status === 404 ? 404 : 502 });
  if (download && p.start === 0) await audit(session, "Downloaded original", "entry", a.entry.id, a.file.name);
  const name = a.isPreview ? a.file.name.replace(/(\.[^.]+)?$/, "") + "." + (type || "").split("/").pop() : a.file.name;
  return respond({ body: r.body, size, p, type, name, download });
});
