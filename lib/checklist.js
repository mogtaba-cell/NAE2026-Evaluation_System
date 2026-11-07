import { coverImage } from "@/lib/framing";

// An Excel checklist with a photo of each artwork, grouped (by school, storage place, size, batch...), with tick
// and signature columns for the teams handing artworks over. cols: [[header, width, (row) => value, opts]]
const border = { top: { style: "thin", color: { argb: "FFDCDDD7" } }, bottom: { style: "thin", color: { argb: "FFDCDDD7" } }, left: { style: "thin", color: { argb: "FFDCDDD7" } }, right: { style: "thin", color: { argb: "FFDCDDD7" } } };
export async function checklistXlsx({ title, subtitle, sheet = "Checklist", cols, rows, group, covers = {}, summary }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook(); wb.creator = "NAE Evaluation System"; wb.created = new Date();
  const ws = wb.addWorksheet(sheet.slice(0, 31), { views: [{ state: "frozen", ySplit: 4 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  const all = [["Done", 7, () => "☐"], ["Photo", 15, () => ""], ...cols];
  ws.columns = all.map(([, w]) => ({ width: w }));
  ws.addRow([title]).font = { bold: true, size: 14 };
  ws.addRow([subtitle]).font = { color: { argb: "FF6A706C" } };
  ws.addRow([]);
  const head = ws.addRow(all.map(c => c[0]));
  head.eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E5E57" } }; c.alignment = { vertical: "middle", wrapText: true }; });
  head.height = 30;
  const imgs = new Array(rows.length).fill(null); let k = 0;
  await Promise.all(Array.from({ length: 6 }, async () => { while (k < rows.length) { const i = k++; imgs[i] = covers[rows[i].entry_id] ? await coverImage({ coverId: covers[rows[i].entry_id] }) : null; } }));
  let last = null;
  rows.forEach((r, i) => {
    const g = group ? group(r) : null;
    if (g && g !== last) { const gr = ws.addRow([g]); ws.mergeCells(gr.number, 1, gr.number, all.length); gr.getCell(1).font = { bold: true }; gr.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3EFED" } }; gr.height = 20; last = g; }
    const row = ws.addRow(all.map(c => c[2](r) ?? ""));
    row.height = 64;
    row.eachCell({ includeEmpty: true }, c => { c.alignment = { vertical: "middle", wrapText: true }; c.border = border; });
    row.getCell(1).alignment = { vertical: "middle", horizontal: "center" }; row.getCell(1).font = { size: 16 };
    row.getCell(1).dataValidation = { type: "list", allowBlank: true, formulae: ['"☐,☑"'] };
    all.forEach((c, j) => { if (c[3]?.mono) row.getCell(j + 1).font = { name: "Consolas" }; if (c[3]?.sign) row.getCell(j + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFAF7" } }; });
    const im = imgs[i];
    if (im) { const id = wb.addImage(im); ws.addImage(id, { tl: { col: 1.1, row: row.number - 1 + 0.08 }, ext: { width: 80, height: 76 }, editAs: "oneCell" }); }
    else row.getCell(2).value = "No photo";
  });
  if (summary) { const s = wb.addWorksheet("Summary"); s.columns = summary.cols.map(w => ({ width: w })); summary.rows.forEach((r, i) => { const x = s.addRow(r); if (i === 0 || r[0] === "Total") x.font = { bold: true }; }); }
  return wb.xlsx.writeBuffer();
}
export const xlsxResponse = (buf, name) => new Response(buf, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } });
