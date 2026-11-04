// Yes/no questions in a rubric (national identity, theme, ...). Older rubric versions only had the national identity
// switch (identity_required / identity_pass); they read as one question with the key "identity".
// Each question: { key, label, label_ar, ask, ask_ar, pass_yes, options, other, flag_choice }
//   pass_yes: every evaluator must say yes to go through
//   options: when the answer is Yes, the evaluator also picks one of these (other: or types their own, "Other")
//   flag_choice: send to management review when evaluators who said Yes picked different options
// The pick is kept in the score's answers as "<key>_choice" (an option, or "Other: <text>").
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
export const answersOf = (s, qs) => Object.fromEntries(qs.flatMap(q => [[q.key, answerOf(s, q.key)], ...(s?.answers?.[`${q.key}_choice`] ? [[`${q.key}_choice`, s.answers[`${q.key}_choice`]]] : [])]));
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
    const options = [...new Set((Array.isArray(raw?.options) ? raw.options : String(raw?.options || "").split("\n")).map(o => String(o || "").trim().slice(0, 80)).filter(Boolean))].slice(0, 20);
    out.push({ key, label, label_ar: String(raw?.label_ar || "").trim().slice(0, 80), ask: String(raw?.ask || "").trim().slice(0, 300), ask_ar: String(raw?.ask_ar || "").trim().slice(0, 300), pass_yes: !!raw?.pass_yes,
      ...(options.length ? { options, other: !!raw?.other, flag_choice: !!raw?.flag_choice } : {}) });
  }
  return out;
}
// the answers a score carries, kept to the version's questions; national_identity mirrors the "identity" answer
export function normAnswers(qs, answers, legacyIdentity) {
  const src = { ...(answers && typeof answers === "object" ? answers : {}) };
  if (typeof legacyIdentity === "boolean" && typeof src.identity !== "boolean") src.identity = legacyIdentity;
  const out = {};
  for (const q of qs) {
    if (typeof src[q.key] !== "boolean") continue;
    out[q.key] = src[q.key];
    const c = String(src[`${q.key}_choice`] || "").trim().slice(0, 200);
    if (src[q.key] && q.options?.length && c && (q.options.includes(c) || (q.other && /^Other: \S/.test(c)))) out[`${q.key}_choice`] = c;
  }
  return out;
}
// the first question not answered (a Yes with options also needs one picked); returns the question with why
export function missingAnswer(qs, answers) {
  for (const q of qs) {
    if (typeof answers?.[q.key] !== "boolean") return { ...q, why: `choose yes or no for ${q.label.toLowerCase()}` };
    if (answers[q.key] && q.options?.length && !answers[`${q.key}_choice`]) return { ...q, why: `pick an option for ${q.label.toLowerCase()}${q.other ? " (or Other, with the text)" : ""}` };
  }
  return null;
}
export const choiceOf = (s, key) => (s?.answers?.[`${key}_choice`]) || null;
export const OTHER = "Other";
