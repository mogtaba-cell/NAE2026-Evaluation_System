// Artwork size in cm: length × width (× height). Shared by the importer and the details editor.
const n1 = n => (Math.round(n * 10) / 10).toString();
export function sizeCm(L, W, H) {
  const ok = v => v != null && v !== "" && !isNaN(Number(v)) && Number(v) > 0;
  if (!ok(L) || !ok(W)) return null;
  return `${n1(Number(L))} × ${n1(Number(W))}${ok(H) ? ` × ${n1(Number(H))}` : ""} cm`;
}
// "30 × 2.5 × 30 cm", "30 × 2.5 cm × 30 cm" (older imports) or "40 × 60 cm" → {L, W, H}; null for anything else (e.g. px)
export function parseSize(t) {
  const s = String(t || "").trim(); if (!s || /px/i.test(s)) return null;
  const m = s.replace(/cm/gi, "").split(/[×x*]/i).map(x => x.trim()).filter(Boolean);
  if (m.length < 2 || m.length > 3 || m.some(x => isNaN(Number(x)))) return null;
  return { L: m[0], W: m[1], H: m[2] || "" };
}
