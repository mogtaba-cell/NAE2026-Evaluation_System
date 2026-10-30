import { route, body, bad } from "@/lib/api";
import { db, q, qc } from "@/lib/db";
import { indexStep } from "@/lib/files";
import { driveConfigured, driveMock, driveCheck, driveSettings } from "@/lib/drive";
import { normSeg } from "@/lib/files";
import { audit } from "@/lib/audit";
export const maxDuration = 60;

const KINDS = ["image", "heic", "video", "audio", "pdf", "doc", "other"];
const head = () => ({ count: "exact", head: true });
export const GET = route(["admin"], async ({ url }) => {
  // unmatched folders: search and filter on the server, show up to 500 at a time
  const uq = String(url.searchParams.get("uq") || "").trim().replace(/[%,()*]/g, " ").trim(), why = url.searchParams.get("why") || "";
  let um = db().from("nae_unmatched_folders").select("*, suggested:nae_entries(code, group_name, title_en)", { count: "exact" });
  if (uq) um = um.ilike("path", `%${uq}%`);
  if (why === "school") um = um.like("reason", "School code%");
  if (why === "folder") um = um.eq("reason", "No artwork has this folder");
  if (why === "outside") um = um.eq("reason", "File outside an artwork folder");
  const [check, runs, unmatched, unmatchedAll, noFiles, withFiles, files, previews, ...kindCounts] = await Promise.all([
    driveConfigured() ? driveCheck() : Promise.resolve(null),
    q(db().from("nae_sync_runs").select("*").eq("kind", "index").order("started_at", { ascending: false }).limit(10)),
    qc(um.order("path").limit(500)),
    qc(db().from("nae_unmatched_folders").select("path_key", head())),
    qc(db().from("nae_entries").select("code, title_en, group_name, pathway_code, sub_code, status, current_round, coordinator_id, school:nae_schools(name)", { count: "exact" }).eq("files_count", 0).order("code").limit(200)),
    qc(db().from("nae_entries").select("id", head()).gt("files_count", 0)),
    qc(db().from("nae_entry_files").select("id", head())),
    qc(db().from("nae_entry_files").select("id", head()).not("preview_drive_id", "is", null)),
    ...KINDS.map(k => qc(db().from("nae_entry_files").select("id", head()).eq("kind", k)))
  ]);
  // libraries (top-level folders of 01 Submissions) with their unmatched folders, and the ones set to be ignored
  let libraries = [];
  if (driveConfigured() && !driveMock()) {
    const s = await driveSettings();
    const [libs, ignored] = await Promise.all([
      q(db().from("nae_drive_items").select("id, name").eq("parent", s.submissions_folder_id || "-").eq("is_folder", true).order("name")),
      q(db().from("nae_folder_links").select("path_key, path").eq("ignored", true).not("path_key", "like", "%/%"))
    ]);
    const counts = await Promise.all(libs.map(l => qc(db().from("nae_unmatched_folders").select("path_key", head()).like("path_key", `${normSeg(l.name)}/%`))));
    libraries = libs.map((l, i) => ({ name: l.name, unmatched: counts[i].count, ignored: ignored.some(x => x.path_key === normSeg(l.name)) }));
  }
  const kinds = Object.fromEntries(KINDS.map((k, i) => [k, kindCounts[i].count]).filter(([, n]) => n));
  return { configured: driveConfigured(), mock: driveMock(), check, runs, unmatched: unmatched.data, unmatchedShown: unmatched.count, unmatchedCount: unmatchedAll.count, noFiles: noFiles.data, noFilesCount: noFiles.count, withFiles: withFiles.count, files: files.count, kinds, previews: previews.count, libraries };
});

export const POST = route(["admin"], async ({ session, request }) => {
  const b = await body(request);
  if (!driveConfigured()) throw bad("Google Drive is not connected yet. Add the service account to the Shared Drive and set GOOGLE_SERVICE_ACCOUNT_JSON.");
  let run;
  if (b.action === "start" || !b.runId) {
    const busy = await q(db().from("nae_sync_runs").select("id").eq("kind", "index").eq("status", "running").gt("started_at", new Date(Date.now() - 5 * 60e3).toISOString()).limit(1));
    if (busy.length) throw bad("An index is already running. Wait for it to finish (or try again in 5 minutes).");
    run = await q(db().from("nae_sync_runs").insert({ kind: "index", started_by: session.sub, state: { phase: "start", full: !!b.full } }).select("*").single());
    await audit(session, b.full ? "Started full file index" : "Started file index", "sync", run.id);
  } else run = await q(db().from("nae_sync_runs").select("*").eq("id", b.runId).single());
  try {
    const res = await indexStep(run);
    const patch = res.done ? { status: "done", finished_at: new Date().toISOString(), summary: { ...(run.summary || {}), ...(res.summary || {}) } } : { state: res.state, summary: { ...(run.summary || {}), ...(res.summary || {}) } };
    run = await q(db().from("nae_sync_runs").update(patch).eq("id", run.id).select("*").single());
    return { run, done: !!res.done };
  } catch (e) {
    await q(db().from("nae_sync_runs").update({ status: "failed", finished_at: new Date().toISOString(), summary: { ...(run.summary || {}), error: e.message } }).eq("id", run.id));
    throw e;
  }
});
