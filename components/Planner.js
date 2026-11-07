"use client";
import { useEffect, useState } from "react";
import { Card, Btn, Banner, Kpis, Modal, Field, Check, dshort } from "@/components/ui";

// The daily plan for framing or photography: the team sets the date range (and, for photography, the spaces used);
// the system shows today's target, what was done, alerts, and the day-by-day schedule.
//   kind: "framing" | "photography"; stats/alerts from the API; onSave(plan) saves it
export default function Planner({ kind, plan, stats, alerts = [], canSet, onSave }) {
  const photo = kind === "photography";
  const noun = photo ? "photographed" : "sent to the framer";
  const [ask, setAsk] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const blank = () => ({ start: plan?.start || "", end: plan?.end || "", skip_weekends: plan?.skip_weekends !== false, spaces: plan?.spaces?.length ? [...plan.spaces] : photo ? ["Studio 1"] : [] });
  // the first time the Logistics team opens the page, they set the period
  useEffect(() => { if (!plan && canSet) setAsk(blank()); }, [plan?.start, canSet]); // eslint-disable-line
  async function save() { setBusy(true); setErr(null); try { await onSave(ask); setAsk(null); } catch (e) { setErr(e.message); } setBusy(false); }
  const s = stats;
  return <>
    {s ? <Card title={photo ? "Photography plan" : "Framing plan"} sub={`${dshort(s.start)} to ${dshort(s.end)} · ${s.workdays} working day${s.workdays === 1 ? "" : "s"}${plan?.skip_weekends !== false ? " (Saturday and Sunday off)" : ""}${photo ? ` · ${s.spaces.length} space${s.spaces.length === 1 ? "" : "s"}: ${s.spaces.join(", ")}` : ""}`} right={canSet && <Btn sm onClick={() => setAsk(blank())}>Change plan</Btn>}>
      <Kpis dense items={[
        [s.notStarted ? "Starts" : "Today's target", s.notStarted ? dshort(s.start) : s.workday ? s.target : "Day off", s.notStarted ? `${s.perDay} a day planned` : photo && s.perSpace != null && s.workday ? `${s.perSpace} per space` : s.daysLeft ? `${s.daysLeft} working day${s.daysLeft === 1 ? "" : "s"} left` : "period over", s.short > 0 ? "warn" : ""],
        ["Done today", s.doneToday, noun, s.workday && s.target && s.doneToday >= s.target ? "ok" : ""],
        ["Done", `${s.done} of ${s.total}`, s.total ? `${Math.round(100 * s.done / s.total)}%` : "", "brand"],
        ["Behind plan", s.behind, s.behind ? "artworks short by yesterday" : "on track", s.behind ? "bad" : "ok"]
      ]} />
      {alerts.length > 0 && <div className="stack s4" style={{ marginTop: 10 }}>{alerts.map((a, i) => <Banner key={i} tone={a.tone === "bad" ? "bad" : a.tone === "warn" ? "warn" : undefined} title={a.text} />)}</div>}
      <details className="pl-sched" style={{ marginTop: 10 }}><summary className="small">Day by day</summary>
        <div className="pl-days">{s.schedule.map(d => <div key={d.day} className={`pl-day${d.today ? " today" : ""}${d.past && d.done < d.plan ? " short" : ""}`}><span className="small faint">{dshort(d.day)}</span><b>{d.done}<span className="faint"> / {d.plan}</span></b></div>)}</div>
      </details>
    </Card> : <Banner tone="warn" title={photo ? "Set the photography plan" : "Set the framing plan"} action={canSet && <Btn sm v="primary" onClick={() => setAsk(blank())}>Set the plan</Btn>}>{canSet ? `Choose the first and last day${photo ? " and the spaces (rooms or venues) you'll use" : ""}; the system then tells you how many artworks to ${photo ? "photograph" : "send"} each day and alerts you when a day falls short.` : "The Logistics team sets it."}</Banner>}
    {alerts.length > 0 && !s && <div className="stack s4">{alerts.map((a, i) => <Banner key={i} tone={a.tone === "bad" ? "bad" : a.tone === "warn" ? "warn" : undefined} title={a.text} />)}</div>}
    <Modal open={!!ask} title={photo ? "Photography plan" : "Framing plan"} sub={photo ? "When you will photograph the artworks, and in which spaces." : "When you will send artworks to the framer."} onClose={() => setAsk(null)}
      footer={<><Btn onClick={() => setAsk(null)}>{plan ? "Cancel" : "Later"}</Btn><Btn v="primary" busy={busy} onClick={save}>Save plan</Btn></>}>
      {ask && <div className="stack" style={{ gap: 12 }}>
        {err && <Banner tone="bad" title={err} />}
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <Field label="First day"><input type="date" className="input" value={ask.start} onChange={e => setAsk({ ...ask, start: e.target.value })} /></Field>
          <Field label="Last day"><input type="date" className="input" value={ask.end} onChange={e => setAsk({ ...ask, end: e.target.value })} /></Field>
        </div>
        <Check label="Saturday and Sunday off" checked={ask.skip_weekends} onChange={v => setAsk({ ...ask, skip_weekends: v })} />
        {photo && <Field label={`Spaces used for photography (${ask.spaces.length})`} help="Rooms or venues in the office. Each batch is photographed in one of them, and each gets its own checklist.">
          <div className="stack s4">{ask.spaces.map((sp, i) => <div key={i} className="row" style={{ gap: 6 }}><input className="input" value={sp} onChange={e => { const n = [...ask.spaces]; n[i] = e.target.value; setAsk({ ...ask, spaces: n }); }} placeholder="e.g. Studio 1, Meeting room B" /><Btn sm v="ghost" disabled={ask.spaces.length < 2} onClick={() => setAsk({ ...ask, spaces: ask.spaces.filter((_, j) => j !== i) })}>Remove</Btn></div>)}
            <Btn sm onClick={() => setAsk({ ...ask, spaces: [...ask.spaces, `Studio ${ask.spaces.length + 1}`] })}>Add a space</Btn></div></Field>}
      </div>}
    </Modal>
  </>;
}
