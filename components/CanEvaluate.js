"use client";
import { useState } from "react";
import { api, useToast, Btn, Banner, Modal, Field } from "@/components/ui";

// The evaluation question (from Frontliners): can this artwork be evaluated from its files? "No" sends it to its
// coordinator as a correction (file quality, or artwork that doesn't match its details); scoring pauses until the
// coordinator sends it back corrected.
const REASONS = [["file_quality", "Artwork file quality / clarity: the image, video or audio can't be evaluated clearly", "جودة ووضوح الملف: لا يمكن تقييم الصورة أو الفيديو أو الصوت بوضوح"], ["artwork_mismatch", "Artwork mismatch: the artwork belongs to a different student, or a name on it doesn't match the students, title or description", "عدم تطابق العمل: العمل يعود لطالب آخر، أو يحمل اسمًا لا يطابق الطلاب أو العنوان أو الوصف"]];
// Online evaluations only (physical ones are judged in the room): asked first, before the scores. "Yes" opens
// the scoring; "No" sends the artwork to the coordinator.
// mode "match" (physical evaluations): only the artwork mismatch check, not asked first and not blocking the scores.
export default function CanEvaluate({ code, roundNo, sessionId, T, ar, onDone, value, onYes, disabled, mode }) {
  const match = mode === "match"; const [said, setSaid] = useState(false);
  const toast = useToast(); const [ask, setAsk] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  async function send() { setBusy(true); setErr(null); try { const r = await api("/api/corrections", { body: { action: "open", source: "evaluation", code, round_no: roundNo, session_id: sessionId || null, reason: ask.reason, note: ask.note } }); toast(r.note); setAsk(null); onDone && onDone(r); } catch (e) { setErr(e.message); } setBusy(false); }
  return <>
    {match ? <div className="ce-q ok"><div className="stack s4" style={{ flex: 1, minWidth: 0 }}><b className="small">{T.matchQ}</b><span className="small faint">{T.matchHint}</span></div>
      <span className="f3-yn lg" role="group" aria-label={T.matchQ}><button type="button" disabled={disabled} className={said ? "on" : ""} onClick={() => setSaid(true)}>{T.yes}</button><button type="button" disabled={disabled} onClick={() => setAsk({ reason: "artwork_mismatch", note: "" })}>{T.no}</button></span></div>
    : <div className={`ce-q${value ? " ok" : " ask"}`}><div className="stack s4" style={{ flex: 1, minWidth: 0 }}><b className="small">{T.notVisible}</b></div>
      <span className="f3-yn lg" role="group" aria-label={T.notVisible}><button type="button" disabled={disabled} className={value ? "on" : ""} onClick={() => onYes && onYes()}>{T.yes}</button><button type="button" disabled={disabled} onClick={() => setAsk({ reason: "file_quality", note: "" })}>{T.no}</button></span></div>}
    <Modal open={!!ask} title={ar ? "إرسال إلى المنسق للتصحيح" : "Send to the coordinator for correction"} sub={code} onClose={() => setAsk(null)}
      footer={<><Btn onClick={() => setAsk(null)}>{ar ? "رجوع" : "Back"}</Btn><Btn v="primary" busy={busy} disabled={!String(ask?.note || "").trim()} onClick={send}>{ar ? "إرسال إلى المنسق" : "Send to the coordinator"}</Btn></>}>
      {ask && <div className="stack" style={{ gap: 12 }}>
        {err && <Banner tone="bad" title={err} />}
        <p className="muted" style={{ margin: 0 }}>{T.notVisibleHint}</p>
        {!match && <Field label={ar ? "السبب" : "Reason"}><div className="stack s4">{REASONS.map(([k, en, a]) => <label key={k} className="ce-r"><input type="radio" name="ce-r" checked={ask.reason === k} onChange={() => setAsk({ ...ask, reason: k })} /><span className="small">{ar ? a : en}</span></label>)}</div></Field>}
        <Field label={ar ? "ما المشكلة؟" : "What's wrong?"} help={ar ? "يستخدمها المنسق عند التواصل مع المدرسة." : "The coordinator uses this when contacting the school."}><textarea className="textarea" rows={3} dir="auto" value={ask.note} onChange={e => setAsk({ ...ask, note: e.target.value })} placeholder={match ? (ar ? "مثال: الاسم على العمل ليس لأحد الطلاب، أو العمل ليس الموصوف" : "For example: the name on the artwork is not one of the students, or it isn't the artwork described") : ar ? "مثال: الفيديو لا يعمل، الصورة غير واضحة، العمل يعود لطالب آخر" : "For example: the video doesn't play, the photo is blurred or cut off, the artwork belongs to a different student"} /></Field>
      </div>}
    </Modal>
  </>;
}
// shown instead of the scores while the artwork is with its coordinator
export function WithCoordinator({ nv, coord, onOpen }) {
  return <Banner tone="warn" title="With the coordinator for correction" action={onOpen ? <Btn sm href={onOpen}>Open the correction</Btn> : null}>{nv?.note ? `“${nv.note}”. ` : ""}Scoring is paused until {coord ? "you get" : "the coordinator gets"} the correct file or details from the school and {coord ? "send" : "sends"} it back. If the school doesn't respond, it is marked not scored.</Banner>;
}
