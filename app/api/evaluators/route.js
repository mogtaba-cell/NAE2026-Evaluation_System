import { NextResponse } from "next/server";
import { requireRequestSession } from "@/lib/auth";
import { getAdminClient } from "@/lib/db";

export async function GET(request) {
  try {
    await requireRequestSession(request);
    const supabase = getAdminClient();
    const { data, error } = await supabase.from("evaluators").select("*").order("name");
    if (error) throw error;
    return NextResponse.json({ evaluators: data || [] });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load evaluators." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await requireRequestSession(request);
    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Evaluator name is required." }, { status: 400 });
    const supabase = getAdminClient();
    const { data, error } = await supabase.from("evaluators").insert({
      name,
      pathways: Array.isArray(body.pathways) ? body.pathways : [],
      active: body.active !== false
    }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ evaluator: data });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to create evaluator." }, { status: 500 });
  }
}
