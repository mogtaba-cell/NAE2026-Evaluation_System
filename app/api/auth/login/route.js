import { NextResponse } from "next/server";
import { attachSession, authenticateUser } from "@/lib/auth";

export async function POST(request) {
  const body = await request.json();
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
  }
  const user = await authenticateUser(username, password);
  if (!user) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }
  const response = NextResponse.json({
    ok: true,
    user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role }
  });
  await attachSession(response, user);
  return response;
}
