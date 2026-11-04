import { readTimes } from "@/lib/sessiontime";
import { route, body, bad, forbidden } from "@/lib/api";
import { db, q } from "@/lib/db";
import { loadStructure, versionById, versionView, rubricFor } from "@/lib/structure";
import { pinnedVersion, scorePlan, recompute, ruleText, flagLine, passThreshold, DEFAULT_BANDS } from "@/lib/scoring";
import { entryFiles } from "@/lib/files";
import { fileView } from "@/lib/entryview";
import { audit } from "@/lib/audit";
import { sessionPool, selfIds } from "@/lib/sessions";
import { venueFields } from "@/lib/venues";
import { requestForSession, releaseFromSession } from "@/lib/movements";
import { myEvaluatorId } from "@/lib/perms";

async function loadSession(id, session) {
  const s = await q(db().from("nae_sessions").select("*, coordinator:nae_accounts(display_name)").eq("id", id).maybeSingle());
  if (!s) throw bad("Session not found.");
  if (session.role === "coordinator" && s.coordinator_id !== session.sub) throw forbidden("This session is run by another coordinator.");
  if (session.role === "evaluator") { const ev = await myEvaluatorId(session); if (!ev || !(s.evaluator_ids || []).includes(ev) || s.status === "cancelled") throw forbidden("You are not in this session's team."); s.__ev = ev; }
  return s;
}

// The session's score sheet: its coordinator, admins, and the evaluators in its team (they type their own column
// when they enter their own scores, and see the others' saved scores). The Logistics team uses the pull list.
export const GET = route(["admin", "coordinator", "evaluator"], async ({ session, params, url }) => {
  const S = await loadStructure();
  const s = await loadSession(params.id, session);
  const r = S.roundById[s.round_id];
  const links = await q(db().from("nae_session_entries").select("position, pulled, entry:nae_entries(*, school:nae_schools(name, esis))").eq("session_id", s.id).order("position"));
  const ids = links.map(l => l.entry.id);
  const [scores, results, logistics, evs, reviews] = await Promise.all([
    ids.length ? q(db().from("nae_scores").select("*").eq("round_id", r.id).in("entry_id", ids)) : [],
    ids.length ? q(db().from("nae_results").select("*").in("entry_id", ids)) : [],
    ids.length ? q(db().from("nae_logistics").select("*, loc:nae_locations(room, shelf, label)").in("entry_id", ids)) : [],
    q(db().from("nae_evaluators").select("id, name, account_id").in("id", s.evaluator_ids || [])),
    ids.length ? q(db().from("nae_reviews").select("entry_id, round_no, status, reason").eq("round_no", r.round_no).in("entry_id", ids)) : []
  ]);
  const evaluator = session.role === "evaluator";
  const comments = ids.length && !evaluator ? await q(db().from("nae_entry_comments").select("entry_id, comment, author_id, updated_at").eq("round_no", r.round_no).in("entry_id", ids)) : [];
  const cur = url.searchParams.get("entry") || null;
  // Everything per artwork comes from these batch reads (no query per artwork): the rubric version an artwork was
  // first scored with, and the latest session of this round each artwork is in (its team decides the minimum).
  const sessLinks = ids.length ? await q(db().from("nae_session_entries").select("entry_id, session:nae_sessions!inner(id, evaluator_ids, round_id, status, created_at)").in("entry_id", ids).eq("session.round_id", r.id).neq("session.status", "cancelled")) : [];
  const entries = [];
  for (const l of links) {
    const e = l.entry;
    const firstScored = scores.filter(x => x.entry_id === e.id && x.rubric_version_id).sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)))[0];
    const hit = firstScored ? versionById(S, firstScored.rubric_version_id) : null;
    const rub = hit ? null : rubricFor(S, e.pathway_code, e.sub_code, r.round_no);
    const ver = hit ? versionView(hit.rubric, hit.version) : rub?.published ? versionView(rub, rub.published) : null;
    const latest = sessLinks.filter(x => x.entry_id === e.id).map(x => x.session).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    const tm = latest?.evaluator_ids || s.evaluator_ids || [];
    const plan = { session: latest || null, min: Math.min(tm.length, Math.max(2, Math.ceil(tm.length / 2))) };
    const rv = reviews.filter(x => x.entry_id === e.id);
    const lg = logistics.find(x => x.entry_id === e.id) || null;
    entries.push({
      position: l.position, code: e.code, pathway_code: e.pathway_code, sub_code: e.sub_code, manual_fields: e.manual_fields || [], title_en: e.title_en, title_ar: e.title_ar, group_name: e.group_name, students_count: e.students_count, grades_text: e.grades_text, school: e.school?.name, sub: (S.P[e.pathway_code].subs.find(x => x.code === e.sub_code) || {}).name, medium: e.medium, size_text: e.size_text, description_en: e.description_en, description_ar: e.description_ar, reflections: e.reflections, registration_type: e.registration_type, status: e.status,
      r1: r.round_no === 2 ? results.find(x => x.entry_id === e.id && x.round_no === 1) || null : null,
      rubric: ver, min: plan.min, inThisSession: plan.session?.id === s.id,
      // evaluators see their own drafts, and only saved (submitted or absent) scores of the others
      scores: scores.filter(x => x.entry_id === e.id && (!evaluator || x.status !== "draft" || x.evaluator_id === s.__ev)).map(x => evaluator && x.evaluator_id !== s.__ev ? { ...x, entered_by: undefined } : x),
      pod: !!e.pod, not_visible: e.not_visible_at && e.not_visible_round === r.round_no ? { at: e.not_visible_at, note: e.not_visible_note } : null,
      coordComment: comments.find(c => c.entry_id === e.id)?.comment || null,
      result: results.find(x => x.entry_id === e.id && x.round_no === r.round_no) || null,
      review: rv.find(x => x.status === "open") ? { status: "open", reason: rv.find(x => x.status === "open").reason } : rv[0] ? { status: rv[0].status } : null,
      logistics: lg ? { state: lg.state, batch: lg.batch_no, handed_at: lg.handed_at, where: lg.loc ? `${lg.loc.label}` : lg.location, needs_framing: lg.needs_framing, glass_framing: lg.glass_framing, damaged: lg.damaged } : null,
      files: null
    });
  }
  const inRoom = x => ["coordinator", "handed_over"].includes(x.logistics?.state);
  const target = entries.find(x => x.code === cur) || entries.find(x => inRoom(x) && !x.result?.complete) || entries.find(x => !x.result?.complete && (!x.logistics || inRoom(x))) || entries.find(x => !x.result?.complete) || entries[0];
  if (target) { const e = links.find(l => l.entry.code === target.code).entry; target.files = (await entryFiles(e)).map(fileView); }
  const bandsFor = x => x.rubric?.grade_bands || DEFAULT_BANDS;
  return {
    me: { role: session.role, evaluator_id: s.__ev || null },
    canEditDetails: ["admin", "management"].includes(session.role) || (session.role === "coordinator" && s.coordinator_id === session.sub && ["planned", "live"].includes(s.status)),
    session: { ...s, __ev: undefined, coordinator: s.coordinator?.display_name, pathway: S.P[r.pathway_code].name, round_no: r.round_no, round_status: r.status, mine: s.coordinator_id === session.sub },
    team: (s.evaluator_ids || []).map(id => evs.find(e => e.id === id)).filter(Boolean).map(t => ({ ...t, self: (s.self_ids || []).includes(t.id), has_login: !!t.account_id, account_id: undefined })),
    entries: entries.map(x => ({ ...x, flagLine: flagLine(r, bandsFor(x)), passMark: passThreshold(r.pass_rule, bandsFor(x)) })),
    current: target?.code || null,
    rules: { pass_rule: r.pass_rule, pass_text: ruleText(r.pass_rule), flag_near: r.flag_near !== false, flag_margin: r.flag_margin, flag_line: r.flag_line, flag_spread: r.flag_spread !== false, spread_limit: r.spread_limit, flag_identity: r.flag_identity !== false }
  };
});

// start | finish | reopen (admin) | cancel (planned only) | edit (planned: details, team, entries)
export const PATCH = route(["admin", "coordinator"], async ({ session, params, request }) => {   // eslint-disable-line
  const b = await body(request);
  const s = await loadSession(params.id, session);
  const S = await loadStructure(); const r = S.roundById[s.round_id];
  const ids = (await q(db().from("nae_session_entries").select("entry_id").eq("session_id", s.id))).map(x => x.entry_id);
  if (r.status === "closed" && ["start", "edit", "reopen"].includes(b.action || "")) throw bad("This round is closed.");
  const action = b.action || ({ live: "start", done: "finish", planned: "edit" })[b.status];

  if (action === "start") {
    if (s.status !== "planned") throw bad("Only a planned session can be started.");
    await q(db().from("nae_sessions").update({ status: "live" }).eq("id", s.id));
    await audit(session, `${s.title}: started`, "session", s.id);
    return { ok: true };
  }
  if (action === "finish") {
    if (s.status !== "live") throw bad("Only a live session can be finished.");
    const res = ids.length ? await q(db().from("nae_results").select("entry_id, complete").eq("round_id", r.id).in("entry_id", ids)) : [];
    const open = ids.filter(id => !res.find(x => x.entry_id === id && x.complete));
    // artworks not started (no saved score) can move to another planned or live session of the same round
    const started = open.length ? new Set((await q(db().from("nae_scores").select("entry_id").eq("round_id", r.id).eq("status", "submitted").in("entry_id", open))).map(x => x.entry_id)) : new Set();
    const movable = open.filter(id => !started.has(id));
    if (open.length && !b.confirm) {
      const targets = movable.length ? (await q(db().from("nae_sessions").select("id, title, session_date, start_time, end_time, status, coordinator:nae_accounts(display_name)").eq("round_id", r.id).in("status", ["planned", "live"]).neq("id", s.id).order("session_date"))).map(t => ({ id: t.id, title: t.title, date: t.session_date, start: t.start_time, end: t.end_time, status: t.status, coordinator: t.coordinator?.display_name || "" })) : [];
      return { ok: false, incomplete: open.length, movable: movable.length, partly: open.length - movable.length, targets, note: `${open.length} artwork${open.length === 1 ? " is" : "s are"} not fully scored. Artworks still with you are handed back to storage.` };
    }
    let moved = 0, target = null;
    if (b.move_to && movable.length) {
      target = await q(db().from("nae_sessions").select("*").eq("id", b.move_to).maybeSingle());
      if (!target || target.round_id !== r.id || !["planned", "live"].includes(target.status) || target.id === s.id) throw bad("Pick a planned or live session of the same round.");
      const pos = (await q(db().from("nae_session_entries").select("position").eq("session_id", target.id).order("position", { ascending: false }).limit(1)))[0]?.position ?? 0;
      await q(db().from("nae_session_entries").delete().eq("session_id", s.id).in("entry_id", movable));
      await q(db().from("nae_session_entries").upsert(movable.map((id, i) => ({ session_id: target.id, entry_id: id, position: pos + 1 + i })), { onConflict: "session_id,entry_id", ignoreDuplicates: true }));
      // physical artworks still waiting for this session now wait for the other one; ones on the shelf are requested for it
      await q(db().from("nae_logistics").update({ session_id: target.id, updated_at: new Date().toISOString() }).eq("session_id", s.id).in("state", ["requested", "picked"]).in("entry_id", movable));
      await requestForSession(session, target, movable);
      moved = movable.length;
      await audit(session, `${s.title}: ${moved} artwork${moved === 1 ? "" : "s"} moved to ${target.title}`, "session", s.id, "");
      await audit(session, `${target.title}: ${moved} artwork${moved === 1 ? "" : "s"} moved in from ${s.title}`, "session", target.id, "");
    }
    await q(db().from("nae_sessions").update({ status: "done" }).eq("id", s.id));
    // artworks still out go back: never handed over → straight back to storage; with the coordinator → handed
    // back (Logistics confirms receipt and the shelf)
    await releaseFromSession(session, s, ids, "session finished");
    for (const id of open) await recompute(id, r.round_no, { S, quiet: true });
    await audit(session, `${s.title}: finished, artworks back to storage`, "session", s.id, open.length ? `${open.length} not fully scored${moved ? `, ${moved} moved to ${target.title}` : ""}` : "");
    return { ok: true, note: moved ? `Session finished. ${moved} artwork${moved === 1 ? "" : "s"} moved to ${target.title}.` : null };
  }
  if (action === "reopen") {
    if (session.role !== "admin") throw forbidden("Only an admin can reopen a finished session.");
    if (s.status !== "done") throw bad("Only a finished session can be reopened.");
    await q(db().from("nae_sessions").update({ status: "live" }).eq("id", s.id));
    await audit(session, `${s.title}: reopened`, "session", s.id, b.reason || "");
    return { ok: true };
  }
  if (action === "cancel") {
    if (s.status !== "planned") throw bad("Only a planned session can be cancelled.");
    await q(db().from("nae_sessions").update({ status: "cancelled" }).eq("id", s.id));
    await releaseFromSession(session, s, ids, "session cancelled");
    for (const id of ids) await recompute(id, r.round_no, { S, quiet: true });
    await audit(session, `${s.title}: cancelled`, "session", s.id, b.reason || "");
    return { ok: true };
  }
  // who types their own scores can change at any time before the session is finished (e.g. a phone that won't log in)
  if (action === "self") {
    if (!["planned", "live"].includes(s.status)) throw bad("This session is finished.");
    const self = await selfIds(b.self_ids, s.evaluator_ids || []);
    await q(db().from("nae_sessions").update({ self_ids: self }).eq("id", s.id));
    await audit(session, `${s.title}: who enters their own scores changed`, "session", s.id, `${self.length} of ${(s.evaluator_ids || []).length}`);
    return { ok: true };
  }
  if (action === "edit") {
    if (s.status !== "planned") throw bad("Only a planned session can be edited.");
    const patch = {};
    ["title", "session_date"].forEach(k => { if (b[k] !== undefined) patch[k] = b[k] || null; });
    if (b.start_time !== undefined || b.end_time !== undefined) { const t = readTimes(b, { required: true }); if (t.error) throw bad(t.error); Object.assign(patch, t); }
    if (b.session_date !== undefined && !patch.session_date) throw bad("Choose the session date.");
    if (b.venue_id !== undefined) Object.assign(patch, await venueFields(b.venue_id, s.venue_id));
    if (patch.title === null) delete patch.title;
    if (Array.isArray(b.evaluator_ids)) {
      const team = [...new Set(b.evaluator_ids)]; if (!team.length) throw bad("Pick at least one evaluator.");
      const evs = await q(db().from("nae_evaluators").select("id, active").in("id", team));
      if (evs.length !== team.length || evs.some(e => !e.active)) throw bad("Pick active evaluators only.");
      patch.evaluator_ids = team;
    }
    if (Array.isArray(b.self_ids)) patch.self_ids = await selfIds(b.self_ids, patch.evaluator_ids || s.evaluator_ids || []);
    else if (patch.evaluator_ids) patch.self_ids = (s.self_ids || []).filter(x => patch.evaluator_ids.includes(x));
    if (session.role === "admin" && b.coordinator_id) patch.coordinator_id = b.coordinator_id;
    if (patch.session_date || patch.end_time) patch.overdue_notified_at = null;
    if (Object.keys(patch).length) await q(db().from("nae_sessions").update(patch).eq("id", s.id));
    if (Array.isArray(b.remove) && b.remove.length) {
      const rm = await q(db().from("nae_entries").select("id").in("code", b.remove));
      if (rm.length) await q(db().from("nae_session_entries").delete().eq("session_id", s.id).in("entry_id", rm.map(x => x.id)));
      if (rm.length) await releaseFromSession(session, s, rm.map(x => x.id), "removed from the session");
    }
    if (Array.isArray(b.add_schools) && b.add_schools.length) {
      const pool = await sessionPool(S, r); const sch = new Set(b.add_schools);
      const add = pool.filter(x => sch.has(x.entry.school_id || "none"));
      if (add.length) await q(db().from("nae_session_entries").insert(add.map((x, i) => ({ session_id: s.id, entry_id: x.entry_id, position: 1000 + i }))));
      if (add.length) await requestForSession(session, s, add.map(x => x.entry_id));
    }
    const now = (await q(db().from("nae_session_entries").select("entry_id").eq("session_id", s.id))).map(x => x.entry_id);
    for (const id of new Set([...ids, ...now])) await recompute(id, r.round_no, { S, quiet: true });
    await audit(session, `${s.title}: edited`, "session", s.id, JSON.stringify({ ...patch, removed: b.remove?.length || 0, added_schools: b.add_schools?.length || 0 }));
    return { ok: true };
  }
  throw bad("Unknown action.");
});
