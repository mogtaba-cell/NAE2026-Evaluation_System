import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth";

export async function GET(request) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: session });
}
