"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MetaProvider, ToastProvider, useMeta, Banner, Btn, Modal } from "@/components/ui";
import { NAV } from "@/components/nav";

const ROLE_LABEL = { admin: "Administrator", coordinator: "Coordinator", evaluator: "Evaluator", management: "Management", storage: "Storage team", leadership: "Leadership" };

function isOn(href, path, sp) {
  const [p, qs] = href.split("?");
  if (qs) return path === p && sp.toString().includes(qs);
  if (p === "/dashboard") return path === p;
  if (path === p && sp.get("scope")) return false;
  return path === p || path.startsWith(p + "/");
}

function Side({ session, open, onNav }) {
  const path = usePathname(); const sp = useSearchParams();
  async function signOut() { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }
  return <aside className="side" aria-label="Main navigation">
    <div className="logo"><b>NAE 2026</b><span>Evaluation System</span></div>
    <nav className="nav">{(NAV[session.role] || []).map(([g, items]) => <div className="nav-group" key={g}><span className="gl">{g}</span>
      {items.map(([href, label]) => <Link key={href} href={href} className={isOn(href, path, sp) ? "on" : ""} onClick={onNav}><span>{label}</span></Link>)}</div>)}</nav>
    <div className="grow" />
    <div className="me"><div className="who"><b>{session.name}</b><span>{ROLE_LABEL[session.role]}</span></div><div className="stack s4" style={{ alignItems: "flex-end" }}><Link href="/account" onClick={onNav} style={{ fontSize: 12, color: "var(--ink3)" }}>Account</Link><a onClick={signOut} role="button" tabIndex={0}>Sign out</a></div></div>
  </aside>;
}

const GROUP = { coordinator: "Coordinators", evaluator: "Evaluators", management: "Management", storage: "Storage team", leadership: "Leadership", admin: "Admins" };
// Admins: see the system exactly as someone else would (read only).
function ViewAs({ session }) {
  const [open, setOpen] = useState(false); const [groups, setGroups] = useState(null); const [f, setF] = useState(""); const [busy, setBusy] = useState(null);
  async function load() { setOpen(true); if (!groups) { const r = await fetch("/api/view-as"); const j = await r.json(); setGroups(j.groups || []); } }
  async function pick(id) { setBusy(id); const r = await fetch("/api/view-as", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account_id: id }) }); if (r.ok) window.location.href = "/"; else setBusy(null); }
  async function stop() { setBusy("stop"); await fetch("/api/view-as", { method: "DELETE" }); window.location.href = "/dashboard"; }
  if (session.viewAs) return <Btn sm v="primary" busy={busy === "stop"} onClick={stop}>Back to my account</Btn>;
  if (session.role !== "admin") return null;
  const t = f.trim().toLowerCase();
  return <><Btn sm onClick={load} title="See the system as another user would">View as…</Btn>
    <Modal open={open} title="View the system as" sub="You'll see exactly what they see. Nothing can be changed while viewing as someone." onClose={() => setOpen(false)}>
      <input className="input" placeholder="Search by name or username" value={f} onChange={e => setF(e.target.value)} autoFocus />
      {!groups ? <p className="muted">Loading…</p> : <div className="stack" style={{ gap: 14, maxHeight: "55vh", overflow: "auto" }}>{groups.map(g => { const ppl = g.people.filter(p => !t || p.name.toLowerCase().includes(t) || p.username.toLowerCase().includes(t)); return ppl.length ? <div key={g.role} className="stack s8"><span className="label" style={{ fontWeight: 700, color: "var(--deep)" }}>{GROUP[g.role] || g.role}</span>
        {ppl.map(p => <button key={p.id} type="button" className="va-row" disabled={!!busy} onClick={() => pick(p.id)}><b>{p.name}</b><span>{p.username}</span>{busy === p.id && <span>Opening…</span>}</button>)}</div> : null; })}</div>}
    </Modal></>;
}

function Top({ session, onMenu }) {
  const meta = useMeta(); const router = useRouter(); const [q, setQ] = useState("");
  const canSearch = session.role !== "evaluator";
  return <header className="top">
    <button type="button" className="btn secondary icon menu-btn" title="Menu" aria-label="Menu" onClick={onMenu}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>
    <span className="strong">{meta?.data?.program?.name || "NAE 2026"}</span>
    <span className="ctx hide-s">{[...new Set((meta?.data?.pathways || []).map(p => p.track))].map(t => `${t} track`).join(" · ")}</span>
    <span className="sp" />
    {canSearch && <form className="hide-s search" style={{ width: 300 }} onSubmit={e => { e.preventDefault(); if (q.trim()) router.push(`/entries?q=${encodeURIComponent(q.trim())}`); }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="faint"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
      <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Code, reference ID, student or school" aria-label="Search entries" /></form>}
    <ViewAs session={session} />
  </header>;
}

export default function Shell({ session, children }) {
  const [open, setOpen] = useState(false);
  const path = usePathname(); const router = useRouter();
  useEffect(() => { setOpen(false); }, [path]);
  // a temporary password must be changed before using the system
  useEffect(() => { if (session.mcp && path !== "/account") router.replace("/account"); }, [session.mcp, path]); // eslint-disable-line
  return <MetaProvider><ToastProvider>
    <div className={`app${open ? " nav-open" : ""}`} onClick={e => { if (open && e.target.classList?.contains("app")) setOpen(false); }}>
      <Side session={session} open={open} onNav={() => setOpen(false)} />
      <div className="main">
        <Top session={session} onMenu={() => setOpen(o => !o)} />
        <main className="content" id="main">
          {session.viewAs && <div className="va-bar">Viewing the system as <b>{session.name}</b> ({ROLE_LABEL[session.role]}). Read only: nothing can be changed. Signed in as {session.viewAs.byName}.</div>}
          {session.mcp && path !== "/account" && <Banner tone="warn" title="Please set your own password" action={<Btn sm href="/account">Change password</Btn>}>You signed in with a temporary password.</Banner>}
          {children}
        </main>
      </div>
    </div>
  </ToastProvider></MetaProvider>;
}
