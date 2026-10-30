"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useApi, useMeta, PageHead, Card, Table, Badge, Loading, Kpis, Tabs, Person, Two, dueTxt, when } from "@/components/ui";

export default function Reviews() {
  const sp = useSearchParams(); const router = useRouter(); const meta = useMeta();
  const mine = sp.get("mine") === "1"; const status = sp.get("status") || "open";
  const d = useApi(`/api/reviews?scope=${mine ? "mine" : "all"}&status=${status}`, [], { live: true });
  if (!d.data) return <Loading error={d.error} />;
  const x = d.data; const setQ = (k, v) => { const n = new URLSearchParams(sp); n.set(k, v); router.replace(`/reviews?${n}`); };
  return <>
    <PageHead title={mine ? "My reviews" : "Reviews"} sub="Artworks flagged automatically (close to the pass mark or grade A line, evaluators far apart, or disagreeing on identity) or by a coordinator. Each review is due within the round's review time (48 hours by default)." />
    <Kpis items={[["Open", x.totals.open], ["Overdue", x.totals.overdue, "", x.totals.overdue ? "warn" : "ok"], ["Decided", x.totals.decided], ["Overridden", x.totals.overridden]]} />
    {!mine && meta?.data?.me?.role === "admin" && <Card title="Manager workload" flush><Table cols={["Manager", { h: "Open", cls: "r" }, { h: "Overdue", cls: "r" }, { h: "Decided", cls: "r" }]} rows={x.managers.map(m => [<Person key="p" name={m.name} />, m.open, m.overdue ? <Badge key="o" tone="bad">{m.overdue}</Badge> : 0, m.decided])} empty="No management accounts yet." /></Card>}
    <Tabs value={status} onChange={v => setQ("status", v)} items={[["open", "Open"], ["decided", "Decided"]]} />
    <Card flush><Table minw={860} cols={["Artwork", "Reason", "Scores", "Manager", status === "open" ? "Due" : "Decision"]} onRow={i => router.push(`/reviews/${x.rows[i].id}`)} empty={status === "open" ? "No open reviews." : "Nothing decided yet."}
      rows={x.rows.map(r => { const [t, tone] = dueTxt(r.due_at); return [<Two key="e" a={<span className="code">{r.entry.code}</span>} b={r.entry.title_en || r.entry.group_name || r.entry.school?.name} />, <Two key="r" a={r.reason} b={`Round ${r.round_no} · by ${r.flagged_by_name}`} />, <span key="s" className="num">{r.totals.join(" · ")}{r.team_at_flag != null ? ` → ${r.team_at_flag}` : ""}</span>, r.manager || "", status === "open" ? <Badge key="d" tone={tone}>{t}</Badge> : <Two key="d" a={r.status === "overridden" ? `Overridden: ${r.new_passed === true ? (r.round_no === 2 ? "selected" : "shortlisted") : r.new_passed === false ? (r.round_no === 2 ? "not selected" : "not shortlisted") : `result ${r.new_result}`}` : "Confirmed"} b={`${r.decided_by_name || ""} · ${when(r.decided_at)}`} />]; })} /></Card>
  </>;
}
