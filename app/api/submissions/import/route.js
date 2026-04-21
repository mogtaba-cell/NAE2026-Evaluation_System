import { NextResponse } from "next/server";
import { requireRequestSession } from "@/lib/auth";
import { getAdminClient } from "@/lib/db";

function pick(row, keys, fallback = "") {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return fallback;
}

function splitComma(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function splitSemis(value) {
  const raw = String(value || "");
  const sep = raw.includes(";") ? ";" : ",";
  return raw.split(sep).map((item) => item.trim()).filter(Boolean);
}

export async function POST(request) {
  try {
    const session = await requireRequestSession(request);
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Only admin can import data." }, { status: 403 });
    }

    const body = await request.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const supabase = getAdminClient();

    const { data: users, error: usersError } = await supabase.from("users").select("id, username");
    if (usersError) throw usersError;
    const userMap = Object.fromEntries((users || []).map((user) => [String(user.username).toLowerCase(), user.id]));

    const submissionCodes = rows
      .map((row, index) => String(pick(row, ["No", "ID", "Submission ID"], `IMP-${index + 1}`)).trim())
      .filter(Boolean);

    const { data: existingSubmissions, error: existingError } = await supabase
      .from("submissions")
      .select("id, submission_code")
      .in("submission_code", submissionCodes);
    if (existingError) throw existingError;

    const existingMap = Object.fromEntries((existingSubmissions || []).map((item) => [item.submission_code, item.id]));

    let importedCount = 0;
    let reuploadedCount = 0;

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const submissionCode = String(pick(row, ["No", "ID", "Submission ID"], `IMP-${index + 1}`)).trim();
      const pathway = String(pick(row, ["Pathway"], "")).trim();
      const artworkName = String(pick(row, ["Art Work Title", "Artwork Name"], "")).trim();
      const schoolName = String(pick(row, ["School Name Eng", "School Name"], "")).trim();

      if (!submissionCode || !pathway || !artworkName || !schoolName) continue;

      const schoolEsis = String(pick(row, ["School eSIS", "School ESIS"], `SCH-${schoolName}`)).trim();

      const { data: school, error: schoolError } = await supabase
        .from("schools")
        .upsert(
          {
            school_esis: schoolEsis,
            school_name: schoolName,
            school_type: String(pick(row, ["School Type", "School Category"], "Unspecified")).trim() || "Unspecified",
            region: String(pick(row, ["Region"], "")).trim() || null,
            updated_at: new Date().toISOString()
          },
          { onConflict: "school_esis" }
        )
        .select("id")
        .single();
      if (schoolError) throw schoolError;

      const coordinatorUsername = String(pick(row, ["Coordinator Username"], "")).trim().toLowerCase();

      const { data: submission, error: submissionError } = await supabase
        .from("submissions")
        .upsert(
          {
            submission_code: submissionCode,
            pathway,
            sub_pathway: String(pick(row, ["Art Sub Pathway", "Sub Pathway"], "")).trim() || null,
            school_id: school.id,
            assigned_coordinator_id: coordinatorUsername ? (userMap[coordinatorUsername] || null) : null,
            artwork_name: artworkName,
            registration_type: String(pick(row, ["Registration Type"], "")).trim() || null,
            number_of_students: Number(pick(row, ["Number of students"], 1)) || 1,
            preview_url: String(pick(row, ["Preview Image", "Preview URL", "Thumbnail"], "")).trim() || null,
            source_file_url: String(pick(row, ["File link", "File Link", "Submission Link", "Media Link"], "")).trim() || null,
            source_file_type: String(pick(row, ["Note"], "")).trim() || null,
            medium: String(pick(row, ["Art Work Medium", "Medium"], "")).trim() || null,
            dimensions: String(pick(row, ["Art Work Dimension", "Dimensions"], "")).trim() || null,
            description: String(pick(row, ["Description", "Art Work Description"], "")).trim() || null,
            updated_at: new Date().toISOString()
          },
          { onConflict: "submission_code" }
        )
        .select("id")
        .single();
      if (submissionError) throw submissionError;

      if (existingMap[submissionCode]) reuploadedCount += 1;
      else importedCount += 1;

      const { error: deleteLinksError } = await supabase
        .from("submission_students")
        .delete()
        .eq("submission_id", submission.id);
      if (deleteLinksError) throw deleteLinksError;

      const names = splitComma(pick(row, ["Names Eng-corrected", "Student Name"], ""));
      const grades = splitSemis(pick(row, ["Participating Students Grades", "Grade"], ""));
      const genders = splitSemis(pick(row, ["Participating Students Gender", "Gender"], ""));
      const nationalities = splitSemis(pick(row, ["Participating Students Nationalities", "Nationality"], ""));
      const esis = splitComma(pick(row, ["Student eSIS", "eSIS-Student-corrected", "eSIS Student"], ""));

      const count = Math.max(
        names.length,
        grades.length,
        genders.length,
        nationalities.length,
        esis.length,
        Number(pick(row, ["Number of students"], 1)) || 1
      );

      for (let i = 0; i < count; i += 1) {
        const studentEsis = String(esis[i] || `${submissionCode}-STU-${i + 1}`).trim();

        const { data: student, error: studentError } = await supabase
          .from("students")
          .upsert(
            {
              student_esis: studentEsis,
              student_name: String(names[i] || `Student ${i + 1}`).trim(),
              grade: String(grades[i] || "").trim() || null,
              gender: String(genders[i] || "").trim() || null,
              nationality: String(nationalities[i] || "").trim() || null,
              school_id: school.id,
              updated_at: new Date().toISOString()
            },
            { onConflict: "student_esis" }
          )
          .select("id")
          .single();
        if (studentError) throw studentError;

        const { error: linkError } = await supabase.from("submission_students").upsert({
          submission_id: submission.id,
          student_id: student.id,
          display_order: i + 1
        });
        if (linkError) throw linkError;
      }
    }

    return NextResponse.json({
      ok: true,
      importedCount,
      reuploadedCount,
      processedRows: rows.length
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Import failed." }, { status: 500 });
  }
}