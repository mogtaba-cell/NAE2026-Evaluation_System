// Removed in v2 of the NAE Evaluation System. This file can be deleted.
import { NextResponse } from "next/server";
const gone = () => NextResponse.json({ error: "This endpoint was removed in v2." }, { status: 410 });
export { gone as GET, gone as POST, gone as PATCH, gone as DELETE };
