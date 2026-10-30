import { route, body, bad, notFound } from "@/lib/api";
import { db, q } from "@/lib/db";
import { audit } from "@/lib/audit";
import { normSeg } from "@/lib/files";
export const POST = route(["admin"], async ({ session, request }) => {
  const b = await body(request);
  // a whole library (for example one that is not part of this program): ignore every folder in it, or undo that
  if (b.library) {
    const key = normSeg(b.library); if (!key) throw bad("Pick a library.");
    if (b.undo) { await q(db().from("nae_folder_links").delete().eq("path_key", key)); await audit(session, `Stopped ignoring library ${b.library}`, "folder", key, b.library); return { ok: true, note: `${b.library} is checked again at the next index run.` }; }
    await q(db().from("nae_folder_links").upsert({ path_key: key, path: b.library, entry_id: null, ignored: true, linked_by: session.sub, linked_at: new Date().toISOString() }, { onConflict: "path_key" }));
    await q(db().from("nae_unmatched_folders").delete().or(`path_key.eq.${key},path_key.like.${key}/*`));
    await audit(session, `Ignored library ${b.library}`, "folder", key, b.library);
    return { ok: true, note: `Ignored every folder in ${b.library}. Its files stay in the copy but are not attached to artworks.` };
  }
  const u = await q(db().from("nae_unmatched_folders").select("*").eq("path_key", b.path_key).maybeSingle());
  if (!u) throw notFound("That folder is no longer in the list.");
  if (b.undo) { await q(db().from("nae_folder_links").delete().eq("path_key", u.path_key)); return { ok: true }; }
  let entry = null;
  if (!b.ignore) { entry = await q(db().from("nae_entries").select("id, code").eq("code", String(b.code || "").trim().toUpperCase()).maybeSingle()); if (!entry) throw bad("No artwork has that code."); }
  await q(db().from("nae_folder_links").upsert({ path_key: u.path_key, path: u.path, entry_id: entry?.id || null, ignored: !!b.ignore, linked_by: session.sub, linked_at: new Date().toISOString() }, { onConflict: "path_key" }));
  await q(db().from("nae_unmatched_folders").delete().eq("path_key", u.path_key));
  await audit(session, b.ignore ? "Ignored a folder" : `Linked a folder to ${entry.code}`, "folder", u.path, u.path);
  return { ok: true, note: b.ignore ? "Ignored. It stays in the copy but is not attached." : `Linked to ${entry.code}. Files attach at the next index run.` };
});
