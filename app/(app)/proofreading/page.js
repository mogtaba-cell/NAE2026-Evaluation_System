"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, useApi, useMeta, useToast, PageHead, Card, Btn, Badge, Banner, Loading, Field, Seg, Kpis, Search, Modal, Check, when } from "@/components/ui";
import FileViewer from "@/components/FileViewer";
import { sizeCm, parseSize } from "@/lib/size";

// Proofreading and the final review of the selected artworks, by assignment. Each proofreader sees the artworks
// given to them; when one is proofread it goes to their linked reviewer, who compares it with the text as it came
// in, then confirms, sends it back, or sends it to the coordinator. A mismatch between the artwork and its details
// (or missing / inappropriate text) goes to the coordinator, who asks the school (Corrections).
const TONE = { to_proofread: "warn", with_coordinator: "bad", to_review: "info", confirmed: "ok", not_scored: "" };
const REFL = [["influence", "Did anyone or anything influence your idea?"], ["enjoy", "What was the most enjoyable part of creating your work?"], ["focus", "What elements did you focus on, and why?"]];
const CORR = [["artwork_mismatch", "Artwork and details mismatch", "The artwork doesn't match its title, description or answers: the school sends the right artwork images (no response: not scored)."], ["incomplete_narrative", "Incomplete narrative", "Title, description or answers are blank, missing or incomplete (no response: the pathway's default text)."], ["inappropriate", "Inappropriate / flagged content", "Sensitive or guideline-breaking text (no response: the pathway's default text)."]];
export default function Proofreading() {
  const sp = useSearchParams(); const router = useRouter(); const meta = useMeta();
  const role = meta?.data?.me?.role; const boss = ["admin", "management"].includes(role);
  const def = role === "reviewer" ? "to_review" : role === "proofreader" ? "to_proofread" : "all";
  const status = sp.get("status") || def; const sel = sp.get("code"); const who = sp.get("who") || ""; const [q, setQ0] = useState(""); const [links, setLinks] = useState(false);
  const d = useApi("/api/proof", [], { live: 20000 });
  const setQ = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== "code") n.delete("code"); router.replace(`/proofreading?${n}`, { scroll: false }); };
  const t = q.trim().toLowerCase();
  const rows = (d.data?.rows || []).filter(r => (status === "all" || r.status === status) && (!who || r.proofreader_id === who || r.reviewer_id === who) && (!t || [r.code, r.title, r.title_ar, r.school].some(v => String(v || "").toLowerCase().includes(t))));
  const code = sel || rows[0]?.code || null;
  useEffect(() => { if (!sel && rows[0]?.code) router.replace(`/proofreading?${new URLSearchParams({ ...Object.fromEntries(sp), code: rows[0].code })}`, { scroll: false }); }, [sel, rows[0]?.code]); // eslint-disable-line
  if (!d.data || !meta?.data) return <Loading error={d.error} />;
  const all = d.data.rows; const n = s => all.filter(r => r.status === s).length;
  const people = d.data.people || [];
  return <>
    <PageHead title={role === "reviewer" ? "Final review" : role === "proofreader" ? "Proofreading" : "Proofreading and review"} sub={role === "reviewer" ? "Artworks your proofreaders finished. Compare the text with how it came in, correct anything left, then confirm it, send it back to the proofreader, or send it to the coordinator if the school has to fix something." : role === "proofreader" ? "The selected artworks given to you. Correct the titles, descriptions and students' answers, then pass each one to the review. If the artwork and its details don't match, or text is missing, send it to the coordinator to ask the school." : "Each selected artwork is given to one proofreader, then to a reviewer linked to that proofreader. Corrections from the school go through the coordinators. This runs alongside framing, printing and the other handling."}
      actions={boss && <Btn onClick={() => setLinks(true)}>Reviewers and proofreaders</Btn>} />
    <Kpis dense items={[[role === "proofreader" || role === "reviewer" ? "Given to you" : "Selected artworks", all.length], ["To proofread", n("to_proofread"), "", n("to_proofread") ? "warn" : ""], ["With the coordinator", n("with_coordinator"), "waiting on the school", n("with_coordinator") ? "bad" : ""], ["To review", n("to_review"), "", n("to_review") ? "info" : ""], ["Confirmed", n("confirmed"), all.length ? `${Math.round(100 * n("confirmed") / all.length)}%` : "", "ok"]]} />
    {boss && !people.some(p => p.role === "proofreader") && <Banner tone="warn" title="No proofreader accounts yet">Create Proofreader and Reviewer accounts in People and logins; the selected artworks are then given to them automatically.</Banner>}
    {!all.length ? <Card><p className="muted" style={{ margin: 0 }}>{role === "proofreader" || role === "reviewer" ? "Nothing given to you yet." : "No selected artworks yet. They appear here once Round 2 results are in."}</p></Card> :
    <div className="f3-sc f3-sess rv-ws">
      <section className="card f3-queue">
        <div className="qh"><Seg value={status} onChange={v => setQ("status", v)} items={[["to_proofread", `Proofread ${n("to_proofread")}`], ["with_coordinator", `Coordinator ${n("with_coordinator")}`], ["to_review", `Review ${n("to_review")}`], ["confirmed", "Done"], ["all", "All"]]} />
          {boss && <select className="select" value={who} onChange={e => setQ("who", e.target.value)} aria-label="Person"><option value="">Everyone</option>{people.map(p => <option key={p.id} value={p.id}>{p.name} ({p.role})</option>)}</select>}
          <Search value={q} onChange={setQ0} placeholder="Code, title or school" /></div>
        <div className="qb">{rows.map(r => <div key={r.code} role="button" tabIndex={0} className={`f3-qi${r.code === code ? " on" : ""}`} onClick={() => setQ("code", r.code)} onKeyDown={k => k.key === "Enter" && setQ("code", r.code)}>
          <div className="t tf"><b dir="auto">{r.title || "Untitled"}</b><span className="cd">{r.code} · {r.school}</span>
            <span className="rv-who"><Badge tone={TONE[r.status]}>{d.data.statuses[r.status]}</Badge>{boss && <span> {r.status === "to_review" || r.status === "confirmed" ? r.reviewer || "no reviewer" : r.proofreader || "not assigned"}</span>}{r.returned_note && r.status === "to_proofread" ? <span> · returned</span> : null}</span></div></div>)}
          {!rows.length && <p className="small faint" style={{ padding: 12 }}>Nothing here.</p>}</div>
      </section>
      {code ? <Detail key={code} code={code} role={role} people={people} rows={rows} onDone={next => { d.reload(); if (next) setQ("code", next); }} /> : <><div /><div /></>}
    </div>}
    {links && <Links d={d} onClose={() => setLinks(false)} />}
  </>;
}

function Detail({ code, role, people, rows, onDone }) {
  const d = useApi(`/api/proof?entry=${encodeURIComponent(code)}`); const toast = useToast();
  const [f, setF] = useState(null); const [dim, setDim] = useState(null); const [note, setNote] = useState(""); const [busy, setBusy] = useState(null); const [err, setErr] = useState(null); const [corr, setCorr] = useState(null);
  const base = e => ({ title_en: e.title_en || "", title_ar: e.title_ar || "", description_en: e.description_en || "", description_ar: e.description_ar || "", medium: e.medium || "", reflections: { influence: e.reflections?.influence || "", enjoy: e.reflections?.enjoy || "", focus: e.reflections?.focus || "" } });
  useEffect(() => { if (!d.data) return; const e = d.data.entry; setF(base(e)); setDim(parseSize(e.size_text) || { L: "", B: "", W: "" }); setNote(""); setErr(null); }, [d.data]); // eslint-disable-line
  if (!d.data || !f) return <><div className="stack" style={{ minWidth: 0 }}><Loading error={d.error} /></div><div /></>;
  const { entry: e, proof: p } = d.data; const boss = ["admin", "management"].includes(role);
  const stage = p.status === "to_proofread" ? "proofreading" : p.status === "to_review" ? "review" : null;
  const mine = boss || (stage === "proofreading" && role === "proofreader") || (stage === "review" && role === "reviewer");
  const can = !!stage && mine;
  const changed = JSON.stringify(f) !== JSON.stringify(base(e)) || (dim && sizeCm(dim.L, dim.B, dim.W) && sizeCm(dim.L, dim.B, dim.W) !== e.size_text);
  const next = () => { const i = rows.findIndex(r => r.code === code); return (rows.slice(i + 1)[0] || rows.find(r => r.code !== code))?.code || null; };
  async function save(quiet) { if (!changed) return; const body = { ...f }; const sz = sizeCm(dim.L, dim.B, dim.W); if (sz && sz !== e.size_text) body.size_text = sz; if (e.competition) { delete body.medium; delete body.reflections; delete body.size_text; } await api(`/api/entries/${encodeURIComponent(code)}`, { method: "PATCH", body: { details: body } }); if (!quiet) toast("Saved"); }
  async function go(action, body = {}) {
    setBusy(action); setErr(null);
    try { if (action === "save") { await save(); d.reload(); setBusy(null); return; }
      if (["done", "confirm", "send_back", "correction"].includes(action)) await save(true);
      const r = action === "correction" ? await api("/api/corrections", { body: { action: "open", source: stage, code, ...body } }) : await api("/api/proof", { body: { action, code, note, ...body } });
      toast(r.note); setCorr(null); onDone(["reopen", "assign"].includes(action) ? null : next()); d.reload(); }
    catch (x) { setErr(x.message); } setBusy(null);
  }
  const o = p.original || {};
  const txt = (k, label, ar, rows_ = 1) => <Field label={label}>{rows_ > 1 ? <textarea className="textarea" rows={rows_} dir={ar ? "rtl" : "auto"} disabled={!can} value={f[k]} onChange={x => setF({ ...f, [k]: x.target.value })} /> : <input className="input" dir={ar ? "rtl" : "auto"} disabled={!can} value={f[k]} onChange={x => setF({ ...f, [k]: x.target.value })} />}</Field>;
  const cmp = [["Title (English)", o.title_en, e.title_en], ["Title (Arabic)", o.title_ar, e.title_ar, true], ["Description (English)", o.description_en, e.description_en], ["Description (Arabic)", o.description_ar, e.description_ar, true], ...(!e.competition ? REFL.map(([k, l]) => [l, o.reflections?.[k], e.reflections?.[k]]) : [])];
  const openCorr = d.data.corrections.find(c => c.status === "open");
  return <>
    <div className="stack sticky-view" style={{ gap: 12, minWidth: 0 }}>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><span className="code" style={{ fontSize: 15, fontWeight: 600 }}>{e.code}</span><Badge>{e.pathway}</Badge><Badge>{e.sub}</Badge><Badge tone={TONE[p.status]}>{d.data.statuses[p.status]}</Badge></div>
      <FileViewer files={d.data.files || []} tall />
      <span className="small faint">{e.school?.name}{e.school?.esis ? ` · eSIS ${e.school.esis}` : ""}</span>
      {d.data.students.length > 0 && <div className="pr-stud"><b className="small">Students</b>{d.data.students.map((s, i) => <span key={i} className="small">{s.name_en || ""}{s.name_ar ? <span dir="rtl"> · {s.name_ar}</span> : null}{s.grade ? <span className="faint"> · {s.grade}</span> : null}</span>)}<span className="small faint">Student details can't be changed here.</span></div>}
    </div>
    <div className="stack" style={{ gap: 14, minWidth: 0 }}>
      <p className="small faint" style={{ margin: 0 }}>Proofreader: <b>{p.proofreader || "not assigned"}</b>{p.proofread_at ? ` (done ${when(p.proofread_at)})` : ""} · Reviewer: <b>{p.reviewer || "after proofreading"}</b>{p.reviewed_at && p.status === "confirmed" ? ` (confirmed ${when(p.reviewed_at)})` : ""}</p>
      {boss && <Assign p={p} people={people} onSave={b => go("assign", { codes: [code], ...b })} />}
      {p.returned_note && p.status === "to_proofread" && <Banner tone="warn" title={p.returned_note} />}
      {openCorr && <Banner tone="bad" title={`With the coordinator: ${d.data.reasons[openCorr.reason]?.label}`}>{`${openCorr.requested_by} ${when(openCorr.opened_at)}: “${openCorr.note}”. It comes back to ${openCorr.source === "review" ? "the reviewer" : "the proofreader"} once the school responds.`}</Banner>}
      {err && <Banner tone="bad" title={err} />}
      {(p.status === "to_review" || p.status === "confirmed") && p.original && <Card title="As it came in · now" sub="The text when the artwork entered proofreading, beside the text now. Changed fields are marked.">
        <div className="pr-cmp"><div className="pr-c pr-h"><span className="small faint">Field</span><span className="small faint">As it came in</span><span className="small faint">Now</span></div>{cmp.map(([l, a, b, ar]) => { const diff = String(a || "") !== String(b || ""); return <div key={l} className={`pr-c${diff ? " diff" : ""}`}><b className="small">{l}{diff ? " · changed" : ""}</b><span className="small faint" dir={ar ? "rtl" : "auto"}>{a || "–"}</span><span className="small" dir={ar ? "rtl" : "auto"}>{b || "–"}</span></div>; })}</div>
      </Card>}
      <Card title="Title and description">
        <div className="stack" style={{ gap: 10 }}>{txt("title_en", "Title (English)")}{txt("title_ar", "Title (Arabic)", true)}{txt("description_en", "Description (English)", false, 4)}{txt("description_ar", "Description (Arabic)", true, 4)}</div>
      </Card>
      {!e.competition && <Card title="Students' answers">
        <div className="stack" style={{ gap: 10 }}>{REFL.map(([k, l]) => <Field key={k} label={l}><textarea className="textarea" rows={3} dir="auto" disabled={!can} value={f.reflections[k]} onChange={x => setF({ ...f, reflections: { ...f.reflections, [k]: x.target.value } })} /></Field>)}
          {txt("medium", "Medium")}
          <Field label="Size (cm): length × breadth × width"><div className="row" style={{ gap: 6 }}>{["L", "B", "W"].map(k => <input key={k} className="input" style={{ width: 90 }} inputMode="decimal" disabled={!can} value={dim[k]} placeholder={k} onChange={x => setDim({ ...dim, [k]: x.target.value.replace(/[^0-9.]/g, "").slice(0, 6) })} />)}</div></Field></div>
      </Card>}
      {can && <Card title={stage === "review" ? "Final review" : "Proofreading"}>
        <Field label={stage === "review" ? "Note (needed to send it back to the proofreader)" : "Note for the reviewer (optional)"}><textarea className="textarea" rows={2} value={note} onChange={x => setNote(x.target.value)} /></Field>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {changed && <Btn busy={busy === "save"} onClick={() => go("save")}>Save changes</Btn>}
          <Btn v="ghost" onClick={() => setCorr({ reason: "artwork_mismatch", note: "" })}>Needs correction from the school</Btn><span className="sp" />
          {stage === "proofreading" && <Btn v="primary" busy={busy === "done"} onClick={() => go("done")}>Ready for review</Btn>}
          {stage === "review" && <><Btn busy={busy === "send_back"} disabled={!note.trim()} onClick={() => go("send_back")}>Send back to the proofreader</Btn><Btn v="primary" busy={busy === "confirm"} onClick={() => go("confirm")}>Confirm the data</Btn></>}
        </div>
      </Card>}
      {p.status === "confirmed" && ["admin", "management"].includes(role) && <div className="row"><Btn busy={busy === "reopen"} onClick={() => go("reopen")}>Reopen</Btn></div>}
      {d.data.corrections.length > 0 && <Card title="Corrections from the school">{d.data.corrections.map(c => <details key={c.id} className="pr-corr" open={c.status === "open"}><summary className="small"><b>{d.data.reasons[c.reason]?.label}</b> · {c.status === "open" ? "with the coordinator" : c.status} · {when(c.opened_at)}</summary>
        <div className="cr-log">{c.log.map(l => <div key={l.id} className="cr-l"><span className="small faint">{when(l.at)} · {l.by_name}</span><span className="small" dir="auto">{l.text || l.kind}</span></div>)}</div></details>)}</Card>}
    </div>
    <Modal open={!!corr} title="Send to the coordinator" sub={`${code} · the coordinator asks the school, then it comes back to you`} onClose={() => setCorr(null)}
      footer={<><Btn onClick={() => setCorr(null)}>Cancel</Btn><Btn v="primary" busy={busy === "correction"} disabled={!String(corr?.note || "").trim()} onClick={() => go("correction", { reason: corr.reason, note: corr.note })}>Send to the coordinator</Btn></>}>
      {corr && <div className="stack" style={{ gap: 12 }}>
        <div className="stack s4">{CORR.map(([k, l, h]) => <label key={k} className="row" style={{ gap: 8, alignItems: "flex-start" }}><input type="radio" name="pr-c" checked={corr.reason === k} onChange={() => setCorr({ ...corr, reason: k })} /><span className="stack s4"><b className="small">{l}</b><span className="small faint">{h}</span></span></label>)}</div>
        <Field label="What should the school fix?"><textarea className="textarea" rows={3} value={corr.note} onChange={x => setCorr({ ...corr, note: x.target.value })} placeholder="For example: the photo shows a painting but the description is about a sculpture" /></Field>
      </div>}
    </Modal>
  </>;
}
function Assign({ p, people, onSave }) {
  const pr = people.filter(x => x.role === "proofreader"), rv = people.filter(x => x.role === "reviewer");
  return <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}><span className="small faint">Reassign:</span>
    <select className="select" style={{ width: 190 }} value={p.proofreader_id || ""} onChange={e => onSave({ proofreader_id: e.target.value })} aria-label="Proofreader"><option value="">Proofreader…</option>{pr.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
    <select className="select" style={{ width: 190 }} value={p.reviewer_id || ""} onChange={e => onSave({ reviewer_id: e.target.value })} aria-label="Reviewer"><option value="">Reviewer…</option>{rv.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>;
}
function Links({ d, onClose }) {
  const toast = useToast(); const people = d.data.people || []; const pr = people.filter(x => x.role === "proofreader"), rv = people.filter(x => x.role === "reviewer");
  const [l, setL] = useState(() => Object.fromEntries(rv.map(r => [r.id, (d.data.links || []).filter(x => x.reviewer_id === r.id).map(x => x.proofreader_id)])));
  async function save(rid) { try { const r = await api("/api/proof", { body: { action: "links", reviewer_id: rid, proofreader_ids: l[rid] } }); toast(r.note); d.reload(); } catch (e) { toast(e.message, "err"); } }
  return <Modal open wide title="Reviewers and their proofreaders" sub="When a proofreader finishes an artwork it goes to one of their linked reviewers (the one with the fewest). With no link, it goes to any reviewer." onClose={onClose} footer={<Btn onClick={onClose}>Close</Btn>}>
    {!rv.length ? <p className="muted">No reviewer accounts yet. Create them in People and logins.</p> : <div className="stack" style={{ gap: 12 }}>{rv.map(r => <div key={r.id} className="rm-card"><div className="row" style={{ gap: 8 }}><b>{r.name}</b><span className="sp" /><Btn sm v="primary" onClick={() => save(r.id)}>Save</Btn></div>
      <div className="row" style={{ gap: 12, flexWrap: "wrap", marginTop: 8 }}>{pr.map(x => <Check key={x.id} label={x.name} checked={(l[r.id] || []).includes(x.id)} onChange={on => setL({ ...l, [r.id]: on ? [...(l[r.id] || []), x.id] : (l[r.id] || []).filter(y => y !== x.id) })} />)}{!pr.length && <span className="small faint">No proofreaders yet.</span>}</div></div>)}</div>}
  </Modal>;
}
