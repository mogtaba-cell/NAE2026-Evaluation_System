// Yes/no questions in a rubric (national identity, theme, ...). Older rubric versions only had the national identity
// switch (identity_required / identity_pass); they read as one question with the key "identity".
// Each question: { key, label, label_ar, ask, ask_ar, pass_yes } — pass_yes: every evaluator must say yes to go through.
export const IDENTITY = { key: "identity", label: "National identity", label_ar: "الهوية الوطنية", ask: "Does the work clearly express UAE national identity?", ask_ar: "هل يعبّر العمل بوضوح عن الهوية الوطنية الإماراتية؟" };
export function questionsOf(v) {
  if (Array.isArray(v?.questions) && v.questions.length) return v.questions;
  return v?.identity_required ? [{ ...IDENTITY, pass_yes: !!v.identity_pass }] : [];
}
export function answerOf(s, key) {
  const a = s?.answers?.[key];
  if (typeof a === "boolean") return a;
  return key === "identity" && typeof s?.national_identity === "boolean" ? s.national_identity : null;
}
export const answersOf = (s, qs) => Object.fromEntries(qs.map(q => [q.key, answerOf(s, q.key)]));
export const qLabel = (q, ar) => (ar && q.label_ar) || q.label;
export const qAsk = (q, ar) => (ar && q.ask_ar) || q.ask || "";
// tidy a list typed in the rubric editor: keys are stable, labels required, at most 8
export function cleanQuestions(list) {
  if (!Array.isArray(list)) return [];
  const used = new Set(); const out = [];
  for (const raw of list.slice(0, 8)) {
    const label = String(raw?.label || "").trim().slice(0, 80); if (!label) continue;
    let key = String(raw?.key || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30) || label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30) || "q";
    while (used.has(key)) key += "_2"; used.add(key);
    out.push({ key, label, label_ar: String(raw?.label_ar || "").trim().slice(0, 80), ask: String(raw?.ask || "").trim().slice(0, 300), ask_ar: String(raw?.ask_ar || "").trim().slice(0, 300), pass_yes: !!raw?.pass_yes });
  }
  return out;
}
// the answers a score carries, kept to the version's questions; national_identity mirrors the "identity" answer
export function normAnswers(qs, answers, legacyIdentity) {
  const src = { ...(answers && typeof answers === "object" ? answers : {}) };
  if (typeof legacyIdentity === "boolean" && typeof src.identity !== "boolean") src.identity = legacyIdentity;
  const out = {}; for (const q of qs) if (typeof src[q.key] === "boolean") out[q.key] = src[q.key];
  return out;
}
export const missingAnswer = (qs, answers) => qs.find(q => typeof answers?.[q.key] !== "boolean");
