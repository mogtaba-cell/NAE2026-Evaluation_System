import { NextResponse } from "next/server";
import { assertAdmin, hashPassword, requireRequestSession } from "@/lib/auth";
import { getAdminClient } from "@/lib/db";

export async function PATCH(request, { params }) {
  try {
    const session = await requireRequestSession(request);
    assertAdmin(session);
    const body = await request.json();
    const patch = {};
    if (body.username !== undefined) patch.username = String(body.username).trim();
    if (body.display_name !== undefined) patch.display_name = String(body.display_name || "").trim();
    if (body.role !== undefined) patch.role = body.role === "admin" ? "admin" : "coordinator";
    if (body.active !== undefined) patch.active = Boolean(body.active);
    if (body.pathways !== undefined) patch.pathways = Array.isArray(body.pathways) ? body.pathways : [];
    if (body.password) patch.password_hash = hashPassword(String(body.password));

    const supabase = getAdminClient();
    const { data, error } = await supabase.from("users").update(patch).eq("id", params.id).select("id, username, display_name, role, active, pathways").single();
    if (error) throw error;
    return NextResponse.json({ user: data });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to update user." }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await requireRequestSession(request);
    assertAdmin(session);
    const supabase = getAdminClient();
    const { error } = await supabase.from("users").delete().eq("id", params.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to delete user." }, { status: 500 });
  }
}
