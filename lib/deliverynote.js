import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readPhoto } from "@/lib/photostore";

// Delivery confirmation note (PDF), following the NAE "Artwork Collection Form": school, submission details, artworks
// expected and delivered per pathway, box photos, who delivered them and their Emirates ID. Saved with the photos in
// the school's folder (06 Uploads / Collections / <eSIS> <School> / <date>). Instead of a signature it records who
// confirmed the delivery in the website and when.
const INK = rgb(0.06, 0.1, 0.24), MUTED = rgb(0.38, 0.42, 0.5), RULE = rgb(0.86, 0.88, 0.92), BAND = rgb(0.92, 0.93, 0.98);
// the standard PDF fonts only cover Latin text: anything else (e.g. Arabic titles) is left out
const latin = s => String(s ?? "").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/·/g, "-").replace(/×/g, "x").replace(/[^\x20-\x7e\xa0-\xff]/g, "").replace(/\s+/g, " ").trim();

export async function deliveryNotePdf({ school, collection, when, receivedBy, contact, phone, boxes, perPathway, received, missing, boxPhotos = [], eidPhotos = [], note }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Artwork receiving note - ${latin(school?.name)}`); pdf.setAuthor("NAE Evaluation System");
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 48;
  let page, y;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M; page.drawText(`Page ${pdf.getPageCount()}`, { x: W - M - 40, y: 24, size: 8, font, color: MUTED }); };
  const need = h => { if (y - h < M) newPage(); };
  const text = (s, x, size = 10, f = font, color = INK) => page.drawText(latin(s), { x, y, size, font: f, color });
  const wrap = (s, size, f, width) => { const words = latin(s).split(" "); const lines = []; let cur = ""; for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (f.widthOfTextAtSize(t, size) > width && cur) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur); return lines.length ? lines : [""]; };
  const row = (label, value) => { const lines = wrap(value || "-", 10, font, W - M - 210); need(16 * lines.length + 4); text(label, M, 10, bold); lines.forEach((l, i) => page.drawText(l, { x: M + 200, y: y - i * 14, size: 10, font, color: INK })); y -= 14 * lines.length + 8; };
  const heading = s => { need(36); y -= 8; text(s, M, 15, bold); y -= 22; };

  newPage();
  page.drawRectangle({ x: 0, y: H - 120, width: W, height: 120, color: BAND });
  y = H - 52; text(when.label, W - M - font.widthOfTextAtSize(latin(when.label), 10), 10);
  y = H - 86; text("National Art Expressions: Artwork Receiving Note", M, 17, bold);
  y = H - 106; text(`Collection ${collection?.code || ""}`, M, 10, font, MUTED);
  y = H - 150;
  row("School eSIS", school?.esis); row("School Name", school?.name); row("School Region", school?.region);
  heading("Submission Details");
  row("Delivered on", when.label); row("Received by", receivedBy); row("No. of Boxes", boxes != null ? String(boxes) : "-");
  // artworks delivered per pathway
  need(60); text("Artworks Delivery per Pathway", M, 11, bold); y -= 18;
  const cols = [M, M + 30, M + 210, M + 315, M + 420], cw = W - 2 * M;
  page.drawRectangle({ x: M, y: y - 6, width: cw, height: 20, color: BAND });
  ["", "Pathway", "Artworks Expected", "Artworks Delivered", "Still to come"].forEach((h, i) => text(h, cols[i] + 6, 9, bold)); y -= 22;
  perPathway.forEach((p, i) => { need(20); page.drawLine({ start: { x: M, y: y + 14 }, end: { x: M + cw, y: y + 14 }, thickness: 0.5, color: RULE }); text(String(i + 1), cols[0] + 6, 10, bold); text(p.name, cols[1] + 6, 10); text(String(p.expected), cols[2] + 6, 10); text(String(p.delivered), cols[3] + 6, 10); text(String(p.left), cols[4] + 6, 10); y -= 20; });
  page.drawLine({ start: { x: M, y: y + 14 }, end: { x: M + cw, y: y + 14 }, thickness: 0.5, color: RULE }); y -= 10;
  // the artworks
  heading(`Artworks received (${received.length})`);
  for (const a of received) { const lines = wrap(`${a.code}   ${a.title || ""}${a.pathway ? `   (${a.pathway})` : ""}${a.condition && a.condition !== "Good" ? `   - ${a.condition}` : ""}`, 9, font, cw); need(13 * lines.length + 2); lines.forEach((l, i) => page.drawText(l, { x: M, y: y - i * 12, size: 9, font, color: a.damaged ? rgb(0.6, 0.15, 0.1) : INK })); y -= 12 * lines.length + 3; }
  if (missing.length) { heading(`Missing, still to be delivered (${missing.length})`); for (const a of missing) { need(14); text(`${a.code}   ${a.title || ""}${a.pathway ? `   (${a.pathway})` : ""}`, M, 9); y -= 13; } }
  if (note) { heading("Note"); for (const l of wrap(note, 10, font, cw)) { need(14); text(l, M, 10); y -= 14; } }
  // photos
  const draw = async (label, list, maxW, maxH) => {
    if (!list.length) return;
    need(Math.min(maxH, 200) + 40); heading(label);
    let x = M, rowH = 0;
    for (const p of list) {
      let img; try { const buf = await readPhoto(p.path); img = /png/i.test(p.mime || "") ? await pdf.embedPng(buf) : await pdf.embedJpg(buf); } catch { continue; }
      const k = Math.min(maxW / img.width, maxH / img.height); const w = img.width * k, h = img.height * k;
      if (x + w > W - M) { x = M; y -= rowH + 10; rowH = 0; }
      if (y - h < M) { newPage(); x = M; rowH = 0; }
      page.drawImage(img, { x, y: y - h, width: w, height: h }); x += w + 10; rowH = Math.max(rowH, h);
    }
    y -= rowH + 14;
  };
  await draw("Box photos", boxPhotos, 240, 240);
  heading("Delivered By");
  row("Delivered By", contact); row("Phone Number", phone);
  await draw("Emirates ID", eidPhotos, 300, 220);
  need(40); y -= 6; page.drawLine({ start: { x: M, y: y + 10 }, end: { x: W - M, y: y + 10 }, thickness: 0.5, color: RULE });
  text(`Confirmed in the NAE Evaluation System by ${receivedBy} on ${when.label}.`, M, 9, font, MUTED);
  return Buffer.from(await pdf.save());
}
