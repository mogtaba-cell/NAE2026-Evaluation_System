import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Return note (PDF): artworks handed back to their school (not selected in Round 2, the wrong artwork, or after the
// exhibition), who collected them for the school and who handed them over. Filed in 06 Uploads / Returns.
const INK = rgb(0.06, 0.1, 0.24), MUTED = rgb(0.38, 0.42, 0.5), RULE = rgb(0.86, 0.88, 0.92), BAND = rgb(0.92, 0.93, 0.98);
const latin = s => String(s ?? "").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/·/g, "-").replace(/×/g, "x").replace(/[^\x20-\x7e\xa0-\xff]/g, "").replace(/\s+/g, " ").trim();
export const REASONS = { not_selected: "Not selected in Round 2", wrong: "Wrong artwork sent", after_exhibition: "After the exhibition", other: "Other" };

export async function returnNotePdf({ school, when, by, contact, phone, boxes, reason, note, artworks }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Artwork return note - ${latin(school?.name)}`); pdf.setAuthor("NAE Evaluation System");
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 48, cw = W - 2 * M;
  let page, y;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M; page.drawText(`Page ${pdf.getPageCount()}`, { x: W - M - 40, y: 24, size: 8, font, color: MUTED }); };
  const need = h => { if (y - h < M) newPage(); };
  const text = (s, x, size = 10, f = font, color = INK) => page.drawText(latin(s), { x, y, size, font: f, color });
  const wrap = (s, size, f, width) => { const words = latin(s).split(" "); const lines = []; let cur = ""; for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (f.widthOfTextAtSize(t, size) > width && cur) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur); return lines.length ? lines : [""]; };
  const row = (label, value) => { const lines = wrap(value || "-", 10, font, W - M - 210); need(16 * lines.length + 4); text(label, M, 10, bold); lines.forEach((l, i) => page.drawText(l, { x: M + 200, y: y - i * 14, size: 10, font, color: INK })); y -= 14 * lines.length + 8; };
  const heading = s => { need(36); y -= 8; text(s, M, 15, bold); y -= 22; };
  newPage();
  page.drawRectangle({ x: 0, y: H - 120, width: W, height: 120, color: BAND });
  y = H - 52; text(when, W - M - font.widthOfTextAtSize(latin(when), 10), 10);
  y = H - 86; text("National Art Expressions: Artwork Return Note", M, 17, bold);
  y = H - 106; text("Artworks returned to the school", M, 10, font, MUTED);
  y = H - 150;
  row("School eSIS", school?.esis); row("School Name", school?.name); row("School Region", school?.region);
  heading("Return Details");
  row("Returned on", when); row("Reason", reason); row("Handed over by", by); row("No. of Boxes", boxes != null ? String(boxes) : "-");
  heading(`Artworks returned (${artworks.length})`);
  const cols = [M, M + 26, M + 120, M + 330];
  need(24); page.drawRectangle({ x: M, y: y - 6, width: cw, height: 20, color: BAND });
  ["", "Code", "Title", "Pathway"].forEach((h, i) => text(h, cols[i] + 4, 9, bold)); y -= 22;
  artworks.forEach((a, i) => {
    const tl = wrap(a.title || "", 9, font, 200); need(14 * tl.length + 6);
    page.drawLine({ start: { x: M, y: y + 12 }, end: { x: M + cw, y: y + 12 }, thickness: 0.5, color: RULE });
    text(String(i + 1), cols[0] + 4, 9, bold); text(a.code, cols[1] + 4, 9); tl.forEach((l, j) => page.drawText(l, { x: cols[2] + 4, y: y - j * 12, size: 9, font, color: INK })); text(a.pathway || "", cols[3] + 4, 9);
    y -= 12 * tl.length + 6;
  });
  if (note) { heading("Note"); for (const l of wrap(note, 10, font, cw)) { need(14); text(l, M, 10); y -= 14; } }
  heading("Collected By (for the school)");
  row("Name", contact); row("Phone Number", phone);
  need(70); y -= 10; text("Signature (school representative):", M, 10, bold); page.drawLine({ start: { x: M + 200, y: y - 2 }, end: { x: W - M, y: y - 2 }, thickness: 0.7, color: INK }); y -= 34;
  text("Signature (handed over by):", M, 10, bold); page.drawLine({ start: { x: M + 200, y: y - 2 }, end: { x: W - M, y: y - 2 }, thickness: 0.7, color: INK }); y -= 30;
  page.drawLine({ start: { x: M, y: y + 10 }, end: { x: W - M, y: y + 10 }, thickness: 0.5, color: RULE });
  text(`Recorded in the NAE Evaluation System by ${by} on ${when}.`, M, 9, font, MUTED);
  return Buffer.from(await pdf.save());
}
