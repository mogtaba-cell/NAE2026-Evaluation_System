// Session times: a start and an end time on the session's date. The end (UAE time) is the session's deadline:
// a session not finished by then is overdue. Client-safe (no server imports).
const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const hm = t => (t ? String(t).slice(0, 5) : "");
export function timeText(start, end) { return start && end ? `${hm(start)} to ${hm(end)}` : start ? `from ${hm(start)}` : null; }
// check what the form sent: { start_time, end_time } → { start_time, end_time, time_text } or an error message
export function readTimes(b, { required } = {}) {
  const s = hm(b.start_time), e = hm(b.end_time);
  if (!s && !e) return required ? { error: "Choose the start and end time." } : { start_time: null, end_time: null, time_text: null };
  if (!HM.test(s) || !HM.test(e)) return { error: "Choose the start and end time." };
  if (e <= s) return { error: "The end time must be after the start time." };
  return { start_time: s, end_time: e, time_text: timeText(s, e) };
}
// the deadline as a timestamp: the session date at its end time in the UAE (UTC+4); no end time → end of that day
export function dueAt(s) {
  if (!s?.session_date) return null;
  return Date.parse(`${s.session_date}T${hm(s.end_time) || "23:59"}:00+04:00`);
}
export const isOverdue = (s, now = Date.now()) => ["planned", "live"].includes(s?.status) && dueAt(s) != null && now > dueAt(s);
export function overdueText(s, now = Date.now()) {
  const h = Math.floor((now - dueAt(s)) / 3600000);
  return h < 1 ? "Overdue" : h < 48 ? `Overdue by ${h} h` : `Overdue by ${Math.floor(h / 24)} days`;
}
