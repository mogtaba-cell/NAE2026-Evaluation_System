import { NextResponse } from "next/server";
import { requireRequestSession } from "@/lib/auth";
import { getAdminClient } from "@/lib/db";
import { calculateSingleEvaluator } from "@/lib/calculations";
import { getRubric } from "@/lib/rubric";

export async function POST(request) {
  try {
    const session = await requireRequestSession(request);
    const body = await request.json();
    const submissionId = body.submission_id;
    const roundNumber = Number(body.round_number);
    const evaluatorIds = Array.isArray(body.evaluator_ids) ? body.evaluator_ids : [];
    const evaluationDate = body.evaluation_date || null;
    const perEvaluator = body.per_evaluator || {};

    const supabase = getAdminClient();
    const { data: submission, error: subError } = await supabase.from("submissions").select("*").eq("id", submissionId).single();
    if (subError || !submission) throw subError || new Error("Submission not found.");
    if (session.role !== "admin" && submission.assigned_coordinator_id !== session.sub) {
      return NextResponse.json({ error: "You can only evaluate submissions assigned to you." }, { status: 403 });
    }

    const rubric = getRubric(submission.pathway, submission.sub_pathway, roundNumber === 1 ? "round1" : "round2");
    const rows = evaluatorIds.map((evaluatorId) => {
      const item = perEvaluator[evaluatorId] || {};
      const result = calculateSingleEvaluator(rubric, item.scores || {});
      return {
        submission_id: submissionId,
        round_number: roundNumber,
        evaluator_id: evaluatorId,
        evaluation_date: evaluationDate,
        scores_json: item.scores || {},
        comments: item.comments || null,
        total_score: result.totalScore,
        grade: result.grade || null,
        national_identity: result.identityValue
      };
    });

    const { error } = await supabase.from("evaluation_records").upsert(rows, { onConflict: "submission_id,round_number,evaluator_id" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to save evaluation." }, { status: 500 });
  }
}
