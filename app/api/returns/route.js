import { route, body, bad } from "@/lib/api";
import { db, q, all, inChunks } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { audit } from "@/lib/audit";
import { applyMove } from "@/lib/movements";
import { storeUpload, dayOf } from "@/lib/photostore";
import { returnNotePdf, REASONS } from "@/lib/returnnote";

// Returning artworks to their schools: artworks in storage (or still at the exhibition) that go back, with the reason
// (not selected in Round 2, wrong artwork, after the exhibition, other). Each return is one school and makes a
// return note (PDF) with signature lines, filed in 06 Uploads / Returns / <eSIS> <School> / <date>.
const STATES = ["storage", "showcase", "exhibition"];
export const GET = route(["admin", "storage"], async ({ scope }) => {
  const S = await loadStructure(); const { has } = await scope(S);
  const lg = (await all(() => db().from("nae_logistics").select("entry_id, state, location, exhibit_sent_at, loc:nae_locations(label, sort), entry:nae_entries(id, code, title_en, title_ar, group_name, pathway_code, status, school:nae_schools(id, name, esis))").in("state", STATES)))
    .filter(r => r.entry && has(r.entry.pathway_code));
  const res = await inChunks(lg.map(r => r.entry_id), part => q(db().from("nae_results").select("entry_id, complete, passed").eq("round_no", 2).in("entry_id", part)));
  const rows = lg.map(r => { const x = res.find(y => y.entry_id === r.entry_id);
    const suggest = x?.complete && !x.passed ? "not_selected" : r.exhibit_sent_at ? "after_exhibition" : r.entry.status === "withdrawn" ? "wrong" : null;
    return { code: r.entry.code, title: r.entry.title_en || r.entry.title_ar || r.entry.group_name || "", pathway: S.P[r.entry.pathway_code]?.name || "", school_id: r.entry.school?.id || null, school: r.entry.school?.name || "No school", esis: r.entry.school?.esis || "",
      state: r.state, where: r.loc?.label || r.location || "", locSort: r.loc?.sort ?? 1e9, selected: !!(x?.complete && x.passed), r2: x?.complete ? (x.passed ? "Selected" : "Not selected") : "Not scored", suggest }; });
  const done = await q(db().from("nae_returns").select("*, school:nae_schools(name, esis)").order("at", { ascending: false }).limit(200));
  return { rows, reasons: REASONS, returns: done.map(r => ({ ...r, school: r.school?.name || "", esis: r.school?.esis || "" })) };
});
export const POST = route(["admin", "storage"], async ({ session, request, scope }) => {
  const b = await body(request);
  const S = await loadStructure(); const { has } = await scope(S);
  if (!REASONS[b.reason]) throw bad("Choose why they go back.");
  const contact = String(b.contact_name || "").trim(), phone = String(b.contact_phone || "").trim(), note = String(b.note || "").trim().slice(0, 1000);
  if (!contact) throw bad("Who collects them for the school?");
  if (b.reason === "other" && !note) throw bad("Add a note for “Other”.");
  const codes = (b.codes || []).filter(Boolean); if (!codes.length) throw bad("Tick the artworks that go back.");
  const es = (await inChunks(codes, part => q(db().from("nae_entries").select("id, code, title_en, title_ar, group_name, pathway_code, school_id, school:nae_schools(id, name, esis, region)").in("code", part)))).filter(e => has(e.pathway_code));
  if (new Set(es.map(e => e.school_id)).size !== 1) throw bad("A return is for one school at a time.");
  const school = es[0].school;
  const r = await applyMove(session, "return_school", es.map(e => e.id), { note: `${REASONS[b.reason]}${note ? `: ${note}` : ""} · collected by ${contact}${phone ? ` (${phone})` : ""}`, ref_type: "return" });
  if (!r.done.length) throw bad(`None could be returned (${[...new Set(r.skipped.map(x => x.why))].join(", ")}).`);
  const boxes = b.boxes === "" || b.boxes == null ? null : Math.max(0, parseInt(b.boxes) || 0);
  const ret = await q(db().from("nae_returns").insert({ school_id: school?.id || null, by_id: session.sub, by_name: session.name, contact_name: contact, contact_phone: phone || null, boxes, reason: b.reason, note: note || null, entries: r.done }).select("id, at").single());
  try {
    const nowD = new Date(ret.at);
    const label = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(nowD);
    const pdf = await returnNotePdf({ school, when: label, by: session.name, contact, phone, boxes, reason: REASONS[b.reason], note, artworks: es.filter(e => r.done.includes(e.code)).map(e => ({ code: e.code, title: e.title_en || e.title_ar || e.group_name || "", pathway: S.P[e.pathway_code]?.name || "" })) });
    const path = await storeUpload({ segments: ["Returns", `${school?.esis || "No eSIS"} ${school?.name || "Unknown school"}`, dayOf(nowD)], name: `Return note - ${school?.esis || ""} ${school?.name || ""}.pdf`, buf: pdf, mime: "application/pdf", key: `returns/${ret.id}.pdf` });
    await q(db().from("nae_returns").update({ note_path: path }).eq("id", ret.id));
  } catch (e) { console.error("return note not made", e.message); }
  await audit(session, `Returned to ${school?.name || "the school"}: ${r.done.length} artwork${r.done.length === 1 ? "" : "s"} (${REASONS[b.reason]})`, "return", ret.id, r.done.slice(0, 40).join(", "));
  return { ok: true, id: ret.id, note: `Returned ${r.done.length} artwork${r.done.length === 1 ? "" : "s"} to ${school?.name || "the school"}. The return note is ready to print and sign.${r.skipped.length ? ` ${r.skipped.length} skipped.` : ""}` };
});
