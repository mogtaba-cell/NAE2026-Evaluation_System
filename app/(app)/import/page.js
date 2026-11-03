"use client";
import { useRef, useState } from "react";
import { api, useApi, useMeta, PageHead, Card, Table, Btn, Banner, Kpis, Prog, Loading, when, fmt } from "@/components/ui";

const REQUIRED = ["referenceId", "Submission date", "ArtPathwayNameEn", "ArtSubPathwayNameEn", "School eSIS", "School Name English", "ArtLink"];
const CHUNK = 100;
const dateKey = v => { if (v instanceof Date) return v.getTime(); const t = Date.parse(String(v || "").replace(" ", "T")); return isNaN(t) ? Infinity : t; };

export default function Import() {
  const hist = useApi("/api/import"); const meta = useMeta();
  const [file, setFile] = useState(null); const [rows, setRows] = useState(null); const [err, setErr] = useState(null); const [drag, setDrag] = useState(false);
  const [run, setRun] = useState(null); const inp = useRef(null);
  async function read(f) {
    setErr(null); setRows(null); setRun(null); setFile(f);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // Every column is read as the text shown in Excel (so a GroupName like "6-2" is not turned into a date);
      // only the submission date is read as a real date, to sort and store it.
      const raw = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
      // Excel sometimes turns text such as a group called "6-2" into a date (2 June). Undo that for text columns.
      const undoDate = v => { if (!(v instanceof Date)) return v; const d = new Date(v.getTime() + 12 * 3600e3); return `${d.getMonth() + 1}-${d.getDate()}`; };
      const data = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false }).map((r, i) => {
        const o = { ...r }; for (const k of ["GroupName", "ArtWorkTitleEn", "ArtWorkTitleAr"]) if (raw[i]?.[k] instanceof Date) o[k] = undoDate(raw[i][k]);
        o["Submission date"] = raw[i]?.["Submission date"] ?? r["Submission date"]; return o;
      });
      if (!data.length) throw new Error("The first sheet is empty.");
      const miss = REQUIRED.filter(c => !(c in data[0]));
      if (miss.length) throw new Error(`Missing columns: ${miss.join(", ")}. Use the NAE submissions export as it is.`);
      const out = data.map((r, i) => { const o = { __row: i + 2 }; for (const [k, v] of Object.entries(r)) o[k] = v instanceof Date ? v.toISOString() : v; return o; })
        .filter(r => r.referenceId).sort((a, b) => dateKey(a["Submission date"]) - dateKey(b["Submission date"]));
      setRows(out);
    } catch (e) { setErr(e.message); }
  }
  async function start() {
    const t0 = Date.now(); const batches = Math.ceil(rows.length / CHUNK);
    const st = { done: 0, created: 0, updated: 0, errors: [], newSubs: [], batch: 0, batches, started: t0 }; setRun({ ...st, going: true });
    for (let i = 0; i < rows.length; i += CHUNK) {
      const part = rows.slice(i, i + CHUNK); st.batch++;
      let r = null, err = null;
      // Batches go one after another so entry codes follow submission order. A failed batch is retried once;
      // it is safe to repeat because rows are matched by referenceId.
      for (let attempt = 0; attempt < 2 && !r; attempt++) { try { r = await api("/api/import", { body: { rows: part } }); } catch (e) { err = e; } }
      if (r) { st.created += r.created; st.updated += r.updated; st.errors.push(...r.errors); st.newSubs.push(...(r.newSubs || [])); }
      else st.errors.push({ row: `${part[0].__row}–${part[part.length - 1].__row}`, message: `${err?.message || "Failed"}. Import the file again to finish these rows.` });
      st.done = Math.min(rows.length, i + CHUNK); setRun({ ...st, going: true });
    }
    st.seconds = Math.round((Date.now() - t0) / 1000);
    await api("/api/import", { body: { finish: true, file_name: file.name, rows_total: rows.length, created: st.created, updated: st.updated, errors: st.errors.slice(0, 200) } }).catch(() => {});
    setRun({ ...st, going: false }); hist.reload(); meta?.reload();
  }
  const pw = rows ? Object.entries(rows.reduce((m, r) => { const k = r.ArtPathwayNameEn || "Not given"; m[k] = (m[k] || 0) + 1; return m; }, {})) : [];
  return <>
    <PageHead title="Data import" sub="Upload the submissions export (.xlsx or .csv). New referenceIds become artworks with short codes in submission-date order. Rows already imported only update their details: scores and history are never touched. A POD (People of Determination) column, if the file has one (Yes/No), marks the artwork POD." />
    <Banner title={`Importing into ${meta?.data?.program?.name || "the current program"}`}>Switch program at the top to import into another one. Pathways are matched by name to this program's pathways; new subpathways found in the file are added to them.</Banner>
    {!run && <div className={`drop${drag ? " on" : ""}`} role="button" tabIndex={0} onClick={() => inp.current?.click()} onKeyDown={e => e.key === "Enter" && inp.current?.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) read(f); }}>
      <b className="strong">{file ? file.name : "Drop the export here, or click to choose"}</b><span className="small faint">The file is read in your browser and sent in batches of {CHUNK} rows.</span>
      <input ref={inp} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => e.target.files[0] && read(e.target.files[0])} /></div>}
    {err && <Banner tone="bad" title="This file can't be imported">{err}</Banner>}
    {rows && !run && <Card title={`${fmt(rows.length)} rows ready`} sub="Sorted by submission date so artwork codes follow the order schools submitted." right={<Btn v="primary" onClick={start}>Import {fmt(rows.length)} rows</Btn>}>
      <Table cols={["Pathway", { h: "Rows", cls: "r" }]} rows={pw.map(([k, n]) => [k, <span key="n" className="num">{n}</span>])} />
      <p className="x-note">First submission {String(rows[0]["Submission date"]).slice(0, 16)} · last {String(rows[rows.length - 1]["Submission date"]).slice(0, 16)}. Unknown subpathways are added to their pathway automatically and listed after the import.</p>
    </Card>}
    {run && <Card title={run.going ? `Importing… batch ${run.batch} of ${run.batches}` : `Import finished in ${run.seconds} s`} sub={run.going ? `${Math.round((Date.now() - run.started) / 1000)} s so far · ${CHUNK} rows per batch` : undefined} right={!run.going && <Btn onClick={() => { setRun(null); setRows(null); setFile(null); }}>Import another file</Btn>}>
      <Prog pct={run.done / rows.length * 100} label={`${fmt(run.done)} / ${fmt(rows.length)}`} />
      <Kpis items={[["New artworks", fmt(run.created), "", "ok"], ["Updated", fmt(run.updated), "details only"], ["Rows with errors", run.errors.length, "", run.errors.length ? "warn" : "ok"]]} />
      {run.newSubs.length > 0 && <Banner tone="warn" title="New subpathways were added" action={<Btn sm href="/setup">Program setup</Btn>}>{[...new Set(run.newSubs.map(s => s.name || s))].join(", ")}. Give them a rubric before Round 1 opens.</Banner>}
      {run.errors.length > 0 && <Table cols={["Row", "Problem"]} rows={run.errors.slice(0, 50).map(e => [String(e.row), e.message])} />}
    </Card>}
    <Card title="Import history" flush>{!hist.data ? <Loading error={hist.error} /> : <Table cols={["File", "When", "By", { h: "Rows", cls: "r" }, { h: "New", cls: "r" }, { h: "Updated", cls: "r" }, { h: "Errors", cls: "r" }]} empty="Nothing imported yet." rows={hist.data.history.map(h => [h.file_name, when(h.at), h.by?.display_name || "", fmt(h.rows), fmt(h.created), fmt(h.updated), (h.errors || []).length])} />}</Card>
  </>;
}
