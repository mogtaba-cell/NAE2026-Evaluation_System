"use client";
import { use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, useApi, useMeta, useToast, PageHead, Card, Btn, Badge, Banner, Loading, Field, dshort } from "@/components/ui";
import FileViewer from "@/components/FileViewer";
import EntryAbout from "@/components/EntryAbout";
import { total, gradeFor } from "@/components/ScoreForm";

export default function Session({ params }) {
  const { id } = use(params); const sp = useSearchParams(); const router = useRouter(); const toast = useToast(); const meta = useMeta();
  const cur = sp.get("entry");
  const d = useApi(`/api/sessions/${id}${cur ? `?entry=${encodeURIComponent(cur)}` : ""}`);
  const [m, setM] = useState({}); const [idn, setIdn] = useState({}); const [busy, setBusy] = useState(null); const [err, setErr] = useState(null);
  const e = d.data?.entries.find(x => x.code === d.data.current);
  useEffect(() => { if (!e) return; const mm = {}, ii = {}; d.data.team.forEach(t => { const s = e.scores.find(x => x.evaluator_id === t.id); mm[t.id] = { ...(s?.scores || {}) }; ii[t.id] = s?.national_identity ?? null; }); setM(mm); setIdn(ii); }, [e?.code, d.data]);
  useEffect(() => { setErr(null); }, [e?.code]); // eslint-disable-line
  if (!d.data) return <Loading error={d.error} />;
  const { session: s, team, entries } = d.data; const crit = e?.rubric?.criteria || [];
  const sub = ev => e.scores.find(x => x.evaluator_id === ev && x.status === "submitted");
  const filled = ev => crit.every(c => m[ev]?.[c.key] !== "" && m[ev]?.[c.key] != null) && (!e.rubric.identity_required || idn[ev] !== null);
  const editable = s.status === "live" || meta?.data?.me?.role === "admin";
  async function submit(evs) {
    setBusy("go"); setErr(null);
    try { for (const ev of evs) await api("/api/scores", { body: { entry_code: e.code, round_no: 2, evaluator_id: ev, session_id: s.id, scores: m[ev], national_identity: idn[ev], submit: true } }); toast(`Saved ${evs.length} score${evs.length > 1 ? "s" : ""} for ${e.code}`); d.reload(); }
    catch (x) { setErr(x.message); } setBusy(null);
  }
  async function status(st) { setBusy(st); try { await api(`/api/sessions/${id}`, { method: "PATCH", body: { status: st } }); toast(st === "live" ? "Session started. Entries are marked as with you." : "Session finished. Entries go back to storage."); d.reload(); } catch (x) { toast(x.message, "err"); } setBusy(null); }
  const open = code => router.replace(`/sessions/${id}?entry=${encodeURIComponent(code)}`, { scroll: false });
  const pending = team.filter(t => !sub(t.id) && filled(t.id)).map(t => t.id);
  const idx = entries.findIndex(x => x.code === e?.code);
  return <>
    <PageHead back={["Scoring sessions", "/sessions"]} title={s.title} sub={`${s.session_date ? dshort(s.session_date) : ""} ${s.time_text || ""} · ${s.venue || ""} · coordinator ${s.coordinator || ""} · team: ${team.map(t => t.name).join(", ")}`}
      badges={<Badge tone={s.status === "live" ? "info" : s.status === "done" ? "ok" : ""}>{s.status === "live" ? "In progress" : s.status === "done" ? "Done" : "Planned"}</Badge>}
      actions={<>{s.status === "planned" && <Btn v="primary" busy={busy === "live"} onClick={() => status("live")}>Start session</Btn>}{s.status === "live" && <Btn busy={busy === "done"} onClick={() => status("done")}>Finish session</Btn>}<Btn href={`/pull-list?session=${id}`}>Pull list</Btn></>} />
    {s.status === "planned" && <Banner title="Start the session when the entries are in the room">Scores can be entered once the session has started.</Banner>}
    <div className="f3-sc">
      <section className="card f3-queue"><div className="qh"><b>{entries.length} entries</b><span className="small faint">{entries.filter(x => x.result?.complete).length} fully scored</span></div>
        <div className="qb">{entries.map(x => <div key={x.code} role="button" tabIndex={0} className={`f3-qi${x.code === e?.code ? " on" : ""}`} onClick={() => open(x.code)}><div className="t"><b>{x.code}</b><span dir="auto">{x.title_en || x.title_ar || x.group_name || "Untitled"}</span></div><span className="s">{x.result?.complete ? x.result.final ?? x.result.team : `${x.scores.filter(y => y.status === "submitted").length}/${team.length}`}</span></div>)}</div></section>
      {e ? <div className="stack" style={{ gap: 16, minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}><span className="code" style={{ fontSize: 15, fontWeight: 600 }}>{e.code}</span><Badge>{e.sub}</Badge>{e.r1 && <Badge tone="ok">Round 1: {e.r1.final ?? e.r1.team} · {e.r1.grade}</Badge>}{e.logistics?.condition && <Badge tone="warn">{e.logistics.condition}</Badge>}</div>
        <section className="card"><FileViewer files={e.files || []} title="Photos for reference; judge the artwork in the room" /></section>
        <EntryAbout e={{ ...e, id: e.code, pathway: s.pathway }} compact />
      </div> : <Loading />}
      {e && <section className="card">
        <div className="card-h"><div className="tt"><h3>Scores</h3><span className="sub">Rubric {e.rubric?.code} v{e.rubric?.version} · each criterion 0 to 100</span></div></div>
        {err && <Banner tone="bad" title={err} />}
        {!e.rubric ? <Banner tone="warn" title="No published Round 2 rubric" /> : <div className="tw"><table className="x-cmp"><thead><tr><th>Criterion</th>{team.map(t => <th key={t.id}>{t.name.split(" ")[0]}</th>)}</tr></thead><tbody>
          {crit.map(c => <tr key={c.key}><td>{c.label} <span className="faint small">{c.weight}%</span></td>{team.map(t => <td key={t.id}><input className="sc-in" inputMode="numeric" aria-label={`${t.name}, ${c.label}`} disabled={!editable || !!sub(t.id)} value={m[t.id]?.[c.key] ?? ""} onChange={x => setM({ ...m, [t.id]: { ...m[t.id], [c.key]: x.target.value.replace(/\D/g, "").slice(0, 3) } })} /></td>)}</tr>)}
          {e.rubric.identity_required && <tr><td>National identity</td>{team.map(t => <td key={t.id}><span className="f3-yn"><button type="button" disabled={!editable || !!sub(t.id)} className={idn[t.id] === true ? "on" : ""} onClick={() => setIdn({ ...idn, [t.id]: true })}>Y</button><button type="button" disabled={!editable || !!sub(t.id)} className={idn[t.id] === false ? "on" : ""} onClick={() => setIdn({ ...idn, [t.id]: false })}>N</button></span></td>)}</tr>}
          <tr className="tot"><td>Total</td>{team.map(t => <td key={t.id}>{sub(t.id) ? sub(t.id).total : crit.some(c => m[t.id]?.[c.key]) ? total(crit, m[t.id]) : "–"}</td>)}</tr>
          <tr><td></td>{team.map(t => <td key={t.id}>{sub(t.id) ? <Badge tone="ok">Saved</Badge> : editable && <Btn sm disabled={!filled(t.id) || !!busy} onClick={() => submit([t.id])}>Save</Btn>}</td>)}</tr>
        </tbody></table></div>}
        {e.result?.team != null && <div className="x-tot"><div className="stack s4"><span className="s">Team result</span><span className="v">{e.result.final ?? e.result.team}</span></div><div className="stack s4"><span className="s">Grade</span><span style={{ fontSize: 18, fontWeight: 600 }}>{e.result.grade || gradeFor(e.result.team)}</span></div><span className="s" style={{ marginLeft: "auto" }}>{e.result.flag ? "Sent to management review" : e.result.complete ? "Complete" : `${e.result.scored} of ${e.result.needed}`}</span></div>}
        <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>{pending.length > 1 && <Btn v="primary" busy={busy === "go"} onClick={() => submit(pending)}>Save all {pending.length}</Btn>}{idx < entries.length - 1 && <Btn onClick={() => open(entries[idx + 1].code)}>Next entry ›</Btn>}</div>
      </section>}
    </div>
  </>;
}
