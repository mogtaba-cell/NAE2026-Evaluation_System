"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, useApi, useMeta, useToast, PageHead, Card, Btn, Badge, Banner, Loading, Field, Seg, Kpis, Search, when } from "@/components/ui";
import FileViewer from "@/components/FileViewer";
import { sizeCm, parseSize } from "@/lib/size";

// Proofreading and the final review of the selected artworks. The list on the left, the artwork's files in the middle,
// its text and details on the right. Proofreaders correct and pass each artwork on; reviewers confirm or send back.
// It runs alongside the artworks handling (framing, printing ...) and doesn't hold it up.
const TONE = { to_proofread: "warn", to_review: "info", confirmed: "ok" };
const REFL = [["influence", "Did anyone or anything influence your idea?"], ["enjoy", "What was the most enjoyable part of creating your work?"], ["focus", "What elements did you focus on, and why?"]];
export default function Proofreading() {
  const sp = useSearchParams(); const router = useRouter(); const meta = useMeta();
  const role = meta?.data?.me?.role;
  const def = role === "reviewer" ? "to_review" : "to_proofread";
  const status = sp.get("status") || def; const sel = sp.get("code"); const [q, setQ0] = useState("");
  const d = useApi("/api/proof", [], { live: 20000 });
  const setQ = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== "code") n.delete("code"); router.replace(`/proofreading?${n}`, { scroll: false }); };
  const t = q.trim().toLowerCase();
  const rows = (d.data?.rows || []).filter(r => (status === "all" || r.status === status) && (!t || [r.code, r.title, r.title_ar, r.school].some(v => String(v || "").toLowerCase().includes(t))));
  const code = sel || rows[0]?.code || null;
  useEffect(() => { if (!sel && rows[0]?.code) router.replace(`/proofreading?${new URLSearchParams({ ...Object.fromEntries(sp), code: rows[0].code })}`, { scroll: false }); }, [sel, rows[0]?.code]); // eslint-disable-line
  if (!d.data || !meta?.data) return <Loading error={d.error} />;
  const all = d.data.rows; const n = s => all.filter(r => r.status === s).length;
  return <>
    <PageHead title={role === "reviewer" ? "Final review" : "Proofreading and review"} sub="The selected artworks' titles, descriptions, reflections, students and other details. Proofreaders correct them and pass each artwork to the reviewers, who confirm the data or send it back with a note. This runs alongside framing, printing and the other handling." />
    <Kpis dense items={[["Selected artworks", all.length], ["To proofread", n("to_proofread"), "", n("to_proofread") ? "warn" : ""], ["To review", n("to_review"), "", n("to_review") ? "info" : ""], ["Confirmed", n("confirmed"), all.length ? `${Math.round(100 * n("confirmed") / all.length)}%` : "", "ok"]]} />
    {!all.length ? <Card><p className="muted" style={{ margin: 0 }}>No selected artworks yet. They appear here once Round 2 results are in.</p></Card> :
    <div className="f3-sc f3-sess rv-ws">
      <section className="card f3-queue">
        <div className="qh"><Seg value={status} onChange={v => setQ("status", v)} items={[["to_proofread", `To proofread ${n("to_proofread")}`], ["to_review", `To review ${n("to_review")}`], ["confirmed", "Confirmed"], ["all", "All"]]} />
          <Search value={q} onChange={setQ0} placeholder="Code, title or school" /></div>
        <div className="qb">{rows.map(r => <div key={r.code} role="button" tabIndex={0} className={`f3-qi${r.code === code ? " on" : ""}`} onClick={() => setQ("code", r.code)} onKeyDown={k => k.key === "Enter" && setQ("code", r.code)}>
          <div className="t tf"><b dir="auto">{r.title || "Untitled"}</b><span className="cd">{r.code} · {r.school}</span>
            <span className="rv-who"><Badge tone={TONE[r.status]}>{d.data.statuses[r.status]}</Badge>{r.review_note && r.status === "to_proofread" ? <span> sent back</span> : null}</span></div></div>)}
          {!rows.length && <p className="small faint" style={{ padding: 12 }}>Nothing here.</p>}</div>
      </section>
      {code ? <Detail key={code} code={code} role={role} rows={rows} onDone={next => { d.reload(); if (next) setQ("code", next); }} /> : <><div /><div /></>}
    </div>}
  </>;
}

function Detail({ code, role, rows, onDone }) {
  const d = useApi(`/api/proof?entry=${encodeURIComponent(code)}`); const toast = useToast();
  const [f, setF] = useState(null); const [st, setSt] = useState(null); const [dim, setDim] = useState(null); const [note, setNote] = useState(""); const [busy, setBusy] = useState(null); const [err, setErr] = useState(null);
  useEffect(() => { if (!d.data) return; const e = d.data.entry;
    setF({ title_en: e.title_en || "", title_ar: e.title_ar || "", description_en: e.description_en || "", description_ar: e.description_ar || "", group_name: e.group_name || "", medium: e.medium || "", reflections: { influence: e.reflections?.influence || "", enjoy: e.reflections?.enjoy || "", focus: e.reflections?.focus || "" } });
    setSt(d.data.students.map(s => ({ ...s, name_en: s.name_en || "", name_ar: s.name_ar || "", grade: s.grade || "" }))); setDim(parseSize(e.size_text) || { L: "", B: "", W: "" }); setNote(""); setErr(null);
  }, [d.data]);
  if (!d.data || !f || !st) return <><div className="stack" style={{ minWidth: 0 }}><Loading error={d.error} /></div><div /></>;
  const { entry: e, proof: p } = d.data;
  const locked = p.status === "confirmed" && !["admin", "management"].includes(role);
  const canProof = ["admin", "management", "proofreader"].includes(role), canRev = ["admin", "management", "reviewer"].includes(role);
  const next = () => { const i = rows.findIndex(r => r.code === code); return (rows.slice(i + 1)[0] || rows.find(r => r.code !== code))?.code || null; };
  const set = (k, v) => setF({ ...f, [k]: v });
  async function save(quiet) {
    const body = { ...f }; const sz = sizeCm(dim.L, dim.B, dim.W); if (sz && sz !== e.size_text) body.size_text = sz;
    if (e.competition) { delete body.medium; delete body.reflections; delete body.size_text; }
    await api(`/api/entries/${encodeURIComponent(code)}`, { method: "PATCH", body: { details: body } });
    if (st.some((s, i) => ["name_en", "name_ar", "grade"].some(k => s[k] !== (d.data.students[i][k] || "")))) await api("/api/proof", { body: { action: "students", code, students: st } });
    if (!quiet) toast("Saved");
  }
  async function go(action) {
    setBusy(action); setErr(null);
    try { if (action !== "save") await save(true); else { await save(); d.reload(); setBusy(null); return; }
      const r = await api("/api/proof", { body: { action, code, note } }); toast(r.note); onDone(action === "reopen" ? null : next()); d.reload(); }
    catch (x) { setErr(x.message); } setBusy(null);
  }
  const txt = (k, label, ar, rows_ = 1) => <Field label={label}>{rows_ > 1 ? <textarea className="textarea" rows={rows_} dir={ar ? "rtl" : "auto"} disabled={locked} value={f[k]} onChange={x => set(k, x.target.value)} /> : <input className="input" dir={ar ? "rtl" : "auto"} disabled={locked} value={f[k]} onChange={x => set(k, x.target.value)} />}</Field>;
  return <>
    <div className="stack sticky-view" style={{ gap: 12, minWidth: 0 }}>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><span className="code" style={{ fontSize: 15, fontWeight: 600 }}>{e.code}</span><Badge>{e.pathway}</Badge><Badge>{e.sub}</Badge><Badge tone={TONE[p.status]}>{({ to_proofread: "To proofread", to_review: "To review", confirmed: "Confirmed" })[p.status]}</Badge></div>
      <FileViewer files={d.data.files || []} tall />
      <span className="small faint">{e.school?.name}{e.school?.esis ? ` · eSIS ${e.school.esis}` : ""}</span>
    </div>
    <div className="stack" style={{ gap: 14, minWidth: 0 }}>
      {p.review_note && p.status === "to_proofread" && <Banner tone="warn" title="Sent back by the reviewer">{`${p.reviewed_by || "Reviewer"} ${when(p.reviewed_at)}: “${p.review_note}”`}</Banner>}
      {p.status !== "to_proofread" && <p className="small faint" style={{ margin: 0 }}>Proofread by {p.proofread_by || "–"} {p.proofread_at ? when(p.proofread_at) : ""}{p.proof_note ? ` · “${p.proof_note}”` : ""}{p.status === "confirmed" ? ` · confirmed by ${p.reviewed_by} ${when(p.reviewed_at)}${p.review_note ? ` · “${p.review_note}”` : ""}` : ""}</p>}
      {err && <Banner tone="bad" title={err} />}
      <Card title="Title and description">
        <div className="stack" style={{ gap: 10 }}>{txt("title_en", "Title (English)")}{txt("title_ar", "Title (Arabic)", true)}{txt("description_en", "Description (English)", false, 4)}{txt("description_ar", "Description (Arabic)", true, 4)}</div>
      </Card>
      {!e.competition && <Card title="Students' answers">
        <div className="stack" style={{ gap: 10 }}>{REFL.map(([k, l]) => <Field key={k} label={l}><textarea className="textarea" rows={3} dir="auto" disabled={locked} value={f.reflections[k]} onChange={x => setF({ ...f, reflections: { ...f.reflections, [k]: x.target.value } })} /></Field>)}</div>
      </Card>}
      <Card title="Students and details">
        <div className="stack" style={{ gap: 10 }}>
          {(e.registration_type === "Group" || e.group_name) && txt("group_name", "Group name")}
          {st.map((s, i) => <div key={s.id} className="pr-stu"><Field label={`Student ${i + 1} (English)`}><input className="input" disabled={locked} value={s.name_en} onChange={x => { const n = [...st]; n[i] = { ...s, name_en: x.target.value }; setSt(n); }} /></Field>
            <Field label="Arabic"><input className="input" dir="rtl" disabled={locked} value={s.name_ar} onChange={x => { const n = [...st]; n[i] = { ...s, name_ar: x.target.value }; setSt(n); }} /></Field>
            <Field label="Grade"><input className="input" disabled={locked} value={s.grade} onChange={x => { const n = [...st]; n[i] = { ...s, grade: x.target.value }; setSt(n); }} /></Field></div>)}
          {!e.competition && <>{txt("medium", "Medium")}
            <Field label="Size (cm): length × breadth × width"><div className="row" style={{ gap: 6 }}>{["L", "B", "W"].map(k => <input key={k} className="input" style={{ width: 90 }} inputMode="decimal" disabled={locked} value={dim[k]} placeholder={k} onChange={x => setDim({ ...dim, [k]: x.target.value.replace(/[^0-9.]/g, "").slice(0, 6) })} />)}</div></Field></>}
        </div>
      </Card>
      <Card title={p.status === "to_review" ? "Final review" : p.status === "confirmed" ? "Confirmed" : "Proofreading"}>
        {!locked && <Field label={p.status === "to_review" ? "Note (needed to send back)" : "Note (optional)"}><textarea className="textarea" rows={2} value={note} onChange={x => setNote(x.target.value)} /></Field>}
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {!locked && <Btn busy={busy === "save"} onClick={() => go("save")}>Save changes</Btn>}<span className="sp" />
          {p.status === "to_proofread" && canProof && <Btn v="primary" busy={busy === "done"} onClick={() => go("done")}>Done: pass to the review</Btn>}
          {p.status === "to_review" && canRev && <><Btn busy={busy === "send_back"} disabled={!note.trim()} onClick={() => go("send_back")}>Send back</Btn><Btn v="primary" busy={busy === "confirm"} onClick={() => go("confirm")}>Confirm the data</Btn></>}
          {p.status === "confirmed" && ["admin", "management"].includes(role) && <Btn busy={busy === "reopen"} onClick={() => go("reopen")}>Reopen</Btn>}
        </div>
      </Card>
    </div>
  </>;
}
