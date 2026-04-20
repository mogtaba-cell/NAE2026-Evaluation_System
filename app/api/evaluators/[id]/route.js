import { NextResponse } from "next/server";
import { requireRequestSession, assertAdmin } from "@/lib/auth";
import { getAdminClient } from "@/lib/db";

export async function PATCH(request, { params }) {
  try {
    await requireRequestSession(request);
    const body = await request.json();
    const patch = {};
    if (body.name !== undefined) patch.name = String(body.name || "").trim();
    if (body.pathways !== undefined) patch.pathways = Array.isArray(body.pathways) ? body.pathways : [];
    if (body.active !== undefined) patch.active = Boolean(body.active);

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("evaluators")
      .update(patch)
      .eq("id", params.id)
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({ evaluator: data });
  } catch (error) {
    const status = error.message === "Unauthorized" ? 401 : 500;
    return NextResponse.json(
      { error: error.message || "Failed to update evaluator." },
      { status }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await requireRequestSession(request);
    assertAdmin(session);

    const supabase = getAdminClient();
    const { error } = await supabase.from("evaluators").delete().eq("id", params.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status =
      error.message === "Unauthorized" ? 401 :
      error.message === "Forbidden" ? 403 :
      500;

    return NextResponse.json(
      { error: error.message || "Failed to delete evaluator." },
      { status }
    );
  }
}