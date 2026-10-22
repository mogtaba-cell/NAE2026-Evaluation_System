"use client";
import { useState } from "react";
import { api, useMeta, PageHead, Card, Field, Btn, Banner } from "@/components/ui";

export default function Account() {
  const meta = useMeta(); const me = meta?.data?.me;
  const [f, setF] = useState({ current: "", next: "", again: "" }); const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  async function save(e) { e.preventDefault(); if (f.next !== f.again) return setMsg(["bad", "The new passwords don't match."]); setBusy(true); try { await api("/api/auth/password", { body: f }); setMsg(["ok", "Password changed."]); setF({ current: "", next: "", again: "" }); setTimeout(() => location.assign("/"), 900); } catch (x) { setMsg(["bad", x.message]); } setBusy(false); }
  return <>
    <PageHead title="Your account" sub={me ? `${me.name} · ${me.username}` : ""} />
    <Card title="Change password" className="" ><form className="stack" style={{ maxWidth: 420 }} onSubmit={save}>
      {msg && <Banner tone={msg[0]} title={msg[1]} />}
      <Field label="Current password"><input className="input" type="password" autoComplete="current-password" value={f.current} onChange={e => setF({ ...f, current: e.target.value })} /></Field>
      <Field label="New password" help="At least 10 characters"><input className="input" type="password" autoComplete="new-password" value={f.next} onChange={e => setF({ ...f, next: e.target.value })} /></Field>
      <Field label="New password again"><input className="input" type="password" autoComplete="new-password" value={f.again} onChange={e => setF({ ...f, again: e.target.value })} /></Field>
      <div><Btn type="submit" v="primary" busy={busy} disabled={f.next.length < 10 || !f.current}>Change password</Btn></div>
    </form></Card>
  </>;
}
