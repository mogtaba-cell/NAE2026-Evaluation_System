import { route, bad, forbidden } from "@/lib/api";
import { db, q } from "@/lib/db";
import { storeUpload, readPhoto } from "@/lib/photostore";
import { audit } from "@/lib/audit";
import { mySessionEntryIds } from "@/lib/perms";

// A file with the production details of an artwork (drawing, PDF, photo). POST: the raw file is the body
// (headers x-code: artwork code, x-name: file name). GET ?code=: download it. Filed in 06 Uploads / Handling / Production.
const MAX = 10 * 1024 * 1024;
async function load(session, code) {
  const e = await q(db().from("nae_entries").select("id, code, coordinator_id").eq("code", code || "").maybeSingle()); if (!e) throw bad("Artwork not found.");
  if (session.role === "coordinator" && e.coordinator_id !== session.sub && !(await mySessionEntryIds(session)).includes(e.id)) throw forbidden("This artwork is not yours.");
  const h = await q(db().from("nae_handling").select("*").eq("entry_id", e.id).maybeSingle()); if (!h) throw bad("This artwork has no handling record.");
  return { e, h };
}
export const POST = route(["admin", "management", "coordinator"], async ({ session, request }) => {
  const { e, h } = await load(session, request.headers.get("x-code"));
  if (h.track !== "production") throw bad("Files are for production.");
  if (["sent", "back"].includes(h.status)) throw bad("Already sent to production.");
  const name = decodeURIComponent(request.headers.get("x-name") || "details").replace(/[\\/]/g, " ").slice(0, 120);
  const mime = request.headers.get("content-type") || "application/octet-stream";
  const buf = Buffer.from(await request.arrayBuffer());
  if (!buf.length) throw bad("The file is empty."); if (buf.length > MAX) throw bad("The file is too large (over 10 MB).");
  const path = await storeUpload({ segments: ["Handling", "Production", e.code], name, buf, mime, key: `handling/${e.code}/${crypto.randomUUID()}` });
  const details = { ...(h.details || {}), file_path: path, file_name: name, file_mime: mime };
  await q(db().from("nae_handling").update({ details, status: "draft", approved_by: null, approved_at: null, updated_by: session.name, updated_at: new Date().toISOString() }).eq("entry_id", e.id));
  await audit(session, `Production file added: ${name}`, "entry", e.id);
  return { ok: true, note: "File added.", file_name: name };
});
export const GET = route(["admin", "management", "coordinator", "storage", "leadership"], async ({ session, url }) => {
  const { h } = await load(session, url.searchParams.get("code"));
  if (!h.details?.file_path) throw bad("No file.");
  const buf = await readPhoto(h.details.file_path);
  return new Response(buf, { headers: { "content-type": h.details.file_mime || "application/octet-stream", "content-disposition": `inline; filename="${encodeURIComponent(h.details.file_name || "file")}"`, "cache-control": "private, max-age=60" } });
});
