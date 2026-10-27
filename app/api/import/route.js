import { route, body, bad } from "@/lib/api";
import { db, q } from "@/lib/db";
import { importRows } from "@/lib/importer";
import { audit } from "@/lib/audit";
export const maxDuration = 60;
export const GET = route(["admin"], async () => ({ history: await q(db().from("nae_imports").select("*, by:nae_accounts(display_name)").order("at", { ascending: false }).limit(20)) }));
export const POST = route(["admin"], async ({ session, request, scope }) => {
  const b = await body(request);
  const sc = await scope();
  if (!sc.program) throw bad("Create a program first (Program setup).");
  if (b.finish) {
    const row = await q(db().from("nae_imports").insert({ file_name: b.file_name, rows: b.rows_total, created: b.created, updated: b.updated, errors: b.errors || [], by_id: session.sub }).select("*").single());
    await audit(session, `Imported ${b.file_name} into ${sc.program.name}: ${b.created} new, ${b.updated} updated`, "import", row.id, `${(b.errors || []).length} rows with errors`);
    return { ok: true };
  }
  if (!Array.isArray(b.rows) || !b.rows.length) throw bad("No rows to import.");
  if (b.rows.length > 300) throw bad("Send at most 300 rows at a time.");
  return await importRows(b.rows, session, sc.program);
});
