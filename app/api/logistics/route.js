import { route, body, bad, forbidden } from "@/lib/api";
import { db, q, all, inChunks } from "@/lib/db";
import { audit } from "@/lib/audit";
import { loadStructure, ENTRY_COLS } from "@/lib/structure";
import { mySessionEntryIds } from "@/lib/perms";
import { assignEntries, recompute } from "@/lib/scoring";
import { saveFraming } from "@/lib/sessions";
import { applyMove, logEvents, ACTIONS, STATES } from "@/lib/movements";

// Every physical artwork of the current program, with where it is, its session and its Round 2 result.
// ?entry=CODE returns one artwork's movement history instead.
export const GET = route(["admin", "coordinator", "storage", "management", "leadership"], async ({ session, url, scope }) => {
  const S = await loadStructure();
  const { has } = await scope(S);
  const code = url.searchParams.get("entry");
  if (code) {
    const e = await q(db().from("nae_entries").select("id, code, pathway_code, coordinator_id").eq("code", code).maybeSingle());
    if (!e || !has(e.pathway_code)) throw bad("Artwork not found.");
    const events = await q(db().from("nae_logistics_events").select("*").eq("entry_id", e.id).order("at", { ascending: false }).limit(200));
    return { events };
  }
  let rows = await all(() => db().from("nae_logistics").select("*, loc:nae_locations(id, room, shelf, label, sort), entry:nae_entries(id, code, title_en, group_name, pathway_code, sub_code, coordinator_id, size_text, medium, status, current_round, physical_override, school:nae_schools(id, name, esis)), collection:nae_collections(id, code, scheduled_on, status)"));
  rows = rows.filter(r => r.entry && has(r.entry.pathway_code));
  if (session.role === "coordinator") { const mine = new Set(await mySessionEntryIds(session)); rows = rows.filter(r => r.entry.coordinator_id === session.sub || mine.has(r.entry_id)); }
  const res = await inChunks(rows.map(r => r.entry_id), ids => q(db().from("nae_results").select("entry_id, complete, passed, grade, final, locked").eq("round_no", 2).in("entry_id", ids)));
  const sessIds = [...new Set(rows.map(r => r.session_id).filter(Boolean))];
  const sessions = sessIds.length ? await q(db().from("nae_sessions").select("id, title, session_date, time_text, venue, status, coordinator_id, coordinator:nae_accounts(display_name)").in("id", sessIds)) : [];
  const coords = await q(db().from("nae_accounts").select("id, display_name").eq("role", "coordinator"));
  return {
    states: STATES,
    rows: rows.map(r => {
      const x = res.find(y => y.entry_id === r.entry_id); const s = sessions.find(y => y.id === r.session_id);
      return { ...r, where: r.loc ? `${r.loc.label}` : r.location || null, locSort: r.loc?.sort ?? 9999, scored: !!x?.complete, r2: x ? { passed: x.passed, grade: x.grade, final: x.final, locked: x.locked } : null, selected: !!(x?.complete && x.passed), sub: (S.P[r.entry.pathway_code]?.subs.find(t => t.code === r.entry.sub_code) || {}).name, pathway: S.P[r.entry.pathway_code]?.name, session: s ? { id: s.id, title: s.title, date: s.session_date, time: s.time_text, venue: s.venue, status: s.status, coordinator: s.coordinator?.display_name, coordinator_id: s.coordinator_id, mine: s.coordinator_id === session.sub } : null, coordinator: coords.find(c => c.id === r.entry.coordinator_id)?.display_name || null };
    })
  };
});

export const POST = route(["admin", "storage", "coordinator"], async ({ session, request, scope }) => {
  const b = await body(request);
  const S = await loadStructure();
  const { has } = await scope(S);
  const staff = session.role === "admin" || session.role === "storage";

  // The artworks an action applies to: given codes, or every artwork of a session (optionally in some states).
  async function targets() {
    let ids = [];
    if (Array.isArray(b.codes) && b.codes.length) {
      const es = await inChunks(b.codes, part => q(db().from("nae_entries").select("id, pathway_code").in("code", part)));
      ids = es.filter(e => has(e.pathway_code)).map(e => e.id);
    } else if (b.session_id) {
      const rows = await q(db().from("nae_logistics").select("entry_id").eq("session_id", b.session_id));
      ids = rows.map(r => r.entry_id);
    }
    if (!ids.length) throw bad("Pick at least one artwork.");
    return ids;
  }

  // ---------- movements (batch or selected artworks) ----------
  if (ACTIONS[b.action]) {
    const ids = await targets();
    const coordinatorStep = ["receive", "send_back", "return_room"].includes(b.action);
    const sessCache = {};
    const check = coordinatorStep && session.role === "coordinator" ? async r => {
      if (!r.session_id) return "not in a session";
      if (!(r.session_id in sessCache)) sessCache[r.session_id] = await q(db().from("nae_sessions").select("coordinator_id").eq("id", r.session_id).maybeSingle());
      return sessCache[r.session_id]?.coordinator_id === session.sub ? null : "another coordinator's session";
    } : null;
    let receivedBy = b.received_by;
    if (b.action === "hand_over" && !receivedBy && b.session_id) { const s = await q(db().from("nae_sessions").select("coordinator:nae_accounts(display_name)").eq("id", b.session_id).maybeSingle()); receivedBy = s?.coordinator?.display_name || null; }
    const r = await applyMove(session, b.action, ids, { location_id: b.location_id || null, locations: b.locations || {}, received_by: receivedBy, note: b.note || null, vendor: b.vendor, due: b.due, check, ref_type: b.session_id ? "session" : null, ref_id: b.session_id || null });
    if (r.done.length) await audit(session, `${r.label}: ${r.done.length} artwork${r.done.length === 1 ? "" : "s"}`, b.session_id ? "session" : "logistics", b.session_id || null, r.done.slice(0, 40).join(", "));
    const skipNote = r.skipped.length ? ` ${r.skipped.length} skipped (${[...new Set(r.skipped.map(x => x.why))].join(", ")}).` : "";
    return { ok: true, done: r.done, skipped: r.skipped, note: `${r.label}: ${r.done.length} artwork${r.done.length === 1 ? "" : "s"}.${skipNote}` };
  }

  // ---------- collections: batches for the artworks waiting to be collected ----------
  if (b.action === "create_collections") {
    if (!staff) throw forbidden();
    const rows = (await all(() => db().from("nae_logistics").select("entry_id, entry:nae_entries(code, pathway_code, sub_code, school_id, school:nae_schools(esis))").eq("state", "to_collect").is("collection_id", null))).filter(r => r.entry && has(r.entry.pathway_code));
    const pick = Array.isArray(b.codes) && b.codes.length ? new Set(b.codes) : null;   // specific artworks
    const groups = {};
    rows.filter(r => !pick || pick.has(r.entry.code)).forEach(r => { const k = r.entry.school_id || "none"; (groups[k] = groups[k] || { school_id: r.entry.school_id, esis: r.entry.school?.esis || "NA", ids: [] }).ids.push(r.entry_id); });
    let n = 0, arts = 0;
    for (const g of Object.values(groups)) {
      // one collection per school: the school brings all its physical artworks; each pathway is stored apart at check-in
      const code = `CB-${g.esis}-${Date.now().toString(36).slice(-4)}${n}`;
      const c = await q(db().from("nae_collections").insert({ code, school_id: g.school_id, pathway_code: null, sub_code: null, scheduled_on: b.scheduled_on || null }).select("id").single());
      await q(db().from("nae_logistics").update({ collection_id: c.id, updated_at: new Date().toISOString() }).in("entry_id", g.ids)); n++; arts += g.ids.length;
      await logEvents(session, g.ids.map(id => ({ entry_id: id, action: "Collection scheduled", from_state: "to_collect", to_state: "to_collect", note: `${code}${b.scheduled_on ? ` on ${b.scheduled_on}` : ""}`, ref_type: "collection", ref_id: c.id })));
    }
    await audit(session, `Created ${n} collections`, "logistics", null, `${arts} artworks`);
    return { ok: true, note: `${n} collection${n === 1 ? "" : "s"} created for ${arts} artwork${arts === 1 ? "" : "s"}, one per school.` };
  }

  // ---------- condition and issues (several artworks at once) ----------
  if (b.action === "damage" || b.action === "issue") {
    if (!staff) throw forbidden("Only the storage team and admins can change artwork records.");
    const ids = await targets(); const now = new Date().toISOString();
    const patch = b.action === "damage"
      ? { damaged: !!b.damaged, condition: String(b.condition || "").trim() || (b.damaged ? "Damaged" : "Good"), updated_at: now }
      : { issue: b.issue || null, issue_owner: b.issue_owner || null, issue_status: b.issue ? (b.issue_status || "open") : null, updated_at: now };
    for (let i = 0; i < ids.length; i += 150) await q(db().from("nae_logistics").update(patch).in("entry_id", ids.slice(i, i + 150)));
    const text = b.action === "damage" ? (b.damaged ? `Marked damaged${b.condition ? `: ${b.condition}` : ""}` : "Marked not damaged") : (b.issue ? `Issue: ${b.issue === "needs_school_fix" ? "needs a fix by the school" : "needs an internal fix"}${b.issue_status === "resolved" ? " (resolved)" : ""}` : "Issue cleared");
    await logEvents(session, ids.map(id => ({ entry_id: id, action: text, note: b.note || b.issue_owner || null })));
    await audit(session, `${text} (${ids.length})`, "logistics", null);
    return { ok: true, note: `${text}: ${ids.length} artwork${ids.length === 1 ? "" : "s"}.` };
  }

  // ---------- one artwork ----------
  const e = await q(db().from("nae_entries").select(ENTRY_COLS).eq("code", b.entry_code).maybeSingle()); if (!e || !has(e.pathway_code)) throw bad("Artwork not found.");
  const lg = await q(db().from("nae_logistics").select("*").eq("entry_id", e.id).maybeSingle());
  if (!lg) throw bad("This artwork has no artwork record (it isn't physical).");

  if (b.action === "framing") {
    if (!staff) { const mine = new Set(await mySessionEntryIds(session)); if (!mine.has(e.id)) throw forbidden(); }
    await saveFraming(e.id, { needs: b.needs, glass: b.glass });
    await logEvents(session, [{ entry_id: e.id, action: b.needs ? (b.glass ? "Needs framing with protective glass" : "Needs framing") : "No framing needed" }]);
    await audit(session, `Framing: ${b.needs ? (b.glass ? "needs framing with protective glass" : "needs framing") : "no framing"}`, "entry", e.id);
    return { ok: true };
  }
  if (!staff) throw forbidden("Only the storage team and admins can change artwork records.");
  if (b.action === "missing_outcome") {
    if (lg.state !== "missing") throw bad("This artwork isn't marked missing.");
    const reason = String(b.reason || "").trim();
    if (b.outcome !== "collect_later" && session.role !== "admin") throw forbidden("Only an admin can choose that.");
    if (b.outcome !== "collect_later" && !reason) throw bad("Give a reason.");
    const now = new Date().toISOString();
    if (b.outcome === "collect_later") {
      await q(db().from("nae_logistics").update({ state: "to_collect", collection_id: null, session_id: null, missing_outcome: "collect_later", updated_at: now }).eq("entry_id", e.id));
      await logEvents(session, [{ entry_id: e.id, action: "Missing: collect later", from_state: "missing", to_state: "to_collect", note: reason || null }]);
      await audit(session, "Missing artwork: collect later", "entry", e.id, reason);
      return { ok: true, note: "Back on the list to collect. It joins the next collection batch for its school." };
    }
    if (b.outcome === "score_online") {
      await q(db().from("nae_logistics").update({ missing_outcome: "score_online", updated_at: now }).eq("entry_id", e.id));
      await q(db().from("nae_entries").update({ physical_override: "online" }).eq("id", e.id));
      const r2 = S.P[e.pathway_code]?.rounds?.[2];
      let n = 0;
      if (r2?.status === "open" && e.current_round === 2) n = await assignEntries(S, r2, [{ ...e, physical_override: "online" }]);
      await recompute(e.id, 2, { S, quiet: true });
      await logEvents(session, [{ entry_id: e.id, action: "Missing: scored from its files online", note: reason }]);
      await audit(session, "Missing artwork: score from its files online", "entry", e.id, reason);
      return { ok: true, note: n ? `Assigned to ${n} evaluator${n === 1 ? "" : "s"} to score from its files.` : "It will be scored from its files (in a session or by evaluators with a login) while Round 2 is open." };
    }
    if (b.outcome === "withdrawn") {
      await q(db().from("nae_logistics").update({ missing_outcome: "withdrawn", updated_at: now }).eq("entry_id", e.id));
      await q(db().from("nae_entries").update({ status: "withdrawn", updated_at: now }).eq("id", e.id));
      await logEvents(session, [{ entry_id: e.id, action: "Missing: withdrawn", note: reason }]);
      await audit(session, "Missing artwork: withdrawn", "entry", e.id, reason);
      return { ok: true, note: "Withdrawn. It won't be scored and is shown as withdrawn in results." };
    }
    throw bad("Unknown choice.");
  }
  throw bad("Unknown action.");
});
