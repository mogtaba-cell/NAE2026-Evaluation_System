"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MetaProvider, ToastProvider, useMeta, Banner, Btn } from "@/components/ui";
import { NAV } from "@/components/nav";

const ROLE_LABEL = { admin: "Administrator", coordinator: "Coordinator", evaluator: "Evaluator", management: "Management", storage: "Storage team", leadership: "Leadership" };

function isOn(href, path, sp) {
  const [p, qs] = href.split("?");
  if (qs) return path === p && sp.toString().includes(qs);
  if (p === "/dashboard") return path === p;
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
  </header>;
}

export default function Shell({ session, children }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => { setOpen(false); }, [path]);
  return <MetaProvider><ToastProvider>
    <div className={`app${open ? " nav-open" : ""}`} onClick={e => { if (open && e.target.classList?.contains("app")) setOpen(false); }}>
      <Side session={session} open={open} onNav={() => setOpen(false)} />
      <div className="main">
        <Top session={session} onMenu={() => setOpen(o => !o)} />
        <main className="content" id="main">
          {session.mcp && path !== "/account" && <Banner tone="warn" title="Please set your own password" action={<Btn sm href="/account">Change password</Btn>}>You signed in with a temporary password.</Banner>}
          {children}
        </main>
      </div>
    </div>
  </ToastProvider></MetaProvider>;
}
