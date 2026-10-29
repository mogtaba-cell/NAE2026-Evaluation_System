"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, useApi, Loading, Empty, Seg, Badge, Btn, Banner, dshort, Prog } from "@/components/ui";
import FileViewer from "@/components/FileViewer";
import EntryAbout from "@/components/EntryAbout";
import ScoreForm from "@/components/ScoreForm";

export default function Queue() {
  const router = useRouter(); const sp = useSearchParams();
  const qd = useApi("/api/queue");
  const [filter, setFilter] = useState("todo");
  const items = qd.data?.items || [];
  // an entry can be in the queue for Round 1 and Round 2: items are picked by entry and round
  const first = items.find(i => i.myStatus !== "submitted") || items[0];
  const code = sp.get("code") || first?.code;
  const roundNo = Number(sp.get("round")) || (items.find(i => i.code === code && i.myStatus !== "submitted") || items.find(i => i.code === code))?.round_no;
  const key = code && roundNo ? `${code}:${roundNo}` : null;
  const [d, setD] = useState(null); const [err, setErr] = useState(null); const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async c => { setErr(null); try { setD(await api(`/api/entries/${encodeURIComponent(c)}`)); } catch (e) { setErr(e.message); } }, []);
  useEffect(() => { if (code) { setD(null); load(code); } }, [code, load]);
  const list = useMemo(() => items.filter(i => filter === "all" || (filter === "done" ? i.myStatus === "submitted" : i.myStatus !== "submitted")), [items, filter]);
  const done = items.filter(i => i.myStatus === "submitted").length;
  const pos = list.findIndex(i => i.key === key);
  const nextItem = list.find((x, j) => j > pos && x.myStatus !== "submitted") || items.find(x => x.key !== key && x.myStatus !== "submitted");
  const nextCode = nextItem?.code;
  // Warm the next entry's file lookup in the background so its images open instantly.
  useEffect(() => { if (d && nextCode) { const t = setTimeout(() => fetch(`/api/entries/${encodeURIComponent(nextCode)}`).catch(() => {}), 800); return () => clearTimeout(t); } }, [d, nextCode]);
  const open = (c, r) => router.replace(`/queue?code=${encodeURIComponent(c)}${r ? `&round=${r}` : ""}`, { scroll: false });
  const openItem = i => i && open(i.code, i.round_no);
  if (qd.loading && !qd.data) return <Loading />;
  if (qd.error) return <Loading error={qd.error} />;
  if (!items.length) return <><div className="ph"><div className="t"><h1>My queue</h1></div></div><Empty title="Nothing to score right now">Artworks appear here when a round you are on opens.</Empty></>;
  const cur = items.find(i => i.key === key);
  const round = d?.rounds?.find(r => r.round_no === cur?.round_no);
  const mine = round?.scores?.find(s => s.evaluator_id === qd.data.evaluator_id);
  async function refresh() { setRefreshing(true); try { const r = await api(`/api/entries/${encodeURIComponent(code)}/files`); setD(x => ({ ...x, files: r.files })); } catch (e) { setErr(e.message); } setRefreshing(false); }
  return <>
    <div className="ph"><div className="t"><h1>My queue</h1><p className="sub">{qd.data.rounds.map(r => `${r.pathway} Round ${r.round_no}${r.closes_on ? `, closes ${dshort(r.closes_on)}` : ""}`).join(" · ")}</p></div>
      <div className="f3-hprog"><span className="small faint">{done} of {items.length} submitted</span><Prog pct={done / items.length * 100} label={false} /></div></div>
    <div className="f3-sc">
      <section className="card f3-queue">
        <div className="qh"><Seg value={filter} onChange={setFilter} items={[["todo", `To do ${items.length - done}`], ["done", `Done ${done}`], ["all", "All"]]} /></div>
        <div className="qb">{list.length ? list.map(i => <div key={i.key} role="button" tabIndex={0} className={`f3-qi${i.key === key ? " on" : ""}`} onClick={() => openItem(i)} onKeyDown={e => e.key === "Enter" && openItem(i)}>
          <div className="t"><b>{i.code}{qd.data.rounds.length > 1 || items.some(x => x.round_no === 2) ? <span className="faint" style={{ fontFamily: "var(--sans)", fontWeight: 400 }}> · R{i.round_no}</span> : null}</b><span dir="auto">{i.title_en || i.title_ar || "Untitled"}</span></div>
          <span className="s">{i.myStatus === "submitted" ? i.myTotal : i.myStatus === "draft" ? "Draft" : ""}</span></div>) : <p className="x-note" style={{ padding: 12 }}>{filter === "todo" ? "All done. Thank you!" : "Nothing here."}</p>}</div>
      </section>
      <div className="stack sticky-view" style={{ gap: 12, minWidth: 0 }}>
        {err && <Banner tone="bad" title="Could not load this artwork">{err}</Banner>}
        {!d ? <Loading /> : <>
          <div className="stack s4"><div className="row" style={{ gap: 8 }}><span className="code" style={{ fontSize: 15, fontWeight: 600 }}>{d.entry.code}</span><Badge>{d.entry.sub || d.entry.pathway}</Badge><Badge>Round {cur?.round_no}</Badge>{cur?.physical && <Badge tone="info">Physical artwork</Badge>}</div>
            <span className="small faint">Reference {d.entry.reference_id}</span></div>
          <FileViewer files={d.files} tall onRefresh={refresh} refreshing={refreshing} />
        </>}
      </div>
      <div className="stack" style={{ gap: 16, minWidth: 0 }}>
        {d && <EntryAbout e={d.entry} compact />}
        {d && round && <ScoreForm code={d.entry.code} round={round} mine={mine} framing={cur?.round_no === 2 && d.logistics ? d.logistics : null} onSaved={async submit => { await qd.reload(); if (submit) { if (nextItem) openItem(nextItem); else load(code); } else load(code); }} />}
        {d && round && mine?.status === "submitted" && round.scores.length > 1 && <section className="card"><div className="card-h"><div className="tt"><h3>Team scores</h3><span className="sub">Visible after you submit</span></div></div>
          <table className="x-cmp"><tbody>{round.scores.map(s => <tr key={s.id}><td>{s.evaluator_id === qd.data.evaluator_id ? "You" : s.evaluator}</td><td>{s.status === "submitted" ? s.total : "Not yet"}</td></tr>)}</tbody></table></section>}
        {d && nextItem && <Btn onClick={() => openItem(nextItem)}>Next artwork ›</Btn>}
      </div>
    </div>
  </>;
}
