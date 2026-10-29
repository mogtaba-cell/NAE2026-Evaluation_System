"use client";
// The artwork list used by the school and student catalogs: status, both rounds' results and where the artwork is.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Table, EntryCell, statusBadge, Badge, Seg, Kpis, fmt } from "@/components/ui";
import { SHORT } from "@/components/Movements";

const res = (e, n) => { if (e.limited) return <span className="faint small">Not your artwork</span>; const r = (e.results || []).find(x => x.round_no === n); if (!r) return <span className="faint small">–</span>; if (r.team == null) return <span className="faint small">{r.scored || 0} of {r.needed || 0} scores</span>; return <span className="small"><b>{r.final ?? r.team}</b> · {r.grade}{r.complete ? (r.passed ? " · passed" : " · not passed") : " · provisional"}</span>; };

export function CatalogKpis({ s }) {
  return <Kpis items={[["Artworks", fmt(s.artworks), s.withdrawn ? `${s.withdrawn} withdrawn` : ""], ["Students", fmt(s.students)], ["Through to Round 2", fmt(s.round2), s.artworks ? `${Math.round(s.round2 / s.artworks * 100)}%` : "", "brand"], ["Passed Round 2", fmt(s.passedR2), "", "ok"]]} />;
}

export function ArtworkCatalog({ rows }) {
  const router = useRouter();
  const [f, setF] = useState("all"); const [pw, setPw] = useState("");
  const pws = [...new Set(rows.map(r => r.pathway).filter(Boolean))];
  const list = rows.filter(r => (!pw || r.pathway === pw) && (f === "all" || (f === "r2" && r.current_round === 2) || (f === "passed" && (r.results || []).some(x => x.round_no === 2 && x.complete && x.passed)) || (f === "open" && !["final", "withdrawn", "not_scored", "not_through"].includes(r.status))));
  return <section className="card flush">
    <div className="row no-print" style={{ gap: 8, padding: 12, flexWrap: "wrap", borderBottom: "1px solid var(--rule)" }}>
      <Seg value={f} onChange={setF} items={[["all", `All ${rows.length}`], ["open", "Still being judged"], ["r2", "Through to Round 2"], ["passed", "Passed Round 2"]]} />
      {pws.length > 1 && <select className="select" style={{ width: 200 }} value={pw} onChange={e => setPw(e.target.value)}><option value="">All pathways</option>{pws.map(p => <option key={p}>{p}</option>)}</select>}
    </div>
    <Table minw={980} empty="No artworks here." onRow={i => router.push(`/entries/${list[i].code}`)} cols={["Artwork", "Pathway", "Status", "Round 1", "Round 2", "Where it is", "Coordinator"]}
      rows={list.map(e => [<EntryCell key="e" e={e} />, <span key="p" className="small">{e.pathway}<br /><span className="faint">{e.sub}</span></span>, <span key="s">{statusBadge(e)}</span>, <span key="r1">{res(e, 1)}</span>, <span key="r2">{e.current_round === 2 || (e.results || []).some(x => x.round_no === 2) ? res(e, 2) : <span className="faint small">–</span>}</span>, <span key="l" className="small">{e.logistics ? SHORT[e.logistics] || e.logistics : <span className="faint">Online</span>}</span>, <span key="c" className="small">{e.coordinator || <span className="faint">Not allocated</span>}</span>])} />
  </section>;
}
