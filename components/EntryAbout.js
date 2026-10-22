"use client";
// "About the entry": title, description and the student's reflections, in English, Arabic or both side by side.
import { useEffect, useState } from "react";

const Q = [["influence", "Did anyone or anything influence your idea?"], ["enjoy", "What was the most enjoyable part of creating your work?"], ["focus", "What elements did you focus on, and why?"]];
const KEY = "nae.lang";

export function useLang(e) {
  const [lang, setLang] = useState("en");
  useEffect(() => {
    let saved = null; try { saved = localStorage.getItem(KEY); } catch {}
    const hasEn = !!(e?.description_en || e?.title_en), hasAr = !!(e?.description_ar || e?.title_ar);
    setLang(saved && (saved !== "en" || hasEn) && (saved !== "ar" || hasAr) ? saved : hasEn ? "en" : "ar");
  }, [e?.id]); // eslint-disable-line
  const set = l => { setLang(l); try { localStorage.setItem(KEY, l); } catch {} };
  return [lang, set];
}

export function LangToggle({ lang, onChange }) {
  return <div className="x-lang" role="group" aria-label="Language">{[["en", "English"], ["ar", "العربية"], ["both", "Both"]].map(([k, l]) => <button key={k} type="button" className={lang === k ? "on" : ""} aria-pressed={lang === k} onClick={() => onChange(k)} lang={k === "ar" ? "ar" : undefined}>{l}</button>)}</div>;
}

const Missing = ({ ar }) => <p className="faint small" style={ar ? { direction: "rtl", textAlign: "right" } : undefined}>{ar ? "لا يوجد وصف بالعربية" : "No English text was submitted."}</p>;

function Block({ en, ar, lang, big, stack }) {
  const style = big ? { fontSize: 16, lineHeight: "24px", fontWeight: 600 } : undefined;
  const EN = en ? <p style={style} dir="auto">{en}</p> : <Missing />;
  const AR = ar ? <p className="rtl" lang="ar" style={{ ...style, fontFamily: '"IBM Plex Sans Arabic", var(--sans)' }}>{ar}</p> : <Missing ar />;
  if (lang === "both") return stack ? <div className="stack" style={{ gap: 10 }}>{EN}<div style={{ borderTop: "1px dashed var(--rule)", paddingTop: 10 }}>{AR}</div></div> : <div className="x-grid2" style={{ gap: 16 }}><div>{EN}</div><div>{AR}</div></div>;
  return lang === "ar" ? AR : EN;
}

export default function EntryAbout({ e, compact, showStudents, students = [] }) {
  const [lang, setLang] = useLang(e);
  const refl = Q.filter(([k]) => e.reflections?.[k]);
  const details = [["Pathway", [e.pathway, e.sub].filter(Boolean).join(" · ")], ["Medium", e.medium], ["Size", e.size_text], ["Entry type", e.registration_type === "Group" || e.group_name ? `Group${e.group_name ? `: ${e.group_name}` : ""}` : "Individual"], ["Students", e.students_count ? `${e.students_count}${e.grades_text ? ` · ${e.grades_text}` : ""}` : e.grades_text]].filter(x => x[1]);
  return <section className="card x-about">
    <div className="card-h"><div className="tt"><h3>About the entry</h3><span className="sub">As submitted by the school</span></div><LangToggle lang={lang} onChange={setLang} /></div>
    <div className="stack" style={{ gap: 16 }}>
      <Block en={e.title_en} ar={e.title_ar} lang={lang} big stack={compact} />
      <div className="stack s8"><span className="label">Description</span><Block en={e.description_en} ar={e.description_ar} lang={lang} stack={compact} /></div>
      {refl.length > 0 && <div className="x-qa">{refl.map(([k, q]) => <div key={k}><b>{q}</b><p dir="auto" className={/[؀-ۿ]/.test(e.reflections[k]) ? "rtl" : ""} style={{ whiteSpace: "pre-wrap" }}>{e.reflections[k]}</p></div>)}</div>}
      {!compact && details.length > 0 && <dl className="kv">{details.flatMap(([k, v]) => [<dt key={k + "t"}>{k}</dt>, <dd key={k + "d"}>{v}</dd>])}</dl>}
      {compact && details.length > 0 && <div className="f3-meta">{details.map(([k, v]) => <span key={k}><span className="faint">{k}:</span> <span className="muted">{v}</span></span>)}</div>}
      {showStudents && students.length > 0 && <div className="x-stu">{students.map((s, i) => <div key={i}><div className="who">
        <b dir="auto">{lang === "ar" ? s.name_ar || s.name_en : s.name_en || s.name_ar || `Student ${i + 1}`}</b>
        <span>{[s.grade, s.nationality, s.consent === false ? "No showcase consent" : null].filter(Boolean).join(" · ")}</span></div></div>)}</div>}
    </div>
  </section>;
}
