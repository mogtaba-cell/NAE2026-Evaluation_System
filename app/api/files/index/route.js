import { route, body, bad } from "@/lib/api";
import { db, q, qc } from "@/lib/db";
import { indexStep } from "@/lib/files";
import { driveConfigured, driveMock, driveCheck } from "@/lib/drive";
import { audit } from "@/lib/audit";
export const maxDuration = 60;

export const GET = route(["admin"], async () => {
  const [check, runs, unmatched, noFiles, withFiles, fileCount] = await Promise.all([
    driveConfigured() ? driveCheck() : Promise.resolve(null),
    q(db().from("nae_sync_runs").select("*").order("started_at", { ascending: false }).limit(10)),
    q(db().from("nae_unmatched_folders").select("*, suggested:nae_entries(code, group_name, title_en)").order("path").limit(500)),
    qc(db().from("nae_entries").select("code, title_en, group_name, pathway_code, sub_code, status, current_round, coordinator_id, school:nae_schools(name)", { count: "exact" }).eq("files_count", 0).order("code").limit(200)),
    qc(db().from("nae_entries").select("id", { count: "exact", head: true }).gt("files_count", 0)),
    qc(db().from("nae_entry_files").select("kind", { count: "exact" }).limit(20000))
  ]);
  const kinds = {}; fileCount.data.forEach(f => { kinds[f.kind] = (kinds[f.kind] || 0) + 1; });
  const previews = await qc(db().from("nae_entry_files").select("id", { count: "exact", head: true }).not("preview_drive_id", "is", null));
  return { configured: driveConfigured(), mock: driveMock(), check, runs, unmatched, noFiles: noFiles.data, noFilesCount: noFiles.count, withFiles: withFiles.count, files: fileCount.count, kinds, previews: previews.count };
});

export const POST = route(["admin"], async ({ session, request }) => {
  const b = await body(request);
  if (!driveConfigured()) throw bad("Google Drive is not connected yet. Add the service account to the Shared Drive and set GOOGLE_SERVICE_ACCOUNT_JSON.");
  let run;
  if (b.action === "start" || !b.runId) {
    run = await q(db().from("nae_sync_runs").insert({ kind: "index", started_by: session.sub, state: { phase: "list" } }).select("*").single());
    await audit(session, "Started file index", "sync", run.id);
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
