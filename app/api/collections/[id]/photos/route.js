import { route, bad, forbidden } from "@/lib/api";
import { db, q } from "@/lib/db";
import { putBlob } from "@/lib/blob";
import { audit } from "@/lib/audit";
import { canWork } from "@/lib/collections";

// Upload one photo for a collection: the raw image is the request body (the phone shrinks it first).
// Headers: x-kind = item | eid | other, x-entry = artwork code (for item photos).
const MAX = 3 * 1024 * 1024;
export const POST = route(["admin", "storage", "coordinator"], async ({ session, params, request }) => {
  const c = await q(db().from("nae_collections").select("id, code").eq("id", params.id).maybeSingle()); if (!c) throw bad("Collection not found.");
  await canWork(session, c.id);
  const mime = request.headers.get("content-type") || "";
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) throw bad("Send a JPG, PNG or WebP photo.");
  const kind = ["item", "eid", "other"].includes(request.headers.get("x-kind")) ? request.headers.get("x-kind") : "item";
  const buf = Buffer.from(await request.arrayBuffer());
  if (!buf.length) throw bad("The photo is empty.");
  if (buf.length > MAX) throw bad("The photo is too large (over 3 MB). Try again; the app shrinks photos before sending.");
  let entryId = null; const code = request.headers.get("x-entry");
  if (code) { const e = await q(db().from("nae_entries").select("id").eq("code", code).maybeSingle()); const l = e ? await q(db().from("nae_logistics").select("collection_id").eq("entry_id", e.id).maybeSingle()) : null; if (!l || l.collection_id !== c.id) throw bad("That artwork is not in this collection."); entryId = e.id; }
  const id = crypto.randomUUID(); const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const key = `collections/${c.id}/${kind}-${id}.${ext}`;
  await putBlob(key, buf, mime);
  const row = await q(db().from("nae_collection_photos").insert({ id, collection_id: c.id, entry_id: entryId, kind, path: key, mime, size: buf.length, taken_by: session.sub, taken_by_name: session.name }).select("id, kind, entry_id, at").single());
  if (kind === "eid") await audit(session, "Emirates ID photo added", "collection", c.id, c.code);
  return { ok: true, photo: { ...row, url: `/api/collections/photos/${row.id}` } };
});
