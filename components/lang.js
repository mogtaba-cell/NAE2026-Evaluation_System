"use client";
// English / Arabic switching, shared across the page: "About the entry", the scoring form and the session
// score sheet all follow one choice, remembered per browser.
import { useEffect, useState } from "react";

const KEY = "nae.lang", EVT = "nae-lang";
export const AR_FONT = '"IBM Plex Sans Arabic", var(--sans)';

// depKey: reset to the saved choice when this changes (e.g. a new entry). hasEn/hasAr: what this content has,
// so a saved "English" choice doesn't open on an empty English view.
export function useLang(depKey, hasEn = true, hasAr = true) {
  const [lang, setLang] = useState("en");
  useEffect(() => {
    let saved = null; try { saved = localStorage.getItem(KEY); } catch {}
    setLang(saved && (saved !== "en" || hasEn) && (saved !== "ar" || hasAr) ? saved : hasEn ? "en" : "ar");
  }, [depKey]); // eslint-disable-line
  useEffect(() => {
    const h = e => setLang(e.detail);
    window.addEventListener(EVT, h); return () => window.removeEventListener(EVT, h);
  }, []);
  const set = l => { setLang(l); try { localStorage.setItem(KEY, l); } catch {} window.dispatchEvent(new CustomEvent(EVT, { detail: l })); };
  return [lang, set];
}

// both=false: scoring screens offer English or Arabic only (side by side doesn't fit criteria with guidance).
export function LangToggle({ lang, onChange, both = true }) {
  return <div className="x-lang" role="group" aria-label="Language">{[["en", "English"], ["ar", "العربية"], ...(both ? [["both", "Both"]] : [])].map(([k, l]) => <button key={k} type="button" className={lang === k ? "on" : ""} aria-pressed={lang === k} onClick={() => onChange(k)} lang={k === "ar" ? "ar" : undefined}>{l}</button>)}</div>;
}

export const hasArabic = criteria => (criteria || []).some(c => c.label_ar || c.description_ar);

// A rubric criterion's name and guidance in the chosen language. Arabic falls back to English, with a note,
// when the rubric has no Arabic text for that criterion.
export function CritText({ c, lang, weight = true }) {
  const w = weight ? <span className="faint small" style={{ display: "inline", fontWeight: 400 }}> · {c.weight}%</span> : null;
  const en = <div><b>{c.label}{w}</b>{c.description && <span>{c.description}</span>}</div>;
  if (lang === "en") return en;
  const hasAr = !!(c.label_ar || c.description_ar);
  const ar = hasAr
    ? <div className="crit-ar" lang="ar" dir="rtl"><b>{c.label_ar || c.label}{w}</b>{(c.description_ar || c.description) && <span>{c.description_ar || c.description}</span>}</div>
    : <div className="crit-ar" lang="ar" dir="rtl"><span>لا توجد ترجمة عربية لهذا المعيار</span></div>;
  if (lang === "ar") return hasAr ? ar : <>{en}{ar}</>;
  return <>{en}{ar}</>;
}

// Short name only (tables, confirmation dialog).
export const critName = (c, lang) => lang === "ar" ? (c.label_ar || c.label) : lang === "both" && c.label_ar ? `${c.label} / ${c.label_ar}` : c.label;

// Scoring screens: one language at a time ("Both" chosen elsewhere shows English here), Arabic right to left.
export const scoreLang = l => (l === "ar" ? "ar" : "en");
export const SL = {
  en: { scores: "Scores", yourScore: "Your score", criterion: "Criterion", total: "Total", identity: "National identity", identityQ: "Does the work clearly express UAE national identity?", identityReq: " Required to go through.", yes: "Yes", no: "No", y: "Y", n: "N",
    framing: "Framing for the showcase", framingQ: "If this artwork is selected, does it need framing?", needs: "Needs framing", glass: "Protective glass", comment: "Comment (optional)", commentPh: "Anything the team should know",
    wtotal: "Weighted total", grade: "Grade", teamResult: "Team result", of: (a, b) => `${a} of ${b} criteria`, saveDraft: "Save draft", submit: "Submit score", each: "each criterion 0 to 100", rubric: "Rubric", round: "Round",
    absent: "Absent", save: "Save", saved: "Saved", undoAbsent: "Undo absent", saveAll: n => `Save all ${n}`, next: "Next artwork ›", noAr: null, saveSheet: "Save scores and go to next", saveSheetLast: "Save scores", draftKept: "Typed scores are kept as a draft until you save.", needFill: n => `Fill in or mark absent: ${n}`, undo: "Undo" },
  ar: { scores: "الدرجات", yourScore: "درجتك", criterion: "المعيار", total: "المجموع", identity: "الهوية الوطنية", identityQ: "هل يعبّر العمل بوضوح عن الهوية الوطنية الإماراتية؟", identityReq: " مطلوب للتأهل.", yes: "نعم", no: "لا", y: "نعم", n: "لا",
    framing: "التأطير للمعرض", framingQ: "إذا اختير هذا العمل، هل يحتاج إلى تأطير؟", needs: "يحتاج إلى تأطير", glass: "زجاج واقٍ", comment: "ملاحظة (اختياري)", commentPh: "أي شيء يحتاج الفريق إلى معرفته",
    wtotal: "المجموع الموزون", grade: "التقدير", teamResult: "نتيجة الفريق", of: (a, b) => `${a} من ${b} معايير`, saveDraft: "حفظ كمسودة", submit: "إرسال الدرجة", each: "كل معيار من 0 إلى 100", rubric: "المعيار المعتمد", round: "الجولة",
    absent: "غائب", save: "حفظ", saved: "محفوظ", undoAbsent: "إلغاء الغياب", saveAll: n => `حفظ الكل (${n})`, next: "العمل التالي ‹", noAr: "لا توجد ترجمة عربية لهذا المعيار", saveSheet: "حفظ الدرجات والانتقال إلى التالي", saveSheetLast: "حفظ الدرجات", draftKept: "تُحفظ الدرجات المكتوبة كمسودة حتى تحفظها.", needFill: n => `أكمل أو سجّل الغياب: ${n}`, undo: "تراجع" }
};
// Name and guidance of a criterion in one language (Arabic falls back to English text).
export const critIn = (c, sl) => sl === "ar" ? { label: c.label_ar || c.label, desc: c.description_ar || c.description || "", missing: !c.label_ar } : { label: c.label, desc: c.description || "", missing: false };
