import { route, bad } from "@/lib/api";
import { db, q } from "@/lib/db";
import { storeUpload, readPhoto } from "@/lib/photostore";
import { kindOf } from "@/lib/drive";
import { canWork, log, hideReplaced } from "@/lib/corrections";

// The corrected artwork file the school sent the coordinator. POST: the raw file is the body (x-id: correction,
// x-name: file name). It is filed in 06 Uploads / Corrections / <eSIS> <School> / <artwork code> and added to the
// artwork's files. GET ?log=<log entry id>: download it.
const MAX = 50 * 1024 * 1024;
export const POST = route(["admin", "management", "coordinator"], async ({ session, request }) => {
  const c = await q(db().from("nae_corrections").select("*").eq("id", request.headers.get("x-id") || "").maybeSingle()); if (!c) throw bad("Correction not found.");
  canWork(session, c); if (c.status !== "open") throw bad("This correction is closed.");
  const e = await q(db().from("nae_entries").select("id, code, source_path, school:nae_schools(name, esis)").eq("id", c.entry_id).single());
  const name = decodeURIComponent(request.headers.get("x-name") || "artwork").replace(/[\\/]/g, " ").slice(0, 120);
  const mime = request.headers.get("content-type") || "application/octet-stream";
  const buf = Buffer.from(await request.arrayBuffer());
  if (!buf.length) throw bad("The file is empty."); if (buf.length > MAX) throw bad("The file is too large (over 50 MB).");
  const path = await storeUpload({ segments: ["Corrections", `${e.school?.esis || "No eSIS"} ${e.school?.name || "Unknown school"}`, e.code], name, buf, mime, key: `corrections/${c.id}/${crypto.randomUUID()}` });
  // a file in the Shared Drive becomes one of the artwork's files (shown to evaluators, proofreaders and reviewers)
  if (path.startsWith("drive:")) await q(db().from("nae_entry_files").upsert({ entry_id: e.id, drive_id: path.slice(6), name: `Corrected · ${name}`, mime, size_bytes: buf.length, kind: kindOf(name, mime), path: e.source_path ? `${e.source_path}/Corrections` : "Corrections", match_method: "correction", synced_at: new Date().toISOString() }, { onConflict: "drive_id" }));
  await log(session, c.id, "file", "Corrected file from the school added", { file_path: path, file_name: name });
  // artwork mismatch: the wrong artwork's files are hidden from evaluators now the correct image is in
  const hid = path.startsWith("drive:") ? await hideReplaced(session, c, [path.slice(6)]) : 0;
  return { ok: true, note: path.startsWith("drive:") ? `File added to the artwork.${hid ? ` ${hid} earlier file${hid === 1 ? " is" : "s are"} now hidden from evaluators.` : ""}` : "File saved with the correction (Google Drive wasn't reachable, so it isn't among the artwork's files yet)." };
});
export const GET = route(["admin", "management", "coordinator", "leadership"], async ({ session, url }) => {
  const l = await q(db().from("nae_correction_log").select("*, correction:nae_corrections(*)").eq("id", url.searchParams.get("log") || "").maybeSingle());
  if (!l?.file_path) throw bad("File not found.");
  if (session.role === "coordinator") canWork(session, l.correction);
  const buf = await readPhoto(l.file_path);
  return new Response(buf, { headers: { "content-type": "application/octet-stream", "content-disposition": `attachment; filename="${encodeURIComponent(l.file_name || "file")}"`, "cache-control": "private, no-store" } });
});
