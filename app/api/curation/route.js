import { route, body, bad } from "@/lib/api";
import { db, q } from "@/lib/db";
import { loadStructure } from "@/lib/structure";
import { loadSelected, loadWalls } from "@/lib/curation";
import { audit } from "@/lib/audit";

// Selected artworks: professional photography and the exhibition. GET lists them (and the exhibition's sections and
// walls); POST manages the sections and walls (admin and Logistics).
export const GET = route(["admin", "storage", "management", "leadership", "coordinator"], async ({ scope }) => {
  const S = await loadStructure(); const { has } = await scope(S);
  const [rows, sections] = await Promise.all([loadSelected(S, has), loadWalls()]);
  const pathways = [...new Set(rows.map(r => r.pathway_code))].map(c => ({ code: c, name: S.P[c]?.name || c }));
  return { rows, sections, pathways };
});
export const POST = route(["admin", "storage"], async ({ session, request }) => {
  const b = await body(request);
  const name = String(b.name || "").trim().slice(0, 80);
  if (b.action === "add_section") { if (!name) throw bad("Name the section."); const n = (await q(db().from("nae_exhibit_sections").select("id"))).length; const s = await q(db().from("nae_exhibit_sections").insert({ name, sort: n }).select("*").single()); await audit(session, `Exhibition section added: ${name}`, "exhibition", s.id); return { ok: true, note: "Section added" }; }
  if (b.action === "add_wall") { if (!name || !b.section_id) throw bad("Name the wall."); const n = (await q(db().from("nae_exhibit_walls").select("id").eq("section_id", b.section_id))).length; const w = await q(db().from("nae_exhibit_walls").insert({ section_id: b.section_id, name, sort: n }).select("*").single()); await audit(session, `Exhibition wall added: ${name}`, "exhibition", w.id); return { ok: true, note: "Wall added" }; }
  if (b.action === "update_section" || b.action === "update_wall") {
    const t = b.action === "update_section" ? "nae_exhibit_sections" : "nae_exhibit_walls"; const patch = {};
    if (name) patch.name = name; if (b.active !== undefined) patch.active = !!b.active;
    if (!Object.keys(patch).length) return { ok: true };
    await q(db().from(t).update(patch).eq("id", b.id)); await audit(session, `Exhibition ${b.action === "update_section" ? "section" : "wall"} updated`, "exhibition", b.id, JSON.stringify(patch));
    return { ok: true, note: "Saved" };
  }
  throw bad("Unknown action.");
});
