"use client";

import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("Admin");
  const [password, setPassword] = useState("NAE2026");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.error || "Login failed");
      return;
    }
    window.location.href = "/";
  }

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 520 }}>
        <div className="hero">
          <div style={{ fontSize: 12, letterSpacing: 3, textTransform: "uppercase", opacity: 0.75 }}>National Art Expressions</div>
          <div style={{ fontSize: 32, fontWeight: 800, marginTop: 8 }}>Platform Login</div>
          <div style={{ marginTop: 10, opacity: 0.85 }}>Admin default username: Admin · password: NAE2026</div>
        </div>
        <form className="card" onSubmit={handleSubmit}>
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <div style={{ fontSize: 13, marginBottom: 6 }}>Username</div>
              <input className="field" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 13, marginBottom: 6 }}>Password</div>
              <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error ? <div className="legend-note" style={{ color: "#B42318" }}>{error}</div> : null}
            <button className="btn" type="submit" disabled={loading}>{loading ? "Signing in..." : "Sign In"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
