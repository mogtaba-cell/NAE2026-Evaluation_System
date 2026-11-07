"use client";
import DisplayPick from "@/components/DisplayPick";
// Rubric scoring form. Used by evaluators in their queue and by admins correcting scores.
import { useEffect, useMemo, useState } from "react";
import { api, Btn, Banner, Badge, useToast, Modal, Field, Check } from "@/components/ui";
import { useLang, LangToggle, CritText, critName, hasArabic, scoreLang, SL, AR_FONT } from "@/components/lang";
import { answersOf, qLabel, qAsk } from "@/lib/questions";
import ChoicePick from "@/components/ChoicePick";

export const total = (criteria, s) => Math.ceil((criteria || []).reduce((a, c) => a + Number(s?.[c.key] || 0) * Number(c.weight || 0), 0) / 100 - 1e-9);
export const gradeFor = (t, bands) => { const b = [...(bands || [{ grade: "A", min: 80 }, { grade: "B", min: 50 }, { grade: "C", min: 0 }])].sort((x, y) => y.min - x.min).find(x => t >= x.min); return b ? b.grade : ""; };

export default function ScoreForm({ code, round, mine, evaluatorId, sessionId, onSaved, title, framing, pod, onPod, notVisible }) {
  const toast = useToast();
  const crit = round?.rubric?.criteria || [];
  const [lang0, setLang] = useLang(round?.rubric?.version_id || round?.id);
  const lang = scoreLang(lang0), ar = lang === "ar", T = SL[lang];
  const [s, setS] = useState({}); const [ans, setAns] = useState({}); const [comment, setComment] = useState(""); const [toRev, setToRev] = useState(false); const [nv, setNv] = useState(null);
  const [busy, setBusy] = useState(null); const [err, setErr] = useState(null); const [confirm, setConfirm] = useState(false);
  const bands = round?.rubric?.grade_bands; const qs = round?.rubric?.questions || [];
  const fr0 = () => ({ display_option: framing?.display_option || null, display_note: framing?.display_note || "", size_class: framing?.size_class || null });
  const [fr, setFr] = useState(fr0);
  useEffect(() => { setFr(fr0()); }, [code, framing?.display_option, framing?.display_note, framing?.size_class]); // eslint-disable-line
  useEffect(() => { setS(mine?.scores || {}); setAns(answersOf(mine, qs)); setComment(mine?.comment || ""); setToRev(!!mine?.to_review); setErr(null); }, [code, round?.id, mine?.id, mine?.status]); // eslint-disable-line
  const done = mine?.status === "submitted";
  const filled = crit.filter(c => s[c.key] !== "" && s[c.key] != null).length;
  const t = useMemo(() => total(crit, s), [crit, s]);
  const bad = c => { const v = s[c.key]; if (v === "" || v == null) return false; const n = Number(v); return !Number.isInteger(n) || n < 0 || n > 100; };
  const ready = filled === crit.length && !crit.some(bad) && qs.every(x => typeof ans[x.key] === "boolean" && (!ans[x.key] || !x.options?.length || (ans[`${x.key}_choice`] && ans[`${x.key}_choice`] !== "Other: ")));
  async function save(submit) {
    setBusy(submit ? "submit" : "draft"); setErr(null);
    try {
      const r = await api("/api/scores", { body: { entry_code: code, round_no: round.round_no, scores: s, answers: ans, to_review: toRev, comment, submit, evaluator_id: evaluatorId, session_id: sessionId, ...(framing ? { display: { option: fr.display_option || null, note: fr.display_note || null, size_class: fr.size_class || null } } : {}) } });
      toast(submit ? `Submitted ${code}: total ${r.total}` : "Draft saved"); setConfirm(false); onSaved && onSaved(submit, r);
    } catch (e) { setErr(e.message); setConfirm(false); } finally { setBusy(null); }
  }
  async function notVis() {
    setBusy("nv"); setErr(null);
    try { const r = await api(`/api/entries/${encodeURIComponent(code)}/visibility`, { body: { action: "not_visible", note: nv, round_no: round.round_no } }); toast(r.note); setNv(null); onSaved && onSaved(false, r); }
    catch (e) { setErr(e.message); setNv(null); } finally { setBusy(null); }
  }
  if (notVisible) return <section className="card"><Banner tone="warn" title="Not visible: with the coordinator">{notVisible.note ? `“${notVisible.note}”. ` : ""}Scoring is paused until the coordinator fixes the files or withdraws the artwork.</Banner></section>;
  if (!round?.rubric) return <Banner tone="warn" title="No published rubric">This subpathway has no published rubric for Round {round?.round_no}. Tell the admin.</Banner>;
  return <section className={`card score-card${ar ? " is-ar" : ""}`} dir={ar ? "rtl" : "ltr"} lang={ar ? "ar" : "en"} style={ar ? { fontFamily: AR_FONT } : undefined}>
    <div className="card-h"><div className="tt"><h3>{title || T.yourScore}</h3><span className="sub" dir="ltr">Round {round.round_no} · rubric {round.rubric.code} v{round.rubric.version}{round.status !== "open" ? " · round closed" : ""}</span></div><div className="row nowrap" style={{ gap: 8 }}><LangToggle lang={lang} onChange={setLang} both={false} />{done ? <Badge tone="ok">Submitted</Badge> : mine ? <Badge>Draft</Badge> : null}</div></div>
    {lang !== "en" && !hasArabic(crit) && <p className="faint small">This rubric has no Arabic text yet, so the criteria show in English. The admin can add Arabic in the Rubric library.</p>}
    {err && <Banner tone="bad" title={err} />}
    <div className="stack" style={{ gap: 0 }}>
      {crit.map(c => <div key={c.key} className="f3-crit"><div className="lab"><CritText c={c} lang={lang} /></div>
        <input className={`sc-in${bad(c) ? " f3-err" : ""}`} inputMode="numeric" aria-label={`${c.label}, 0 to 100`} placeholder="0–100" disabled={done} value={s[c.key] ?? ""} onChange={e => setS({ ...s, [c.key]: e.target.value.replace(/[^0-9]/g, "").slice(0, 3) })} /></div>)}
      {qs.map(x => <div key={x.key} className="f3-crit"><div className="lab"><div><b>{qLabel(x, ar)}</b><span>{qAsk(x, ar)}{x.pass_yes ? T.identityReq : ""}</span></div>{ans[x.key] === true && <ChoicePick q={x} ar={ar} disabled={done} value={ans[`${x.key}_choice`]} onChange={v => setAns({ ...ans, [`${x.key}_choice`]: v })} />}</div>
        <span className="f3-yn lg"><button type="button" disabled={done} className={ans[x.key] === true ? "on" : ""} onClick={() => setAns({ ...ans, [x.key]: true })}>{T.yes}</button><button type="button" disabled={done} className={ans[x.key] === false ? "on" : ""} onClick={() => setAns({ ...ans, [x.key]: false, [`${x.key}_choice`]: undefined })}>{T.no}</button></span></div>)}
    </div>
    {framing && <div className="f3-crit"><div className="lab"><b>{T.framing}</b><span>{T.framingQ}</span></div>
      <DisplayPick value={fr} disabled={done} ar={ar} onSave={p => setFr(f => ({ ...f, ...(p.option !== undefined ? { display_option: p.option, display_note: p.note || "" } : {}), ...(p.size_class !== undefined ? { size_class: p.size_class } : {}) }))} /></div>}
    <Field label={T.comment}><textarea className="textarea" rows={2} value={comment} disabled={done} onChange={e => setComment(e.target.value)} placeholder={T.commentPh} /></Field>
    <div className="sc-ticks">
      <Check label={T.toReview} disabled={done} checked={toRev} onChange={setToRev} />
      {onPod && <Check label={T.pod} checked={!!pod} onChange={onPod} />}
      {!done && <Check label={T.notVisible} checked={false} onChange={v => v && setNv("")} />}
    </div>
    <div className="x-tot"><div className="stack s4"><span className="s">{T.wtotal}</span><span className="v">{filled ? t : "–"}</span></div><div className="stack s4"><span className="s">{T.grade}</span><span style={{ fontSize: 18, fontWeight: 600 }}>{filled ? gradeFor(t, bands) : "–"}</span></div><span className="s" style={{ marginInlineStart: "auto" }}>{T.of(filled, crit.length)}</span></div>
    {!done && <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}><Btn onClick={() => save(false)} busy={busy === "draft"} disabled={!!busy}>{T.saveDraft}</Btn><Btn v="primary" disabled={!ready || !!busy} onClick={() => setConfirm(true)}>{T.submit}</Btn></div>}
    {done && <p className="x-note">Submitted scores can't be changed here. If something is wrong, ask the admin to correct it (they must give a reason).</p>}
    <Modal open={confirm} title="Submit this score?" sub={`${code} · Round ${round.round_no}`} onClose={() => setConfirm(false)} footer={<><Btn onClick={() => setConfirm(false)}>Back</Btn><Btn v="primary" busy={busy === "submit"} onClick={() => save(true)}>Submit {t}</Btn></>}>
      <table className="x-cmp"><thead><tr><th>Criterion</th><th>Weight</th><th>Score</th></tr></thead><tbody>{crit.map(c => <tr key={c.key}><td dir="auto">{critName(c, lang)}</td><td>{c.weight}%</td><td>{s[c.key]}</td></tr>)}{qs.map(x => <tr key={x.key}><td>{x.label}</td><td></td><td>{ans[x.key] ? `Yes${ans[`${x.key}_choice`] ? ` · ${ans[`${x.key}_choice`]}` : ""}` : "No"}</td></tr>)}{toRev && <tr><td colSpan={3}>Sent to management review</td></tr>}<tr className="tot"><td>Total</td><td></td><td>{t} · {gradeFor(t, bands)}</td></tr></tbody></table>
      <p className="muted">You can't change it after you submit. Other evaluators' scores become visible to you once you submit.</p>
    </Modal>
    <Modal open={nv !== null} title={T.notVisible} sub={code} onClose={() => setNv(null)} footer={<><Btn onClick={() => setNv(null)}>Back</Btn><Btn v="primary" busy={busy === "nv"} disabled={!String(nv || "").trim()} onClick={notVis}>Send to the coordinator</Btn></>}>
      <p className="muted" style={{ marginTop: 0 }}>{T.notVisibleHint}</p>
      <Field label="What's wrong?"><textarea className="textarea" rows={3} value={nv || ""} onChange={e => setNv(e.target.value)} placeholder="For example: the video doesn't play, the photo is blurred or cut off" /></Field>
    </Modal>
  </section>;
}
