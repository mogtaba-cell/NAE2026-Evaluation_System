import { NextResponse } from "next/server";
import { sendOverdue } from "@/lib/overdue";

// Daily (vercel.json crons): email coordinators and admins about scoring sessions past their date and not finished.
// Vercel calls it with "Authorization: Bearer <CRON_SECRET>".
export const maxDuration = 60;
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  try { return NextResponse.json(await sendOverdue()); }
  catch (e) { console.error(e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
