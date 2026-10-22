"use client";
// Submission file viewer. Images load the Drive thumbnail (fast, also works for HEIC) and can switch to the
// full-size file; videos and audio stream through the range proxy; PDFs and converted previews open inline.
import { useEffect, useState, useCallback, useRef } from "react";
import { Btn, Badge } from "@/components/ui";

const TAG = { image: "IMG", heic: "HEIC", video: "VIDEO", audio: "AUDIO", pdf: "PDF", doc: "DOC", other: "FILE" };
const mb = n => n ? (n >= 1048576 ? `${(n / 1048576).toFixed(n > 1e8 ? 0 : 1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`) : "";
const srcUrl = f => `/api/files/${encodeURIComponent(f.id)}`;

function Stage({ f, full, zoom, rot, onErr, err, mediaRef }) {
  if (err) return <div className="fv-state"><b>This file could not be shown</b><span>{err}</span><a className="btn secondary sm" href={srcUrl(f)} target="_blank" rel="noreferrer">Open the source file</a></div>;
  const pk = f.preview ? (/^video/.test(f.previewMime || "") ? "video" : /^audio/.test(f.previewMime || "") ? "audio" : /pdf/.test(f.previewMime || "") ? "pdf" : /^image/.test(f.previewMime || "") ? "image" : f.kind) : f.kind;
  if (f.kind === "image" || f.kind === "heic" || pk === "image") {
    const src = full && f.kind !== "heic" ? srcUrl(f) : (f.thumb ? `${f.thumb}?s=1600` : f.url);
    return <div className="fv-zm" style={{ transform: `scale(${zoom}) rotate(${rot}deg)` }}><img key={src} className="fv-img" src={src} alt={f.name} onError={() => onErr(full ? "The full-size file did not load. Try the standard view." : "No preview image is available for this file yet.")} /></div>;
  }
  if (pk === "video") return <video ref={mediaRef} key={f.url} className="fv-media" src={f.url} poster={f.thumb ? `${f.thumb}?s=1280` : undefined} controls preload="metadata" playsInline onError={() => onErr("The video did not load. It may still be converting, or the format is not supported by this browser.")} />;
  if (pk === "audio") return <div className="fv-state" style={{ maxWidth: 520, width: "100%" }}><b>{f.name}</b><audio ref={mediaRef} key={f.url} src={f.url} controls preload="metadata" style={{ width: "100%" }} onError={() => onErr("The audio did not load.")} /></div>;
  if (pk === "pdf") return <iframe key={f.url} className="fv-frame" src={`${f.url}#view=FitH`} title={f.name} />;
  if (f.kind === "doc") return <div className="fv-state"><b>No preview yet</b><span>Word and PowerPoint files show here after the sync computer converts them to PDF. You can open the source file meanwhile.</span><a className="btn secondary sm" href={srcUrl(f)} target="_blank" rel="noreferrer">Open the source file</a></div>;
  return <div className="fv-state"><b>This file type can't be previewed</b><span>{f.name}</span><a className="btn secondary sm" href={srcUrl(f)} target="_blank" rel="noreferrer">Open the source file</a></div>;
}

export default function FileViewer({ files = [], tall, canDownload, onRefresh, refreshing, checkedAt, title }) {
  const [i, setI] = useState(0); const [zoom, setZoom] = useState(1); const [rot, setRot] = useState(0); const [full, setFull] = useState(false); const [err, setErr] = useState(null);
  const n = files.length; const f = files[Math.min(i, n - 1)];
  const stageRef = useRef(null); const mediaRef = useRef(null); const [rate, setRate] = useState(1);
  useEffect(() => { if (mediaRef.current) { mediaRef.current.defaultPlaybackRate = rate; mediaRef.current.playbackRate = rate; } }, [rate, i]);
  const fullscreen = () => { const el = stageRef.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.().catch(() => {}); };
  useEffect(() => { setI(0); }, [files]);
  useEffect(() => { setZoom(1); setRot(0); setFull(false); setErr(null); }, [i, files]);
  const go = useCallback(d => setI(x => (x + d + n) % n), [n]);
  useEffect(() => {
    const k = e => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable) return; if (e.key === "ArrowLeft" && n > 1) go(-1); if (e.key === "ArrowRight" && n > 1) go(1); };
    document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k);
  }, [go, n]);
  if (!n) return <div className={`fv${tall ? " tall" : ""}`}><div className="fv-stage"><div className="fv-state"><b>No files found for this entry</b><span>The school's folder is empty or has not been matched yet. Files are checked again every 10 minutes.</span>{onRefresh && <Btn sm onClick={onRefresh} busy={refreshing}>Check again now</Btn>}</div></div></div>;
  const isImg = ["image", "heic"].includes(f.kind) || /^image/.test(f.previewMime || "");
  const media = ["video", "audio"].includes(f.kind);
  return <div className={`fv${tall ? " tall" : ""}`}>
    <div className="fv-bar">
      <div className="nm"><b title={f.name}>{f.name}</b><span>{title ? `${title} · ` : ""}File {Math.min(i, n - 1) + 1} of {n}{f.size ? ` · ${mb(f.size)}` : ""}{f.preview ? " · converted preview" : ""}</span></div>
      <div className="fv-tools">
        {isImg && <><Btn sm v="ghost" title="Zoom out" onClick={() => setZoom(z => Math.max(.5, +(z - .25).toFixed(2)))}>−</Btn><span className="zl">{Math.round(zoom * 100)}%</span><Btn sm v="ghost" title="Zoom in" onClick={() => setZoom(z => Math.min(4, +(z + .25).toFixed(2)))}>+</Btn><Btn sm v="ghost" title="Rotate" onClick={() => setRot(r => (r + 90) % 360)}>⟳</Btn><span className="vr" />
          {f.kind !== "heic" && <Btn sm v={full ? "primary" : "ghost"} onClick={() => { setFull(x => !x); setErr(null); }} title="Load the original at full resolution">{full ? "Full size" : "Standard"}</Btn>}</>}
        {media && <select className="select" style={{ height: 28, width: 74, fontSize: 12 }} value={rate} onChange={e => setRate(+e.target.value)} aria-label="Playback speed">{[0.75, 1, 1.25, 1.5, 2].map(r => <option key={r} value={r}>{r}×</option>)}</select>}
        <Btn sm v="ghost" title="Full screen" onClick={fullscreen}>⛶</Btn>
        <a className="btn ghost sm" href={srcUrl(f)} target="_blank" rel="noreferrer" title="Open the source file in a new tab">Source ↗</a>
        {canDownload && <a className="btn ghost sm" href={f.original} title="Download the original">Download</a>}
      </div>
    </div>
    <div ref={stageRef} className={`fv-stage${media ? " media" : ""}`}>
      <Stage f={f} full={full} zoom={zoom} rot={rot} err={err} onErr={setErr} mediaRef={mediaRef} />
      {n > 1 && <><span className="fv-nav l"><Btn sm title="Previous file" onClick={() => go(-1)}>‹</Btn></span><span className="fv-nav r"><Btn sm title="Next file" onClick={() => go(1)}>›</Btn></span></>}
    </div>
    {n > 1 && <div className="fv-strip" role="listbox" aria-label="Files">{files.map((x, j) => <button key={x.id} type="button" className={`fv-th${j === i ? " on" : ""}`} onClick={() => setI(j)} aria-selected={j === i} title={x.name}>
      <span className={`tb${["video", "audio"].includes(x.kind) ? " dark" : ""}`}>{x.thumb ? <img src={`${x.thumb}?s=220`} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.style.display = "none"; }} /> : <span className="doc"><i /><i /><i /></span>}<span className="ty">{TAG[x.kind] || "FILE"}</span></span>
      <span className="nm">{x.name}</span></button>)}</div>}
    <div className="fv-foot"><span title={f.path}>{f.path ? `Drive: ${f.path}` : ""}</span><span className="sp" />{checkedAt && <span>Checked {checkedAt}</span>}{onRefresh && <Btn sm v="ghost" onClick={onRefresh} busy={refreshing}>Check for new files</Btn>}</div>
  </div>;
}
