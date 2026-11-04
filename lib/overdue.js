import { db, q, inChunks } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { sendMail, mailConfigured } from "@/lib/mail";
import { audit, SYSTEM } from "@/lib/audit";
import { dueAt, hm } from "@/lib/sessiontime";

// Scoring sessions past their end (date + end time, UAE) that are not finished (planned or still live). Each coordinator gets one email a
// day about their overdue sessions; admins get one summary. A session is reminded at most once a day.
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
const site = () => process.env.NAE_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
export async function overdueSessions() {
  const S = await loadStructure();
  const rows = (await q(db().from("nae_sessions").select("id, round_id, title, session_date, start_time, end_time, time_text, venue, status, coordinator_id, evaluator_ids, self_ids, overdue_notified_at, entries:nae_session_entries(entry_id)").in("status", ["planned", "live"]).lte("session_date", today()).order("session_date"))).filter(s => dueAt(s) < Date.now());
  if (!rows.length) return [];
  const ids = rows.flatMap(s => s.entries.map(e => e.entry_id));
  const res = ids.length ? await q(db().from("nae_results").select("entry_id, round_id, complete").in("entry_id", ids)) : [];
  const accs = await q(db().from("nae_accounts").select("id, display_name, email, role, active"));
  // evaluators who type their own scores: how many of the session's open artworks still wait for their score
  const selfIds = [...new Set(rows.flatMap(s => s.self_ids || []))];
  const [evs, scores] = await Promise.all([
    selfIds.length ? q(db().from("nae_evaluators").select("id, name, account_id").in("id", selfIds)) : [],
    selfIds.length && ids.length ? inChunks(ids, part => q(db().from("nae_scores").select("entry_id, round_id, evaluator_id, status").in("evaluator_id", selfIds).in("status", ["submitted", "absent"]).in("entry_id", part))) : []
  ]);
  return rows.map(s => { const rid = s.round_id; const open = s.entries.filter(e => !res.some(x => x.entry_id === e.entry_id && x.round_id === rid && x.complete)); const done = s.entries.length - open.length; const c = accs.find(a => a.id === s.coordinator_id); const rd = S.roundById[rid];
    const self = (s.self_ids || []).filter(id => (s.evaluator_ids || []).includes(id)).map(id => { const ev = evs.find(x => x.id === id); const a = accs.find(x => x.id === ev?.account_id);
      return { id, name: ev?.name || "Evaluator", email: a?.active ? a.email || null : null, left: open.filter(e => !scores.some(x => x.entry_id === e.entry_id && x.round_id === rid && x.evaluator_id === id)).length }; });
    return { ...s, entries: undefined, evaluator_ids: undefined, self_ids: undefined, count: s.entries.length, done, left: open.length, self, pathway: rd ? S.P[rd.pathway_code]?.name : "", round_no: rd?.round_no, coordinator: c?.display_name || "", coordinator_email: c?.active ? c.email : null, hours: Math.floor((Date.now() - dueAt(s)) / 3600000) }; });
}
export async function sendOverdue({ force = false } = {}) {
  const list = await overdueSessions();
  const now = Date.now();
  const due = list.filter(s => force || !s.overdue_notified_at || now - Date.parse(s.overdue_notified_at) > 20 * 3600 * 1000);
  if (!due.length) return { overdue: list.length, emailed: 0, note: list.length ? "Already reminded today." : "No overdue sessions." };
  if (!mailConfigured()) return { overdue: list.length, emailed: 0, note: "Email is not set up yet (SMTP_USER and SMTP_PASS in Vercel)." };
  const line = s => `• ${s.title} (${s.pathway} Round ${s.round_no}): planned for ${s.session_date}${s.start_time ? ` ${hm(s.start_time)} to ${hm(s.end_time)}` : s.time_text ? ` ${s.time_text}` : ""}${s.venue ? ` at ${s.venue}` : ""}, ${s.status === "live" ? "started, not finished" : "not started"}. ${s.done} of ${s.count} artworks fully scored, ${s.left} left.${site() ? ` ${site()}/sessions/${s.id}` : ""}`;
  let emailed = 0; const missingEmail = [];
  const byCoord = {}; due.forEach(s => { (byCoord[s.coordinator_id] ||= []).push(s); });
  for (const [cid, ss] of Object.entries(byCoord)) {
    const to = ss[0].coordinator_email; if (!to) { missingEmail.push(ss[0].coordinator || "a coordinator"); continue; }
    const r = await sendMail({ to, subject: `NAE: ${ss.length} scoring session${ss.length === 1 ? " is" : "s are"} overdue`, text: [`Hello ${ss[0].coordinator},`, "", `${ss.length === 1 ? "This scoring session is" : "These scoring sessions are"} past ${ss.length === 1 ? "its" : "their"} end time and not finished:`, "", ...ss.map(line), "", "Please score the remaining artworks, or finish the session (artworks not fully scored can go into another session). If the date changed, edit the session.", "", "NAE Evaluation System"].join("\n") });
    emailed += r.sent || 0;
  }
  const admins = (await q(db().from("nae_accounts").select("email, display_name").eq("role", "admin").eq("active", true))).map(a => a.email).filter(Boolean);
  if (admins.length) { const r = await sendMail({ to: admins, subject: `NAE: ${due.length} overdue scoring session${due.length === 1 ? "" : "s"}`, text: ["Scoring sessions past their end time and not finished:", "", ...due.map(s => `${line(s)} Coordinator: ${s.coordinator || "–"}${s.coordinator_email ? "" : " (no email on their account)"}.`), "", "NAE Evaluation System"].join("\n") }); emailed += r.sent || 0; }
  await q(db().from("nae_sessions").update({ overdue_notified_at: new Date().toISOString() }).in("id", due.map(s => s.id)));
  await audit(SYSTEM, `Overdue session reminders sent (${due.length} session${due.length === 1 ? "" : "s"})`, "session", null, missingEmail.length ? `No email for: ${[...new Set(missingEmail)].join(", ")}` : "");
  return { overdue: list.length, emailed, note: `Reminders sent for ${due.length} session${due.length === 1 ? "" : "s"}.${missingEmail.length ? ` No email on the account of ${[...new Set(missingEmail)].join(", ")}: add it in People and logins.` : ""}` };
}
// One overdue session, sent by hand: to its coordinator (admins), or to the evaluators who type their own scores and still
// have artworks to score in it (admins, or the session's coordinator)
export async function sendSessionReminder(session, sessionId, to) {
  const s = (await overdueSessions()).find(x => x.id === sessionId);
  if (!s) throw new Error("This session is not overdue.");
  if (session.role === "coordinator" && s.coordinator_id !== session.sub) throw new Error("This session is run by another coordinator.");
  if (!mailConfigured()) return { emailed: 0, note: "Email is not set up yet (SMTP_USER and SMTP_PASS in Vercel)." };
  const when = `${s.session_date}${s.start_time ? ` ${hm(s.start_time)} to ${hm(s.end_time)}` : s.time_text ? ` ${s.time_text}` : ""}${s.venue ? ` at ${s.venue}` : ""}`;
  const link = site() ? `${site()}/sessions/${s.id}` : "";
  if (to === "coordinator") {
    if (session.role !== "admin") throw new Error("Only an admin can remind the coordinator.");
    if (!s.coordinator_email) return { emailed: 0, note: `${s.coordinator || "The coordinator"} has no email on their account. Add it in People and logins.` };
    await sendMail({ to: s.coordinator_email, subject: `NAE: ${s.title} is overdue`, text: [`Hello ${s.coordinator},`, "", `The scoring session ${s.title} (${s.pathway} Round ${s.round_no}, ${when}) is past its end time and not finished: ${s.done} of ${s.count} artworks are fully scored.`, "", "Please score the remaining artworks, or finish the session (artworks nobody has scored yet can move to another session).", link, "", `Sent by ${session.name || "an admin"}.`, "NAE Evaluation System"].filter(x => x !== null).join("\n") });
    await audit(session, `${s.title}: overdue reminder emailed to the coordinator`, "session", s.id, s.coordinator);
    return { emailed: 1, note: `Reminder emailed to ${s.coordinator}.` };
  }
  if (to === "evaluators") {
    const want = s.self.filter(x => x.left > 0);
    if (!want.length) return { emailed: 0, note: "The evaluators who type their own scores have nothing left to score here." };
    const sent = [], noEmail = [];
    for (const ev of want) {
      if (!ev.email) { noEmail.push(ev.name); continue; }
      await sendMail({ to: ev.email, subject: `NAE: please finish your scores for ${s.title}`, text: [`Hello ${ev.name},`, "", `The scoring session ${s.title} (${when}) is past its end time. ${ev.left} artwork${ev.left === 1 ? " is" : "s are"} still waiting for your score.`, "", "Please sign in and type your scores in the session.", link, "", `Sent by ${session.name || "the coordinator"}${s.coordinator && session.sub !== s.coordinator_id ? ` (coordinator: ${s.coordinator})` : ""}.`, "NAE Evaluation System"].join("\n") });
      sent.push(ev.name);
    }
    if (sent.length) await audit(session, `${s.title}: overdue reminder emailed to ${sent.length} evaluator${sent.length === 1 ? "" : "s"}`, "session", s.id, sent.join(", "));
    return { emailed: sent.length, note: [sent.length ? `Reminder emailed to ${sent.join(", ")}.` : "", noEmail.length ? `No email on the account of ${noEmail.join(", ")}: add it in People and logins.` : ""].filter(Boolean).join(" ") };
  }
  throw new Error("Unknown reminder.");
}
// checked whenever staff open the sessions list (in the background, at most every 10 minutes), so a reminder goes out
// soon after a session's end time and not only with the daily run
let lastCheck = 0;
export function checkOverdueSoon() {
  if (Date.now() - lastCheck < 10 * 60 * 1000 || !mailConfigured()) return null;
  lastCheck = Date.now();
  return () => sendOverdue().catch(e => console.error("overdue reminders", e.message));
}
