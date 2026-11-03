import { db, q } from "@/lib/db";
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
  const rows = (await q(db().from("nae_sessions").select("id, round_id, title, session_date, start_time, end_time, time_text, venue, status, coordinator_id, overdue_notified_at, entries:nae_session_entries(entry_id)").in("status", ["planned", "live"]).lte("session_date", today()).order("session_date"))).filter(s => dueAt(s) < Date.now());
  if (!rows.length) return [];
  const ids = rows.flatMap(s => s.entries.map(e => e.entry_id));
  const res = ids.length ? await q(db().from("nae_results").select("entry_id, round_id, complete").in("entry_id", ids)) : [];
  const accs = await q(db().from("nae_accounts").select("id, display_name, email, role, active"));
  return rows.map(s => { const rid = s.round_id; const done = s.entries.filter(e => res.some(x => x.entry_id === e.entry_id && x.round_id === rid && x.complete)).length; const c = accs.find(a => a.id === s.coordinator_id); const rd = S.roundById[rid];
    return { ...s, entries: undefined, count: s.entries.length, done, left: s.entries.length - done, pathway: rd ? S.P[rd.pathway_code]?.name : "", round_no: rd?.round_no, coordinator: c?.display_name || "", coordinator_email: c?.active ? c.email : null, hours: Math.floor((Date.now() - dueAt(s)) / 3600000) }; });
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
// checked whenever staff open the sessions list (in the background, at most every 10 minutes), so a reminder goes out
// soon after a session's end time and not only with the daily run
let lastCheck = 0;
export function checkOverdueSoon() {
  if (Date.now() - lastCheck < 10 * 60 * 1000 || !mailConfigured()) return null;
  lastCheck = Date.now();
  return () => sendOverdue().catch(e => console.error("overdue reminders", e.message));
}
