import { route, body, bad, notFound } from "@/lib/api";
import { db, q } from "@/lib/db";
import { audit } from "@/lib/audit";
export const POST = route(["admin"], async ({ session, request }) => {
  const b = await body(request);
  const u = await q(db().from("nae_unmatched_folders").select("*").eq("path_key", b.path_key).maybeSingle());
  if (!u) throw notFound("That folder is no longer in the list.");
  if (b.undo) { await q(db().from("nae_folder_links").delete().eq("path_key", u.path_key)); return { ok: true }; }
  let entry = null;
  if (!b.ignore) { entry = await q(db().from("nae_entries").select("id, code").eq("code", String(b.code || "").trim().toUpperCase()).maybeSingle()); if (!entry) throw bad("No entry has that code."); }
  await q(db().from("nae_folder_links").upsert({ path_key: u.path_key, path: u.path, entry_id: entry?.id || null, ignored: !!b.ignore, linked_by: session.sub, linked_at: new Date().toISOString() }, { onConflict: "path_key" }));
  await q(db().from("nae_unmatched_folders").delete().eq("path_key", u.path_key));
  await audit(session, b.ignore ? "Ignored a folder" : `Linked a folder to ${entry.code}`, "folder", u.path, u.path);
  return { ok: true, note: b.ignore ? "Ignored. It stays in the copy but is not attached." : `Linked to ${entry.code}. Files attach at the next index run.` };
});
