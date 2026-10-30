import { route, bad } from "@/lib/api";
import { loadStructure } from "@/lib/structure";
import { audit } from "@/lib/audit";
import { loadFraming, coverImage } from "@/lib/framing";
export const maxDuration = 60;

const STATE = { storage: "In storage", requested: "Waiting for its session", picked: "Picked", handed_over: "Handed over", coordinator: "In the session room", returning: "Handed back", framer: "At the framer", showcase: "Showcase" };
const NEED = r => r.glass ? "Frame + protective glass" : "Frame";
const day = d => d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
// order: by school (then code), or by storage place (room, shelf, row) so the framing team walks the shelves in order
const order = (rows, by) => [...rows].sort(by === "place" ? (a, b) => a.locSort - b.locSort || a.code.localeCompare(b.code) : (a, b) => a.school.localeCompare(b.school) || a.code.localeCompare(b.code));
const groupKey = (r, by) => by === "place" ? (r.where ? r.where.split(" · ").slice(0, 2).join(" · ") : "No storage place") : `${r.school}${r.esis ? ` (eSIS ${r.esis})` : ""}`;

// GET: the artworks needing framing. ?format=xlsx: an Excel checklist (with photos) for the framing team.
// Filters: only=selected|all, pathway, state (storage|framer|back|all), by=school|place
export const GET = route(["admin", "storage", "management", "leadership"], async ({ session, url, scope }) => {
  const S = await loadStructure(); const { has, program } = await scope(S);
  const p = Object.fromEntries(url.searchParams);
  let rows = await loadFraming(S, has);
  if (p.format !== "xlsx") return { rows, pathways: S.pathways.filter(x => has(x.code)).map(x => ({ code: x.code, name: x.name })) };
  if (p.only !== "all") rows = rows.filter(r => r.selected);
  if (p.pathway) rows = rows.filter(r => r.pathway_code === p.pathway);
  if (p.state === "storage") rows = rows.filter(r => r.state !== "framer" && !r.framed);
  if (p.state === "framer") rows = rows.filter(r => r.state === "framer");
  if (p.state === "back") rows = rows.filter(r => r.framed);
  if (!rows.length) throw bad("No artworks match these choices.");
  const by = p.by === "place" ? "place" : "school";
  rows = order(rows, by);

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook(); wb.creator = "NAE Evaluation System"; wb.created = new Date();
  const ws = wb.addWorksheet("Framing checklist", { views: [{ state: "frozen", ySplit: 4 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  const cols = [["Done", 8], ["Photo", 15], ["Artwork code", 15], ["Title", 30], ["School", 30], ["Pathway · subpathway", 26], ["Size", 18], ["Medium", 18], ["Framing needed", 22], ["Current place", 24], ["Status", 16], ["Sent to framer", 13], ["Due back", 11], ["Back", 11], ["Framing team notes", 30]];
  ws.columns = cols.map(([h, w]) => ({ width: w }));
  const title = ws.addRow([`Framing checklist · ${program?.name || "NAE 2026"}`]); title.font = { bold: true, size: 14 };
  ws.addRow([`${rows.length} artwork${rows.length === 1 ? "" : "s"} · ${rows.filter(r => r.glass).length} with protective glass · ${p.only === "all" ? "all artworks marked for framing" : "selected artworks only"} · grouped by ${by === "place" ? "storage place" : "school"} · made ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" })}`]).font = { color: { argb: "FF6A706C" } };
  ws.addRow([]);
  const head = ws.addRow(cols.map(c => c[0]));
  head.eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E5E57" } }; c.alignment = { vertical: "middle", wrapText: true }; });
  head.height = 22;
  const border = { top: { style: "thin", color: { argb: "FFDCDDD7" } }, bottom: { style: "thin", color: { argb: "FFDCDDD7" } }, left: { style: "thin", color: { argb: "FFDCDDD7" } }, right: { style: "thin", color: { argb: "FFDCDDD7" } } };
  // photos are fetched a few at a time
  const imgs = new Array(rows.length).fill(null); let k = 0;
  await Promise.all(Array.from({ length: 6 }, async () => { while (k < rows.length) { const i = k++; imgs[i] = await coverImage(rows[i]); } }));
  let last = null;
  rows.forEach((r, i) => {
    const g = groupKey(r, by);
    if (g !== last) {
      const gr = ws.addRow([g]); ws.mergeCells(gr.number, 1, gr.number, cols.length);
      gr.getCell(1).font = { bold: true }; gr.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3EFED" } }; gr.height = 20; last = g;
    }
    const row = ws.addRow(["☐", "", r.code, r.title, `${r.school}${r.esis ? `\neSIS ${r.esis}` : ""}`, `${r.pathway}${r.sub ? ` · ${r.sub}` : ""}`, r.size, r.medium, NEED(r), r.where, r.framed ? "Framed" : STATE[r.state] || r.state, day(r.sent_on), day(r.due), day(r.back_on), ""]);
    row.height = 64;
    row.eachCell({ includeEmpty: true }, c => { c.alignment = { vertical: "middle", wrapText: true }; c.border = border; });
    row.getCell(1).alignment = { vertical: "middle", horizontal: "center" }; row.getCell(1).font = { size: 16 };
    row.getCell(3).font = { name: "Consolas" };
    if (r.glass) { row.getCell(9).font = { bold: true, color: { argb: "FF8A5300" } }; row.getCell(9).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8EDD6" } }; }
    row.getCell(1).dataValidation = { type: "list", allowBlank: true, formulae: ['"☐,☑"'] };
    const im = imgs[i];
    if (im) { const id = wb.addImage(im); ws.addImage(id, { tl: { col: 1.1, row: row.number - 1 + 0.08 }, ext: { width: 80, height: 76 }, editAs: "oneCell" }); }
    else row.getCell(2).value = "No photo";
  });
  // a short summary to check against
  const sum = wb.addWorksheet("Summary");
  sum.columns = [{ width: 36 }, { width: 12 }, { width: 14 }, { width: 14 }];
  sum.addRow(["By school", "Artworks", "With glass", "Framed"]).font = { bold: true };
  const bySchool = {}; rows.forEach(r => { const s = bySchool[r.school] ||= [0, 0, 0]; s[0]++; if (r.glass) s[1]++; if (r.framed) s[2]++; });
  Object.entries(bySchool).sort().forEach(([n, v]) => sum.addRow([n, ...v]));
  sum.addRow([]); sum.addRow(["Total", rows.length, rows.filter(r => r.glass).length, rows.filter(r => r.framed).length]).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  await audit(session, "Exported the framing checklist", "logistics", null, `${rows.length} artworks`);
  const name = `Framing checklist ${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buf, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } });
});
