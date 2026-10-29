"use client";
import { useState } from "react";
import { api, useApi, useToast, PageHead, Card, Table, Btn, Badge, Banner, Loading, Kpis, Tabs, Modal, Field, when, fmt, Prog } from "@/components/ui";

export default function Files() {
  const d = useApi("/api/files/index"); const toast = useToast();
  const [tab, setTab] = useState("unmatched"); const [run, setRun] = useState(null); const [link, setLink] = useState(null); const [code, setCode] = useState(""); const [err, setErr] = useState(null);
  if (!d.data) return <Loading error={d.error} />;
  const x = d.data;
  async function index() {
    setRun({ phase: "list", listed: 0 }); let r = await api("/api/files/index", { body: { action: "start" } }).catch(e => { toast(e.message, "err"); return null; });
    while (r && !r.done) { setRun({ phase: r.run.state?.phase, listed: r.run.summary?.listed || 0 }); r = await api("/api/files/index", { body: { runId: r.run.id } }).catch(e => { toast(e.message, "err"); return null; }); }
    if (r) toast(`Index finished: ${fmt(r.run.summary?.files || 0)} files on ${fmt(r.run.summary?.entries_with_files || 0)} entries`);
    setRun(null); d.reload();
  }
  async function doLink(body) { setErr(null); try { const r = await api("/api/files/link", { body }); toast(r.note); setLink(null); setCode(""); d.reload(); } catch (e) { setErr(e.message); } }
  const last = x.runs[0];
  return <>
    <PageHead title="Submission files" sub="How files reach evaluators: the sync computer copies SharePoint into the GVC Shared Drive (01 Submissions) and converts videos, HEIC photos and Word/PowerPoint into small previews (02 Previews). The index below matches every folder to its artwork using the ArtLink. Artworks also look up their own folder on first open, so new uploads show up within 10 minutes." actions={<Btn v="primary" busy={!!run} disabled={!x.configured || x.mock} onClick={index}>Run index now</Btn>} />
    {!x.configured && <Banner tone="warn" title="Google Drive is not connected yet">Create the read-only service account, add it as Viewer on the Shared Drive and set GOOGLE_SERVICE_ACCOUNT_JSON in Vercel. Until then files can't be shown.</Banner>}
    {x.check && !x.check.ok && <Banner tone="bad" title="The website can't read the Shared Drive">{x.check.error}</Banner>}
    {x.check?.ok && !x.mock && <Banner tone="ok" title={`Connected to the Shared Drive "${x.check.drive}"`}>Reading as {x.check.email}.</Banner>}
    {x.mock && <Banner title="Test mode">Files are generated test images (DRIVE_MOCK=1). Switch it off once the Drive is connected.</Banner>}
    {run && <Card title={run.phase === "match" ? "Matching folders to artworks…" : "Listing the Shared Drive…"}><Prog pct={run.phase === "match" ? 85 : 40} label={`${fmt(run.listed)} items`} /></Card>}
    <Kpis items={[["Artworks with files", fmt(x.withFiles), "", "ok"], ["Artworks without files", fmt(x.noFilesCount), "folder empty or not matched", x.noFilesCount ? "warn" : "ok"], ["Files", fmt(x.files), Object.entries(x.kinds).map(([k, n]) => `${n} ${k}`).join(" · ")], ["Converted previews", fmt(x.previews), "videos, HEIC, documents"], ["Unmatched folders", x.unmatched.length, "", x.unmatched.length ? "warn" : "ok"]]} />
    <Tabs value={tab} onChange={setTab} items={[["unmatched", "Unmatched folders", x.unmatched.length], ["nofiles", "Artworks without files", x.noFilesCount], ["runs", "Index runs", x.runs.length]]} />
    {tab === "unmatched" && <Card flush sub="Folders in 01 Submissions that no artwork points to. Link each one to its artwork, or ignore it.">
      <Table minw={900} cols={["Folder", { h: "Files", cls: "r" }, "Why", "Suggested artwork", ""]} empty="Every folder is matched." rows={x.unmatched.map(u => [<span key="p" className="code small" style={{ overflowWrap: "anywhere" }}>{u.path}</span>, u.files_count, <span key="w" className="small">{u.reason}</span>,
        u.suggested ? <div key="s" className="stack s4"><span className="code">{u.suggested.code}</span><span className="small faint">{u.suggested.group_name || u.suggested.title_en}</span></div> : <span key="s" className="faint small">None</span>,
        <span key="b" className="row nowrap" style={{ gap: 4 }}>{u.suggested && <Btn sm onClick={() => doLink({ path_key: u.path_key, code: u.suggested.code })}>Link</Btn>}<Btn sm v="ghost" onClick={() => { setErr(null); setCode(""); setLink(u); }}>Other…</Btn><Btn sm v="ghost" onClick={() => doLink({ path_key: u.path_key, ignore: true })}>Ignore</Btn></span>])} /></Card>}
    {tab === "nofiles" && <Card flush><Table minw={760} cols={["Artwork", "School", "Pathway", "Status"]} onRow={i => location.assign(`/entries/${x.noFiles[i].code}`)} rows={x.noFiles.map(e => [<div key="e" className="stack s4"><span className="code">{e.code}</span><span className="small faint">{e.title_en || e.group_name}</span></div>, e.school?.name, `${e.pathway_code} · ${e.sub_code}`, `R${e.current_round} ${e.status}`])} empty="Every artwork has files." /></Card>}
    {tab === "runs" && <Card flush><Table cols={["Started", "Status", "Result"]} rows={x.runs.map(r => [when(r.started_at), <Badge key="s" tone={r.status === "done" ? "ok" : r.status === "failed" ? "bad" : "info"}>{r.status}</Badge>, <span key="r" className="small">{r.summary?.error || r.summary?.note || `${fmt(r.summary?.listed || 0)} items listed · ${fmt(r.summary?.files || 0)} files on ${fmt(r.summary?.entries_with_files || 0)} artworks · ${fmt(r.summary?.unmatched_folders || 0)} unmatched`}</span>])} empty="No index has run yet." /></Card>}
    {last && <p className="x-note">Last index {when(last.started_at)}{last.finished_at ? `, finished ${when(last.finished_at)}` : ""}.</p>}
    <Modal open={!!link} title="Link folder to an artwork" sub={link?.path} onClose={() => setLink(null)} footer={<><Btn onClick={() => setLink(null)}>Cancel</Btn><Btn v="primary" disabled={!code.trim()} onClick={() => doLink({ path_key: link.path_key, code })}>Link</Btn></>}>
      {err && <Banner tone="bad" title={err} />}
      <Field label="Artwork code" help="For example VA-PD-0042"><input className="input code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} autoFocus /></Field>
    </Modal>
  </>;
}
