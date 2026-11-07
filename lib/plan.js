// Daily targets for framing and photography. The Logistics team sets the date range they work in (and, for
// photography, the spaces: rooms or venues in the office); the system spreads what is left over the working days
// that are left, and compares each day with what was done.
//   plan: { start: "YYYY-MM-DD", end: "YYYY-MM-DD", skip_weekends: true, spaces: ["Studio 1", ...] }
export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
export const dayOf = iso => iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }) : null;
const add = (d, n) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
// the UAE weekend is Saturday and Sunday
const weekend = d => [0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay());
export function workdays(start, end, skip = true) {
  const out = []; if (!start || !end || end < start) return out;
  for (let d = start, i = 0; d <= end && i < 400; d = add(d, 1), i++) if (!skip || !weekend(d)) out.push(d);
  return out;
}
export function cleanPlan(b, { spaces = false } = {}) {
  const ok = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
  if (!ok(b.start) || !ok(b.end)) throw new Error("Choose the first and last day.");
  if (b.end < b.start) throw new Error("The last day is before the first day.");
  const p = { start: b.start, end: b.end, skip_weekends: b.skip_weekends !== false };
  if (!workdays(p.start, p.end, p.skip_weekends).length) throw new Error("There are no working days in that range.");
  if (spaces) {
    const list = (Array.isArray(b.spaces) ? b.spaces : []).map(s => String(s || "").trim().slice(0, 60)).filter(Boolean);
    if (!list.length) throw new Error("Add at least one space (room or venue) used for photography.");
    p.spaces = [...new Set(list)].slice(0, 20);
  }
  return p;
}
// total: artworks to do in all; doneDays: the day each finished one was done (sent to the framer, photographed)
// returns the day's target, what was done today, how far behind the plan the team is, and the schedule
export function planStats(plan, total, doneDays) {
  if (!plan?.start) return null;
  const t = today(); const days = workdays(plan.start, plan.end, plan.skip_weekends !== false);
  const done = doneDays.filter(Boolean); const doneBefore = done.filter(d => d < t).length, doneToday = done.filter(d => d === t).length;
  const left = days.filter(d => d >= t);
  const remaining = Math.max(0, total - doneBefore);
  const target = left.length && left[0] === t ? Math.ceil(remaining / left.length) : 0;
  // where the team should be by the end of yesterday on an even plan from the first day
  const past = days.filter(d => d < t).length;
  const expected = days.length ? Math.min(total, Math.ceil(total * past / days.length)) : 0;
  const per = days.length ? total / days.length : 0;
  const schedule = days.map((d, i) => ({ day: d, plan: Math.ceil(per * (i + 1)) - Math.ceil(per * i), done: done.filter(x => x === d).length, today: d === t, past: d < t }));
  const spaces = plan.spaces?.length || 0;
  return {
    start: plan.start, end: plan.end, workdays: days.length, daysLeft: left.length, total, done: done.length, remaining: Math.max(0, total - done.length),
    target, doneToday, short: Math.max(0, target - doneToday), behind: Math.max(0, expected - doneBefore), expected, perDay: Math.ceil(per),
    perSpace: spaces ? Math.ceil(target / spaces) : null, spaces: plan.spaces || [], schedule,
    notStarted: t < plan.start, over: t > plan.end, workday: days.includes(t)
  };
}
