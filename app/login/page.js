"use client";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const [setup, setSetup] = useState(null);
  const [f, setF] = useState({ username: "", password: "", name: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/auth/setup").then(r => r.json()).then(j => setSetup(!!j.needed)).catch(() => setSetup(false)); }, []);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr("");
    const r = await fetch(setup ? "/api/auth/setup" : "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setErr(j.error || "Sign in failed."); return; }
    window.location.href = j.mustChange ? "/account" : "/";
  }
  return <div className="signin">
    <div className="sbox">
      <div className="stack s4"><span className="strong" style={{ fontSize: 16 }}>NAE 2026</span><span className="faint">Evaluation System</span></div>
      <div className="stack s8"><h1>{setup ? "Create the first admin" : "Sign in"}</h1>
        <p className="muted">{setup ? "No accounts exist yet. This account manages everyone else's logins." : "Use the account your administrator created for you."}</p></div>
      <form className="stack" onSubmit={submit}>
        {setup && <div className="field"><label htmlFor="nm">Your name</label><input id="nm" className="input" value={f.name} onChange={set("name")} autoComplete="name" /></div>}
        <div className="field"><label htmlFor="un">Username</label><input id="un" className="input" value={f.username} onChange={set("username")} autoComplete="username" autoFocus /></div>
        <div className="field"><label htmlFor="pw">Password</label><input id="pw" className="input" type="password" value={f.password} onChange={set("password")} autoComplete={setup ? "new-password" : "current-password"} />
          {setup && <span className="help">At least 10 characters.</span>}</div>
        {err && <div className="banner bad" role="alert"><div className="bt"><b>{err}</b></div></div>}
        <button type="submit" className="btn primary" style={{ height: 40 }} disabled={busy || setup === null}>{busy ? "Signing in…" : setup ? "Create account and sign in" : "Sign in"}</button>
        {!setup && <span className="small faint">Forgot your password? Ask the NAE operations team to reset it.</span>}
      </form>
    </div>
    <div className="foot"><span>Global Vision Training L.L.C</span><span>National Art Expressions 2026</span></div>
  </div>;
}
