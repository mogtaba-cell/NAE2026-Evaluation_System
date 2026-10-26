"use client";
import { useMeta, PageHead, Badge, Btn, Loading, fmt } from "@/components/ui";
import Readiness from "@/components/Readiness";

export default function Setup() {
  const meta = useMeta();
  if (!meta?.data) return <Loading error={meta?.error} />;
  const pws = meta.data.pathways;
  const Track = ({ t, sub }) => <div className="stack" style={{ gap: 12 }}><div className="stack s4"><h2>{t}</h2><span className="faint small">{sub}</span></div>
    {pws.filter(p => p.track === t).map(p => {
      const next = p.rounds.find(r => r.status === "setup") || p.rounds.find(r => r.status === "open") || p.rounds[0];
      const rd = next?.readiness; const ok = rd ? rd.checks.filter(c => c.ok).length : 0;
      return <div key={p.code} className="x-pwc">
        <div className="nm"><h3>{p.name}</h3><span className="small faint">{p.code} · {fmt(p.entries)} entries · {p.subs.length} subpathways</span><div className="row" style={{ gap: 4 }}>{p.rounds.map(r => <Badge key={r.id} tone={r.status === "open" ? "info" : r.status === "closed" ? "ok" : ""}>R{r.round_no} {r.status}</Badge>)}</div></div>
        <div className="stack s8"><span className="small faint">{next ? `Round ${next.round_no} ${next.status === "setup" ? "readiness" : "checks"}` : ""}</span>{rd && <Readiness checks={rd.checks} />}</div>
        <div className="ac"><span className="small faint">{rd ? `${ok} of ${rd.checks.length} ready` : ""}</span><Btn v={rd?.ready ? "secondary" : "primary"} href={`/setup/${p.code}`}>Set up</Btn>{next?.status === "setup" && <Btn href="/rounds" v={rd?.ready ? "primary" : "ghost"}>{rd?.ready ? `Open Round ${next.round_no}` : "Rounds"}</Btn>}</div></div>;
    })}</div>;
  return <>
    <PageHead title="Program setup" sub="A round can open when every check is green. “Must fix” items block opening; “Check” items can be overridden by an admin with a reason." actions={<><Btn href="/import">Import entries</Btn><Btn href="/rubrics">Rubric library</Btn></>} />
    {[...new Set(pws.map(p => p.track))].map(t => <Track key={t} t={t} sub={`${pws.filter(p => p.track === t).map(p => p.name).join(", ")}.`} />)}
    {!pws.length && <p className="muted">No pathways yet.</p>}
  </>;
}
