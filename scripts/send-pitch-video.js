import { loadJSON, loadConfig, slugify } from '../lib/state.js';
import { loadEnv } from '../lib/env.js';
import { preparePitch } from '../agents/pitcher.js';
import { createTransport } from 'nodemailer';
import { existsSync } from 'fs';

loadEnv();
const config = loadConfig();

const lead = loadJSON('database/leads.json', []).find(
  (l) => l.name === (process.env.TEST_BUSINESS || 'Pannónia Dental Plus Kft.')
);
if (!lead) { console.error('Lead not found'); process.exit(1); }

const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
if (!user || !pass) { console.error('SMTP not set'); process.exit(1); }

const slug = slugify(lead.name);
const siteUrl = `${config.agency.site_base_url}/${slug}/`;
const posterPath = `projects/${slug}/mail-poster.jpg`;

const pitch = preparePitch(lead);

// Clickable video thumbnail (poster + play button) → opens the live site,
// where the visit triggers an instant ntfy alert and the video plays.
const videoBlock = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 24px;">
    <p style="font-family:Arial,sans-serif;font-size:15px;color:#374151;margin:0 0 14px;">▶️ 20 másodperces bemutató — kattintson a lejátszáshoz:</p>
    <a href="${siteUrl}#video" target="_blank" style="display:inline-block;border-radius:18px;overflow:hidden;box-shadow:0 12px 36px rgba(0,0,0,0.25);">
      <img src="cid:promoposter" width="270" style="display:block;border:0;width:270px;height:auto;" alt="Bemutató videó">
    </a>
  </td></tr></table>`;

let html = pitch.html || `<p>${(pitch.body || '').replace(/\n/g, '<br>')}</p>`;
// Inject the video block right before the signature/closing of the email.
if (html.includes('</body>')) {
  html = html.replace('</body>', videoBlock + '</body>');
} else {
  html = html + videoBlock;
}

const transport = createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: { user, pass }
});

const attachments = [];
if (existsSync(posterPath)) {
  attachments.push({ filename: 'bemutato.jpg', path: posterPath, cid: 'promoposter' });
}

const info = await transport.sendMail({
  from: `"${config.agency.name}" <${user}>`,
  to: user, // test: send to self
  subject: `[TEST] ${pitch.subject}`,
  text: (pitch.body || '') + `\n\nBemutató videó: ${siteUrl}#video`,
  html,
  attachments
});

console.log('Sent pitch+video email:', info.messageId);
