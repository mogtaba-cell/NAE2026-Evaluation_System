"use client";
// Submission file viewer.
// - Images and HEIC photos show Google Drive's resized copy (fast); "Full size" asks for a 3200 px copy.
// - Videos and audio stream in 4 MB pieces (the player asks for them as it plays).
// - PDFs and converted previews are fetched in pieces and shown inline.
// - "Source" opens the original file; "Download" saves it, in pieces, so large videos work too.
import { useEffect, useState, useCallback, useRef } from "react";
import { Btn, Prog } from "@/components/ui";
import { fetchBlob, downloadFile } from "@/components/fetchFile";

const TAG = { image: "IMG", heic: "HEIC", video: "VIDEO", audio: "AUDIO", pdf: "PDF", doc: "DOC", other: "FILE" };
const CH = 4 * 1000 * 1000;
const mb = n => n ? (n >= 1048576 ? `${(n / 1048576).toFixed(n > 1e8 ? 0 : 1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`) : "";
const srcUrl = f => `/api/files/${encodeURIComponent(f.id)}`;
const kindShown = f => {
  if (!f.preview) return f.kind;
  const m = f.previewMime || "";
  return /^video/.test(m) ? "video" : /^audio/.test(m) ? "audio" : /pdf/.test(m) ? "pdf" : /^image/.test(m) ? "image" : f.kind;
};

function PdfStage({ f, onErr }) {
  const [state, setState] = useState({ url: null, got: 0, total: 0 });
  useEffect(() => {
    let alive = true, made = null;
    setState({ url: null, got: 0, total: 0 });
    fetchBlob(f.url, (got, total) => alive && setState(s => ({ ...s, got, total })))
      .then(b => { if (!alive) return; made = URL.createObjectURL(new Blob([b], { type: "application/pdf" })); setState(s => ({ ...s, url: made })); })
      .catch(e => alive && onErr(e.message));
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [f.url]); // eslint-disable-line
  if (!state.url) return <div className="fv-state"><b>Loading document…</b>{state.total > CH && <Prog pct={state.got / state.total * 100} label={`${mb(state.got)} of ${mb(state.total)}`} />}</div>;
  return <iframe className="fv-frame" src={`${state.url}#view=FitH`} title={f.name} />;
}

function Stage({ f, full, zoom, rot, onErr, err, mediaRef, onNotice }) {
  if (err) return <div className="fv-state"><b>This file could not be shown</b><span>{err}</span></div>;
  const k = kindShown(f);
  if (k === "image" || f.kind === "heic") {
    const src = f.thumb ? `${f.thumb}?s=${full ? 3200 : 1600}` : f.url;
    return <div className="fv-zm" style={{ transform: `scale(${zoom}) rotate(${rot}deg)` }}><img key={src} className="fv-img" src={src} alt={f.name} onError={() => onErr(f.thumb ? "Google Drive has not made a preview of this image yet. Use Source or Download to see the original." : "The image did not load.")} /></div>;
  }
  if (k === "video") return <video ref={mediaRef} key={f.url} className="fv-media" src={f.url} poster={f.thumb ? `${f.thumb}?s=1280` : undefined} controls preload="metadata" playsInline
    onLoadedMetadata={e => onNotice(e.currentTarget.videoWidth === 0 ? (f.preview ? "This file has sound only: the school's original has no picture. Check the other files of this entry for the video." : "Only the sound of this video can play in the browser: its picture is in a format browsers can't show. A converted preview will appear here automatically; meanwhile use Download to watch the original.") : null)}
    onError={() => onErr(f.preview ? "The video did not load. Try again in a moment." : "This video can't play in the browser yet (often an iPhone .mov). A 720p preview is made by the sync computer; meanwhile use Download to watch the original.")} />;
  if (k === "audio") return <div className="fv-state" style={{ maxWidth: 520, width: "100%" }}><b>{f.name}</b><audio ref={mediaRef} key={f.url} src={f.url} controls preload="metadata" style={{ width: "100%" }} onError={() => onErr("The audio did not load.")} /></div>;
  if (k === "pdf") return <PdfStage f={f} onErr={onErr} />;
  if (f.kind === "doc") return <div className="fv-state"><b>Preview being prepared</b><span>Word and PowerPoint files show here once the sync computer has converted them to PDF. Use Download to open the original meanwhile.</span></div>;
  return <div className="fv-state"><b>No preview for this file type</b><span>{f.name}. Use Download to open it.</span></div>;
}

export default function FileViewer({ files = [], tall, canDownload = true, onRefresh, refreshing, checkedAt, title }) {
  const [i, setI] = useState(0); const [zoom, setZoom] = useState(1); const [rot, setRot] = useState(0); const [full, setFull] = useState(false); const [err, setErr] = useState(null);
  const [job, setJob] = useState(null); // { what, got, total }
  const [notice, setNotice] = useState(null);
  const n = files.length; const f = files[Math.min(i, n - 1)];
  const stageRef = useRef(null); const mediaRef = useRef(null); const [rate, setRate] = useState(1);
  useEffect(() => { if (mediaRef.current) { mediaRef.current.defaultPlaybackRate = rate; mediaRef.current.playbackRate = rate; } }, [rate, i]);
  const fullscreen = () => { const el = stageRef.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.().catch(() => {}); };
  useEffect(() => { setI(0); }, [files]);
  useEffect(() => { setZoom(1); setRot(0); setFull(false); setErr(null); setNotice(null); }, [i, files]);
  const go = useCallback(d => setI(x => (x + d + n) % n), [n]);
  useEffect(() => {
    const k = e => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable) return; if (e.key === "ArrowLeft" && n > 1) go(-1); if (e.key === "ArrowRight" && n > 1) go(1); };
    document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k);
  }, [go, n]);
  if (!n) return <div className={`fv${tall ? " tall" : ""}`}><div className="fv-stage"><div className="fv-state"><b>No files found for this entry</b><span>The school's folder is empty or has not been matched yet. Files are checked again every 10 minutes.</span>{onRefresh && <Btn sm onClick={onRefresh} busy={refreshing}>Check again now</Btn>}</div></div></div>;

  const k = kindShown(f);
  const isImg = k === "image" || f.kind === "heic";
  const media = k === "video" || k === "audio";
  const progress = (what) => (got, total) => setJob({ what, got, total });
  async function openSource() {
    // Small files and media open directly; large documents and images are fetched in pieces first.
    if (["video", "audio"].includes(f.kind) || (f.size && f.size <= CH)) { window.open(srcUrl(f), "_blank", "noopener"); return; }
    const w = window.open("", "_blank");
    try { setJob({ what: "Opening", got: 0, total: f.size || 0 }); const b = await fetchBlob(srcUrl(f), progress("Opening")); const u = URL.createObjectURL(b); if (w) w.location = u; else window.open(u, "_blank"); }
    catch (e) { if (w) w.close(); setErr(e.message); } finally { setJob(null); }
  }
  async function download() {
    try { setJob({ what: "Downloading", got: 0, total: f.size || 0 }); await downloadFile(srcUrl(f), f.name, progress("Downloading")); }
    catch (e) { setErr(`Download failed: ${e.message}`); } finally { setJob(null); }
  }
  return <div className={`fv${tall ? " tall" : ""}`}>
    <div className="fv-bar">
      <div className="nm"><b title={f.name}>{f.name}</b><span>{title ? `${title} · ` : ""}File {Math.min(i, n - 1) + 1} of {n}{f.size ? ` · ${mb(f.size)}` : ""}{f.preview ? " · showing the converted preview" : ""}</span></div>
      <div className="fv-tools">
        {isImg && <><Btn sm v="ghost" title="Zoom out" onClick={() => setZoom(z => Math.max(.5, +(z - .25).toFixed(2)))}>−</Btn><span className="zl">{Math.round(zoom * 100)}%</span><Btn sm v="ghost" title="Zoom in" onClick={() => setZoom(z => Math.min(4, +(z + .25).toFixed(2)))}>+</Btn><Btn sm v="ghost" title="Rotate" onClick={() => setRot(r => (r + 90) % 360)}>⟳</Btn><span className="vr" />
          {f.thumb && <Btn sm v={full ? "primary" : "ghost"} onClick={() => { setFull(x => !x); setErr(null); }} title="Show a larger, sharper copy">{full ? "Full size" : "Standard"}</Btn>}</>}
        {media && <select className="select" style={{ height: 28, width: 74, fontSize: 12 }} value={rate} onChange={e => setRate(+e.target.value)} aria-label="Playback speed">{[0.75, 1, 1.25, 1.5, 2].map(r => <option key={r} value={r}>{r}×</option>)}</select>}
        <Btn sm v="ghost" title="Full screen" onClick={fullscreen}>⛶</Btn>
        <Btn sm v="ghost" title="Open the original file in a new tab" onClick={openSource} disabled={!!job}>Source ↗</Btn>
        {canDownload && <Btn sm v="ghost" title="Save the original file" onClick={download} disabled={!!job}>Download</Btn>}
      </div>
    </div>
    {job && <div className="row nowrap" style={{ gap: 8 }}><span className="small faint" style={{ whiteSpace: "nowrap" }}>{job.what} {f.name}</span><Prog pct={job.total ? job.got / job.total * 100 : 0} label={job.total ? `${mb(job.got)} of ${mb(job.total)}` : mb(job.got)} /></div>}
    <div ref={stageRef} className={`fv-stage${media ? " media" : ""}`}>
      <Stage f={f} full={full} zoom={zoom} rot={rot} err={err} onErr={setErr} mediaRef={mediaRef} onNotice={setNotice} />
      {notice && <div style={{ position: "absolute", left: 12, right: 12, top: 12, zIndex: 3, background: "rgba(23,26,25,.85)", color: "#fff", borderRadius: 8, padding: "8px 12px", fontSize: 13, lineHeight: "18px" }}>{notice}</div>}
      {n > 1 && <><span className="fv-nav l"><Btn sm title="Previous file" onClick={() => go(-1)}>‹</Btn></span><span className="fv-nav r"><Btn sm title="Next file" onClick={() => go(1)}>›</Btn></span></>}
    </div>
    {n > 1 && <div className="fv-strip" role="listbox" aria-label="Files">{files.map((x, j) => <button key={x.id} type="button" className={`fv-th${j === i ? " on" : ""}`} onClick={() => setI(j)} aria-selected={j === i} title={x.name}>
      <span className={`tb${["video", "audio"].includes(x.kind) ? " dark" : ""}`}>{x.thumb ? <img src={`${x.thumb}?s=220`} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.style.display = "none"; }} /> : <span className="doc"><i /><i /><i /></span>}<span className="ty">{TAG[x.kind] || "FILE"}</span></span>
      <span className="nm">{x.name}</span></button>)}</div>}
    <div className="fv-foot"><span title={f.path}>{f.path ? `Drive: ${f.path}` : ""}</span><span className="sp" />{checkedAt && <span>Checked {checkedAt}</span>}{onRefresh && <Btn sm v="ghost" onClick={onRefresh} busy={refreshing}>Check for new files</Btn>}</div>
  </div>;
}
