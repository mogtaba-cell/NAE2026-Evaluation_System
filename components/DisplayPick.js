"use client";
import { useEffect, useState } from "react";
import { DISPLAY, SIZES } from "@/lib/display";

// During the physical evaluation: how the artwork would be displayed if selected (one option; "Other" needs a
// note) and its size class. value: { display_option, display_note, size_class }; onSave({ option, note } | { size_class })
export default function DisplayPick({ value, disabled, ar, onSave }) {
  const [note, setNote] = useState(value?.display_note || "");
  useEffect(() => { setNote(value?.display_note || ""); }, [value?.display_note]);
  const [opt, setOpt] = useState(value?.display_option || "");
  useEffect(() => { setOpt(value?.display_option || ""); }, [value?.display_option]);
  return <div className="stack s4 dp">
    <select className="select" disabled={disabled} value={opt} onChange={e => { const o = e.target.value; setOpt(o); if (o !== "other") onSave({ option: o || null }); else if (note.trim()) onSave({ option: o, note }); }} aria-label={ar ? "خيارات العرض" : "Display option"}>
      <option value="">{ar ? "اختر…" : "Choose…"}</option>{DISPLAY.map(d => <option key={d.key} value={d.key}>{ar ? d.ar : d.label}</option>)}
    </select>
    {opt === "other" && <input className="input" disabled={disabled} dir="auto" value={note} placeholder={ar ? "اكتب ملاحظة" : "Add a note: how should it be displayed?"} onChange={e => setNote(e.target.value)} onBlur={() => note.trim() && (note !== (value?.display_note || "") || value?.display_option !== "other") && onSave({ option: "other", note })} />}
    <div className="dp-size" role="group" aria-label={ar ? "الحجم" : "Size"}>{SIZES.map(([k, en, a]) => <button key={k} type="button" disabled={disabled} className={`chip${value?.size_class === k ? " on" : ""}`} title={ar ? a : en} onClick={() => onSave({ size_class: value?.size_class === k ? null : k })}>{ar ? a : en}</button>)}</div>
  </div>;
}
