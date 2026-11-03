import { route } from "@/lib/api";
import { overdueSessions, sendOverdue } from "@/lib/overdue";
import { mailConfigured } from "@/lib/mail";

// Admin: overdue sessions and the email reminders (status, send now)
export const maxDuration = 60;
export const GET = route(["admin"], async () => ({ sessions: await overdueSessions(), mail: mailConfigured(), cron: !!process.env.CRON_SECRET }));
export const POST = route(["admin"], async () => sendOverdue({ force: true }));
