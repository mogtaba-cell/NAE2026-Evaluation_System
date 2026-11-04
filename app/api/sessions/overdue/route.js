import { route, body, bad } from "@/lib/api";
import { overdueSessions, sendOverdue, sendSessionReminder } from "@/lib/overdue";
import { mailConfigured } from "@/lib/mail";

// Overdue sessions and their email reminders.
//   GET: admins see every overdue session; a coordinator sees their own
//   POST {}: admin, the daily reminders now (every overdue session)
//   POST { session_id, to: "coordinator" | "evaluators" }: one session; admins, or its coordinator for its evaluators
export const maxDuration = 60;
export const GET = route(["admin", "coordinator"], async ({ session }) => {
  let sessions = await overdueSessions();
  if (session.role === "coordinator") sessions = sessions.filter(s => s.coordinator_id === session.sub);
  return { sessions, mail: mailConfigured(), cron: !!process.env.CRON_SECRET };
});
export const POST = route(["admin", "coordinator"], async ({ session, request }) => {
  const b = await body(request);
  if (!b.session_id) { if (session.role !== "admin") throw bad("Pick a session."); return sendOverdue({ force: true }); }
  try { return await sendSessionReminder(session, b.session_id, b.to); } catch (e) { throw bad(e.message); }
});
