"use client";
import { useMeta, PageHead, Card, Badge, Btn, Loading, fmt } from "@/components/ui";

export default function Setup() {
  const meta = useMeta();
  if (!meta?.data) return <Loading error={meta?.error} />;
  const pws = meta.data.pathways;
  const Track = ({ t, sub }) => <div className="stack" style={{ gap: 12 }}><div className="stack s4"><h2>{t}</h2><span className="faint small">{sub}</span></div>
    {pws.filter(p => p.track === t).map(p => { const ok = p.check.filter(c => c.ok).length; return <div key={p.code} className="x-pwc">
      <div className="nm"><h3>{p.name}</h3><span className="small faint">{p.code} · {fmt(p.entries)} entries · {p.subs.length} subpathways</span>{p.rounds.map(r => <span key={r.id} className="small"><Badge tone={r.status === "open" ? "info" : r.status === "closed" ? "ok" : ""}>R{r.round_no} {r.status}</Badge></span>)}</div>
      <div className="x-ck">{p.check.map(c => <div key={c.key} className={c.ok ? "ok" : p.entries ? "bad" : ""}><b>{c.label}</b><span>{c.text}</span></div>)}</div>
      <div className="ac"><span className="small faint">{ok} of {p.check.length} ready</span><Btn v={ok === p.check.length ? "secondary" : "primary"} href={`/setup/${p.code}`}>Set up</Btn></div></div>; })}</div>;
  return <>
    <PageHead title="Program setup" sub="Each pathway needs entries, a published rubric for every subpathway in use, round dates, evaluators and coordinators before Round 1 can open." actions={<><Btn href="/import">Import entries</Btn><Btn href="/rubrics">Rubric library</Btn></>} />
    <Track t="Expressions" sub="NAE 2026 submissions, in scoring now." />
    <Track t="Arts" sub="Visual, Digital, Literary and Performing Arts. Submitted separately; set up when its intake opens." />
  </>;
}
