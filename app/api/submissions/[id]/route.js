import { NextResponse } from "next/server";
import { requireRequestSession } from "@/lib/auth";
import { getAdminClient } from "@/lib/db";

export async function PATCH(request, { params }) {
  try {
    const session = await requireRequestSession(request);
    const body = await request.json();
    const patch = {
      seen_reviewed: Boolean(body.seen_reviewed),
      need_fixing_school: Boolean(body.need_fixing_school),
      need_fixing_internal: Boolean(body.need_fixing_internal),
      artwork_collected: Boolean(body.artwork_collected)
    };

    if (session.role === "admin") {
      patch.management_comments = body.management_comments ?? null;
      patch.management_round1_total_score = body.management_round1_total_score ?? null;
      patch.management_round1_grade = body.management_round1_grade ?? null;
      patch.management_round1_comments = body.management_round1_comments ?? null;
      patch.management_round2_total_score = body.management_round2_total_score ?? null;
      patch.management_round2_grade = body.management_round2_grade ?? null;
      patch.management_round2_national_identity = body.management_round2_national_identity ?? null;
      patch.management_round2_comments = body.management_round2_comments ?? null;
      if (body.assigned_coordinator_id !== undefined) patch.assigned_coordinator_id = body.assigned_coordinator_id || null;
    }

    const supabase = getAdminClient();
    const { data, error } = await supabase.from("submissions").update(patch).eq("id", params.id).select("*").single();
    if (error) throw error;
    return NextResponse.json({ submission: data });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to update submission." }, { status: 500 });
  }
}
