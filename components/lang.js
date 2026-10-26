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

export function LangToggle({ lang, onChange }) {
  return <div className="x-lang" role="group" aria-label="Language">{[["en", "English"], ["ar", "العربية"], ["both", "Both"]].map(([k, l]) => <button key={k} type="button" className={lang === k ? "on" : ""} aria-pressed={lang === k} onClick={() => onChange(k)} lang={k === "ar" ? "ar" : undefined}>{l}</button>)}</div>;
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
