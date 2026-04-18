import { NextResponse } from "next/server";
import { requireRequestSession } from "@/lib/auth";
import { getAdminClient } from "@/lib/db";

export async function GET(request) {
  try {
    const session = await requireRequestSession(request);
    const supabase = getAdminClient();
    const [usersRes, evaluatorsRes, submissionsRes, evalsRes, schoolsRes, studentsRes, linksRes] = await Promise.all([
      supabase.from("users").select("id, username, display_name, role, active, pathways, created_at").order("username"),
      supabase.from("evaluators").select("*").order("name"),
      supabase.from("submissions").select("*").order("created_at", { ascending: false }),
      supabase.from("evaluation_records").select("*").order("created_at", { ascending: true }),
      supabase.from("schools").select("*").order("school_name"),
      supabase.from("students").select("*").order("student_name"),
      supabase.from("submission_students").select("*").order("display_order")
    ]);
    for (const res of [usersRes, evaluatorsRes, submissionsRes, evalsRes, schoolsRes, studentsRes, linksRes]) {
      if (res.error) throw res.error;
    }
    return NextResponse.json({
      currentUser: session,
      users: usersRes.data || [],
      evaluators: evaluatorsRes.data || [],
      rawSubmissions: submissionsRes.data || [],
      evaluationRecords: evalsRes.data || [],
      schools: schoolsRes.data || [],
      students: studentsRes.data || [],
      submissionStudents: linksRes.data || []
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unauthorized" }, { status: error.message === "Unauthorized" ? 401 : 500 });
  }
}
