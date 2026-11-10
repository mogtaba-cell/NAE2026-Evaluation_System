import { route, body, bad, forbidden } from "@/lib/api";
import { db, q, all, inChunks } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { audit } from "@/lib/audit";
import { entryFiles } from "@/lib/files";
import { fileView } from "@/lib/entryview";
import { coverThumbs } from "@/lib/covers";
import { REASONS } from "@/lib/corrections";

// Proofreading and the final review of the selected artworks (passed Round 2), by assignment: each artwork is
// given to one proofreader (whoever has the fewest); when it is proofread it goes to a reviewer linked to that
// proofreader (or the reviewer with the fewest). The reviewer confirms, sends it back to the proofreader, or either
// sends it to the coordinator for a correction (Corrections). Runs alongside the artworks handling.
//   status: to_proofread → to_review → confirmed; with_coordinator while a correction is open; not_scored
const VIEW = ["admin", "management", "leadership", "proofreader", "reviewer"];
const STATUS = { to_proofread: "To proofread", with_coordinator: "With the coordinator", to_review: "To review", confirmed: "Confirmed", not_scored: "Not scored" };
const TEXT = e => ({ title_en: e.title_en || "", title_ar: e.title_ar || "", description_en: e.description_en || "", description_ar: e.description_ar || "", reflections: e.reflections || {} });
const active = async role => q(db().from("nae_accounts").select("id, display_name").eq("role", role).eq("active", true));
async function load(role, ids) { return ids.length ? inChunks(ids, part => q(db().from("nae_proof").select(role === "proofreader" ? "proofreader_id" : "reviewer_id").in("status", role === "proofreader" ? ["to_proofread", "with_coordinator"] : ["to_review"]).in(role === "proofreader" ? "proofreader_id" : "reviewer_id", part))) : []; }
// whoever has the fewest artworks waiting on them
async function leastLoaded(role, candidates) {
  const people = candidates?.length ? candidates : (await active(role)).map(a => a.id);
  if (!people.length) return null;
  const rows = await load(role, people); const k = role === "proofreader" ? "proofreader_id" : "reviewer_id";
  const n = Object.fromEntries(people.map(p => [p, 0])); rows.forEach(r => { if (r[k] in n) n[r[k]]++; });
  return people.sort((a, b) => n[a] - n[b])[0];
}
async function reviewerFor(proofreaderId) {
  const ok = new Set((await active("reviewer")).map(a => a.id));
  const linked = proofreaderId ? (await q(db().from("nae_reviewer_links").select("reviewer_id").eq("proofreader_id", proofreaderId))).map(x => x.reviewer_id).filter(id => ok.has(id)) : [];
  return leastLoaded("reviewer", linked);
}

// every selected artwork gets a record (with its text as it entered proofreading) and a proofreader
async function ensureRows(has) {
  const res = await all(() => db().from("nae_results").select("entry_id, entry:nae_entries(pathway_code, status)").eq("round_no", 2).eq("complete", true).eq("passed", true));
  const ids = res.filter(r => r.entry && has(r.entry.pathway_code) && r.entry.status !== "withdrawn").map(r => r.entry_id);
  if (!ids.length) return [];
  const have = await inChunks(ids, part => q(db().from("nae_proof").select("entry_id, proofreader_id, original, status").in("entry_id", part)));
  const add = ids.filter(id => !have.some(h => h.entry_id === id));
  const needText = [...add, ...have.filter(h => !h.original).map(h => h.entry_id)];
  const ents = needText.length ? await inChunks(needText, part => q(db().from("nae_entries").select("id, title_en, title_ar, description_en, description_ar, reflections").in("id", part))) : [];
  for (const id of add) { const e = ents.find(x => x.id === id); await q(db().from("nae_proof").upsert({ entry_id: id, original: e ? TEXT(e) : null }, { onConflict: "entry_id", ignoreDuplicates: true })); }
  for (const h of have.filter(h => !h.original)) { const e = ents.find(x => x.id === h.entry_id); if (e) await q(db().from("nae_proof").update({ original: TEXT(e) }).eq("entry_id", h.entry_id)); }
  // give unassigned ones to proofreaders, a few at a time so the load stays even
  const unassigned = [...add, ...have.filter(h => !h.proofreader_id && h.status === "to_proofread").map(h => h.entry_id)];
  if (unassigned.length && (await active("proofreader")).length) for (const id of unassigned) { const p = await leastLoaded("proofreader"); if (p) await q(db().from("nae_proof").update({ proofreader_id: p }).eq("entry_id", id).is("proofreader_id", null)); }
  return ids;
}

export const GET = route(VIEW, async ({ session, url, scope }) => {
  const S = await loadStructure(); const { has } = await scope(S);
  const ids = await ensureRows(has);
  const people = await q(db().from("nae_accounts").select("id, display_name, role, active").in("role", ["proofreader", "reviewer"]));
  const nameOf = id => people.find(p => p.id === id)?.display_name || null;
  const code = url.searchParams.get("entry");
  if (code) {
    const e = await q(db().from("nae_entries").select("*, school:nae_schools(name, esis)").eq("code", code).maybeSingle());
    if (!e || !ids.includes(e.id)) throw bad("This artwork is not in proofreading.");
    const p = await q(db().from("nae_proof").select("*").eq("entry_id", e.id).maybeSingle());
    if (session.role === "proofreader" && p.proofreader_id !== session.sub) throw forbidden("This artwork is assigned to another proofreader.");
    if (session.role === "reviewer" && p.reviewer_id !== session.sub) throw forbidden("This artwork is assigned to another reviewer.");
    const [students, files, corr] = await Promise.all([
      q(db().from("nae_entry_students").select("position, name_en, name_ar, grade").eq("entry_id", e.id).order("position")),
      entryFiles(e).catch(() => []),
      q(db().from("nae_corrections").select("*").eq("entry_id", e.id).in("source", ["proofreading", "review"]).order("opened_at", { ascending: false }))
    ]);
    const lg = corr.length ? await q(db().from("nae_correction_log").select("*").in("correction_id", corr.map(c => c.id)).order("at")) : [];
    const P = S.P[e.pathway_code];
    return { statuses: STATUS, reasons: REASONS, entry: { ...e, raw: undefined, search_text: undefined, pathway: P?.name, sub: (P?.subs.find(s => s.code === e.sub_code) || {}).name, competition: P?.eval_type === "Competition" }, proof: { ...p, proofreader: nameOf(p.proofreader_id), reviewer: nameOf(p.reviewer_id) }, students, files: files.map(fileView), corrections: corr.map(c => ({ ...c, log: lg.filter(l => l.correction_id === c.id) })) };
  }
  let rows = await inChunks(ids, part => q(db().from("nae_proof").select("*, entry:nae_entries(id, code, reference_id, source_path, title_en, title_ar, group_name, pathway_code, school:nae_schools(name, esis))").in("entry_id", part)));
  if (session.role === "proofreader") rows = rows.filter(r => r.proofreader_id === session.sub);
  if (session.role === "reviewer") rows = rows.filter(r => r.reviewer_id === session.sub);
  const th = await coverThumbs(rows.map(r => r.entry).filter(Boolean));
  const links = ["admin", "management"].includes(session.role) ? await q(db().from("nae_reviewer_links").select("*")) : [];
  return {
    statuses: STATUS, people: people.filter(p => p.active).map(p => ({ id: p.id, name: p.display_name, role: p.role })), links,
    rows: rows.filter(r => r.entry).map(r => ({ code: r.entry.code, title: r.entry.title_en || r.entry.title_ar || r.entry.group_name || "", title_ar: r.entry.title_ar, school: r.entry.school?.name || "", pathway: S.P[r.entry.pathway_code]?.name || "", status: r.status,
      proofreader: nameOf(r.proofreader_id), reviewer: nameOf(r.reviewer_id), proofreader_id: r.proofreader_id, reviewer_id: r.reviewer_id, proofread_at: r.proofread_at, reviewed_at: r.reviewed_at, returned_note: r.returned_note, thumb: th[r.entry.id] || null }))
      .sort((a, b) => a.school.localeCompare(b.school) || a.code.localeCompare(b.code))
  };
});

export const POST = route(["admin", "management", "proofreader", "reviewer"], async ({ session, request }) => {
  const b = await body(request); const now = new Date().toISOString();
  const boss = ["admin", "management"].includes(session.role);
  // admins: who reviews whose work, and (re)assigning artworks
  if (b.action === "links") {
    if (!boss) throw forbidden();
    const rid = b.reviewer_id; const list = Array.isArray(b.proofreader_ids) ? b.proofreader_ids : [];
    await q(db().from("nae_reviewer_links").delete().eq("reviewer_id", rid));
    if (list.length) await q(db().from("nae_reviewer_links").insert(list.map(proofreader_id => ({ reviewer_id: rid, proofreader_id }))));
    await audit(session, "Reviewer linked to proofreaders", "account", rid, `${list.length} proofreader(s)`);
    return { ok: true, note: "Saved." };
  }
  if (b.action === "assign") {
    if (!boss) throw forbidden();
    const ents = await inChunks(b.codes || [], part => q(db().from("nae_entries").select("id, code").in("code", part)));
    const patch = {}; if (b.proofreader_id !== undefined) patch.proofreader_id = b.proofreader_id || null; if (b.reviewer_id !== undefined) patch.reviewer_id = b.reviewer_id || null;
    if (!ents.length || !Object.keys(patch).length) throw bad("Choose the artworks and the person.");
    await q(db().from("nae_proof").update({ ...patch, updated_at: now }).in("entry_id", ents.map(e => e.id)));
    await audit(session, `Proofreading: ${ents.length} artwork(s) reassigned`, "entry", null, ents.map(e => e.code).slice(0, 40).join(", "));
    return { ok: true, note: `Reassigned ${ents.length} artwork${ents.length === 1 ? "" : "s"}.` };
  }
  const e = await q(db().from("nae_entries").select("id, code").eq("code", b.code || "").maybeSingle()); if (!e) throw bad("Artwork not found.");
  const p = await q(db().from("nae_proof").select("*").eq("entry_id", e.id).maybeSingle()); if (!p) throw bad("This artwork is not in proofreading.");
  const note = String(b.note || "").trim().slice(0, 1000) || null;
  if (b.action === "done") {
    if (!boss && !(session.role === "proofreader" && p.proofreader_id === session.sub)) throw forbidden("This artwork is assigned to another proofreader.");
    if (p.status !== "to_proofread") throw bad(STATUS[p.status] ? `It is ${STATUS[p.status].toLowerCase()}.` : "Not at this stage.");
    const reviewer = p.reviewer_id || await reviewerFor(p.proofreader_id || session.sub);
    await q(db().from("nae_proof").update({ status: "to_review", reviewer_id: reviewer, proofread_by_id: session.sub, proofread_by: session.name, proofread_at: now, proof_note: note, returned_note: null, updated_at: now }).eq("entry_id", e.id));
    await audit(session, "Proofread: passed to the review", "entry", e.id, note || "");
    return { ok: true, note: reviewer ? `${e.code} passed to the review.` : `${e.code} passed to the review. No reviewer account yet: an admin assigns one.` };
  }
  if (b.action === "confirm" || b.action === "send_back") {
    if (!boss && !(session.role === "reviewer" && p.reviewer_id === session.sub)) throw forbidden("This artwork is assigned to another reviewer.");
    if (p.status !== "to_review") throw bad(p.status === "to_proofread" ? "It isn't proofread yet." : `It is ${(STATUS[p.status] || p.status).toLowerCase()}.`);
    if (b.action === "send_back" && !note) throw bad("Say what needs another look.");
    await q(db().from("nae_proof").update(b.action === "confirm" ? { status: "confirmed", reviewed_by_id: session.sub, reviewed_by: session.name, reviewed_at: now, review_note: note, updated_at: now } : { status: "to_proofread", review_note: note, returned_note: `Sent back by the reviewer: ${note}`, reviewed_by_id: session.sub, reviewed_by: session.name, reviewed_at: now, updated_at: now }).eq("entry_id", e.id));
    await audit(session, b.action === "confirm" ? "Final review: data confirmed" : "Final review: sent back to the proofreader", "entry", e.id, note || "");
    return { ok: true, note: b.action === "confirm" ? `${e.code} confirmed.` : `${e.code} sent back to the proofreader.` };
  }
  if (b.action === "reopen") {
    if (!boss) throw forbidden("An admin reopens a confirmed artwork.");
    await q(db().from("nae_proof").update({ status: "to_proofread", returned_note: note ? `Reopened: ${note}` : "Reopened", updated_at: now }).eq("entry_id", e.id));
    await audit(session, "Proofreading reopened", "entry", e.id, note || "");
    return { ok: true, note: `${e.code} is back in proofreading.` };
  }
  throw bad("Unknown action.");
});
