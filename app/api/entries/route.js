import { route, forbidden } from "@/lib/api";
import { db, qc, q } from "@/lib/db";
import { scopeEntries, mySessionEntryIds } from "@/lib/perms";

const SELECT_LIST = "id, code, reference_id, registration_id, title_en, title_ar, group_name, registration_type, students_count, grades_text, pathway_code, sub_code, current_round, status, files_count, coordinator_id, mgmt_viewed_at, mgmt_viewed_how, school:nae_schools!inner(id, name, esis, region, school_type), results:nae_results(round_no, team, final, grade, scored, needed, complete, passed)";
const clean = s => String(s || "").trim().replace(/[%,()]/g, " ").trim();

export const GET = route(["admin", "coordinator", "management", "storage", "leadership"], async ({ session, url }) => {
  const p = Object.fromEntries(url.searchParams);
  const per = Math.min(100, parseInt(p.per) || 25), page = Math.max(0, parseInt(p.page) || 0);
  const term = clean(p.q).toLowerCase();
  let qy = db().from("nae_entries").select(SELECT_LIST, { count: "exact" });
  // coordinators: "My entries" by default; "All entries" (scope=all) is a view-only list of everything
  const allScope = session.role === "coordinator" && p.scope === "all";
  if (!allScope) qy = (await scopeEntries(qy, session)).q;
  if (term) qy = qy.like("search_text", `%${term}%`);
  if (p.pathway) qy = qy.eq("pathway_code", p.pathway);
  if (p.sub) qy = qy.eq("sub_code", p.sub);
  if (p.region) qy = qy.eq("school.region", p.region);
  if (p.type) qy = qy.eq("school.school_type", p.type);
  if (p.school) qy = qy.eq("school_id", p.school);
  if (p.mine === "1") qy = qy.eq("coordinator_id", session.sub);
  if (p.coordinator) qy = qy.eq("coordinator_id", p.coordinator);
  if (p.unallocated === "1") qy = qy.is("coordinator_id", null);
  if (p.nofiles === "1") qy = qy.eq("files_count", 0);
  if (p.reg === "Group") qy = qy.or("registration_type.ilike.group*,group_name.not.is.null");
  if (p.reg === "Individual") qy = qy.is("group_name", null).or("registration_type.is.null,registration_type.not.ilike.group*");
  if (p.mgmt === "yes") qy = qy.not("mgmt_viewed_at", "is", null);
  if (p.mgmt === "no") qy = qy.is("mgmt_viewed_at", null);
  if (p.status) { const [r, s] = p.status.split(":"); qy = qy.eq("current_round", Number(r)).eq("status", s); }
  qy = qy.order(p.sort === "recent" ? "updated_at" : "code", { ascending: p.sort !== "recent" }).range(page * per, page * per + per - 1);
  const { data, count } = await qc(qy);
  const counts = await q(db().rpc("nae_status_counts", { p_q: term || null, p_pathway: p.pathway || null, p_sub: p.sub || null, p_region: p.region || null, p_type: p.type || null, p_coord: p.mine === "1" ? session.sub : (p.coordinator || null), p_scope_coord: session.role === "coordinator" && !allScope ? session.sub : null, p_reg: p.reg || null, p_mgmt: p.mgmt || null, p_nofiles: p.nofiles === "1" ? true : null, p_school: p.school || null, p_unalloc: p.unallocated === "1" ? true : null }));
  // results are shown only for entries the person works on
  const own = session.role === "coordinator" ? new Set([...(await mySessionEntryIds(session))]) : null;
  const hideScores = r => session.role === "storage" || (session.role === "coordinator" && r.coordinator_id !== session.sub && !own.has(r.id));
  const rows = data.map(e => {
    let why = "";
    if (term) {
      const vis = [e.code, e.title_en, e.title_ar, e.group_name, e.school?.name].filter(Boolean).join(" ").toLowerCase();
      if (!vis.includes(term)) why = e.reference_id.toLowerCase().includes(term) ? "referenceId" : (e.registration_id || "").toLowerCase().includes(term) ? "RegistrationId" : e.school?.esis === term ? "school eSIS" : "student name or ESIS";
    }
    return { ...e, why, results: hideScores(e) ? [] : e.results, limited: hideScores(e) };
  });
  return { rows, count, page, per, counts };
});
