"use client";
import { useEffect, useState } from "react";
import { api, useApi, useToast, PageHead, Card, Table, Btn, Badge, Banner, Loading, Kpis, Tabs, Modal, Field, Search, Two, when, fmt, Prog } from "@/components/ui";

const PHASE = { start: "Starting…", list: "Listing the whole Shared Drive…", changes: "Reading what changed since the last index…", match: "Matching folders to artworks…" };
const secs = (a, b) => { const s = Math.round((Date.parse(b) - Date.parse(a)) / 1000); return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`; };

export default function Files() {
  const [uq, setUq] = useState(""); const [duq, setDuq] = useState(""); const [why, setWhy] = useState("");
  useEffect(() => { const t = setTimeout(() => setDuq(uq.trim()), 300); return () => clearTimeout(t); }, [uq]);
  const d = useApi(`/api/files/index?${new URLSearchParams({ uq: duq, why })}`); const toast = useToast();
  const [tab, setTab] = useState("unmatched"); const [run, setRun] = useState(null); const [link, setLink] = useState(null); const [code, setCode] = useState(""); const [err, setErr] = useState(null);
  if (!d.data) return <Loading error={d.error} />;
  const x = d.data;
  async function index(full) {
    const t0 = Date.now();
    setRun({ phase: "start", listed: 0, full }); let r = await api("/api/files/index", { body: { action: "start", full } }).catch(e => { toast(e.message, "err"); return null; });
    while (r && !r.done) { setRun({ phase: r.run.state?.phase, listed: r.run.summary?.listed || 0, full: r.run.state?.mode === "full", t0 }); r = await api("/api/files/index", { body: { runId: r.run.id } }).catch(e => { toast(e.message, "err"); return null; }); }
    if (r) toast(`Index finished in ${Math.round((Date.now() - t0) / 1000)} s: ${fmt(r.run.summary?.files || 0)} files on ${fmt(r.run.summary?.entries_with_files || 0)} artworks`);
    setRun(null); d.reload();
  }
  async function doLink(body) { setErr(null); try { const r = await api("/api/files/link", { body }); toast(r.note); setLink(null); setCode(""); d.reload(); } catch (e) { setErr(e.message); } }
  const last = x.runs[0];
  return <>
    <PageHead title="Submission files" sub="How files reach evaluators: the sync computer copies SharePoint into the GVC Shared Drive (01 Submissions) and converts videos, HEIC photos and Word/PowerPoint into small previews (02 Previews). The index below matches every folder to its artwork using the ArtLink. Artworks also look up their own folder on first open, so new uploads show up within 10 minutes." actions={<><Btn v="ghost" disabled={!!run || !x.configured || x.mock} onClick={() => index(true)} title="Lists every file on the Shared Drive again. Runs by itself once a week.">Full re-index</Btn><Btn v="primary" busy={!!run} disabled={!x.configured || x.mock} onClick={() => index(false)} title="Reads only what changed since the last index">Run index now</Btn></>} />
    {!x.configured && <Banner tone="warn" title="Google Drive is not connected yet">Create the read-only service account, add it as Viewer on the Shared Drive and set GOOGLE_SERVICE_ACCOUNT_JSON in Vercel. Until then files can't be shown.</Banner>}
    {x.check && !x.check.ok && <Banner tone="bad" title="The website can't read the Shared Drive">{x.check.error}</Banner>}
    {x.check?.ok && !x.mock && <Banner tone="ok" title={`Connected to the Shared Drive "${x.check.drive}"`}>Reading as {x.check.email}.</Banner>}
    {x.mock && <Banner title="Test mode">Files are generated test images (DRIVE_MOCK=1). Switch it off once the Drive is connected.</Banner>}
    {run && <Card title={PHASE[run.phase] || "Working…"} sub={run.full ? "A full index lists about 30,000 items and takes around half a minute. Routine runs only read the changes." : "Only the changes since the last index are read."}><Prog pct={run.phase === "match" ? 85 : run.phase === "start" ? 5 : 45} label={`${fmt(run.listed)} ${run.phase === "changes" ? "changes" : "items"} read`} /></Card>}
    <Kpis items={[["Artworks with files", fmt(x.withFiles), "", "ok"], ["Artworks without files", fmt(x.noFilesCount), "folder empty or not matched", x.noFilesCount ? "warn" : "ok"], ["Files", fmt(x.files), Object.entries(x.kinds).map(([k, n]) => `${n} ${k}`).join(" · ")], ["Converted previews", fmt(x.previews), "videos, HEIC, documents"], ["Unmatched folders", fmt(x.unmatchedCount), "", x.unmatchedCount ? "warn" : "ok"]]} />
    <Tabs value={tab} onChange={setTab} items={[["unmatched", "Unmatched folders", x.unmatchedCount], ["nofiles", "Artworks without files", x.noFilesCount], ["runs", "Index runs", x.runs.length]]} />
    {tab === "unmatched" && x.libraries?.length > 0 && <Card title="Libraries" sub="Each top-level folder of 01 Submissions. Ignore a whole library that is not part of this program (for example the Expressions libraries): its folders stop showing here and its files are never attached.">
      <Table minw={560} cols={["Library", { h: "Unmatched folders", cls: "r" }, ""]} rows={x.libraries.map(l => [<b key="n">{l.name}</b>, l.ignored ? <span key="c" className="faint">–</span> : fmt(l.unmatched),
        l.ignored ? <span key="b" className="row nowrap" style={{ gap: 6 }}><Badge>Ignored</Badge><Btn sm v="ghost" onClick={() => doLink({ library: l.name, undo: true })}>Undo</Btn></span> : <Btn key="b" sm v="ghost" onClick={() => doLink({ library: l.name })}>Ignore whole library</Btn>])} /></Card>}
    {tab === "unmatched" && <section className="card"><div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      <Search value={uq} onChange={setUq} placeholder="Folder path, school code or group" />
      <select className="select" style={{ width: 240 }} value={why} onChange={e => setWhy(e.target.value)} aria-label="Why"><option value="">Every reason</option><option value="school">School is not in the import</option><option value="folder">No artwork has this folder</option><option value="outside">File outside an artwork folder</option></select>
      <span className="small faint" style={{ alignSelf: "center" }}>{x.unmatchedShown > x.unmatched.length ? `Showing the first ${fmt(x.unmatched.length)} of ${fmt(x.unmatchedShown)}` : `${fmt(x.unmatchedShown)} folder${x.unmatchedShown === 1 ? "" : "s"}`}</span>
    </div></section>}
    {tab === "unmatched" && <Card flush sub="Folders in 01 Submissions that no artwork points to. Most clear by themselves once the full artwork list is imported. Link the rest to their artwork, or ignore them.">
      <Table minw={900} cols={["Folder", { h: "Files", cls: "r" }, "Why", "Suggested artwork", ""]} empty="Every folder is matched." rows={x.unmatched.map(u => [<span key="p" className="code small" style={{ overflowWrap: "anywhere" }}>{u.path}</span>, u.files_count, <span key="w" className="small">{u.reason}</span>,
        u.suggested ? <div key="s" className="stack s4"><span className="code">{u.suggested.code}</span><span className="small faint">{u.suggested.group_name || u.suggested.title_en}</span></div> : <span key="s" className="faint small">None</span>,
        <span key="b" className="row nowrap" style={{ gap: 4 }}>{u.suggested && <Btn sm onClick={() => doLink({ path_key: u.path_key, code: u.suggested.code })}>Link</Btn>}<Btn sm v="ghost" onClick={() => { setErr(null); setCode(""); setLink(u); }}>Other…</Btn><Btn sm v="ghost" onClick={() => doLink({ path_key: u.path_key, ignore: true })}>Ignore</Btn></span>])} /></Card>}
    {tab === "nofiles" && <Card flush><Table minw={760} cols={["Artwork", "School", "Pathway", "Status"]} onRow={i => location.assign(`/entries/${x.noFiles[i].code}`)} rows={x.noFiles.map(e => [<div key="e" className="stack s4"><span className="code">{e.code}</span><span className="small faint">{e.title_en || e.group_name}</span></div>, e.school?.name, `${e.pathway_code} · ${e.sub_code}`, `R${e.current_round} ${e.status}`])} empty="Every artwork has files." /></Card>}
    {tab === "runs" && <Card flush><Table cols={["Started", "Status", "Result"]} rows={x.runs.map(r => [<Two key="t" a={when(r.started_at)} b={r.finished_at ? `took ${secs(r.started_at, r.finished_at)}` : ""} />, <Badge key="s" tone={r.status === "done" ? "ok" : r.status === "failed" ? "bad" : "info"}>{r.status}</Badge>, <span key="r" className="small">{r.summary?.error || r.summary?.note || `${r.summary?.mode === "changes" ? `Changes only: ${fmt(r.summary?.listed || 0)} changes read` : `Full: ${fmt(r.summary?.listed || 0)} items listed`} · ${fmt(r.summary?.files || 0)} files on ${fmt(r.summary?.entries_with_files || 0)} artworks · ${fmt(r.summary?.unmatched_folders || 0)} unmatched`}</span>])} empty="No index has run yet." /></Card>}
    {last && <p className="x-note">Last index {when(last.started_at)}{last.finished_at ? `, finished ${when(last.finished_at)}` : ""}.</p>}
    <Modal open={!!link} title="Link folder to an artwork" sub={link?.path} onClose={() => setLink(null)} footer={<><Btn onClick={() => setLink(null)}>Cancel</Btn><Btn v="primary" disabled={!code.trim()} onClick={() => doLink({ path_key: link.path_key, code })}>Link</Btn></>}>
      {err && <Banner tone="bad" title={err} />}
      <Field label="Artwork code" help="For example VA-PD-0042"><input className="input code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} autoFocus /></Field>
    </Modal>
  </>;
}
