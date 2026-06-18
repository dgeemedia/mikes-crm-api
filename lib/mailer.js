// lib/mailer.js
// All outbound emails for the CRM
// Uses nodemailer with Gmail SMTP (App Password)

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   Number(process.env.SMTP_PORT) || 587,
  secure: false, // STARTTLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM      = `"${process.env.FROM_NAME || 'Mikes Constructions'}" <${process.env.SMTP_USER}>`;
const CALENDAR  = process.env.CALENDAR_URL || 'https://calendly.com/mikes-constructions';
const CRM_URL   = process.env.CRM_URL      || 'http://localhost:3001';
const NOTIFY_TO = process.env.NOTIFY_EMAIL;

// ── Shared send helper ───────────────────────────────────────────────────────
async function send({ to, subject, html }) {
  try {
    await transporter.sendMail({ from: FROM, to, subject, html });
    return true;
  } catch (err) {
    console.error(`[mailer] Failed to send to ${to}:`, err.message);
    return false;
  }
}

// ── 1. Auto-reply to customer on new enquiry ─────────────────────────────────
async function sendAutoReply({ first_name, email, project }) {
  return send({
    to:      email,
    subject: `We've received your enquiry — Mikes Constructions`,
    html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#222">
  <div style="border-left:4px solid #1D9E75;padding-left:20px;margin-bottom:32px">
    <h2 style="margin:0 0 4px;font-size:22px">Mikes Constructions Group Ltd</h2>
    <p style="margin:0;color:#666;font-size:14px">Crewe, Cheshire</p>
  </div>
  <p>Hi ${first_name},</p>
  <p>Thank you for getting in touch about your <strong>${project}</strong> project. We've received your enquiry and one of our team will be in touch within <strong>24 hours</strong>.</p>
  <p>In the meantime, you're welcome to book a free consultation call at a time that suits you:</p>
  <div style="text-align:center;margin:32px 0">
    <a href="${CALENDAR}" style="background:#1D9E75;color:#fff;padding:14px 28px;border-radius:4px;text-decoration:none;font-weight:600;font-size:15px">
      Book a free consultation →
    </a>
  </div>
  <p style="color:#666;font-size:14px">Our working hours are Monday–Friday 8am–6pm and Saturday 9am–2pm.</p>
  <p>Kind regards,<br><strong>The Mikes Constructions Team</strong></p>
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0">
  <p style="font-size:12px;color:#999">Mikes Constructions Group Ltd · enquiry@mikes-constructions.co.uk · +44 7879 737524</p>
</div>`,
  });
}

// ── 2. Internal team notification on new enquiry ─────────────────────────────
async function sendInternalNotify({ first_name, last_name, email, phone, project, message }) {
  if (!NOTIFY_TO) return;
  return send({
    to:      NOTIFY_TO,
    subject: `New enquiry: ${first_name} ${last_name} — ${project || 'General'}`,
    html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#222">
  <h2 style="color:#1D9E75;margin-bottom:4px">New enquiry received</h2>
  <p style="color:#666;margin-top:0">${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}</p>
  <table style="width:100%;border-collapse:collapse;margin:20px 0">
    <tr><td style="padding:8px 0;color:#666;width:130px;vertical-align:top">Name</td><td style="padding:8px 0;font-weight:600">${first_name} ${last_name}</td></tr>
    <tr><td style="padding:8px 0;color:#666;vertical-align:top">Email</td><td style="padding:8px 0"><a href="mailto:${email}">${email}</a></td></tr>
    <tr><td style="padding:8px 0;color:#666;vertical-align:top">Phone</td><td style="padding:8px 0">${phone || 'Not provided'}</td></tr>
    <tr><td style="padding:8px 0;color:#666;vertical-align:top">Project</td><td style="padding:8px 0">${project || 'Not specified'}</td></tr>
  </table>
  <div style="background:#f5f5f5;padding:16px;border-radius:4px;margin:16px 0;border-left:3px solid #1D9E75">
    <p style="margin:0;font-style:italic;color:#333">"${message}"</p>
  </div>
  <a href="${CRM_URL}" style="display:inline-block;margin-top:16px;background:#1D9E75;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;font-weight:600">
    Open in CRM →
  </a>
  <p style="margin-top:24px;font-size:12px;color:#999">This is an automated notification from the Mikes Constructions CRM.</p>
</div>`,
  });
}

// ── 3. Team reply to customer ─────────────────────────────────────────────────
async function sendReply({ to, firstName, senderName, body }) {
  return send({
    to,
    subject: `Re: Your enquiry — Mikes Constructions`,
    html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#222">
  <div style="border-left:4px solid #1D9E75;padding-left:20px;margin-bottom:28px">
    <h2 style="margin:0 0 4px;font-size:20px">Mikes Constructions Group Ltd</h2>
  </div>
  <p>Hi ${firstName},</p>
  ${body.split('\n').filter(Boolean).map(p => `<p>${p}</p>`).join('')}
  <p style="margin-top:28px">Kind regards,<br><strong>${senderName}</strong><br>Mikes Constructions Group Ltd</p>
  <hr style="border:none;border-top:1px solid #eee;margin:28px 0">
  <p style="font-size:12px;color:#999">enquiry@mikes-constructions.co.uk · +44 7879 737524</p>
</div>`,
  });
}

module.exports = { sendAutoReply, sendInternalNotify, sendReply };
