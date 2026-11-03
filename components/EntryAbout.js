"use client";
import { useLang as useSharedLang, LangToggle, AR_FONT } from "@/components/lang";
// "About the entry": title, description and the student's reflections, in English, Arabic or both side by side.

const Q = [["influence", "Did anyone or anything influence your idea?"], ["enjoy", "What was the most enjoyable part of creating your work?"], ["focus", "What elements did you focus on, and why?"]];
// Language switching lives in components/lang.js so the scoring form follows the same choice.
export const useLang = e => useSharedLang(e?.id, !!(e?.description_en || e?.title_en), !!(e?.description_ar || e?.title_ar));

const Missing = ({ ar }) => <p className="faint small" style={ar ? { direction: "rtl", textAlign: "right" } : undefined}>{ar ? "لا يوجد وصف بالعربية" : "No English text was submitted."}</p>;

function Block({ en, ar, lang, big, stack }) {
  const style = big ? { fontSize: 16, lineHeight: "24px", fontWeight: 600 } : undefined;
  const EN = en ? <p style={style} dir="auto">{en}</p> : <Missing />;
  const AR = ar ? <p className="rtl" lang="ar" style={{ ...style, fontFamily: AR_FONT }}>{ar}</p> : <Missing ar />;
  if (lang === "both") return stack ? <div className="stack" style={{ gap: 10 }}>{EN}<div style={{ borderTop: "1px dashed var(--rule)", paddingTop: 10 }}>{AR}</div></div> : <div className="x-grid2" style={{ gap: 16 }}><div>{EN}</div><div>{AR}</div></div>;
  return lang === "ar" ? AR : EN;
}

export default function EntryAbout({ e, compact, showStudents, students = [], onEdit }) {
  const [lang, setLang] = useLang(e);
  const refl = Q.filter(([k]) => e.reflections?.[k]);
  const group = e.registration_type === "Group" || (!e.registration_type && e.group_name);
  const details = [["Pathway", e.pathway], ["Subpathway", e.sub], ["People of Determination", e.pod ? "Yes (POD)" : null], ["Size", e.size_text], ["Medium", e.medium], ["Artwork type", group ? "Group" : "Individual"], ["Group name", group ? e.group_name : null], ["Students", e.students_count ? `${e.students_count} student${e.students_count === 1 ? "" : "s"}` : null], ["Grade", e.grades_text]].filter(x => x[1]);
  return <section className="card x-about">
    <div className="card-h"><div className="tt"><h3>About the artwork</h3><span className="sub">{(e.manual_fields || []).length ? "As submitted by the school, with corrections" : "As submitted by the school"}</span></div>{onEdit && <button type="button" className="btn ghost sm" onClick={onEdit}>Edit details</button>}<LangToggle lang={lang} onChange={setLang} /></div>
    <div className="stack" style={{ gap: 16 }}>
      <Block en={e.title_en} ar={e.title_ar} lang={lang} big stack={compact} />
      <div className="stack s8"><span className="label">Description</span><Block en={e.description_en} ar={e.description_ar} lang={lang} stack={compact} /></div>
      {refl.length > 0 && <div className="x-qa">{refl.map(([k, q]) => <div key={k}><b>{q}</b><p dir="auto" className={/[؀-ۿ]/.test(e.reflections[k]) ? "rtl" : ""} style={{ whiteSpace: "pre-wrap" }}>{e.reflections[k]}</p></div>)}</div>}
      {details.length > 0 && <div className={`x-facts${compact ? " sm" : ""}`}>{details.map(([k, v]) => <div key={k}><span>{k}</span><b dir="auto">{v}</b></div>)}</div>}
      {showStudents && students.length > 0 && <div className="x-stu">{students.map((s, i) => <div key={i}><div className="who">
        <b dir="auto">{lang === "ar" ? s.name_ar || s.name_en : s.name_en || s.name_ar || `Student ${i + 1}`}</b>
        <span>{[s.grade, s.nationality, s.consent === false ? "No showcase consent" : null].filter(Boolean).join(" · ")}</span></div></div>)}</div>}
    </div>
  </section>;
}
