import { route } from "@/lib/api";
import { db, qc } from "@/lib/db";
export const GET = route(["admin"], async ({ url }) => {
  const role = url.searchParams.get("role"); const page = Math.max(0, parseInt(url.searchParams.get("page")) || 0); const per = 30;
  const term = String(url.searchParams.get("q") || "").replace(/[%,()]/g, " ").trim();
  let qy = db().from("nae_audit").select("*", { count: "exact" }).order("at", { ascending: false });
  if (role) qy = qy.eq("actor_role", role);
  if (term) qy = qy.or(`action.ilike.%${term}%,detail.ilike.%${term}%,actor_name.ilike.%${term}%`);
  const { data, count } = await qc(qy.range(page * per, page * per + per - 1));
  const ids = [...new Set(data.filter(x => x.object_type === "entry").map(x => x.object_id))];
  const ents = ids.length ? (await qc(db().from("nae_entries").select("id, code").in("id", ids))).data : [];
  return { rows: data.map(x => ({ ...x, entry_code: ents.find(e => e.id === x.object_id)?.code || null })), count, page, per };
});
