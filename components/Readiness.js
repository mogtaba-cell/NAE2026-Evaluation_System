"use client";
import Link from "next/link";
// Readiness checks for a round (computed on the server; the Open button uses the same checks).
export default function Readiness({ checks = [], compact }) {
  return <div className={`x-ck${compact ? " compact" : ""}`}>{checks.map(c => <div key={c.key} className={c.ok ? "ok" : c.hard ? "bad hard" : "bad"}>
    <b>{c.label}{!c.ok && <span className="tag">{c.hard ? "Must fix" : "Check"}</span>}</b><span>{c.text}</span>
    {!c.ok && c.fix && <Link className="fix" href={c.fix}>Fix this ›</Link>}</div>)}</div>;
}
