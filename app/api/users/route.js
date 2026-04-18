import { NextResponse } from "next/server";
import { assertAdmin, hashPassword, requireRequestSession } from "@/lib/auth";
import { getAdminClient } from "@/lib/db";

export async function GET(request) {
  try {
    const session = await requireRequestSession(request);
    assertAdmin(session);
    const supabase = getAdminClient();
    const { data, error } = await supabase.from("users").select("id, username, display_name, role, active, pathways, created_at").order("username");
    if (error) throw error;
    return NextResponse.json({ users: data || [] });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load users." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await requireRequestSession(request);
    assertAdmin(session);
    const body = await request.json();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
    }
    const supabase = getAdminClient();
    const { data, error } = await supabase.from("users").insert({
      username,
      display_name: String(body.display_name || username).trim(),
      role: body.role === "admin" ? "admin" : "coordinator",
      active: body.active !== false,
      pathways: Array.isArray(body.pathways) ? body.pathways : [],
      password_hash: hashPassword(password)
    }).select("id, username, display_name, role, active, pathways").single();
    if (error) throw error;
    return NextResponse.json({ user: data });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to create user." }, { status: 500 });
  }
}
