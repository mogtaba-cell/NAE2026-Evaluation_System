import { route, body, bad, forbidden } from "@/lib/api";
import { db, q, all, inChunks } from "@/lib/db";
import { audit } from "@/lib/audit";
import { loadStructure, ENTRY_COLS } from "@/lib/structure";
import { mySessionEntryIds } from "@/lib/perms";
import { assignEntries, recompute } from "@/lib/scoring";
import { saveFraming } from "@/lib/sessions";

export const GET = route(["admin", "coordinator", "storage", "management", "leadership"], async ({ session }) => {
  const S = await loadStructure();
  let rows = await all(() => db().from("nae_logistics").select("*, loc:nae_locations(id, room, shelf), entry:nae_entries(id, code, title_en, group_name, pathway_code, sub_code, coordinator_id, size_text, status, current_round, physical_override, school:nae_schools(id, name, esis)), collection:nae_collections(id, code, scheduled_on, status)"));
  if (session.role === "coordinator") { const mine = new Set(await mySessionEntryIds(session)); rows = rows.filter(r => r.entry?.coordinator_id === session.sub || mine.has(r.entry_id)); }
  rows = rows.filter(r => r.entry);
  const res = await inChunks(rows.map(r => r.entry_id), ids => q(db().from("nae_results").select("entry_id, complete, passed, grade, final, locked").eq("round_no", 2).in("entry_id", ids)));
  const sess = await inChunks(rows.map(r => r.entry_id), ids => q(db().from("nae_session_entries").select("entry_id, session:nae_sessions(id, title, session_date, status, venue, created_at)").in("entry_id", ids)));
  const sessionOf = id => sess.filter(s => s.entry_id === id && s.session && s.session.status !== "cancelled").map(s => s.session).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] || null;
  return {
    rows: rows.map(r => {
      const x = res.find(y => y.entry_id === r.entry_id);
      return { ...r, where: r.loc ? `${r.loc.room} · ${r.loc.shelf}` : r.location || null, scored: !!x?.complete, r2: x ? { passed: x.passed, grade: x.grade, final: x.final, locked: x.locked } : null, shortlisted: !!(x?.complete && x.passed && x.grade === "A"), sub: (S.P[r.entry.pathway_code]?.subs.find(s => s.code === r.entry.sub_code) || {}).name, pathway: S.P[r.entry.pathway_code]?.name, session: sessionOf(r.entry_id) };
    })
  };
});

const MANUAL = { returned: ["storage"], framer: ["storage"], storage: ["framer", "returned", "missing"], missing: ["storage"] };
export const POST = route(["admin", "storage", "coordinator"], async ({ session, request }) => {
  const b = await body(request);
  const staff = session.role === "admin" || session.role === "storage";

  if (b.action === "create_collections") {
    if (!staff) throw forbidden();
    const rows = await all(() => db().from("nae_logistics").select("entry_id, entry:nae_entries(pathway_code, sub_code, school_id, school:nae_schools(esis))").eq("state", "to_collect").is("collection_id", null));
    const groups = {};
    rows.forEach(r => { const k = [r.entry.school_id, r.entry.pathway_code, r.entry.sub_code].join("|"); (groups[k] = groups[k] || { school_id: r.entry.school_id, esis: r.entry.school?.esis || "NA", pathway: r.entry.pathway_code, sub: r.entry.sub_code, ids: [] }).ids.push(r.entry_id); });
    let n = 0;
    for (const g of Object.values(groups)) {
      const code = `CB-${g.pathway}-${g.sub}-${g.esis}-${Date.now().toString(36).slice(-4)}${n}`;
      const c = await q(db().from("nae_collections").insert({ code, school_id: g.school_id, pathway_code: g.pathway, sub_code: g.sub, scheduled_on: b.scheduled_on || null }).select("id").single());
      await q(db().from("nae_logistics").update({ collection_id: c.id }).in("entry_id", g.ids)); n++;
    }
    await audit(session, `Created ${n} collections`, "logistics", null, `${rows.length} artworks`);
    return { ok: true, note: `${n} collection${n === 1 ? "" : "s"} created, one per school and subpathway.` };
  }

  const e = await q(db().from("nae_entries").select(ENTRY_COLS).eq("code", b.entry_code).maybeSingle()); if (!e) throw bad("Entry not found.");
  const lg = await q(db().from("nae_logistics").select("*").eq("entry_id", e.id).maybeSingle());
  if (!lg) throw bad("This entry has no artwork record (it isn't physical).");
  const S = await loadStructure();

  if (b.action === "framing") {
    if (!staff) { const mine = new Set(await mySessionEntryIds(session)); if (!mine.has(e.id)) throw forbidden(); }
    await saveFraming(e.id, { needs: b.needs, glass: b.glass });
    await audit(session, `Framing: ${b.needs ? (b.glass ? "needs framing with protective glass" : "needs framing") : "no framing"}`, "entry", e.id);
    return { ok: true };
  }
  if (!staff) throw forbidden("Only the storage team and admins can change artwork records.");

  if (b.action === "move") {
    const l = await q(db().from("nae_locations").select("id, room, shelf, active").eq("id", b.location_id).maybeSingle());
    if (!l || !l.active) throw bad("Pick an active storage location.");
    await q(db().from("nae_logistics").update({ location_id: l.id, location: `${l.room} · ${l.shelf}`, updated_at: new Date().toISOString() }).eq("entry_id", e.id));
    await audit(session, `Moved to ${l.room} · ${l.shelf}`, "entry", e.id);
    return { ok: true };
  }
  if (b.action === "damage") {
    await q(db().from("nae_logistics").update({ damaged: !!b.damaged, condition: String(b.condition || "").trim() || (b.damaged ? "Damaged" : "Good"), updated_at: new Date().toISOString() }).eq("entry_id", e.id));
    await audit(session, b.damaged ? "Marked damaged" : "Marked not damaged", "entry", e.id, b.condition || "");
    return { ok: true };
  }
  if (b.action === "set_state") {
    const allowed = MANUAL[b.state]; if (!allowed) throw bad("That change can't be made by hand.");
    if (!allowed.includes(lg.state)) throw bad(`An artwork that is "${lg.state}" can't be moved to "${b.state}".`);
    if (b.state === "framer" && !lg.needs_framing) throw bad("This artwork isn't marked as needing framing.");
    const patch = { state: b.state, updated_at: new Date().toISOString() };
    if (b.state === "storage" && b.location_id) { const l = await q(db().from("nae_locations").select("id, room, shelf").eq("id", b.location_id).single()); patch.location_id = l.id; patch.location = `${l.room} · ${l.shelf}`; }
    if (b.state === "storage" && lg.state === "missing") patch.missing_outcome = null;
    await q(db().from("nae_logistics").update(patch).eq("entry_id", e.id));
    await audit(session, `Artwork: ${lg.state} → ${b.state}`, "entry", e.id, b.note || "");
    return { ok: true };
  }
  if (b.action === "missing_outcome") {
    if (lg.state !== "missing") throw bad("This artwork isn't marked missing.");
    const reason = String(b.reason || "").trim();
    if (b.outcome !== "collect_later" && session.role !== "admin") throw forbidden("Only an admin can choose that.");
    if (b.outcome !== "collect_later" && !reason) throw bad("Give a reason.");
    if (b.outcome === "collect_later") {
      await q(db().from("nae_logistics").update({ state: "to_collect", collection_id: null, missing_outcome: "collect_later", updated_at: new Date().toISOString() }).eq("entry_id", e.id));
      await audit(session, "Missing artwork: collect later", "entry", e.id, reason);
      return { ok: true, note: "Back on the list to collect. It joins the next collection batch for its school." };
    }
    if (b.outcome === "score_online") {
      await q(db().from("nae_logistics").update({ missing_outcome: "score_online", updated_at: new Date().toISOString() }).eq("entry_id", e.id));
      await q(db().from("nae_entries").update({ physical_override: "online" }).eq("id", e.id));
      const r2 = S.P[e.pathway_code]?.rounds?.[2];
      let n = 0;
      if (r2?.status === "open" && e.current_round === 2) n = await assignEntries(S, r2, [{ ...e, physical_override: "online" }]);
      await recompute(e.id, 2, { S, quiet: true });
      await audit(session, "Missing artwork: score from its files online", "entry", e.id, reason);
      return { ok: true, note: n ? `Assigned to ${n} evaluator${n === 1 ? "" : "s"} to score from its files.` : "It will be scored from its files when Round 2 is open." };
    }
    if (b.outcome === "withdrawn") {
      await q(db().from("nae_logistics").update({ missing_outcome: "withdrawn", updated_at: new Date().toISOString() }).eq("entry_id", e.id));
      await q(db().from("nae_entries").update({ status: "withdrawn", updated_at: new Date().toISOString() }).eq("id", e.id));
      await audit(session, "Missing artwork: withdrawn", "entry", e.id, reason);
      return { ok: true, note: "Withdrawn. It won't be scored and is shown as withdrawn in results." };
    }
    throw bad("Unknown choice.");
  }
  throw bad("Unknown action.");
});
