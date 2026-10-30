"use client";
import { useApi, useMeta, PageHead, Kpis, Card, Table, Btn, Badge, Prog, Two, Loading, when, dshort, dueTxt, fmt, Empty } from "@/components/ui";
import { useRouter } from "next/navigation";
import Insights from "@/components/Insights";

const hello = n => { const h = +new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Dubai" }); return `${h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"}, ${String(n || "").split(" ")[0]}`; };
const today = () => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Dubai" });

function Pathways({ d }) {
  const router = useRouter();
  return <Card title="Pathways" flush right={<Btn sm v="ghost" href="/rounds">Rounds</Btn>}>
    <Table cols={["Pathway", "Stage", { h: "Scoring", cls: "r" }]} onRow={i => router.push(`/entries?pathway=${d.pathways[i].code}`)}
      rows={d.pathways.map(p => [<Two key="a" a={p.name} b={`${fmt(p.entries)} entries`} />, <Two key="b" a={p.round ? `Round ${p.round} open` : p.roundStatus === "between" ? "Between rounds" : "Setup"} b={p.closes_on ? `Closes ${dshort(p.closes_on)}` : ""} />, p.round ? <Prog key="c" pct={p.assigned ? p.submitted / p.assigned * 100 : 0} label={`${p.submitted}/${p.assigned}`} /> : <span key="c" className="small faint">Not scoring</span>])} />
  </Card>;
}
function Todo({ items }) {
  if (!items.length) return <Card title="Needs your attention"><p className="muted">Nothing is waiting on you.</p></Card>;
  return <Card title="Needs your attention"><div className="x-todo">{items.map(([t, s, b], i) => <div className="it" key={i}><div className="tx"><b>{t}</b><span>{s}</span></div>{b}</div>)}</div></Card>;
}
function Bars({ title, rows }) {
  const max = Math.max(1, ...rows.map(r => r.n));
  return <Card title={title}><div className="stack s8">{rows.sort((a, b) => b.n - a.n).slice(0, 8).map(r => <div key={r.label} className="row nowrap" style={{ gap: 12 }}><span className="small" style={{ width: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span><Prog pct={r.n / max * 100} label={fmt(r.n)} /></div>)}</div></Card>;
}

// Results so far, for every account: Shortlisted (passed Round 1), Selected in participation pathways, competition winners
function Outcomes({ o }) {
  if (!o) return null;
  return <Kpis items={[
    ["Shortlisted", fmt(o.shortlisted), "passed Round 1", "brand"],
    ...(o.participation ? [["Selected", fmt(o.selectedParticipation), "participation pathways, passed Round 2", "ok"]] : []),
    ...(o.competition ? [["Competition winners", fmt(o.winners), `${fmt(o.firsts)} first place${o.firsts === 1 ? "" : "s"} · ${fmt(o.selectedCompetition)} selected${o.ties ? ` · ${o.ties} in a tie` : ""}`, o.ties ? "warn" : "ok"]] : [])
  ]} />;
}

export default function Dashboard() {
  const d = useApi("/api/dashboard", [], { live: true }); const meta = useMeta(); const me = meta?.data?.me;
  if (!d.data) return <Loading error={d.error} />;
  const x = d.data; const role = x.role;
  const lg = x.logistics;
  if (role === "admin") {
    const a = x.attention; const un = Object.entries(a.unallocated || {});
    const todo = [
      ...meta?.data?.pathways?.filter(p => p.entries && p.check.some(c => !c.ok && c.key === "rubrics")).map(p => [`${p.name}: rubrics missing`, p.check.find(c => c.key === "rubrics").text + " have a published rubric", <Btn key="r" sm href="/rubrics">Rubrics</Btn>]) || [],
      ...(x.lateRounds || []).map(r => [`${r.pathway} Round ${r.round_no} is past its closing date`, `It was planned to close on ${r.closes_on}. Close it when scoring is finished.`, <Btn key={"lr" + r.id} sm href="/rounds">Rounds</Btn>]),
      ...(x.reviews.overdue ? [[`${x.reviews.overdue} reviews overdue`, `${x.reviews.open} open in total`, <Btn key="v" sm href="/reviews">View</Btn>]] : []),
      ...un.map(([p, n]) => [`${n} ${p} artworks not allocated`, "Allocate so coordinators can follow up with schools", <Btn key="al" sm href={`/allocation?pathway=${p}`}>Allocate</Btn>]),
      ...(a.unmatched ? [[`${a.unmatched} Drive folders not matched`, "Link them to artworks or ignore them", <Btn key="u" sm href="/files">Open</Btn>]] : []),
      ...(a.nofiles ? [[`${a.nofiles} artwork${a.nofiles === 1 ? " has" : "s have"} no files`, meta?.data?.drive?.mock ? "Test mode: files are counted when each artwork is first opened" : "Their folders are empty or missing. Clears when schools upload", <Btn key="n" sm href="/entries?nofiles=1">Open</Btn>]] : []),
      ...(lg?.unbatched ? [[`${lg.unbatched} physical artwork${lg.unbatched === 1 ? " needs" : "s need"} a collection`, "Group them by school for the storage team", <Btn key="c" sm href="/logistics">Open</Btn>]] : [])
    ];
    return <>
      <PageHead title={hello(me?.name)} sub={today()} actions={<><Btn href="/reports">Reports</Btn><Btn v="primary" href="/entries">Find an artwork</Btn></>} />
      <Kpis items={[["Artworks", fmt(x.total), `${fmt(x.schools)} schools · ${fmt(x.students)} students`], ["Scores submitted", fmt(x.pathways.reduce((s, p) => s + p.submitted, 0)), `of ${fmt(x.pathways.reduce((s, p) => s + p.assigned, 0))} assigned in open rounds`, "brand"], ["Reviews open", x.reviews.open, `${x.reviews.overdue} overdue`, x.reviews.overdue ? "warn" : "ok"], ["Physical artworks", lg?.total || 0, `${lg?.storage || 0} in storage · ${lg?.missing || 0} missing`]]} />
      <Outcomes o={x.outcomes} />
      <div className="x-side"><Todo items={todo} /><Pathways d={x} /></div>
      <Card title="Recent activity" flush right={<Btn sm v="ghost" href="/audit">Audit log</Btn>}><Table minw={700} cols={["What happened", "Item", "By", { h: "When", cls: "r" }]} rows={(x.activity || []).map(h => [<Two key="a" a={h.action} b={h.detail?.slice(0, 90)} />, h.entry_code ? <a key="b" className="code link" href={`/entries/${h.entry_code}`}>{h.entry_code}</a> : <span key="b" className="small faint">{h.object_type}</span>, <Two key="c" a={h.actor_name || "System"} b={h.actor_role} />, <span key="d" className="faint small">{when(h.at)}</span>])} /></Card>
    </>;
  }
  if (role === "coordinator") {
    const m = x.mine; const st = m.status; const sum = k => Object.entries(st).filter(([s]) => s.endsWith(":" + k)).reduce((a, [, n]) => a + n, 0);
    const mySessions = x.sessions.filter(s => s.mine && s.status !== "done");
    return <>
      <PageHead title={hello(me?.name)} sub={today()} actions={<><Btn href="/entries?mine=1">My artworks</Btn><Btn v="primary" href="/sessions">Scoring sessions</Btn></>} />
      <Kpis items={[["My artworks", m.entries, `${m.schools} schools`], ["To score", sum("to_score") + sum("in_progress"), "in open rounds", "brand"], ["Needs review", sum("review"), "with management", sum("review") ? "warn" : ""], ["My shortlisted", Object.entries(st).filter(([k]) => k.startsWith("2:")).reduce((a, [, n]) => a + n, 0), "so far", "ok"], ["My selected", m.r2passed || 0, "passed Round 2", "ok"]]} />
      <Outcomes o={x.outcomes} />
      <div className="x-side">
        {(lg?.toMe || lg?.withMe) ? <Card title="Artworks in your session room" right={<Btn sm v="primary" href="/pull-list">Session board</Btn>}><p className="muted">{lg.toMe + lg.withMe} artwork{lg.toMe + lg.withMe === 1 ? " is" : "s are"} in the room. Hand each batch back on the board when it's scored, and storage brings the next.</p></Card> : null}
        <Card title="My scoring sessions" right={<Btn sm v="ghost" href="/sessions">All sessions</Btn>}>{mySessions.length ? <div className="x-todo">{mySessions.map(s => <div className="it" key={s.id}><div className="tx"><b>{s.title}</b><span>{dshort(s.session_date)} {s.time_text || ""} · {s.venue || ""} · {s.count} artworks</span></div><Btn sm v={s.status === "live" ? "primary" : "secondary"} href={`/sessions/${s.id}`}>{s.status === "live" ? "Continue" : "Open"}</Btn></div>)}</div> : <p className="muted">No sessions planned. Physical Round 2 artworks are scored in sessions you create.</p>}</Card>
        <Card title="Follow up with schools">{m.nofiles.length || lg?.mineMissing?.length || m.collections.length ? <div className="x-todo">
          {lg?.mineMissing?.map(c => <div className="it" key={c}><div className="tx"><b>{c} missing at collection</b><span>Ask the school to check</span></div><Btn sm href={`/entries/${c}`}>Open</Btn></div>)}
          {m.collections.map(c => <div className="it" key={c.id}><div className="tx"><b>Collection {c.code} · {dshort(c.scheduled_on)}</b><span>{c.school} · {c.count} artworks</span></div><Btn sm href="/collections">Open</Btn></div>)}
          {m.nofiles.map(e => <div className="it" key={e.code}><div className="tx"><b>{e.code} has no files</b><span>{e.school?.name}</span></div><Btn sm href={`/entries/${e.code}`}>Open</Btn></div>)}</div> : <p className="muted">Nothing to follow up.</p>}</Card>
      </div>
      <Pathways d={x} />
    </>;
  }
  if (role === "storage") {
    const b = lg.by || {}; const n = k => b[k] || 0;
    const todo = [
      ...(n("requested") + n("picked") ? [[`${n("requested") + n("picked")} artwork${n("requested") + n("picked") === 1 ? "" : "s"} waiting for ${lg.pullSessions} session${lg.pullSessions === 1 ? "" : "s"}`, "Bring them into the room in batches from the session board", <Btn key="p" sm v="primary" href="/pull-list">Session boards</Btn>]] : []),
      ...(n("returning") ? [[`${n("returning")} handed back from sessions`, "Put them back on the shelves", <Btn key="r" sm href="/pull-list">Session boards</Btn>]] : []),
      ...(lg.unbatched ? [[`${lg.unbatched} artwork${lg.unbatched === 1 ? "" : "s"} not in a collection`, "Schedule collections from the schools", <Btn key="c" sm href="/logistics">Schedule</Btn>]] : []),
      ...(lg.to_collect - lg.unbatched > 0 ? [[`${lg.to_collect - lg.unbatched} artworks in scheduled collections`, "Check them in as they arrive", <Btn key="cc" sm href="/collections">Collections</Btn>]] : []),

      ...(lg.missing + lg.damaged ? [[`${lg.missing} missing · ${lg.damaged} damaged`, "Decide what happens to each", <Btn key="x" sm href="/logistics?tab=exceptions">Exceptions</Btn>]] : [])
    ];
    return <>
      <PageHead title={hello(me?.name)} sub={today()} actions={<><Btn href="/collections">Collections</Btn><Btn v="primary" href="/pull-list">Session boards</Btn></>} />
      <Kpis items={[["Physical artworks", lg.total, "Round 2"], ["Waiting for sessions", n("requested") + n("picked"), `${lg.pullSessions} session${lg.pullSessions === 1 ? "" : "s"}`, n("requested") + n("picked") ? "brand" : ""], ["In session rooms", n("handed_over") + n("coordinator"), `${n("returning")} handed back`], ["In storage", lg.storage, `${lg.to_collect} still to collect`, "ok"], ["Exceptions", lg.missing + lg.damaged, `${lg.missing} missing · ${lg.damaged} damaged`, lg.missing + lg.damaged ? "warn" : "ok"]]} />
      <Outcomes o={x.outcomes} />
      <div className="x-side">
        <Todo items={todo} />
        <Card title="Upcoming sessions" sub="Each one has a pull list">{x.sessions.filter(s => s.status !== "done").length ? <div className="x-todo">{x.sessions.filter(s => s.status !== "done").map(s => <div className="it" key={s.id}><div className="tx"><b>{s.title}</b><span>{dshort(s.session_date)} · {s.venue || ""} · {s.count} artworks</span></div><Btn sm href={`/pull-list?session=${s.id}`}>Board</Btn></div>)}</div> : <p className="muted">No sessions planned.</p>}</Card>
      </div>
      <Bars title="Shelves" rows={Object.entries(lg.shelves).map(([label, n]) => ({ label, n }))} />
    </>;
  }
  if (role === "management") {
    const m = x.mine;
    return <>
      <PageHead title={hello(me?.name)} sub={today()} actions={<><Btn href="/insights">Insights</Btn><Btn v="primary" href="/reviews?mine=1">My reviews</Btn></>} />
      <Kpis items={[["My open reviews", m.open.length, `${m.open.filter(r => Date.parse(r.due_at) < Date.now()).length} overdue`, m.open.some(r => Date.parse(r.due_at) < Date.now()) ? "warn" : ""], ["Decided", m.decided, `${m.overridden} overridden`], ["All open reviews", x.reviews.open, `${x.reviews.overdue} overdue`], ["Artworks", fmt(x.total), `${fmt(x.schools)} schools`]]} />
      <Outcomes o={x.outcomes} />
      <Card title="Waiting for your decision" flush>{m.open.length ? <Table cols={["Artwork", "Reason", { h: "Due", cls: "r" }]} rows={m.open.map(r => { const [t, tone] = dueTxt(r.due_at); return [<Two key="a" a={<span className="code">{r.entry?.code}</span>} b={r.entry?.title_en} />, r.reason, <Badge key="c" tone={tone}>{t}</Badge>]; })} onRow={i => location.assign(`/reviews/${m.open[i].id}`)} /> : <div style={{ padding: 20 }}><Empty title="No reviews waiting">Flagged artworks assigned to you appear here.</Empty></div>}</Card>
      <Pathways d={x} />
    </>;
  }
  // HQ (higher management): the insights view is the home page
  return <>
    <PageHead title={hello(me?.name)} sub={`${today()} · NAE 2026 at a glance`} actions={<><Btn href="/reports">Reports</Btn><Btn v="primary" href="/final-results">Final results</Btn></>} />
    <Outcomes o={x.outcomes} />
    <Insights />
  </>;
}
