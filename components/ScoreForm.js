"use client";
// Rubric scoring form. Used by evaluators in their queue and by admins correcting scores.
import { useEffect, useMemo, useState } from "react";
import { api, Btn, Banner, Badge, useToast, Modal, Field, Check } from "@/components/ui";
import { useLang, LangToggle, CritText, critName, hasArabic, scoreLang, SL, AR_FONT } from "@/components/lang";

export const total = (criteria, s) => Math.ceil((criteria || []).reduce((a, c) => a + Number(s?.[c.key] || 0) * Number(c.weight || 0), 0) / 100 - 1e-9);
export const gradeFor = (t, bands) => { const b = [...(bands || [{ grade: "A", min: 80 }, { grade: "B", min: 50 }, { grade: "C", min: 0 }])].sort((x, y) => y.min - x.min).find(x => t >= x.min); return b ? b.grade : ""; };

export default function ScoreForm({ code, round, mine, evaluatorId, sessionId, onSaved, title, framing }) {
  const toast = useToast();
  const crit = round?.rubric?.criteria || [];
  const [lang0, setLang] = useLang(round?.rubric?.version_id || round?.id);
  const lang = scoreLang(lang0), ar = lang === "ar", T = SL[lang];
  const [s, setS] = useState({}); const [idn, setIdn] = useState(null); const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(null); const [err, setErr] = useState(null); const [confirm, setConfirm] = useState(false);
  const bands = round?.rubric?.grade_bands; const needIdentity = !!round?.pass_rule?.identity;
  const [fr, setFr] = useState({ needs: !!framing?.needs_framing, glass: !!framing?.glass_framing });
  useEffect(() => { setFr({ needs: !!framing?.needs_framing, glass: !!framing?.glass_framing }); }, [code, framing?.needs_framing, framing?.glass_framing]);
  useEffect(() => { setS(mine?.scores || {}); setIdn(typeof mine?.national_identity === "boolean" ? mine.national_identity : null); setComment(mine?.comment || ""); setErr(null); }, [code, round?.id, mine?.id, mine?.status]); // eslint-disable-line
  const done = mine?.status === "submitted";
  const filled = crit.filter(c => s[c.key] !== "" && s[c.key] != null).length;
  const t = useMemo(() => total(crit, s), [crit, s]);
  const bad = c => { const v = s[c.key]; if (v === "" || v == null) return false; const n = Number(v); return !Number.isInteger(n) || n < 0 || n > 100; };
  const ready = filled === crit.length && !crit.some(bad) && (!round.rubric.identity_required || idn !== null);
  async function save(submit) {
    setBusy(submit ? "submit" : "draft"); setErr(null);
    try {
      const r = await api("/api/scores", { body: { entry_code: code, round_no: round.round_no, scores: s, national_identity: idn, comment, submit, evaluator_id: evaluatorId, session_id: sessionId, ...(framing ? { framing: fr } : {}) } });
      toast(submit ? `Submitted ${code}: total ${r.total}` : "Draft saved"); setConfirm(false); onSaved && onSaved(submit, r);
    } catch (e) { setErr(e.message); setConfirm(false); } finally { setBusy(null); }
  }
  if (!round?.rubric) return <Banner tone="warn" title="No published rubric">This subpathway has no published rubric for Round {round?.round_no}. Tell the admin.</Banner>;
  return <section className={`card score-card${ar ? " is-ar" : ""}`} dir={ar ? "rtl" : "ltr"} lang={ar ? "ar" : "en"} style={ar ? { fontFamily: AR_FONT } : undefined}>
    <div className="card-h"><div className="tt"><h3>{title || T.yourScore}</h3><span className="sub" dir="ltr">Round {round.round_no} · rubric {round.rubric.code} v{round.rubric.version}{round.status !== "open" ? " · round closed" : ""}</span></div><div className="row nowrap" style={{ gap: 8 }}><LangToggle lang={lang} onChange={setLang} both={false} />{done ? <Badge tone="ok">Submitted</Badge> : mine ? <Badge>Draft</Badge> : null}</div></div>
    {lang !== "en" && !hasArabic(crit) && <p className="faint small">This rubric has no Arabic text yet, so the criteria show in English. The admin can add Arabic in the Rubric library.</p>}
    {err && <Banner tone="bad" title={err} />}
    <div className="stack" style={{ gap: 0 }}>
      {crit.map(c => <div key={c.key} className="f3-crit"><div className="lab"><CritText c={c} lang={lang} /></div>
        <input className={`sc-in${bad(c) ? " f3-err" : ""}`} inputMode="numeric" aria-label={`${c.label}, 0 to 100`} placeholder="0–100" disabled={done} value={s[c.key] ?? ""} onChange={e => setS({ ...s, [c.key]: e.target.value.replace(/[^0-9]/g, "").slice(0, 3) })} /></div>)}
      {round.rubric.identity_required && <div className="f3-crit"><div className="lab"><div><b>{T.identity}</b><span>{T.identityQ}{needIdentity ? T.identityReq : ""}</span></div></div>
        <span className="f3-yn lg"><button type="button" disabled={done} className={idn === true ? "on" : ""} onClick={() => setIdn(true)}>{T.yes}</button><button type="button" disabled={done} className={idn === false ? "on" : ""} onClick={() => setIdn(false)}>{T.no}</button></span></div>}
    </div>
    {framing && <div className="f3-crit"><div className="lab"><b>{T.framing}</b><span>{T.framingQ}</span></div>
      <div className="stack s4"><Check label={T.needs} disabled={done} checked={fr.needs} onChange={v => setFr({ needs: v, glass: v && fr.glass })} />
      <Check label={T.glass} disabled={done || !fr.needs} checked={fr.glass} onChange={v => setFr({ ...fr, glass: v })} /></div></div>}
    <Field label={T.comment}><textarea className="textarea" rows={2} value={comment} disabled={done} onChange={e => setComment(e.target.value)} placeholder={T.commentPh} /></Field>
    <div className="x-tot"><div className="stack s4"><span className="s">{T.wtotal}</span><span className="v">{filled ? t : "–"}</span></div><div className="stack s4"><span className="s">{T.grade}</span><span style={{ fontSize: 18, fontWeight: 600 }}>{filled ? gradeFor(t, bands) : "–"}</span></div><span className="s" style={{ marginInlineStart: "auto" }}>{T.of(filled, crit.length)}</span></div>
    {!done && <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}><Btn onClick={() => save(false)} busy={busy === "draft"} disabled={!!busy}>{T.saveDraft}</Btn><Btn v="primary" disabled={!ready || !!busy} onClick={() => setConfirm(true)}>{T.submit}</Btn></div>}
    {done && <p className="x-note">Submitted scores can't be changed here. If something is wrong, ask the admin to correct it (they must give a reason).</p>}
    <Modal open={confirm} title="Submit this score?" sub={`${code} · Round ${round.round_no}`} onClose={() => setConfirm(false)} footer={<><Btn onClick={() => setConfirm(false)}>Back</Btn><Btn v="primary" busy={busy === "submit"} onClick={() => save(true)}>Submit {t}</Btn></>}>
      <table className="x-cmp"><thead><tr><th>Criterion</th><th>Weight</th><th>Score</th></tr></thead><tbody>{crit.map(c => <tr key={c.key}><td dir="auto">{critName(c, lang)}</td><td>{c.weight}%</td><td>{s[c.key]}</td></tr>)}{round.rubric.identity_required && <tr><td>National identity</td><td></td><td>{idn ? "Yes" : "No"}</td></tr>}<tr className="tot"><td>Total</td><td></td><td>{t} · {gradeFor(t, bands)}</td></tr></tbody></table>
      <p className="muted">You can't change it after you submit. Other evaluators' scores become visible to you once you submit.</p>
    </Modal>
  </section>;
}
