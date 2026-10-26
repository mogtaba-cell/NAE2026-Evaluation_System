"use client";
import { use, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, useApi, useMeta, useToast, PageHead, Btn, Badge, Banner, Loading, Field, Modal, Check, dshort } from "@/components/ui";
import FileViewer from "@/components/FileViewer";
import EntryAbout from "@/components/EntryAbout";
import { total, gradeFor } from "@/components/ScoreForm";
import { useLang, LangToggle, scoreLang, SL, critIn, AR_FONT } from "@/components/lang";

const passesRule = (rule, t, g, idn) => { if (t == null) return null; if (rule?.min_score != null && t < Number(rule.min_score)) return false; if (rule?.grades?.length && !rule.grades.includes(g)) return false; if (rule?.identity && idn !== true) return false; return true; };

export default function Session({ params }) {
  const { id } = use(params); const sp = useSearchParams(); const router = useRouter(); const toast = useToast(); const meta = useMeta();
  const cur = sp.get("entry");
  const d = useApi(`/api/sessions/${id}${cur ? `?entry=${encodeURIComponent(cur)}` : ""}`);
  const [m, setM] = useState({}); const [idn, setIdn] = useState({}); const [busy, setBusy] = useState(null); const [err, setErr] = useState(null);
  const [confirm, setConfirm] = useState(null);   // { evs: [...] } scores about to be saved
  const [leave, setLeave] = useState(null);       // entry code we want to open while scores are unsaved
  const [absentAsk, setAbsentAsk] = useState(null);
  const [finishAsk, setFinishAsk] = useState(null);
  const [edit, setEdit] = useState(null);
  const e = d.data?.entries.find(x => x.code === d.data.current);
  const [lang0, setLang] = useLang(id);
  const lang = scoreLang(lang0), ar = lang === "ar", T = SL[lang];
  const admin = meta?.data?.me?.role === "admin";
  useEffect(() => { if (!e) return; const mm = {}, ii = {}; d.data.team.forEach(t => { const s = e.scores.find(x => x.evaluator_id === t.id); mm[t.id] = { ...(s?.scores || {}) }; ii[t.id] = s?.national_identity ?? null; }); setM(mm); setIdn(ii); }, [e?.code, d.data]); // eslint-disable-line
  useEffect(() => { setErr(null); }, [e?.code]); // eslint-disable-line
  const crit = e?.rubric?.criteria || [];
  const scoreOf = ev => e?.scores.find(x => x.evaluator_id === ev);
  const saved = ev => scoreOf(ev)?.status === "submitted";
  const absent = ev => scoreOf(ev)?.status === "absent";
  const dirty = useMemo(() => !!e && (d.data?.team || []).some(t => !saved(t.id) && !absent(t.id) && crit.some(c => (m[t.id]?.[c.key] ?? "") !== ((scoreOf(t.id)?.scores || {})[c.key] ?? ""))), [m, e, d.data]); // eslint-disable-line
  if (!d.data) return <Loading error={d.error} />;
  const { session: s, team, entries, rules } = d.data;
  const filled = ev => crit.every(c => m[ev]?.[c.key] !== "" && m[ev]?.[c.key] != null) && (!e.rubric?.identity_required || idn[ev] !== null);
  const editable = (s.status === "live" && (s.mine || admin)) || (admin && s.status !== "cancelled");
  const bands = e?.rubric?.grade_bands;

  // What saving these columns would do to the entry (shown before saving).
  function preview(evs) {
    const totals = [], answers = [];
    team.forEach(t => { if (saved(t.id)) { totals.push(scoreOf(t.id).total); answers.push(scoreOf(t.id).national_identity); } else if (evs.includes(t.id)) { totals.push(total(crit, m[t.id])); answers.push(idn[t.id]); } });
    const abs = team.filter(t => absent(t.id)).length;
    const complete = totals.length + abs >= team.length && totals.length >= (e.min || 1);
    if (!complete) return { complete: false, left: team.length - totals.length - abs, need: e.min };
    const teamScore = Math.ceil(totals.reduce((a, b) => a + b, 0) / totals.length - 1e-9);
    const g = gradeFor(teamScore, bands);
    const ask = !!e.rubric?.identity_required;
    const identity = ask ? answers.every(a => a === true) : null;
    const why = [];
    if (rules.flag_near && Math.abs(teamScore - e.flagLine) <= rules.flag_margin) why.push(`it is within ${rules.flag_margin} points of the ${rules.flag_line === "A" ? "grade A line" : "pass mark"} (${e.flagLine})`);
    const spread = totals.length > 1 ? Math.max(...totals) - Math.min(...totals) : 0;
    if (rules.flag_spread && spread > rules.spread_limit) why.push(`the evaluators are ${spread} points apart`);
    if (rules.flag_identity && ask && answers.includes(true) && answers.includes(false)) why.push("the evaluators disagree on national identity");
    return { complete: true, team: teamScore, grade: g, why, passes: passesRule(rules.pass_rule, teamScore, g, identity) };
  }
  async function submit(evs) {
    setBusy("go"); setErr(null);
    try { for (const ev of evs) await api("/api/scores", { body: { entry_code: e.code, round_no: s.round_no, evaluator_id: ev, session_id: s.id, scores: m[ev], national_identity: idn[ev], submit: true } }); toast(`Saved ${evs.length} score${evs.length > 1 ? "s" : ""} for ${e.code}`); setConfirm(null); d.reload(); }
    catch (x) { setErr(x.message); setConfirm(null); } setBusy(null);
  }
  async function markAbsent(ev, undo) {
    setBusy("abs"); setErr(null);
    try { await api("/api/scores", { body: { entry_code: e.code, round_no: s.round_no, evaluator_id: ev, session_id: s.id, ...(undo ? { clear_absent: true } : { absent: true }) } }); setAbsentAsk(null); d.reload(); }
    catch (x) { setErr(x.message); setAbsentAsk(null); } setBusy(null);
  }
  async function framing(needs, glass) { try { await api("/api/logistics", { body: { action: "framing", entry_code: e.code, needs, glass: needs && glass } }); d.reload(); } catch (x) { toast(x.message, "err"); } }
  async function act(action, extra = {}) {
    setBusy(action);
    try {
      const r = await api(`/api/sessions/${id}`, { method: "PATCH", body: { action, ...extra } });
      if (r.ok === false && r.incomplete) { setFinishAsk(r); setBusy(null); return; }
      setFinishAsk(null); setEdit(null);
      toast({ start: "Session started. The artworks are marked as with you.", finish: "Session finished. Physical artworks go back to storage.", reopen: "Session reopened.", cancel: "Session cancelled.", edit: "Session updated." }[action]);
      if (action === "cancel") router.push("/sessions"); else d.reload();
    } catch (x) { toast(x.message, "err"); } setBusy(null);
  }
  const go = code => router.replace(`/sessions/${id}?entry=${encodeURIComponent(code)}`, { scroll: false });
  const open = code => { if (dirty) setLeave(code); else go(code); };
  const pending = team.filter(t => !saved(t.id) && !absent(t.id) && filled(t.id)).map(t => t.id);
  const idx = entries.findIndex(x => x.code === e?.code);
  const pv = confirm ? preview(confirm.evs) : null;
  const res = e?.result;
  const resultText = !res ? null : e.review?.status === "open" ? `With management: ${e.review.reason}` : res.complete ? (e.review ? `Decided by management (${e.review.status})` : res.passed ? `Complete · passes Round ${s.round_no}` : `Complete · does not pass Round ${s.round_no}`) : `Provisional: ${res.scored} of ${res.needed} scores${e.min ? ` (needs at least ${e.min})` : ""}`;
  const statusLabel = { live: "In progress", done: "Done", planned: "Planned", cancelled: "Cancelled" }[s.status];
  return <>
    <PageHead back={["Scoring sessions", "/sessions"]} title={s.title} sub={[s.session_date ? dshort(s.session_date) : null, s.time_text, s.venue, s.coordinator ? `coordinator ${s.coordinator}` : null].filter(Boolean).join(" · ")}
      badges={<Badge tone={s.status === "live" ? "info" : s.status === "done" ? "ok" : s.status === "cancelled" ? "bad" : ""}>{statusLabel}</Badge>}
      actions={<>
        {s.status === "planned" && <Btn v="primary" busy={busy === "start"} onClick={() => act("start")}>Start session</Btn>}
        {s.status === "planned" && <Btn onClick={() => setEdit({ title: s.title, session_date: s.session_date || "", time_text: s.time_text || "", venue: s.venue || "", evaluator_ids: team.map(t => t.id), remove: [] })}>Edit</Btn>}
        {s.status === "live" && <Btn busy={busy === "finish"} onClick={() => act("finish")}>Finish session</Btn>}
        {s.status === "done" && admin && <Btn busy={busy === "reopen"} onClick={() => act("reopen")}>Reopen</Btn>}
        {entries.some(x => x.logistics) && <Btn href={`/pull-list?session=${id}`}>Pull list</Btn>}</>} />
    <p className="small faint" style={{ marginTop: -8 }}>Team: {team.map(t => t.name).join(", ")}</p>
    {s.status === "planned" && <Banner title="Start the session when the team is in the room">Scores can be entered once the session has started. You can still edit the team and the artworks, or cancel the session.</Banner>}
    {s.status === "done" && <Banner title="This session is finished">Entries that weren't fully scored can go into another session (physical artworks are back in storage).{admin ? " As an admin you can still correct scores here." : ""}</Banner>}
    <div className="f3-sc f3-sess">
      <section className="card f3-queue"><div className="qh"><b>{entries.length} artworks</b><span className="small faint">{entries.filter(x => x.result?.complete).length} fully scored</span></div>
        <div className="qb">{entries.map(x => <div key={x.code} role="button" tabIndex={0} className={`f3-qi${x.code === e?.code ? " on" : ""}`} onClick={() => open(x.code)} onKeyDown={k => k.key === "Enter" && open(x.code)}><div className="t"><b>{x.code}</b><span dir="auto">{x.title_en || x.title_ar || x.group_name || "Untitled"}</span></div><span className="s">{x.result?.complete ? x.result.final ?? x.result.team : `${x.scores.filter(y => y.status === "submitted").length}/${team.length}`}</span></div>)}</div></section>
      {e ? <div className="stack sticky-view" style={{ gap: 12, minWidth: 0 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><span className="code" style={{ fontSize: 15, fontWeight: 600 }}>{e.code}</span><Badge>{e.sub}</Badge>{e.r1 && <Badge tone="ok">Round 1: {e.r1.final ?? e.r1.team} · {e.r1.grade}</Badge>}{e.logistics?.damaged && <Badge tone="warn">Damaged</Badge>}{e.logistics?.where && <Badge>{e.logistics.where}</Badge>}</div>
        <FileViewer files={e.files || []} tall title="Photos for reference; judge the artwork in the room" />
      </div> : <Loading />}
      {e && <div className="stack" style={{ gap: 16, minWidth: 0 }}>
        <section className={`card score-card${ar ? " is-ar" : ""}`} dir={ar ? "rtl" : "ltr"} lang={ar ? "ar" : "en"} style={ar ? { fontFamily: AR_FONT } : undefined}>
          <div className="card-h"><div className="tt"><h3>{T.scores}</h3><span className="sub">{T.rubric} <span dir="ltr">{e.rubric?.code} v{e.rubric?.version}</span> · {T.each}</span></div><LangToggle lang={lang} onChange={setLang} both={false} /></div>
          {err && <Banner tone="bad" title={err} />}
          {!e.rubric ? <Banner tone="warn" title={`No published Round ${s.round_no} rubric`} /> : <div className="tw"><table className="x-cmp sess-mx"><thead><tr><th>{T.criterion}</th>{team.map(t => <th key={t.id} title={t.name}>{t.name}</th>)}</tr></thead><tbody>
            {crit.map(c => { const ct = critIn(c, lang); return <tr key={c.key}><td><div className="cl"><b>{ct.label} <span className="w">{c.weight}%</span></b>{ct.desc && <span className="d">{ct.desc}</span>}{ct.missing && ar && <span className="d">{T.noAr}</span>}</div></td>
              {team.map(t => <td key={t.id}>{absent(t.id) ? <span className="faint small">{T.absent}</span> : <input className="sc-in" inputMode="numeric" aria-label={`${t.name}, ${c.label}`} disabled={!editable || saved(t.id)} value={m[t.id]?.[c.key] ?? ""} onChange={x => setM({ ...m, [t.id]: { ...m[t.id], [c.key]: x.target.value.replace(/\D/g, "").slice(0, 3) } })} />}</td>)}</tr>; })}
            {e.rubric.identity_required && <tr><td><div className="cl"><b>{T.identity}</b></div></td>{team.map(t => <td key={t.id}>{absent(t.id) ? "" : <span className="f3-yn"><button type="button" disabled={!editable || saved(t.id)} className={idn[t.id] === true ? "on" : ""} onClick={() => setIdn({ ...idn, [t.id]: true })}>{T.y}</button><button type="button" disabled={!editable || saved(t.id)} className={idn[t.id] === false ? "on" : ""} onClick={() => setIdn({ ...idn, [t.id]: false })}>{T.n}</button></span>}</td>)}</tr>}
            <tr className="tot"><td>{T.total}</td>{team.map(t => <td key={t.id}>{saved(t.id) ? scoreOf(t.id).total : absent(t.id) ? "–" : crit.some(c => m[t.id]?.[c.key]) ? total(crit, m[t.id]) : "–"}</td>)}</tr>
            {(editable || team.some(t => saved(t.id) || absent(t.id))) && <tr className="act"><td></td>{team.map(t => <td key={t.id}>{saved(t.id) ? <Badge tone="ok">{T.saved}</Badge> : absent(t.id) ? (editable ? <Btn sm v="ghost" busy={busy === "abs"} onClick={() => markAbsent(t.id, true)}>{T.undoAbsent}</Btn> : <Badge>{T.absent}</Badge>) : editable && <div className="stack s4" style={{ alignItems: "center" }}><Btn sm disabled={!filled(t.id) || !!busy} onClick={() => setConfirm({ evs: [t.id] })}>{T.save}</Btn><Btn sm v="ghost" disabled={!!busy} onClick={() => setAbsentAsk(t)}>{T.absent}</Btn></div>}</td>)}</tr>}
          </tbody></table></div>}
          {res && <div className="x-tot"><div className="stack s4"><span className="s">{T.teamResult}</span><span className="v">{res.team != null ? res.final ?? res.team : "–"}</span></div><div className="stack s4"><span className="s">{T.grade}</span><span style={{ fontSize: 18, fontWeight: 600 }}>{res.team != null ? res.grade || gradeFor(res.team, bands) : "–"}</span></div><span className="s" dir="ltr" style={{ marginInlineStart: "auto", textAlign: "end" }}>{resultText}</span></div>}
          {e.logistics && <div className="f3-crit" style={{ borderTop: "1px solid var(--rule)" }}><div className="lab"><b>{T.framing}</b><span>{T.framingQ}</span></div>
            <div className="stack s4"><Check label={T.needs} disabled={!editable} checked={!!e.logistics?.needs_framing} onChange={v => framing(v, e.logistics?.glass_framing)} /><Check label={T.glass} disabled={!editable || !e.logistics?.needs_framing} checked={!!e.logistics?.glass_framing} onChange={v => framing(true, v)} /></div></div>}
          <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>{pending.length > 1 && <Btn v="primary" disabled={!!busy} onClick={() => setConfirm({ evs: pending })}>{T.saveAll(pending.length)}</Btn>}{idx < entries.length - 1 && <Btn onClick={() => open(entries[idx + 1].code)}>{T.next}</Btn>}</div>
        </section>
        <EntryAbout e={{ ...e, id: e.code, pathway: s.pathway }} compact />
      </div>}
    </div>

    <Modal open={!!confirm} title={confirm?.evs.length > 1 ? `Save ${confirm.evs.length} scores?` : "Save this score?"} sub={e ? `${e.code} · saved scores are final` : ""} onClose={() => setConfirm(null)} footer={<><Btn onClick={() => setConfirm(null)}>Back</Btn><Btn v="primary" busy={busy === "go"} onClick={() => submit(confirm.evs)}>Save</Btn></>}>
      {confirm && <><table className="x-cmp"><thead><tr><th>Evaluator</th><th>Total</th></tr></thead><tbody>{confirm.evs.map(ev => <tr key={ev}><td>{team.find(t => t.id === ev)?.name}</td><td>{total(crit, m[ev])}</td></tr>)}</tbody></table>
        {pv && !pv.complete && <p className="muted">After this, {pv.left} more score{pv.left === 1 ? "" : "s"} (or absences) are needed for this artwork.</p>}
        {pv?.complete && pv.why.length > 0 && <Banner tone="warn" title="This artwork will go to management review">Because {pv.why.join(", and ")}. Team result {pv.team} · grade {pv.grade}.</Banner>}
        {pv?.complete && !pv.why.length && <Banner tone={pv.passes ? "ok" : ""} title={`Team result ${pv.team} · grade ${pv.grade}`}>{pv.passes ? `It passes Round ${s.round_no}.` : `It does not pass Round ${s.round_no} (${rules.pass_text}).`}</Banner>}
        <p className="faint small">Saved scores can only be corrected by an admin, with a reason.</p></>}
    </Modal>
    <Modal open={!!leave} title="Scores not saved" onClose={() => setLeave(null)} footer={<><Btn onClick={() => setLeave(null)}>Stay</Btn><Btn v="primary" onClick={() => { const c = leave; setLeave(null); go(c); }}>Leave without saving</Btn></>}>
      <p className="muted">You typed scores for {e?.code} that aren't saved yet. They will be lost if you open another artwork.</p>
    </Modal>
    <Modal open={!!absentAsk} title={`Mark ${absentAsk?.name || ""} absent for ${e?.code}?`} onClose={() => setAbsentAsk(null)} footer={<><Btn onClick={() => setAbsentAsk(null)}>Back</Btn><Btn v="primary" busy={busy === "abs"} onClick={() => markAbsent(absentAsk.id)}>Mark absent</Btn></>}>
      <p className="muted">The artwork is then decided on the other evaluators' scores. It needs at least {e?.min} score{e?.min === 1 ? "" : "s"}.</p>
    </Modal>
    <Modal open={!!finishAsk} title="Finish with artworks not fully scored?" onClose={() => setFinishAsk(null)} footer={<><Btn onClick={() => setFinishAsk(null)}>Back</Btn><Btn v="primary" busy={busy === "finish"} onClick={() => act("finish", { confirm: true })}>Finish anyway</Btn></>}>
      <p className="muted">{finishAsk?.note}</p>
    </Modal>
    <Modal open={!!edit} wide title="Edit session" onClose={() => setEdit(null)} footer={<><Btn v="ghost" busy={busy === "cancel"} onClick={() => act("cancel", { reason: "Cancelled before it started" })}>Cancel session</Btn><span className="sp" /><Btn onClick={() => setEdit(null)}>Back</Btn><Btn v="primary" busy={busy === "edit"} onClick={() => act("edit", edit)}>Save</Btn></>}>
      {edit && <div className="stack" style={{ gap: 12 }}>
        <Field label="Title"><input className="input" value={edit.title} onChange={x => setEdit({ ...edit, title: x.target.value })} /></Field>
        <div className="grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
          <Field label="Date"><input type="date" className="input" value={edit.session_date} onChange={x => setEdit({ ...edit, session_date: x.target.value })} /></Field>
          <Field label="Time"><input className="input" value={edit.time_text} onChange={x => setEdit({ ...edit, time_text: x.target.value })} /></Field>
          <Field label="Venue"><input className="input" value={edit.venue} onChange={x => setEdit({ ...edit, venue: x.target.value })} /></Field>
        </div>
        <Field label="Evaluator team"><div className="row" style={{ gap: 12, flexWrap: "wrap" }}>{(meta?.data?.evaluators || []).filter(v => v.active).map(v => <Check key={v.id} label={v.name} checked={edit.evaluator_ids.includes(v.id)} onChange={on => setEdit({ ...edit, evaluator_ids: on ? [...edit.evaluator_ids, v.id] : edit.evaluator_ids.filter(x => x !== v.id) })} />)}</div></Field>
        <Field label="Artworks in this session" help="Untick an artwork to take it out of the session.">
          <div className="stack s4" style={{ maxHeight: 240, overflow: "auto" }}>{entries.map(x => <Check key={x.code} label={`${x.code} · ${x.school || ""} · ${x.title_en || x.group_name || ""}`} checked={!edit.remove.includes(x.code)} onChange={on => setEdit({ ...edit, remove: on ? edit.remove.filter(c => c !== x.code) : [...edit.remove, x.code] })} />)}</div></Field>
      </div>}
    </Modal>
  </>;
}
