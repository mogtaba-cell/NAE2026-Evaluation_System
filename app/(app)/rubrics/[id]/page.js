"use client";
import { use, useEffect, useState } from "react";
import { api, useApi, useMeta, useToast, PageHead, Card, Btn, Badge, Banner, Loading, Field, Switch, Table, Check, when } from "@/components/ui";
import { questionsOf } from "@/lib/questions";

export default function RubricBuilder({ params }) {
  const { id } = use(params);
  const d = useApi(`/api/rubrics/${id}`); const meta = useMeta(); const toast = useToast();
  const [crit, setCrit] = useState(null); const [qs, setQs] = useState([]); const [bands, setBands] = useState({ A: 80, B: 50 }); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(null); const [err, setErr] = useState(null);
  const admin = meta?.data?.me?.role === "admin";
  const draft = d.data?.versions.find(v => v.status === "draft"); const pub = d.data?.versions.filter(v => v.status === "published").pop();
  const bandOf = (v, g, dflt) => (v?.grade_bands || []).find(b => b.grade === g)?.min ?? dflt;
  // admins edit the draft (or start one from the published version); everyone else sees the version in use
  useEffect(() => { if (d.data) { const v = admin ? (draft || pub) : (pub || draft); setCrit((v?.criteria || []).map(c => ({ ...c }))); setQs(questionsOf(v).map(x => ({ ...x }))); setBands({ A: bandOf(v, "A", 80), B: bandOf(v, "B", 50) }); } }, [d.data, admin]); // eslint-disable-line
  if (!d.data || !crit) return <Loading error={d.error} />;
  const tot = crit.reduce((s, c) => s + (Number(c.weight) || 0), 0);
  const upd = (i, k, v) => setCrit(c => c.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const gb = [{ grade: "A", min: Number(bands.A) }, { grade: "B", min: Number(bands.B) }, { grade: "C", min: 0 }];
  const bandsBad = !(Number.isInteger(Number(bands.A)) && Number.isInteger(Number(bands.B)) && Number(bands.A) <= 100 && Number(bands.B) >= 1 && Number(bands.B) < Number(bands.A));
  const base = draft || pub;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const strip = c => (c || []).map(x => ({ key: x.key || "", label: x.label || "", label_ar: x.label_ar || "", weight: Number(x.weight) || 0, description: x.description || "", description_ar: x.description_ar || "" }));
  const optList = o => (Array.isArray(o) ? o : String(o || "").split("\n")).map(t => String(t).trim()).filter(Boolean);
  const stripQ = l => (l || []).map(x => ({ key: x.key || "", label: x.label || "", label_ar: x.label_ar || "", ask: x.ask || "", ask_ar: x.ask_ar || "", pass_yes: !!x.pass_yes, options: optList(x.options), other: !!x.other && optList(x.options).length > 0, flag_choice: !!x.flag_choice && optList(x.options).length > 0 }));
  const updQ = (i, k, v) => setQs(l => l.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const qBad = qs.some(x => !String(x.label || "").trim());
  const changed = !base || !same(strip(crit), strip(base.criteria)) || !same(stripQ(qs), stripQ(questionsOf(base))) || bandOf(base, "A", 80) !== Number(bands.A) || bandOf(base, "B", 50) !== Number(bands.B);
  const canPublish = !!draft || changed;
  async function save() { setBusy("save"); setErr(null); try { await api(`/api/rubrics/${id}`, { method: "PATCH", body: { criteria: crit, questions: qs, grade_bands: gb } }); toast("Draft saved"); d.reload(); } catch (e) { setErr(e.message); } setBusy(null); }
  async function publish() { setBusy("pub"); setErr(null); try { if (changed || !draft) await api(`/api/rubrics/${id}`, { method: "PATCH", body: { criteria: crit, questions: qs, grade_bands: gb } }); const r = await api(`/api/rubrics/${id}`, { body: { action: "publish", reason } }); toast(r.note); setReason(""); d.reload(); meta.reload(); } catch (e) { setErr(e.message); } setBusy(null); }
  return <>
    <PageHead back={["Rubric library", "/rubrics"]} title={<span className="code" style={{ fontSize: 22 }}>{d.data.rubric.code}</span>} badges={<>{pub && <Badge tone="ok">Published v{pub.version}</Badge>}{draft && <Badge tone="warn">Draft v{draft.version}</Badge>}</>}
      sub={`${d.data.rubric.name} · used by ${d.data.subs.map(s => `${s.pathway_code} ${s.name}${s.rubric_r1 === id && s.rubric_r2 === id ? " (R1, R2)" : s.rubric_r1 === id ? (s.rubric_r2 ? " (R1)" : " (R1, R2)") : " (R2)"}`).join(", ") || "no subpathway yet"} · ${d.data.scored} scores saved`} />
    {err && <Banner tone="bad" title={err} />}
    {d.data.scored > 0 && <Banner title="Scores already use this rubric">Editing creates a new draft version. Scores already saved keep the version they were scored with; new scores use the newly published version.</Banner>}
    <Card title="Criteria" sub="Each criterion is scored 0 to 100. The total is the weighted sum, rounded up. Add Arabic so evaluators can switch language while scoring." right={<span className={`badge ${tot === 100 ? "ok" : "warn"}`}>Total {tot}%</span>}>
      {crit.map((c, i) => <div key={i} className="rb-crit">
        <div className="rb-row">
          <Field label={`Criterion ${i + 1} (English)`}><input className="input" value={c.label} disabled={!admin} onChange={e => upd(i, "label", e.target.value)} /></Field>
          <Field label="What evaluators look for (English)"><input className="input" value={c.description || ""} disabled={!admin} onChange={e => upd(i, "description", e.target.value)} /></Field>
          <Field label="Weight %"><input className="input num" inputMode="numeric" value={c.weight} disabled={!admin} onChange={e => upd(i, "weight", e.target.value.replace(/\D/g, ""))} /></Field>
          {admin ? <Btn v="ghost" title="Remove criterion" onClick={() => setCrit(crit.filter((_, j) => j !== i))}>×</Btn> : <span />}
        </div>
        <div className="rb-row ar">
          <Field label="Criterion name (Arabic)"><input className="input" lang="ar" dir="rtl" value={c.label_ar || ""} disabled={!admin} placeholder="اسم المعيار" onChange={e => upd(i, "label_ar", e.target.value)} /></Field>
          <Field label="What evaluators look for (Arabic)"><input className="input" lang="ar" dir="rtl" value={c.description_ar || ""} disabled={!admin} placeholder="ما يبحث عنه المقيّم" onChange={e => upd(i, "description_ar", e.target.value)} /></Field>
          <span />
        </div>
      </div>)}
      {crit.length > 0 && crit.some(c => c.label && !c.label_ar) && <p className="small" style={{ color: "var(--warn)" }}>{crit.filter(c => c.label && !c.label_ar).length} of {crit.length} criteria have no Arabic name. Evaluators who choose Arabic will see English for those.</p>}
      {admin && <div><Btn sm onClick={() => setCrit([...crit, { label: "", label_ar: "", weight: 0, description: "", description_ar: "" }])}>Add criterion</Btn></div>}
      <div className="rb-qs">
        <div className="stack s4"><b>Yes/no questions</b><span className="small faint">Evaluators answer each one with Yes or No (for example national identity, or whether the work follows the theme). Tick “Yes needed” when every evaluator must say yes for the artwork to go through. When evaluators disagree, the artwork can be sent to review (set per round).</span></div>
        {qs.map((x, i) => <div key={x.key || i} className="rb-crit">
          <div className="rb-row">
            <Field label={`Question ${i + 1} name (English)`}><input className="input" value={x.label} disabled={!admin} placeholder="For example Theme" onChange={e => updQ(i, "label", e.target.value)} /></Field>
            <Field label="Question evaluators see (English)"><input className="input" value={x.ask || ""} disabled={!admin} placeholder="For example Does the work follow the theme?" onChange={e => updQ(i, "ask", e.target.value)} /></Field>
            <Field label="Yes needed"><Switch checked={!!x.pass_yes} disabled={!admin} onChange={v => updQ(i, "pass_yes", v)} label={x.pass_yes ? "To go through" : "No"} /></Field>
            {admin ? <Btn v="ghost" title="Remove question" onClick={() => setQs(qs.filter((_, j) => j !== i))}>×</Btn> : <span />}
          </div>
          <div className="rb-row ar">
            <Field label="Question name (Arabic)"><input className="input" lang="ar" dir="rtl" value={x.label_ar || ""} disabled={!admin} placeholder="اسم السؤال" onChange={e => updQ(i, "label_ar", e.target.value)} /></Field>
            <Field label="Question evaluators see (Arabic)"><input className="input" lang="ar" dir="rtl" value={x.ask_ar || ""} disabled={!admin} placeholder="السؤال" onChange={e => updQ(i, "ask_ar", e.target.value)} /></Field>
            <span /><span />
          </div>
          <div className="rb-opts">
            <Field label="If Yes, evaluators choose from (optional)" help="One option per line. Leave empty for a plain Yes/No."><textarea className="textarea" rows={3} disabled={!admin} value={Array.isArray(x.options) ? x.options.join("\n") : x.options || ""} placeholder={"For example:\nFlag\nFalcon\nDesert landscape"} onChange={e => updQ(i, "options", e.target.value)} /></Field>
            {optList(x.options).length > 0 && <div className="stack s4">
              <Check label="Add “Other” (the evaluator types it)" disabled={!admin} checked={!!x.other} onChange={v => updQ(i, "other", v)} />
              <Check label="Send to management review when evaluators choose different options" disabled={!admin} checked={!!x.flag_choice} onChange={v => updQ(i, "flag_choice", v)} />
            </div>}
          </div>
        </div>)}
        {!qs.length && <p className="small faint" style={{ margin: 0 }}>No yes/no questions in this rubric.</p>}
        {admin && <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <Btn sm disabled={qs.length >= 8} onClick={() => setQs([...qs, { label: "", label_ar: "", ask: "", ask_ar: "", pass_yes: false }])}>Add yes/no question</Btn>
          {!qs.some(x => x.key === "identity") && <Btn sm v="ghost" onClick={() => setQs([...qs, { key: "identity", label: "National identity", label_ar: "الهوية الوطنية", ask: "Does the work clearly express UAE national identity?", ask_ar: "هل يعبّر العمل بوضوح عن الهوية الوطنية الإماراتية؟", pass_yes: false }])}>Add national identity</Btn>}
          {!qs.some(x => x.key === "theme") && <Btn sm v="ghost" onClick={() => setQs([...qs, { key: "theme", label: "Theme", label_ar: "الموضوع", ask: "Does the work follow this year's theme?", ask_ar: "هل يلتزم العمل بموضوع هذا العام؟", pass_yes: false }])}>Add theme</Btn>}
        </div>}
        {qBad && <span className="small" style={{ color: "var(--warn)" }}>Every yes/no question needs an English name.</span>}
      </div>
      <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Field label="Grade A from (total)"><input className="input num" style={{ width: 90 }} inputMode="numeric" disabled={!admin} value={bands.A} onChange={e => setBands({ ...bands, A: e.target.value.replace(/\D/g, "").slice(0, 3) })} /></Field>
        <Field label="Grade B from (total)"><input className="input num" style={{ width: 90 }} inputMode="numeric" disabled={!admin} value={bands.B} onChange={e => setBands({ ...bands, B: e.target.value.replace(/\D/g, "").slice(0, 3) })} /></Field>
        <span className="small faint" style={{ paddingBottom: 10 }}>Grade C below {bands.B || "B"}. {bandsBad ? <span style={{ color: "var(--warn)" }}>A must be higher than B, and both from 1 to 100.</span> : `A: ${bands.A}–100 · B: ${bands.B}–${Number(bands.A) - 1} · C: 0–${Number(bands.B) - 1}`}</span>
      </div>
      <div className="meter"><div className="grow stack s4"><span className="strong">Total {tot}%</span><span className="small" style={{ color: tot === 100 ? "var(--ok)" : "var(--warn)" }}>{tot === 100 ? "Ready to publish" : tot < 100 ? `${100 - tot} points left to assign` : `${tot - 100} points over`}</span></div>
        {admin && <><input className="input" style={{ width: 220 }} placeholder="Reason (if used by an open round)" value={reason} onChange={e => setReason(e.target.value)} /><Btn busy={busy === "save"} disabled={!changed || bandsBad || qBad} onClick={save}>Save draft</Btn><Btn v="primary" busy={busy === "pub"} disabled={tot !== 100 || crit.some(c => !c.label) || bandsBad || qBad || !canPublish} title={!canPublish ? "Nothing has changed since the published version" : ""} onClick={publish}>Publish</Btn></>}</div>
    </Card>
    <Card title="Versions" flush><Table cols={["Version", "Status", "Criteria", "Published"]} rows={d.data.versions.slice().reverse().map(v => [`v${v.version}`, <Badge key="s" tone={v.status === "published" ? "ok" : v.status === "draft" ? "warn" : ""}>{v.status}</Badge>, <span key="c" className="small">{(v.criteria || []).map(c => `${c.label} ${c.weight}%`).join(" · ")}{questionsOf(v).length ? ` · yes/no: ${questionsOf(v).map(x => x.label).join(", ")}` : ""}{v.grade_bands ? ` · A ${bandOf(v, "A", 80)}, B ${bandOf(v, "B", 50)}` : ""}</span>, v.published_at ? when(v.published_at) : ""])} /></Card>
  </>;
}
