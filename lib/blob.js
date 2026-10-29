import { db } from "@/lib/db";
import fs from "fs/promises";
import path from "path";

// Private files (collection photos, Emirates ID photos). Stored in the private Supabase Storage bucket "nae-private",
// which only the server can read; the site streams them to signed-in staff after checking their role.
// NAE_BLOB_DIR (local testing only) keeps them on disk instead.
const BUCKET = "nae-private";
const local = () => process.env.NAE_BLOB_DIR;
export async function putBlob(key, buf, mime) {
  if (local()) { const p = path.join(local(), key); await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, buf); return key; }
  const { error } = await db().storage.from(BUCKET).upload(key, buf, { contentType: mime, upsert: false });
  if (error) throw new Error(`Could not store the photo: ${error.message}`);
  return key;
}
export async function getBlob(key) {
  if (local()) return fs.readFile(path.join(local(), key));
  const { data, error } = await db().storage.from(BUCKET).download(key);
  if (error) throw new Error("Photo not found.");
  return Buffer.from(await data.arrayBuffer());
}
export async function delBlob(key) {
  if (local()) { await fs.rm(path.join(local(), key), { force: true }); return; }
  await db().storage.from(BUCKET).remove([key]);
}
