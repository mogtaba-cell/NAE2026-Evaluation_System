"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { api, useApi, useMeta, useToast, PageHead, Card, Table, Loading, Btn, Check, Empty, Badge, dshort } from "@/components/ui";

export default function PullList() {
  const sp = useSearchParams(); const router = useRouter(); const meta = useMeta(); const toast = useToast();
  const all = useApi("/api/sessions");
  const sessions = (all.data?.sessions || []).filter(s => ["planned", "live"].includes(s.status));
  const id = sp.get("session") || sessions[0]?.id;
  const d = useApi(id ? `/api/pull-list/${id}` : null);
  const canTick = ["admin", "storage"].includes(meta?.data?.me?.role);
  if (!all.data) return <Loading error={all.error} />;
  if (!id) return <><PageHead title="Pull lists" /><Empty title="No sessions planned">Pull lists appear when a coordinator creates a scoring session.</Empty></>;
  const s = d.data?.session;
  async function tick(code, v) { try { await api(`/api/pull-list/${id}`, { body: { entry_code: code, pulled: v } }); d.reload(); } catch (e) { toast(e.message, "err"); } }
  const rows = d.data?.rows || [];
  return <>
    <PageHead title={`Pull list${s ? ` · ${s.title}` : ""}`} sub={s ? `${s.session_date ? dshort(s.session_date) : ""} ${s.time_text || ""} · ${s.venue || ""}. Sorted by room and shelf so you can walk the store once.` : ""}
      actions={<><select className="select no-print" style={{ width: 260 }} value={id} onChange={e => router.replace(`/pull-list?session=${e.target.value}`)}>{(all.data.sessions || []).filter(x => x.status !== "cancelled").map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select><Btn className="no-print" onClick={() => window.print()}>Print</Btn></>} />
    {!d.data ? <Loading error={d.error} /> : <Card flush><Table minw={760} cols={["Pulled", "Where", "Artwork", "School", "Size"]} rows={rows.map(r => [<Check key="c" disabled={!canTick} checked={!!r.pulled} onChange={v => tick(r.code, v)} />, <span key="l" className="strong">{r.state === "coordinator" ? "With coordinator" : r.where || "Not shelved"}{r.damaged ? <> <Badge tone="warn">Damaged</Badge></> : null}</span>, <div key="e" className="stack s4"><span className="code">{r.code}</span><span className="small faint">{r.title_en}</span></div>, <span key="s" className="small">{r.school?.name}</span>, <span key="z" className="small muted">{r.size_text || "Not given"}</span>])} />
      <p className="x-note" style={{ padding: 12 }}>{rows.filter(r => r.pulled).length} of {rows.length} pulled. Starting the session marks these artworks as with the coordinator.</p></Card>}
  </>;
}
