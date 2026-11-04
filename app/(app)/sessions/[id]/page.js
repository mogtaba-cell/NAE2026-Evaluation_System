"use client";
import VenueSelect from "@/components/VenueSelect";
import { use, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, useApi, useMeta, useToast, PageHead, Btn, Badge, Banner, Loading, Field, Modal, Check, Seg, dshort } from "@/components/ui";
import { hm, timeText, isOverdue, overdueText } from "@/lib/sessiontime";
import FileViewer from "@/components/FileViewer";
import SessionBoard from "@/components/SessionBoard";
import EntryAbout from "@/components/EntryAbout";
import EditDetails from "@/components/EditDetails";
import { total, gradeFor } from "@/components/ScoreForm";
import { useLang, LangToggle, scoreLang, SL, critIn, AR_FONT } from "@/components/lang";
import { answersOf, answerOf, qLabel } from "@/lib/questions";
import ChoicePick from "@/components/ChoicePick";

const qsOf = e => e?.rubric?.questions || [];
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
  const [m, setM] = useState({}); const [idn, setIdn] = useState({}); const [toRev, setToRev] = useState(false); const [nv, setNv] = useState(null); const [cc, setCc] = useState(null); const [selfEdit, setSelfEdit] = useState(null); const [abs, setAbs] = useState({}); const [cm, setCm] = useState({}); const [busy, setBusy] = useState(null); const [err, setErr] = useState(null);
  const [finishAsk, setFinishAsk] = useState(null); const [editD, setEditD] = useState(false);
  const [edit, setEdit] = useState(null); const [board, setBoard] = useState(false); const [only, setOnly] = useState(null);
  // schools with artworks waiting for a session in this round, to add to the session while editing it
  const pools = useApi(edit && edit.status !== "done" ? "/api/sessions?pools=1" : null, [edit ? 1 : 0]);
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
    const mm = {}, ii = {}, aa = {}, cc = {};
    d.data.team.forEach(t => {
      const sc = e.scores.find(x => x.evaluator_id === t.id);
      if (sc && sc.status !== "draft") { mm[t.id] = { ...(sc.scores || {}) }; ii[t.id] = answersOf(sc, qsOf(e)); cc[t.id] = sc.comment || ""; return; }
      cc[t.id] = (dr.cm || {})[t.id] ?? sc?.comment ?? "";
      mm[t.id] = { ...((dr.m || {})[t.id] || sc?.scores || {}) }; ii[t.id] = { ...answersOf(sc, qsOf(e)), ...(typeof (dr.idn || {})[t.id] === "object" ? dr.idn[t.id] : {}) }; aa[t.id] = !!(dr.abs || {})[t.id];
    });
    setM(mm); setIdn(ii); setAbs(aa); setCm(cc); setErr(null); setToRev(!!dr.toRev); setCc(null);
  }, [e?.code, savedSig]); // eslint-disable-line
  const crit = e?.rubric?.criteria || [];
  const scoreOf = ev => e?.scores.find(x => x.evaluator_id === ev);
  const saved = ev => scoreOf(ev)?.status === "submitted";
  const absent = ev => scoreOf(ev)?.status === "absent";
  function edit_(fn) { const next = fn(); if (e) writeDraft(id, e.code, next); }
  const setScore = (ev, key, v) => { const nm = { ...m, [ev]: { ...m[ev], [key]: v } }; setM(nm); edit_(() => ({ m: nm, idn, abs, cm, toRev })); };
  const setId = (ev, key, v) => { const ni = { ...idn, [ev]: { ...(idn[ev] || {}), [key]: v } }; setIdn(ni); edit_(() => ({ m, idn: ni, abs, cm, toRev })); };
  const setAb = (ev, v) => { const na = { ...abs, [ev]: v }; setAbs(na); edit_(() => ({ m, idn, abs: na, cm, toRev })); };
  const setCom = (ev, v) => { const nc = { ...cm, [ev]: v }; setCm(nc); edit_(() => ({ m, idn, abs, cm: nc, toRev })); };
  const setRev = v => { setToRev(v); edit_(() => ({ m, idn, abs, cm, toRev: v })); };
  if (!d.data) return <Loading error={d.error} />;
  const { session: s, team, entries, rules } = d.data;
  // in a live session, evaluators and artworks with scores saved here can't be taken out while editing it
  const savedHere = s.status === "live" ? entries.flatMap(x => (x.scores || []).filter(y => y.status === "submitted" && y.session_id === s.id).map(y => ({ code: x.code, ev: y.evaluator_id }))) : [];
  const savedEv = new Set(savedHere.map(x => x.ev)), savedArt = new Set(savedHere.map(x => x.code));
  const qs = qsOf(e);
  const filled = ev => crit.every(c => m[ev]?.[c.key] !== "" && m[ev]?.[c.key] != null) && qs.every(x => typeof idn[ev]?.[x.key] === "boolean" && (!idn[ev][x.key] || !x.options?.length || (idn[ev][`${x.key}_choice`] && idn[ev][`${x.key}_choice`] !== "Other: ")));
  const isEv = d.data.me?.role === "evaluator", myEv = d.data.me?.evaluator_id;
  const nvHere = !!e?.not_visible;
  const editable = !nvHere && ((s.status === "live" && (s.mine || admin || isEv)) || (admin && s.status !== "cancelled"));
  const staff = !isEv && editable;                                  // coordinator/admin controls (absent, review tick, comment)
  // which columns this user types: evaluators their own (when they enter their own scores); the coordinator everyone
  // who doesn't; admins anyone
  const canCol = t => editable && (isEv ? t.id === myEv && t.self : admin || !t.self);
  const bands = e?.rubric?.grade_bands;
  const runs = !isEv && ((s.status === "live" && (s.mine || admin)) || (admin && s.status !== "cancelled"));   // coordinator/admin of this session
  const open_ = team.filter(t => !saved(t.id) && !absent(t.id) && (canCol(t) || (staff && abs[t.id])));   // columns this user still has to save
  const missingCols = open_.filter(t => !abs[t.id] && !filled(t.id));
  const canSave = editable && open_.length > 0 && !missingCols.length;

  // What saving the open columns would do to the artwork (shown live under the sheet).
  function preview() {
    const totals = [], answers = [];
    team.forEach(t => { if (saved(t.id)) { totals.push(scoreOf(t.id).total); answers.push(answersOf(scoreOf(t.id), qs)); } else if (canCol(t) && !absent(t.id) && !abs[t.id] && filled(t.id)) { totals.push(total(crit, m[t.id])); answers.push(idn[t.id] || {}); } });
    const nAbs = team.filter(t => absent(t.id) || abs[t.id]).length;
    if (!totals.length) return null;
    const complete = totals.length + nAbs >= team.length && totals.length >= (e.min || 1);
    const teamScore = Math.ceil(totals.reduce((a, b) => a + b, 0) / totals.length - 1e-9);
    const g = gradeFor(teamScore, bands);
    if (!complete) return { complete: false, team: teamScore, grade: g, left: team.length - totals.length - nAbs, need: e.min };
    const passQs = qs.filter(x => x.pass_yes);
    const identity = passQs.length ? passQs.every(x => answers.every(a => a[x.key] === true)) : null;
    const why = [];
    if (rules.flag_near && Math.abs(teamScore - e.flagLine) <= rules.flag_margin) why.push(`it is within ${rules.flag_margin} points of the ${rules.flag_line === "A" ? "grade A line" : "pass mark"} (${e.flagLine})`);
    const spread = totals.length > 1 ? Math.max(...totals) - Math.min(...totals) : 0;
    if (rules.flag_spread && spread > rules.spread_limit) why.push(`the evaluators are ${spread} points apart`);
    if (rules.flag_identity) qs.forEach(x => { const a = answers.map(y => y[x.key]); if (a.includes(true) && a.includes(false)) why.push(`the evaluators disagree on ${x.label.toLowerCase()}`); });
    qs.filter(x => x.flag_choice && x.options?.length).forEach(x => { const c = new Set(answers.filter(y => y[x.key] === true).map(y => y[`${x.key}_choice`] || "")); if (c.size > 1) why.push(`the evaluators picked different ${x.label.toLowerCase()} options`); });
    if (toRev || team.some(t => saved(t.id) && scoreOf(t.id).to_review)) why.push("it was sent to review");
    return { complete: true, team: teamScore, grade: g, why, passes: passesRule({ ...rules.pass_rule, identityPass: passQs.length > 0 }, teamScore, g, identity) };
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
      const items = open_.map(t => abs[t.id] ? { evaluator_id: t.id, absent: true } : { evaluator_id: t.id, scores: m[t.id], answers: idn[t.id] || {}, comment: (cm[t.id] || "").trim() || null, to_review: toRev });
      const r = await api("/api/scores/session", { body: { session_id: s.id, entry_code: e.code, items, to_review: toRev } });
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
      if (r.ok === false && r.undecided) { setFinishAsk({ ...r, to: finishAsk?.to && r.targets?.some(t => t.id === finishAsk.to) ? finishAsk.to : r.targets?.[0]?.id || "", reason: "" }); setBusy(null); return; }
      // moved the ones not started: show what is still left to decide
      if (action === "move_open") { toast(r.note); d.reload(); setBusy(null); return act("finish"); }
      setFinishAsk(null); setEdit(null);
      toast(r.note || { start: "Session started.", finish: "Session finished. Artworks still in the room are marked as handed back to storage.", reopen: "Session reopened.", cancel: "Session cancelled.", edit: "Session updated." }[action]);
      if (action === "cancel") router.push("/sessions"); else d.reload();
    } catch (x) { toast(x.message, "err"); } setBusy(null);
  }
  async function setPod(v) { try { await api(`/api/entries/${encodeURIComponent(e.code)}`, { method: "PATCH", body: { pod: v } }); d.reload(); } catch (x) { toast(x.message, "err"); } }
  async function reopenNV() { setBusy("reopen"); try { const r = await api(`/api/entries/${encodeURIComponent(e.code)}/visibility`, { body: { action: "reopen" } }); toast(r.note); d.reload(); } catch (x) { toast(x.message, "err"); } setBusy(null); }
  async function notVis() { setBusy("nv"); try { const r = await api(`/api/entries/${encodeURIComponent(e.code)}/visibility`, { body: { action: "not_visible", note: nv, round_no: s.round_no } }); toast(r.note); setNv(null); d.reload(); } catch (x) { toast(x.message, "err"); } setBusy(null); }
  async function saveCc() { setBusy("cc"); try { const r = await api(`/api/entries/${encodeURIComponent(e.code)}/comment`, { body: { round_no: s.round_no, comment: cc, session_id: s.id } }); toast(r.note); setCc(null); d.reload(); } catch (x) { toast(x.message, "err"); } setBusy(null); }
  async function saveSelf() { setBusy("self"); try { await api(`/api/sessions/${id}`, { method: "PATCH", body: { action: "self", self_ids: selfEdit } }); toast("Saved"); setSelfEdit(null); d.reload(); } catch (x) { toast(x.message, "err"); } setBusy(null); }
  const go = code => router.replace(`/sessions/${id}?entry=${encodeURIComponent(code)}`, { scroll: false });
  const idx = entries.findIndex(x => x.code === e?.code);
  const pv = e ? preview() : null;
  const hasDraft = code => { const dr = readDraft(id, code); return !!dr && Object.values(dr.m || {}).some(o => Object.values(o || {}).some(v => v !== "" && v != null)); };
  const res = e?.result;
  const resultText = !res ? null : e.review?.status === "open" ? `With management: ${e.review.reason}` : res.complete ? (e.review ? `Decided by management (${e.review.status})` : res.passed ? `Complete · passes Round ${s.round_no}` : `Complete · does not pass Round ${s.round_no}`) : `Provisional: ${res.scored} of ${res.needed} scores${e.min ? ` (needs at least ${e.min})` : ""}`;
  const statusLabel = { live: "In progress", done: "Done", planned: "Planned", cancelled: "Cancelled" }[s.status];
  return <>
    <PageHead back={[isEv ? "My sessions" : "Scoring sessions", "/sessions"]} title={s.title} sub={[s.session_date ? dshort(s.session_date) : null, timeText(s.start_time, s.end_time) || s.time_text, s.venue, s.coordinator ? `coordinator ${s.coordinator}` : null].filter(Boolean).join(" · ")}
      badges={<><Badge tone={s.status === "live" ? "info" : s.status === "done" ? "ok" : s.status === "cancelled" ? "bad" : ""}>{statusLabel}</Badge>{isOverdue(s) && <Badge tone="bad">{overdueText(s)}</Badge>}</>}
      actions={isEv ? null : <>
        {s.status === "planned" && <Btn v="primary" busy={busy === "start"} onClick={() => act("start")}>Start session</Btn>}
        {(["planned", "live"].includes(s.status) || (s.status === "done" && admin)) && <Btn onClick={() => setEdit({ status: s.status, title: s.title, session_date: s.session_date || "", start_time: hm(s.start_time), end_time: hm(s.end_time), venue_id: s.venue_id || "", evaluator_ids: team.map(t => t.id), self_ids: team.filter(t => t.self).map(t => t.id), remove: [], add_schools: [] })}>Edit</Btn>}
        {s.status === "live" && (s.mine || admin) && <Btn onClick={() => setSelfEdit(team.filter(t => t.self).map(t => t.id))}>Who enters scores</Btn>}
        {s.status === "live" && <Btn busy={busy === "finish"} onClick={() => act("finish")}>Finish session</Btn>}
        {s.status === "done" && admin && <Btn busy={busy === "reopen"} onClick={() => act("reopen")}>Reopen</Btn>}
        {physical && <Btn onClick={() => setBoard(true)}>Artworks board</Btn>}</>} />
    <p className="small faint" style={{ marginTop: -8 }}>Team: {team.map(t => `${t.name}${t.self ? " (own login)" : ""}`).join(", ")}{isEv ? (team.find(t => t.id === myEv)?.self ? " · You type your own scores in your column." : " · Your coordinator types your scores; you can see the team's saved scores here.") : team.some(t => t.self) ? " · Evaluators marked “own login” type their own column." : ""}</p>
    {s.status === "planned" && <Banner title="Start the session when the team is in the room">Scores can be entered once the session has started. You can still edit the team and the artworks, or cancel the session.</Banner>}
    {!isEv && physical && s.status !== "done" && s.status !== "cancelled" && <RoomStrip entries={entries} onOpen={() => setBoard(true)} />}
    <Modal open={board} wide="x" title={`Artworks · ${s.title}`} sub="Logistics brings artworks in batches. Hand a batch back when it's scored and Logistics brings the next one." onClose={() => { setBoard(false); d.reload(); }} footer={<Btn onClick={() => { setBoard(false); d.reload(); }}>Close</Btn>}>
      {board && <SessionBoard sessionId={id} role={me?.role} compact onChanged={d.reload} />}
    </Modal>
    {s.status === "done" && <Banner title="This session is finished">Artworks that weren't fully scored can go into another session (physical artworks are back in storage).{admin ? " As an admin you can still correct scores here." : ""}</Banner>}
    <div className="f3-sc f3-sess">
      <section className="card f3-queue"><div className="qh"><b>{shown.length} artworks</b><span className="small faint">{entries.filter(x => x.result?.complete).length} of {entries.length} fully scored</span></div>
        {physical && <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--rule)" }}><Seg value={filter} onChange={setOnly} items={[["room", `In the room ${roomN}`], ["all", `All ${entries.length}`]]} /></div>}
        <div className="qb">{shown.map(x => <div key={x.code} role="button" tabIndex={0} className={`f3-qi${x.code === e?.code ? " on" : ""}`} onClick={() => go(x.code)} onKeyDown={k => k.key === "Enter" && go(x.code)}><div className="t tf"><b dir="auto">{x.title_en || x.title_ar || x.group_name || "Untitled"}</b><span className="cd">{x.code}</span>{isNew(x) && <span className="room-chip new">Just arrived</span>}{x.not_visible && <span className="room-chip new">Not visible</span>}{x.pod && <span className="room-chip">POD</span>}{x.logistics && <span className={`room-chip${inRoom(x) ? " in" : ""}`}>{inRoom(x) ? `In the room${x.logistics.batch ? ` · batch ${x.logistics.batch}` : ""}` : x.logistics.state === "returning" ? "Handed back" : x.logistics.state === "missing" ? "Missing" : "On the shelf"}</span>}</div><span className="s">{x.result?.complete ? x.result.final ?? x.result.team : `${x.scores.filter(y => y.status !== "draft").length}/${team.length}`}{hasDraft(x.code) && !x.result?.complete ? " ·" : ""}</span></div>)}
          {!shown.length && <p className="small faint" style={{ padding: 12 }}>{filter === "room" ? "No artworks in the room right now. Logistics brings the next batch." : "No artworks."}</p>}</div></section>
      {e ? <div className="stack sticky-view" style={{ gap: 12, minWidth: 0 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><span className="code" style={{ fontSize: 15, fontWeight: 600 }}>{e.code}</span><Badge>{e.sub}</Badge>{e.r1 && <Badge tone="ok">Round 1: {e.r1.final ?? e.r1.team} · {e.r1.grade}</Badge>}{e.logistics?.damaged && <Badge tone="warn">Damaged</Badge>}{e.logistics?.where && <Badge>{e.logistics.where}</Badge>}{d.data?.canEditDetails && <Btn sm onClick={() => setEditD(true)} style={{ marginLeft: "auto" }}>Edit details</Btn>}</div>
        <FileViewer files={e.files || []} tall title="Photos for reference; judge the artwork in the room" />
      </div> : <Loading />}
      {e && <div className="stack" style={{ gap: 16, minWidth: 0 }}>
        <section className={`card score-card${ar ? " is-ar" : ""}`} dir={ar ? "rtl" : "ltr"} lang={ar ? "ar" : "en"} style={ar ? { fontFamily: AR_FONT } : undefined}>
          <div className="card-h"><div className="tt"><h3>{T.scores}</h3><span className="sub">{T.rubric} <span dir="ltr">{e.rubric?.code} v{e.rubric?.version}</span> · {T.each}</span></div><LangToggle lang={lang} onChange={setLang} both={false} /></div>
          {!e.rubric ? <Banner tone="warn" title={`No published Round ${s.round_no} rubric`} /> : <div className="tw"><table className="x-cmp sess-mx"><thead><tr><th>{T.criterion}</th>{team.map(t => <th key={t.id} title={t.name} className={canCol(t) && !saved(t.id) ? "mine" : ""}>{isEv && t.id === myEv ? "You" : t.name}{t.self && <span className="own">own login</span>}
              <span className="th-act">{saved(t.id) ? <Badge tone="ok">{T.saved}</Badge> : absent(t.id) ? <Badge>{T.absent}</Badge> : staff ? (abs[t.id] ? <button type="button" className="th-btn on" onClick={() => setAb(t.id, false)}>{T.undo}</button> : <button type="button" className="th-btn" onClick={() => setAb(t.id, true)}>{T.absent}</button>) : null}</span></th>)}</tr></thead><tbody>
            {crit.map(c => { const ct = critIn(c, lang); return <tr key={c.key}><td><div className="cl"><b>{ct.label} <span className="w">{c.weight}%</span></b>{ct.desc && <span className="d">{ct.desc}</span>}{ct.missing && ar && <span className="d">{T.noAr}</span>}</div></td>
              {team.map(t => <td key={t.id}>{absent(t.id) || abs[t.id] ? <span className="faint small">{T.absent}</span> : !canCol(t) && !saved(t.id) ? <span className="faint">–</span> : <input className="sc-in" inputMode="numeric" aria-label={`${t.name}, ${c.label}`} disabled={!canCol(t) || saved(t.id)} value={m[t.id]?.[c.key] ?? ""} onChange={x => setScore(t.id, c.key, x.target.value.replace(/\D/g, "").slice(0, 3))} />}</td>)}</tr>; })}
            {qs.map(x => <tr key={x.key}><td><div className="cl"><b>{qLabel(x, ar)}</b>{x.pass_yes && <span className="d">{T.identityReq.trim()}</span>}</div></td>{team.map(t => <td key={t.id}>{absent(t.id) || abs[t.id] ? "" : !canCol(t) && !saved(t.id) ? <span className="faint">–</span> : <span className="f3-yn"><button type="button" disabled={!canCol(t) || saved(t.id)} className={idn[t.id]?.[x.key] === true ? "on" : ""} onClick={() => setId(t.id, x.key, true)}>{T.y}</button><button type="button" disabled={!canCol(t) || saved(t.id)} className={idn[t.id]?.[x.key] === false ? "on" : ""} onClick={() => setId(t.id, x.key, false)}>{T.n}</button></span>}
              {idn[t.id]?.[x.key] === true && x.options?.length > 0 && !(absent(t.id) || abs[t.id]) && (saved(t.id) ? <span className="small d-choice" dir="auto">{idn[t.id][`${x.key}_choice`] || "–"}</span> : canCol(t) && <ChoicePick compact q={x} ar={ar} value={idn[t.id][`${x.key}_choice`]} onChange={v => setId(t.id, `${x.key}_choice`, v)} />)}</td>)}</tr>)}
            <tr className="tot"><td>{T.total}</td>{team.map(t => <td key={t.id}>{saved(t.id) ? scoreOf(t.id).total : absent(t.id) || abs[t.id] ? "–" : crit.some(c => m[t.id]?.[c.key]) ? total(crit, m[t.id]) : "–"}</td>)}</tr>
          </tbody></table></div>}
          {e.rubric && team.some(t => !(absent(t.id) || abs[t.id]) && (saved(t.id) || canCol(t))) && <div className="sc-cms"><b className="small">{T.comment}</b>
            {team.filter(t => !(absent(t.id) || abs[t.id]) && (saved(t.id) || canCol(t))).map(t => <div key={t.id} className="sc-cmr"><span className="small">{isEv && t.id === myEv ? "You" : t.name}</span>
              {saved(t.id) ? <span className="small" dir="auto">{scoreOf(t.id).comment || <span className="faint">–</span>}</span> : <textarea className="sc-cm" dir="auto" rows={1} disabled={!canCol(t)} value={cm[t.id] || ""} placeholder={T.commentPh} onChange={x => setCom(t.id, x.target.value)} aria-label={`${t.name}, ${T.comment}`} />}</div>)}
          </div>}
          {nvHere && <Banner tone="warn" title={T.notVisible} action={runs ? <Btn sm v="primary" busy={busy === "reopen"} onClick={reopenNV}>Files fixed: reopen</Btn> : null}>“{e.not_visible.note}”. Scoring is paused until the coordinator fixes the files (or marks it not scored on the artwork page).</Banner>}
          {e.rubric && !nvHere && <div className="sc-ticks">
            {editable && open_.length > 0 && <Check label={T.toReview} checked={toRev} onChange={setRev} />}
            {!(editable && open_.length > 0) && team.some(t => saved(t.id) && scoreOf(t.id).to_review) && <span className="small" style={{ color: "var(--warn)" }}>Sent to management review</span>}
            {(runs || isEv) && <Check label={T.pod} checked={!!e.pod} onChange={setPod} />}
            {editable && <Check label={T.notVisible} checked={false} onChange={v => v && setNv("")} />}
          </div>}
          {!isEv && (runs || e.coordComment) && <div className="cc-box">
            <div className="row" style={{ gap: 8 }}><b className="small">{T.coordComment}</b><span className="sp" />{runs && cc === null && <Btn sm v="ghost" onClick={() => setCc(e.coordComment || "")}>{e.coordComment ? "Edit" : "Add"}</Btn>}</div>
            {cc !== null ? <><textarea className="textarea" rows={2} dir="auto" value={cc} onChange={x => setCc(x.target.value)} placeholder={T.coordCommentPh} /><div className="row" style={{ gap: 6, justifyContent: "flex-end" }}><Btn sm onClick={() => setCc(null)}>Cancel</Btn><Btn sm v="primary" busy={busy === "cc"} onClick={saveCc}>Save</Btn></div></> : e.coordComment ? <span className="small" dir="auto">{e.coordComment}</span> : null}
          </div>}
          {res && <div className="x-tot"><div className="stack s4"><span className="s">{T.teamResult}</span><span className="v">{res.team != null ? res.final ?? res.team : "–"}</span></div><div className="stack s4"><span className="s">{T.grade}</span><span style={{ fontSize: 18, fontWeight: 600 }}>{res.team != null ? res.grade || gradeFor(res.team, bands) : "–"}</span></div><span className="s" dir="ltr" style={{ marginInlineStart: "auto", textAlign: "end" }}>{resultText}</span></div>}
          {e.logistics && <div className="f3-crit" style={{ borderTop: "1px solid var(--rule)" }}><div className="lab"><b>{T.framing}</b><span>{T.framingQ}</span></div>
            <div className="stack s4"><Check label={T.needs} disabled={!runs} checked={!!e.logistics?.needs_framing} onChange={v => framing(v, e.logistics?.glass_framing)} /><Check label={T.glass} disabled={!runs || !e.logistics?.needs_framing} checked={!!e.logistics?.glass_framing} onChange={v => framing(true, v)} /></div></div>}
          {err && <Banner tone="bad" title={err} />}
          {editable && open_.length > 0 && <div className="sheet-save">
            <div className="stack s4" style={{ flex: 1, minWidth: 0 }}>
              {pv?.complete ? (pv.why.length ? <span className="small"><b>Team result {pv.team} · grade {pv.grade}</b> <span className="faint">· goes to review: {pv.why.join(", ")}</span></span> : <span className="small"><b>Team result {pv.team} · grade {pv.grade}</b> <span className="faint">· {pv.passes ? `passes Round ${s.round_no}` : `does not pass Round ${s.round_no}`}</span></span>) : null}
              {missingCols.length > 0 && <span className="small" style={{ color: "var(--warn)" }}>{T.needFill(missingCols.map(t => t.name).join(", "))}</span>}
            </div>
            <Btn v="primary" busy={busy === "go"} disabled={!canSave} onClick={saveSheet} title="Saved scores are final; only an admin can correct them">{nextOpen() ? T.saveSheet : T.saveSheetLast}</Btn>
          </div>}
          {(!editable || !open_.length) && idx < entries.length - 1 && <div className="row" style={{ justifyContent: "flex-end" }}><Btn onClick={() => go((nextOpen() || entries[idx + 1]).code)}>{T.next}</Btn></div>}
        </section>
        <EntryAbout e={{ ...e, id: e.code, pathway: s.pathway }} compact onEdit={d.data?.canEditDetails ? () => setEditD(true) : null} />
      </div>}
    </div>

    {editD && e && <EditDetails e={e} onClose={() => setEditD(false)} onDone={() => { setEditD(false); d.reload(); }} />}
    <Modal open={!!selfEdit} title="Who types their own scores" sub="Ticked evaluators score on their own login. You type the others' scores." onClose={() => setSelfEdit(null)} footer={<><Btn onClick={() => setSelfEdit(null)}>Cancel</Btn><Btn v="primary" busy={busy === "self"} onClick={saveSelf}>Save</Btn></>}>
      {selfEdit && <div className="stack s8">{team.map(t => <Check key={t.id} label={`${t.name}${t.has_login ? "" : " (no login yet)"}${saved(t.id) ? " · saved" : ""}`} disabled={!t.has_login} checked={selfEdit.includes(t.id)} onChange={on => setSelfEdit(on ? [...selfEdit, t.id] : selfEdit.filter(x => x !== t.id))} />)}</div>}
    </Modal>
    <Modal open={nv !== null} title={T.notVisible} sub={e?.code} onClose={() => setNv(null)} footer={<><Btn onClick={() => setNv(null)}>Back</Btn><Btn v="primary" busy={busy === "nv"} disabled={!String(nv || "").trim()} onClick={notVis}>Send to the coordinator</Btn></>}>
      <p className="muted" style={{ marginTop: 0 }}>{T.notVisibleHint}</p>
      <Field label="What's wrong?"><textarea className="textarea" rows={3} value={nv || ""} onChange={x => setNv(x.target.value)} placeholder="For example: the video doesn't play, the photo is blurred or cut off" /></Field>
    </Modal>
    <Modal open={!!finishAsk} title="Artworks still need a decision" onClose={() => setFinishAsk(null)} footer={<><Btn onClick={() => setFinishAsk(null)}>Back</Btn><span className="sp" />
      {finishAsk?.movable > 0 && finishAsk?.targets?.length > 0 && (finishAsk.partly
        ? <Btn v="primary" busy={busy === "move_open"} disabled={!finishAsk.to} onClick={() => act("move_open", { move_to: finishAsk.to })}>Move the {finishAsk.movable} not started</Btn>
        : <Btn v="primary" busy={busy === "finish"} disabled={!finishAsk.to} onClick={() => act("finish", { move_to: finishAsk.to })}>Move {finishAsk.movable} and finish</Btn>)}</>}>
      {finishAsk && <div className="stack" style={{ gap: 12 }}>
        <p className="muted" style={{ margin: 0 }}>{finishAsk.note} For each one: finish its scores (mark evaluators absent if they left), tick “Artwork not visible” if its files can't be judged, or move it to another session if nobody has scored it yet.</p>
        <div className="fin-list">{finishAsk.open.map(x => <button key={x.code} type="button" className="fin-row" onClick={() => { setFinishAsk(null); go(x.code); }}>
          <span className="code">{x.code}</span><span className="t" dir="auto">{x.title}</span>
          <span className="small">{x.started ? <Badge tone="warn">{x.saved} of {x.team} scores{x.absent ? ` · ${x.absent} absent` : ""}</Badge> : <Badge>Not started</Badge>}</span></button>)}</div>
        {finishAsk.movable > 0 && (finishAsk.targets?.length ? <Field label={`Move the ${finishAsk.movable} artwork${finishAsk.movable === 1 ? "" : "s"} not started to`} help={finishAsk.partly ? `The ${finishAsk.partly} partly scored artwork${finishAsk.partly === 1 ? " stays" : "s stay"} here to be finished.` : "Their evaluators there score them. Physical ones are requested for that session's board."}>
          <select className="select" value={finishAsk.to} onChange={x => setFinishAsk({ ...finishAsk, to: x.target.value })}>{finishAsk.targets.map(t => <option key={t.id} value={t.id}>{t.title} · {t.date ? dshort(t.date) : "no date"}{t.start ? ` ${hm(t.start)}–${hm(t.end)}` : ""} · {t.coordinator}{t.status === "live" ? " (in progress)" : ""}</option>)}</select></Field>
          : <p className="small faint" style={{ margin: 0 }}>There is no other planned or live session in this round to move them to. Create one first, then come back to finish.</p>)}
        {admin && <details className="fin-force"><summary className="small">Admin: end the session anyway</summary>
          <Field label="Reason (recorded in the history)"><textarea className="textarea" rows={2} value={finishAsk.reason} onChange={x => setFinishAsk({ ...finishAsk, reason: x.target.value })} /></Field>
          <Btn sm v="ghost" busy={busy === "finish"} disabled={!finishAsk.reason.trim()} onClick={() => act("finish", { force: true, reason: finishAsk.reason })}>End with {finishAsk.open.length} undecided</Btn></details>}
      </div>}
    </Modal>
    <Modal open={!!edit} wide title="Edit session" sub={edit?.status === "live" ? "In progress: evaluators and artworks with scores saved here stay in the session." : edit?.status === "done" ? "Finished: you can correct the details. Reopen it to change the team or artworks." : ""} onClose={() => setEdit(null)} footer={<>{edit?.status === "planned" && <Btn v="ghost" busy={busy === "cancel"} onClick={() => act("cancel", { reason: "Cancelled before it started" })}>Cancel session</Btn>}<span className="sp" /><Btn onClick={() => setEdit(null)}>Back</Btn><Btn v="primary" busy={busy === "edit"} onClick={() => { const { status, ...b } = edit; act("edit", status === "done" ? { title: b.title, session_date: b.session_date, start_time: b.start_time, end_time: b.end_time, venue_id: b.venue_id } : b); }}>Save</Btn></>}>
      {edit && <div className="stack" style={{ gap: 12 }}>
        <Field label="Title"><input className="input" value={edit.title} onChange={x => setEdit({ ...edit, title: x.target.value })} /></Field>
        <div className="grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
          <Field label="Date"><input type="date" className="input" value={edit.session_date} onChange={x => setEdit({ ...edit, session_date: x.target.value })} /></Field>
          <Field label="Starts"><input type="time" step="900" className="input" value={edit.start_time} onChange={x => setEdit({ ...edit, start_time: x.target.value })} /></Field>
          <Field label="Ends"><input type="time" step="900" className="input" value={edit.end_time} onChange={x => setEdit({ ...edit, end_time: x.target.value })} /></Field>
          <Field label="Venue"><VenueSelect value={edit.venue_id} current={s.venue} onChange={v => setEdit({ ...edit, venue_id: v })} /></Field>
        </div>
        {edit.status !== "done" && <>
        <Field label="Evaluator team" help={savedEv.size ? "Evaluators who saved scores here can't be taken out." : undefined}><div className="row" style={{ gap: 12, flexWrap: "wrap" }}>{(meta?.data?.evaluators || []).filter(v => v.active || edit.evaluator_ids.includes(v.id)).map(v => <Check key={v.id} label={`${v.name}${savedEv.has(v.id) ? " (has scores)" : ""}`} disabled={savedEv.has(v.id)} checked={edit.evaluator_ids.includes(v.id)} onChange={on => setEdit({ ...edit, evaluator_ids: on ? [...edit.evaluator_ids, v.id] : edit.evaluator_ids.filter(x => x !== v.id), self_ids: on ? edit.self_ids : edit.self_ids.filter(x => x !== v.id) })} />)}</div></Field>
        <Field label="Who types their own scores" help="Ticked evaluators score on their own login and can only change their own column. You type the scores of the others.">
          <div className="stack s4">{edit.evaluator_ids.map(eid => { const v = (meta?.data?.evaluators || []).find(x => x.id === eid); return v ? <Check key={eid} label={`${v.name}${v.account_id ? "" : " (no login yet)"}`} disabled={!v.account_id} checked={edit.self_ids.includes(eid)} onChange={on => setEdit({ ...edit, self_ids: on ? [...edit.self_ids, eid] : edit.self_ids.filter(x => x !== eid) })} /> : null; })}</div></Field>
        <Field label="Artworks in this session" help={`Untick an artwork to take it out of the session${savedArt.size ? "; ones with scores saved here stay" : ""}.`}>
          <div className="stack s4" style={{ maxHeight: 240, overflow: "auto" }}>{entries.map(x => <Check key={x.code} label={`${x.code} · ${x.school || ""} · ${x.title_en || x.group_name || ""}${savedArt.has(x.code) ? " (scored here)" : ""}`} disabled={savedArt.has(x.code)} checked={!edit.remove.includes(x.code)} onChange={on => setEdit({ ...edit, remove: on ? edit.remove.filter(c => c !== x.code) : [...edit.remove, x.code] })} />)}</div></Field>
        <Field label="Add artworks" help="Schools with artworks of this round still waiting for a session. Ticking a school adds all its waiting artworks; physical ones are requested from storage.">
          {!pools.data ? <p className="small faint" style={{ margin: 0 }}>Loading…</p> : (() => { const list = pools.data.pools?.[s.round_id] || []; return list.length ? <div className="stack s4" style={{ maxHeight: 200, overflow: "auto" }}>{list.map(g => { const k = g.school_id || "none"; return <Check key={k} label={`${g.name}${g.esis ? ` · eSIS ${g.esis}` : ""} · ${g.count} artwork${g.count === 1 ? "" : "s"}${g.physical ? ` (${g.physical} physical)` : ""}`} checked={edit.add_schools.includes(k)} onChange={on => setEdit({ ...edit, add_schools: on ? [...edit.add_schools, k] : edit.add_schools.filter(x => x !== k) })} />; })}</div> : <p className="small faint" style={{ margin: 0 }}>No artworks of this round are waiting for a session.</p>; })()}</Field>
        </>}
      </div>}
    </Modal>
  </>;
}
