"use client";
// After a Yes, the option picked for a rubric question (a list, plus "Other" with the evaluator's own words).
// value is the stored text: an option, or "Other: <text>".
export default function ChoicePick({ q, value, onChange, disabled, compact, ar }) {
  if (!q?.options?.length) return null;
  const isOther = /^Other:/.test(value || "");
  const other = isOther ? String(value).replace(/^Other:\s?/, "") : "";
  return <span className={`chp${compact ? " sm" : ""}`}>
    <select className="select" disabled={disabled} value={isOther ? "__other" : value || ""} onChange={e => onChange(e.target.value === "__other" ? "Other: " : e.target.value)} aria-label={`${q.label}: option`}>
      <option value="">{ar ? "اختر…" : "Choose…"}</option>{q.options.map(o => <option key={o} value={o}>{o}</option>)}{q.other && <option value="__other">{ar ? "أخرى" : "Other"}</option>}
    </select>
    {isOther && <input className="input" disabled={disabled} value={other} onChange={e => onChange(`Other: ${e.target.value}`)} placeholder={ar ? "اكتب" : "Type it"} aria-label={`${q.label}: other`} />}
  </span>;
}
