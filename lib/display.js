// Display options (chosen during the physical evaluation) and size classes; shared by the pages and the server.
export const DISPLAY = [
  { key: "frame_glass", label: "Framing with protection", ar: "تأطير مع حماية", track: "framing" },
  { key: "frame_plain", label: "Framing without protection", ar: "تأطير بدون حماية", track: "framing" },
  { key: "photo_print", label: "Photography printing", ar: "طباعة فوتوغرافية", track: "framing" },
  { key: "poster_print", label: "Poster printing", ar: "طباعة ملصق", track: "printing" },
  { key: "hanging", label: "Hanging", ar: "تعليق", track: "production" },
  { key: "podium", label: "Displayed on podium", ar: "عرض على منصة", track: "production" },
  { key: "other", label: "Other", ar: "أخرى", track: "other" }
];
export const displayLabel = k => DISPLAY.find(d => d.key === k)?.label || "";
export const SIZES = [["S", "Small", "صغير"], ["M", "Medium", "متوسط"], ["L", "Large", "كبير"], ["XL", "Extra large", "كبير جدًا"]];
export const sizeLabel = k => SIZES.find(s => s[0] === k)?.[1] || "";
