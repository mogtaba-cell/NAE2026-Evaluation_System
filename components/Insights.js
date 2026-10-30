"use client";
// The KPIs and charts shared by HQ (its home page), management and admins (the Insights page).
import { useState } from "react";
import { useApi, Kpis, Card, Table, Chips, Seg, Prog, Two, Loading, Badge, fmt } from "@/components/ui";
import { ChartCard, HBars, StackBars, Histogram, DayLine, Funnel } from "@/components/Charts";

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "–");
const BIN_LABELS = ["0–9", "10–19", "20–29", "30–39", "40–49", "50–59", "60–69", "70–79", "80–89", "90–100"];

export default function Insights() {
  const [pw, setPw] = useState("");
  const [histRound, setHistRound] = useState("1");
  const d = useApi(`/api/insights${pw ? `?pathway=${pw}` : ""}`, [], { live: 60000 });
  const x = d.data;
  if (!x) return <Loading error={d.error} />;
  const k = x.kpis;
  const h = x.hist.find(r => String(r.round) === histRound) || x.hist[0];
  const gradeRows = x.pathways.flatMap(p => p.grades.filter(g => g.A + g.B + g.C).map(g => ({ label: `${pw ? "" : p.code + " · "}Round ${g.round}`, ...g })));
  const top = rows => rows.slice(0, 8);
  return <div className="stack" style={{ gap: 16, opacity: d.loading ? 0.6 : 1, transition: "opacity .15s" }}>
    <Chips value={pw} onChange={setPw} items={[["", "All pathways"], ...x.pathwayOptions.map(p => [p.code, p.name])]} />
    <Kpis items={[
      ["Artworks", fmt(k.entries), `${fmt(k.schools)} schools · ${fmt(k.students)} students`],
      ["Scores submitted", fmt(k.scores), "all rounds"],
      ["Shortlisted", fmt(k.r1through), `passed Round 1 · ${pct(k.r1through, k.entries)} of artworks`, "ok"],
      ["Selected", fmt(k.r2passed), `passed Round 2 · ${fmt(k.gradeA)} with grade A`, "ok"],
      ["Reviews open", fmt(k.reviewsOpen), `${k.reviewsOverdue} overdue${k.avgReviewHours != null ? ` · decided in ${k.avgReviewHours < 1 ? "under 1 h" : `${k.avgReviewHours} h`} on average` : ""}`, k.reviewsOverdue ? "warn" : ""]
    ]} />

    <Card title="Where each pathway is" flush>
      <Table cols={["Pathway", "Stage", { h: "Current round progress", cls: "r" }, { h: "Shortlisted", cls: "r" }, { h: "Selected", cls: "r" }]}
        rows={x.pathways.map(p => [<Two key="a" a={p.name} b={`${fmt(p.entries)} entries`} />, <span key="b">{p.stage}</span>,
          p.progress ? <Prog key="c" pct={p.progress.total ? (p.progress.done / p.progress.total) * 100 : 0} label={`${p.progress.done}/${p.progress.total}`} /> : <span key="c" className="faint small">Not scoring</span>,
          <span key="d" className="num">{fmt(p.stages[2][1])}</span>, <span key="e" className="num">{fmt(p.stages[4][1])}</span>])} />
    </Card>

    <div className={`ins-grid${pw ? "" : " ins-4"}`}>
      {x.pathways.map(p => <ChartCard key={p.code} title={pw ? "Journey of the artworks" : p.name} sub="Each stage as a share of all artworks"
        table={{ cols: ["Stage", "Artworks", "Share"], rows: p.stages.map(([l, n]) => [l, fmt(n), pct(n, p.stages[0][1])]) }}>
        <Funnel stages={p.stages} /></ChartCard>)}
    </div>

    <div className="ins-grid">
      <ChartCard title="Grades of completed results" sub={pw ? "By round" : "By pathway and round"} table={{ cols: ["", "A", "B", "C"], rows: gradeRows.map(r => [r.label, r.A, r.B, r.C]) }}>
        <StackBars rows={gradeRows} />
      </ChartCard>
      <ChartCard title="Team results" sub={`Round ${histRound}, completed artworks, in 10-point bands`} right={<Seg value={histRound} onChange={setHistRound} items={[["1", "Round 1"], ["2", "Round 2"]]} />}
        table={{ cols: ["Team result", "Artworks"], rows: h.bins.map((n, i) => [BIN_LABELS[i], n]) }}>
        <Histogram bins={h.bins} labels={BIN_LABELS} />
      </ChartCard>
    </div>

    <div className="ins-grid">
      <ChartCard title="Scores submitted per day" sub="Last 21 days" table={{ cols: ["Day", "Scores"], rows: x.daily.map(p => [p.day, p.n]) }}>
        <DayLine points={x.daily} />
      </ChartCard>
      <ChartCard title="Management reviews" sub={`${x.sessions.live} live, ${x.sessions.planned} planned and ${x.sessions.done} finished scoring sessions`}
        table={{ cols: ["Reviews", "Count"], rows: [["Open", x.reviews.open], ["Overdue", x.reviews.overdue], ["Confirmed", x.reviews.confirmed], ["Overridden", x.reviews.overridden]] }}>
        <HBars rows={[{ label: "Open", n: x.reviews.open }, { label: "Overdue", n: x.reviews.overdue, color: "#B4581B" }, { label: "Confirmed", n: x.reviews.confirmed }, { label: "Overridden", n: x.reviews.overridden }]} />
        {x.reviews.overdue > 0 && <p className="small" style={{ marginTop: 8 }}><Badge tone="warn">Overdue</Badge> {x.reviews.overdue} review{x.reviews.overdue === 1 ? " is" : "s are"} past the 48-hour decision time.</p>}
      </ChartCard>
    </div>

    <div className="ins-grid">
      <ChartCard title="Physical artworks" sub={x.logisticsExtra.total ? `${fmt(x.logisticsExtra.total)} artworks · ${x.logisticsExtra.damaged} damaged · ${x.logisticsExtra.framing} need framing` : "Round 2 physical subpathways"}
        table={x.logistics.length ? { cols: ["State", "Artworks"], rows: x.logistics.map(r => [r.label, r.n]) } : null}>
        <HBars rows={x.logistics.filter(r => r.n || ["To collect", "In storage"].includes(r.label))} empty="No physical artworks in this view." />
      </ChartCard>
      <ChartCard title="Schools with the most artworks shortlisted" sub="Artworks shortlisted for Round 2, with all artworks for comparison"
        table={{ cols: ["School", "Shortlisted", "Artworks"], rows: x.topSchools.map(s => [s.name, s.through, s.entries]) }}>
        <HBars rows={x.topSchools.map(s => ({ label: s.name, n: s.through, entries: s.entries }))} sub={r => `of ${r.entries}`} />
      </ChartCard>
    </div>

    <Card title="Coordinators" sub="Artworks allocated, scored in their current round, and shortlisted" flush>
      <Table empty="No artworks allocated yet." cols={["Coordinator", "Pathways", { h: "Schools", cls: "r" }, { h: "Artworks", cls: "r" }, { h: "Scored", cls: "r" }, { h: "Shortlisted", cls: "r" }, { h: "In review", cls: "r" }]}
        rows={x.coordinators.map(c => [c.name, <span key="p" className="small">{c.pathways.join(", ")}</span>, <span key="s" className="num">{c.schools}</span>, <span key="e" className="num">{c.entries}</span>, <Prog key="sc" pct={c.entries ? (c.scored / c.entries) * 100 : 0} label={`${c.scored}/${c.entries}`} />, <span key="t" className="num">{c.through}</span>, <span key="r" className="num">{c.review || ""}</span>])} />
    </Card>

    <div className="ins-grid ins-4">
      {[["Artworks by region", "region"], ["Artworks by school type", "type"], ["Students by gender", "gender"], ["Students by nationality", "nationality"]].map(([t, key]) =>
        <ChartCard key={key} title={t} sub={x.participation[key].length > 8 ? "Top 8" : null} table={{ cols: [t.split(" by ")[1].replace(/^./, c => c.toUpperCase()), t.startsWith("Students") ? "Students" : "Artworks"], rows: x.participation[key].map(r => [r.label, r.n]) }}>
          <HBars rows={top(x.participation[key])} />
        </ChartCard>)}
    </div>
  </div>;
}
