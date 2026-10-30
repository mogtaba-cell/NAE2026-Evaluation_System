import { route, bad } from "@/lib/api";
import { db, all } from "@/lib/db";

// The mediums schools used in a pathway (from the imported data), most used first. Feeds the Medium dropdown.
const cache = new Map();
export const GET = route(["admin", "management", "coordinator"], async ({ url }) => {
  const pw = url.searchParams.get("pathway"); if (!pw) throw bad("Pick a pathway.");
  const hit = cache.get(pw); if (hit && Date.now() - hit.at < 5 * 60 * 1000) return { mediums: hit.list };
  const rows = await all(() => db().from("nae_entries").select("medium").eq("pathway_code", pw).not("medium", "is", null).order("id"));
  const n = {}; for (const r of rows) { const m = String(r.medium || "").trim(); if (m) n[m] = (n[m] || 0) + 1; }
  const list = Object.entries(n).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([m]) => m);
  cache.set(pw, { at: Date.now(), list });
  return { mediums: list };
});
