"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApi, PageHead, Card, Table, Loading, Btn, Check, Empty, dshort } from "@/components/ui";

export default function PullList() {
  const sp = useSearchParams(); const router = useRouter();
  const all = useApi("/api/sessions");
  const sessions = (all.data?.sessions || []).filter(s => s.status !== "done");
  const id = sp.get("session") || sessions[0]?.id;
  const d = useApi(id ? `/api/pull-list/${id}` : null);
  const [got, setGot] = useState({});
  if (!all.data) return <Loading error={all.error} />;
  if (!id) return <><PageHead title="Pull lists" /><Empty title="No sessions planned">Pull lists appear when a coordinator creates a scoring session.</Empty></>;
  const s = d.data?.session;
  return <>
    <PageHead title={`Pull list${s ? ` · ${s.title}` : ""}`} sub={s ? `${s.session_date ? dshort(s.session_date) : ""} ${s.time_text || ""} · ${s.venue || ""}. Sorted by shelf so you can walk the room once.` : ""}
      actions={<><select className="select no-print" style={{ width: 260 }} value={id} onChange={e => router.replace(`/pull-list?session=${e.target.value}`)}>{(all.data.sessions || []).map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select><Btn className="no-print" onClick={() => window.print()}>Print</Btn></>} />
    {!d.data ? <Loading error={d.error} /> : <Card flush><Table minw={760} cols={["", "Shelf", "Entry", "School", "Size"]} rows={d.data.rows.map(r => [<Check key="c" checked={!!got[r.code]} onChange={v => setGot({ ...got, [r.code]: v })} />, <span key="l" className="strong">{r.location || (r.state === "coordinator" ? "With coordinator" : "Not shelved")}</span>, <div key="e" className="stack s4"><span className="code">{r.code}</span><span className="small faint">{r.title_en}</span></div>, <span key="s" className="small">{r.school?.name}</span>, <span key="z" className="small muted">{r.size_text || "Not given"}</span>])} />
      <p className="x-note" style={{ padding: 12 }}>{Object.values(got).filter(Boolean).length} of {d.data.rows.length} pulled. Starting the session marks these entries as with the coordinator.</p></Card>}
  </>;
}
