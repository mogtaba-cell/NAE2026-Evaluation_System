import nodemailer from "nodemailer";

// Email through Google Workspace SMTP: SMTP_USER (a gvc.ae mailbox, e.g. hello@gvc.ae) and SMTP_PASS (an app
// password for that mailbox, from Google Account → Security → App passwords). SMTP_FROM sets the sender name.
export function mailConfigured() { return !!(process.env.SMTP_USER && process.env.SMTP_PASS); }
let tx = null;
function transport() {
  if (!tx) tx = nodemailer.createTransport({ host: process.env.SMTP_HOST || "smtp.gmail.com", port: Number(process.env.SMTP_PORT || 465), secure: Number(process.env.SMTP_PORT || 465) === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  return tx;
}
export async function sendMail({ to, subject, text, html }) {
  const list = [...new Set((Array.isArray(to) ? to : [to]).filter(Boolean))];
  if (!list.length) return { sent: 0, skipped: "no address" };
  if (!mailConfigured()) return { sent: 0, skipped: "email not set up" };
  if (process.env.NAE_MAIL_LOG) { console.log(`[mail] to ${list.join(", ")}: ${subject}\n${text}`); return { sent: list.length, logged: true }; }
  await transport().sendMail({ from: process.env.SMTP_FROM || `NAE Evaluation System <${process.env.SMTP_USER}>`, to: list.join(", "), subject, text, html });
  return { sent: list.length };
}
