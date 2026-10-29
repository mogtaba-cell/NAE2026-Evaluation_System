"use client";
import { use, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, useApi, useMeta, useToast, PageHead, Btn, Badge, Banner, Loading, Field, Modal, Check, Seg, dshort } from "@/components/ui";
import FileViewer from "@/components/FileViewer";
import SessionBoard from "@/components/SessionBoard";
import EntryAbout from "@/components/EntryAbout";
import { total, gradeFor } from "@/components/ScoreForm";
import { useLang, LangToggle, scoreLang, SL, critIn, AR_FONT } from "@/components/lang";

const passesRule = (rule, t, g, idn) => { if (t == null) return null; if (rule?.min_score != null && t < Number(rule.min_score)) return false; if (rule?.grades?.length && !rule.grades.includes(g)) return false; if (rule?.identityPass && idn !== true) return false; return true; };

// Typed scores are kept in this browser until saved, per session and artwork, so switching artworks or reloading
// loses nothing.
const DKEY = (sid, code) => `nae-draft:${sid}:${code}`;
const readDraft = (sid, code) => { try { return JSON.parse(localStorage.getItem(DKEY(sid, code)) || "null"); } catch { return null; } };
const writeDraft = (sid, code, v) => { try { if (v) localStorage.setItem(DKEY(sid, code), JSON.stringify(v)); else localStorage.removeItem(DKEY(sid, code)); } catch {} };

function RoomStrip({ entries, onOpen }) {
  const ph = entries.filter(x => x.logistics); const st = x => x.logistics.state;
  const room = ph.filter(x => ["coordinator", "handed_over"].includes(st(x))), waiting = ph.filter(x => ["requested", "picked"].includes(st(x)) || (st(x) === "storage" && !x.result?.complete)), back = ph.filter(x => st(x) === "returning");
  const batches = [...new Set(room.map(x => x.logistics.batch).filter(Boolean))];
  const left = room.filter(x => !x.result?.complete).length;
  return <div className="sb-sum" style={{ marginBottom: 12 }}>
    <span><b>{room.length}</b> in the room{batches.length ? ` (batch ${batches.join(", ")})` : ""}{room.length ? ` · ${room.length - left} scored` : ""}</span><span className="arrow">·</span>
    <span><b>{waiting.length}</b> waiting with storage</span><span className="arrow">·</span><span><b>{back.length}</b> handed back</span>
    <span className="sp" />{room.length > 0 && left === 0 && <span className="small" style={{ color: "var(--ok)" }}>This batch is scored: hand it back for the next one.</span>}
    <Btn sm v={room.length > 0 && left === 0 ? "primary" : "secondary"} onClick={onOpen}>Open artworks board</Btn>
  </div>;
}

export default function Session({ params }) {
  const { id } = use(params); const sp = useSearchParams(); const router = useRouter(); const toast = useToast(); const meta = useMeta();
  const cur = sp.get("entry");
  const d = useApi(`/api/sessions/${id}${cur ? `?entry=${encodeURIComponent(cur)}` : ""}`, [], { live: 15000 });
  const [m, setM] = useState({}); const [idn, setIdn] = useState({}); const [abs, setAbs] = useState({}); const [busy, setBusy] = useState(null); const [err, setErr] = useState(null);
  const [finishAsk, setFinishAsk] = useState(null);
  const [edit, setEdit] = useState(null); const [board, setBoard] = useState(false); const [only, setOnly] = useState(null);
  const me = meta?.data?.me;
  const e = d.data?.entries.find(x => x.code === d.data.current);
  // keep the open artwork in the address, so a live refresh never switches to another one
  useEffect(() => { if (!cur && d.data?.current) router.replace(`/sessions/${id}?entry=${encodeURIComponent(d.data.current)}`, { scroll: false }); }, [cur, d.data?.current]); // eslint-disable-line
  const [lang0, setLang] = useLang(id);
  const lang = scoreLang(lang0), ar = lang === "ar", T = SL[lang];
  const admin = meta?.data?.me?.role === "admin";
  // load the sheet when another artwork opens or a score gets saved; keep what's typed for the others
  const savedSig = e ? e.scores.map(x => `${x.evaluator_id}:${x.status}`).join("|") : "";
  useEffect(() => {
    if (!e) return;
    const dr = readDraft(id, e.code) || {};
    const mm = {}, ii = {}, aa = {};
    d.data.team.forEach(t => {
      const sc = e.scores.find(x => x.evaluator_id === t.id);
      if (sc && sc.status !== "draft") { mm[t.id] = { ...(sc.scores || {}) }; ii[t.id] = sc.national_identity ?? null; return; }
      mm[t.id] = { ...((dr.m || {})[t.id] || sc?.scores || {}) }; ii[t.id] = (dr.idn || {})[t.id] ?? sc?.national_identity ?? null; aa[t.id] = !!(dr.abs || {})[t.id];
    });
    setM(mm); setIdn(ii); setAbs(aa); setErr(null);
  }, [e?.code, savedSig]); // eslint-disable-line
  const crit = e?.rubric?.criteria || [];
  const scoreOf = ev => e?.scores.find(x => x.evaluator_id === ev);
  const saved = ev => scoreOf(ev)?.status === "submitted";
  const absent = ev => scoreOf(ev)?.status === "absent";
  function edit_(fn) { const next = fn(); if (e) writeDraft(id, e.code, next); }
  const setScore = (ev, key, v) => { const nm = { ...m, [ev]: { ...m[ev], [key]: v } }; setM(nm); edit_(() => ({ m: nm, idn, abs })); };
  const setId = (ev, v) => { const ni = { ...idn, [ev]: v }; setIdn(ni); edit_(() => ({ m, idn: ni, abs })); };
  const setAb = (ev, v) => { const na = { ...abs, [ev]: v }; setAbs(na); edit_(() => ({ m, idn, abs: na })); };
  if (!d.data) return <Loading error={d.error} />;
  const { session: s, team, entries, rules } = d.data;
  const filled = ev => crit.every(c => m[ev]?.[c.key] !== "" && m[ev]?.[c.key] != null) && (!e.rubric?.identity_required || idn[ev] !== null);
  const editable = (s.status === "live" && (s.mine || admin)) || (admin && s.status !== "cancelled");
  const bands = e?.rubric?.grade_bands;
  const open_ = team.filter(t => !saved(t.id) && !absent(t.id));            // columns still to save
  const missingCols = open_.filter(t => !abs[t.id] && !filled(t.id));
  const canSave = editable && open_.length > 0 && !missingCols.length && open_.some(t => !abs[t.id] || true);

  // What saving the open columns would do to the artwork (shown live under the sheet).
  function preview() {
    const totals = [], answers = [];
    team.forEach(t => { if (saved(t.id)) { totals.push(scoreOf(t.id).total); answers.push(scoreOf(t.id).national_identity); } else if (!absent(t.id) && !abs[t.id] && filled(t.id)) { totals.push(total(crit, m[t.id])); answers.push(idn[t.id]); } });
    const nAbs = team.filter(t => absent(t.id) || abs[t.id]).length;
    if (!totals.length) return null;
    const complete = totals.length + nAbs >= team.length && totals.length >= (e.min || 1);
    const teamScore = Math.ceil(totals.reduce((a, b) => a + b, 0) / totals.length - 1e-9);
    const g = gradeFor(teamScore, bands);
    if (!complete) return { complete: false, team: teamScore, grade: g, left: team.length - totals.length - nAbs, need: e.min };
    const ask = !!e.rubric?.identity_required;
    const identity = ask ? answers.every(a => a === true) : null;
    const why = [];
    if (rules.flag_near && Math.abs(teamScore - e.flagLine) <= rules.flag_margin) why.push(`it is within ${rules.flag_margin} points of the ${rules.flag_line === "A" ? "grade A line" : "pass mark"} (${e.flagLine})`);
    const spread = totals.length > 1 ? Math.max(...totals) - Math.min(...totals) : 0;
    if (rules.flag_spread && spread > rules.spread_limit) why.push(`the evaluators are ${spread} points apart`);
    if (rules.flag_identity && ask && answers.includes(true) && answers.includes(false)) why.push("the evaluators disagree on national identity");
    return { complete: true, team: teamScore, grade: g, why, passes: passesRule({ ...rules.pass_rule, identityPass: !!e.rubric?.identity_pass }, teamScore, g, identity) };
  }
  const inRoom = x => ["coordinator", "handed_over"].includes(x.logistics?.state);
  const physical = entries.some(x => x.logistics);
  const roomN = entries.filter(inRoom).length;
  const filter = only ?? (physical && roomN > 0 && s.status === "live" ? "room" : "all");
  // in the room: in the order they arrived (batch 1 first), so a new batch is added at the bottom
  const arrived = x => `${String(x.logistics?.batch || 0).padStart(4, "0")}|${x.logistics?.handed_at || ""}|${String(x.position ?? 0).padStart(5, "0")}`;
  const shown = filter === "room" ? entries.filter(inRoom).sort((a, b) => arrived(a).localeCompare(arrived(b))) : entries;
  const isNew = x => inRoom(x) && x.logistics?.handed_at && Date.now() - Date.parse(x.logistics.handed_at) < 3 * 60 * 1000;
  const nextOpen = () => { const order = [...entries.filter(inRoom), ...entries]; return order.find(x => x.code !== e.code && !x.result?.complete && !(x.scores.filter(y => y.status !== "draft").length >= team.length)); };
  async function saveSheet() {
    setBusy("go"); setErr(null);
    try {
      const items = open_.map(t => abs[t.id] ? { evaluator_id: t.id, absent: true } : { evaluator_id: t.id, scores: m[t.id], national_identity: idn[t.id] });
      const r = await api("/api/scores/session", { body: { session_id: s.id, entry_code: e.code, items } });
      writeDraft(id, e.code, null);
      toast(`${e.code}: saved ${r.saved} score${r.saved === 1 ? "" : "s"}${r.absent ? `, ${r.absent} absent` : ""}`);
      const nx = nextOpen(); if (nx) go(nx.code); else d.reload();
    } catch (x) { setErr(x.message); } setBusy(null);
  }
  async function framing(needs, glass) { try { await api("/api/logistics", { body: { action: "framing", entry_code: e.code, needs, glass: needs && glass } }); d.reload(); } catch (x) { toast(x.message, "err"); } }
  async function act(action, extra = {}) {
    setBusy(action);
    try {
      const r = await api(`/api/sessions/${id}`, { method: "PATCH", body: { action, ...extra } });
      if (r.ok === false && r.incomplete) { setFinishAsk(r); setBusy(null); return; }
      setFinishAsk(null); setEdit(null);
      toast({ start: "Session started.", finish: "Session finished. Artworks still in the room are marked as handed back to storage.", reopen: "Session reopened.", cancel: "Session cancelled.", edit: "Session updated." }[action]);
      if (action === "cancel") router.push("/sessions"); else d.reload();
    } catch (x) { toast(x.message, "err"); } setBusy(null);
  }
  const go = code => router.replace(`/sessions/${id}?entry=${encodeURIComponent(code)}`, { scroll: false });
  const idx = entries.findIndex(x => x.code === e?.code);
  const pv = e ? preview() : null;
  const hasDraft = code => { const dr = readDraft(id, code); return !!dr && Object.values(dr.m || {}).some(o => Object.values(o || {}).some(v => v !== "" && v != null)); };
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
        {physical && <Btn onClick={() => setBoard(true)}>Artworks board</Btn>}</>} />
    <p className="small faint" style={{ marginTop: -8 }}>Team: {team.map(t => t.name).join(", ")}</p>
    {s.status === "planned" && <Banner title="Start the session when the team is in the room">Scores can be entered once the session has started. You can still edit the team and the artworks, or cancel the session.</Banner>}
    {physical && s.status !== "done" && s.status !== "cancelled" && <RoomStrip entries={entries} onOpen={() => setBoard(true)} />}
    <Modal open={board} wide="x" title={`Artworks · ${s.title}`} sub="Storage brings artworks in batches. Hand a batch back when it's scored and storage brings the next one." onClose={() => { setBoard(false); d.reload(); }} footer={<Btn onClick={() => { setBoard(false); d.reload(); }}>Close</Btn>}>
      {board && <SessionBoard sessionId={id} role={me?.role} compact onChanged={d.reload} />}
    </Modal>
    {s.status === "done" && <Banner title="This session is finished">Artworks that weren't fully scored can go into another session (physical artworks are back in storage).{admin ? " As an admin you can still correct scores here." : ""}</Banner>}
    <div className="f3-sc f3-sess">
      <section className="card f3-queue"><div className="qh"><b>{shown.length} artworks</b><span className="small faint">{entries.filter(x => x.result?.complete).length} of {entries.length} fully scored</span></div>
        {physical && <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--rule)" }}><Seg value={filter} onChange={setOnly} items={[["room", `In the room ${roomN}`], ["all", `All ${entries.length}`]]} /></div>}
        <div className="qb">{shown.map(x => <div key={x.code} role="button" tabIndex={0} className={`f3-qi${x.code === e?.code ? " on" : ""}`} onClick={() => go(x.code)} onKeyDown={k => k.key === "Enter" && go(x.code)}><div className="t"><b>{x.code}</b><span dir="auto">{x.title_en || x.title_ar || x.group_name || "Untitled"}</span>{isNew(x) && <span className="room-chip new">Just arrived</span>}{x.logistics && <span className={`room-chip${inRoom(x) ? " in" : ""}`}>{inRoom(x) ? `In the room${x.logistics.batch ? ` · batch ${x.logistics.batch}` : ""}` : x.logistics.state === "returning" ? "Handed back" : x.logistics.state === "missing" ? "Missing" : "On the shelf"}</span>}</div><span className="s">{x.result?.complete ? x.result.final ?? x.result.team : `${x.scores.filter(y => y.status !== "draft").length}/${team.length}`}{hasDraft(x.code) && !x.result?.complete ? " ·" : ""}</span></div>)}
          {!shown.length && <p className="small faint" style={{ padding: 12 }}>{filter === "room" ? "No artworks in the room right now. Storage brings the next batch." : "No artworks."}</p>}</div></section>
      {e ? <div className="stack sticky-view" style={{ gap: 12, minWidth: 0 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><span className="code" style={{ fontSize: 15, fontWeight: 600 }}>{e.code}</span><Badge>{e.sub}</Badge>{e.r1 && <Badge tone="ok">Round 1: {e.r1.final ?? e.r1.team} · {e.r1.grade}</Badge>}{e.logistics?.damaged && <Badge tone="warn">Damaged</Badge>}{e.logistics?.where && <Badge>{e.logistics.where}</Badge>}</div>
        <FileViewer files={e.files || []} tall title="Photos for reference; judge the artwork in the room" />
      </div> : <Loading />}
      {e && <div className="stack" style={{ gap: 16, minWidth: 0 }}>
        <section className={`card score-card${ar ? " is-ar" : ""}`} dir={ar ? "rtl" : "ltr"} lang={ar ? "ar" : "en"} style={ar ? { fontFamily: AR_FONT } : undefined}>
          <div className="card-h"><div className="tt"><h3>{T.scores}</h3><span className="sub">{T.rubric} <span dir="ltr">{e.rubric?.code} v{e.rubric?.version}</span> · {T.each}</span></div><LangToggle lang={lang} onChange={setLang} both={false} /></div>
          {!e.rubric ? <Banner tone="warn" title={`No published Round ${s.round_no} rubric`} /> : <div className="tw"><table className="x-cmp sess-mx"><thead><tr><th>{T.criterion}</th>{team.map(t => <th key={t.id} title={t.name}>{t.name}</th>)}</tr></thead><tbody>
            {crit.map(c => { const ct = critIn(c, lang); return <tr key={c.key}><td><div className="cl"><b>{ct.label} <span className="w">{c.weight}%</span></b>{ct.desc && <span className="d">{ct.desc}</span>}{ct.missing && ar && <span className="d">{T.noAr}</span>}</div></td>
              {team.map(t => <td key={t.id}>{absent(t.id) || abs[t.id] ? <span className="faint small">{T.absent}</span> : <input className="sc-in" inputMode="numeric" aria-label={`${t.name}, ${c.label}`} disabled={!editable || saved(t.id)} value={m[t.id]?.[c.key] ?? ""} onChange={x => setScore(t.id, c.key, x.target.value.replace(/\D/g, "").slice(0, 3))} />}</td>)}</tr>; })}
            {e.rubric.identity_required && <tr><td><div className="cl"><b>{T.identity}</b></div></td>{team.map(t => <td key={t.id}>{absent(t.id) || abs[t.id] ? "" : <span className="f3-yn"><button type="button" disabled={!editable || saved(t.id)} className={idn[t.id] === true ? "on" : ""} onClick={() => setId(t.id, true)}>{T.y}</button><button type="button" disabled={!editable || saved(t.id)} className={idn[t.id] === false ? "on" : ""} onClick={() => setId(t.id, false)}>{T.n}</button></span>}</td>)}</tr>}
            <tr className="tot"><td>{T.total}</td>{team.map(t => <td key={t.id}>{saved(t.id) ? scoreOf(t.id).total : absent(t.id) || abs[t.id] ? "–" : crit.some(c => m[t.id]?.[c.key]) ? total(crit, m[t.id]) : "–"}</td>)}</tr>
            {(editable || team.some(t => saved(t.id) || absent(t.id))) && <tr className="act"><td></td>{team.map(t => <td key={t.id}>{saved(t.id) ? <Badge tone="ok">{T.saved}</Badge> : absent(t.id) ? <Badge>{T.absent}</Badge> : editable && (abs[t.id] ? <Btn sm v="ghost" onClick={() => setAb(t.id, false)}>{T.undo}</Btn> : <Btn sm v="ghost" onClick={() => setAb(t.id, true)}>{T.absent}</Btn>)}</td>)}</tr>}
          </tbody></table></div>}
          {res && <div className="x-tot"><div className="stack s4"><span className="s">{T.teamResult}</span><span className="v">{res.team != null ? res.final ?? res.team : "–"}</span></div><div className="stack s4"><span className="s">{T.grade}</span><span style={{ fontSize: 18, fontWeight: 600 }}>{res.team != null ? res.grade || gradeFor(res.team, bands) : "–"}</span></div><span className="s" dir="ltr" style={{ marginInlineStart: "auto", textAlign: "end" }}>{resultText}</span></div>}
          {e.logistics && <div className="f3-crit" style={{ borderTop: "1px solid var(--rule)" }}><div className="lab"><b>{T.framing}</b><span>{T.framingQ}</span></div>
            <div className="stack s4"><Check label={T.needs} disabled={!editable} checked={!!e.logistics?.needs_framing} onChange={v => framing(v, e.logistics?.glass_framing)} /><Check label={T.glass} disabled={!editable || !e.logistics?.needs_framing} checked={!!e.logistics?.glass_framing} onChange={v => framing(true, v)} /></div></div>}
          {err && <Banner tone="bad" title={err} />}
          {editable && open_.length > 0 && <div className="sheet-save">
            <div className="stack s4" style={{ flex: 1, minWidth: 220 }}>
              {pv ? (pv.complete ? (pv.why.length ? <span><b>Team result {pv.team} · grade {pv.grade}</b> <span className="faint">· goes to management review because {pv.why.join(", and ")}</span></span> : <span><b>Team result {pv.team} · grade {pv.grade}</b> <span className="faint">· {pv.passes ? `passes Round ${s.round_no}` : `does not pass Round ${s.round_no}`}</span></span>) : <span className="faint">So far {pv.team} · grade {pv.grade}. {pv.left} more score{pv.left === 1 ? "" : "s"} needed.</span>) : <span className="faint">{T.draftKept}</span>}
              {missingCols.length > 0 && <span className="small" style={{ color: "var(--warn)" }}>{T.needFill(missingCols.map(t => t.name).join(", "))}</span>}
              <span className="small faint">Saved scores are final; only an admin can correct them, with a reason.</span>
            </div>
            <Btn v="primary" busy={busy === "go"} disabled={!canSave} onClick={saveSheet}>{nextOpen() ? T.saveSheet : T.saveSheetLast}</Btn>
          </div>}
          {(!editable || !open_.length) && idx < entries.length - 1 && <div className="row" style={{ justifyContent: "flex-end" }}><Btn onClick={() => go((nextOpen() || entries[idx + 1]).code)}>{T.next}</Btn></div>}
        </section>
        <EntryAbout e={{ ...e, id: e.code, pathway: s.pathway }} compact />
      </div>}
    </div>

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
