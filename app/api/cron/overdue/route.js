import { NextResponse } from "next/server";
import { sendOverdue } from "@/lib/overdue";
import { remindCoordinators } from "@/lib/corrections";

// Daily (vercel.json crons): email coordinators and admins about scoring sessions past their date and not finished,
// and each coordinator one reminder with how many corrections are waiting (and how many for 3 days or more).
// Vercel calls it with "Authorization: Bearer <CRON_SECRET>".
export const maxDuration = 60;
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  try { const overdue = await sendOverdue(); const corrections = await remindCoordinators().catch(e => ({ error: e.message })); return NextResponse.json({ ...overdue, corrections }); }
  catch (e) { console.error(e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
