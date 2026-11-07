import { route, body, bad, forbidden } from "@/lib/api";
import { db, q, all, inChunks } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { audit } from "@/lib/audit";
import { entryFiles } from "@/lib/files";
import { fileView } from "@/lib/entryview";
import { coverThumbs } from "@/lib/covers";

// Proofreading and the final review of the selected artworks (passed Round 2). Proofreaders correct the titles,
// descriptions, reflections and other details, then pass each artwork to the reviewers, who confirm the data or
// send it back with a note. It runs alongside the artworks handling and doesn't affect it.
//   status: to_proofread → to_review → confirmed (send back: to_proofread with the reviewer's note)
const VIEW = ["admin", "management", "leadership", "proofreader", "reviewer"];
const STATUS = { to_proofread: "To proofread", to_review: "To review", confirmed: "Confirmed" };

// every selected artwork gets a proofreading record the first time the list is opened after the results
async function ensureRows(has) {
  const res = await all(() => db().from("nae_results").select("entry_id, entry:nae_entries(pathway_code, status)").eq("round_no", 2).eq("complete", true).eq("passed", true));
  const ids = res.filter(r => r.entry && has(r.entry.pathway_code) && r.entry.status !== "withdrawn").map(r => r.entry_id);
  if (!ids.length) return [];
  const have = new Set((await inChunks(ids, part => q(db().from("nae_proof").select("entry_id").in("entry_id", part)))).map(x => x.entry_id));
  const add = ids.filter(id => !have.has(id));
  for (let i = 0; i < add.length; i += 300) await q(db().from("nae_proof").upsert(add.slice(i, i + 300).map(entry_id => ({ entry_id })), { onConflict: "entry_id", ignoreDuplicates: true }));
  return ids;
}

export const GET = route(VIEW, async ({ url, scope }) => {
  const S = await loadStructure(); const { has } = await scope(S);
  const ids = await ensureRows(has);
  const code = url.searchParams.get("entry");
  if (code) {
    const e = await q(db().from("nae_entries").select("*, school:nae_schools(name, esis)").eq("code", code).maybeSingle());
    if (!e || !ids.includes(e.id)) throw bad("This artwork is not in proofreading.");
    const [p, students, files] = await Promise.all([
      q(db().from("nae_proof").select("*").eq("entry_id", e.id).maybeSingle()),
      q(db().from("nae_entry_students").select("id, position, name_en, name_ar, grade").eq("entry_id", e.id).order("position")),
      entryFiles(e).catch(() => [])
    ]);
    const P = S.P[e.pathway_code];
    return { entry: { ...e, raw: undefined, search_text: undefined, pathway: P?.name, sub: (P?.subs.find(s => s.code === e.sub_code) || {}).name, competition: P?.eval_type === "Competition" }, proof: p, students, files: files.map(fileView) };
  }
  const rows = await inChunks(ids, part => q(db().from("nae_proof").select("*, entry:nae_entries(id, code, reference_id, source_path, title_en, title_ar, group_name, pathway_code, sub_code, school:nae_schools(name, esis))").in("entry_id", part)));
  const th = await coverThumbs(rows.map(r => r.entry).filter(Boolean));
  return {
    statuses: STATUS,
    rows: rows.filter(r => r.entry).map(r => ({ code: r.entry.code, title: r.entry.title_en || r.entry.title_ar || r.entry.group_name || "", title_ar: r.entry.title_ar, school: r.entry.school?.name || "", pathway: S.P[r.entry.pathway_code]?.name || "", status: r.status, proofread_by: r.proofread_by, proofread_at: r.proofread_at, reviewed_by: r.reviewed_by, reviewed_at: r.reviewed_at, review_note: r.review_note, proof_note: r.proof_note, thumb: th[r.entry.id] || null }))
      .sort((a, b) => a.school.localeCompare(b.school) || a.code.localeCompare(b.code))
  };
});

export const POST = route(["admin", "management", "proofreader", "reviewer"], async ({ session, request }) => {
  const b = await body(request);
  const e = await q(db().from("nae_entries").select("id, code").eq("code", b.code || "").maybeSingle()); if (!e) throw bad("Artwork not found.");
  const p = await q(db().from("nae_proof").select("*").eq("entry_id", e.id).maybeSingle()); if (!p) throw bad("This artwork is not in proofreading.");
  const now = new Date().toISOString(); const note = String(b.note || "").trim().slice(0, 1000) || null;
  const isProof = ["admin", "management", "proofreader"].includes(session.role), isRev = ["admin", "management", "reviewer"].includes(session.role);
  // the students' names and grades (proofread like the rest of the text)
  if (b.action === "students") {
    if (p.status === "confirmed" && !["admin", "management"].includes(session.role)) throw bad("Already confirmed. Ask an admin to reopen it.");
    const list = Array.isArray(b.students) ? b.students : []; const cur = await q(db().from("nae_entry_students").select("id, name_en, name_ar, grade").eq("entry_id", e.id));
    const changed = [];
    for (const s of list) { const c = cur.find(x => x.id === s.id); if (!c) continue; const patch = {}; for (const k of ["name_en", "name_ar", "grade"]) { const v = String(s[k] ?? "").trim().slice(0, 200) || null; if (v !== (c[k] ?? null)) patch[k] = v; } if (Object.keys(patch).length) { await q(db().from("nae_entry_students").update(patch).eq("id", c.id)); changed.push(Object.keys(patch).join("/")); } }
    if (changed.length) await audit(session, `Proofreading: students' details corrected (${changed.length})`, "entry", e.id, changed.join(", "));
    return { ok: true, note: changed.length ? "Students' details saved." : "Nothing changed." };
  }
  if (b.action === "done") {
    if (!isProof) throw forbidden("Proofreaders pass artworks to the review.");
    if (p.status !== "to_proofread") throw bad(p.status === "to_review" ? "Already with the reviewers." : "Already confirmed.");
    await q(db().from("nae_proof").update({ status: "to_review", proofread_by_id: session.sub, proofread_by: session.name, proofread_at: now, proof_note: note, updated_at: now }).eq("entry_id", e.id));
    await audit(session, "Proofread: passed to the review", "entry", e.id, note || "");
    return { ok: true, note: `${e.code} passed to the reviewers.` };
  }
  if (b.action === "confirm" || b.action === "send_back") {
    if (!isRev) throw forbidden("Reviewers confirm the data.");
    if (p.status !== "to_review") throw bad(p.status === "to_proofread" ? "It isn't proofread yet." : "Already confirmed.");
    if (b.action === "send_back" && !note) throw bad("Say what needs another look.");
    await q(db().from("nae_proof").update(b.action === "confirm" ? { status: "confirmed", reviewed_by_id: session.sub, reviewed_by: session.name, reviewed_at: now, review_note: note, updated_at: now } : { status: "to_proofread", review_note: note, reviewed_by_id: session.sub, reviewed_by: session.name, reviewed_at: now, updated_at: now }).eq("entry_id", e.id));
    await audit(session, b.action === "confirm" ? "Final review: data confirmed" : "Final review: sent back to proofreading", "entry", e.id, note || "");
    return { ok: true, note: b.action === "confirm" ? `${e.code} confirmed.` : `${e.code} sent back to proofreading.` };
  }
  if (b.action === "reopen") {
    if (!["admin", "management"].includes(session.role)) throw forbidden("An admin reopens a confirmed artwork.");
    await q(db().from("nae_proof").update({ status: "to_proofread", updated_at: now, review_note: note || p.review_note }).eq("entry_id", e.id));
    await audit(session, "Proofreading reopened", "entry", e.id, note || "");
    return { ok: true, note: `${e.code} is back in proofreading.` };
  }
  throw bad("Unknown action.");
});
