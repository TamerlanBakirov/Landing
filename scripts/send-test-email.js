import { loadJSON, loadConfig } from '../lib/state.js';
import { loadEnv } from '../lib/env.js';
import { preparePitch } from '../agents/pitcher.js';
import { createTransport } from 'nodemailer';

loadEnv();
const config = loadConfig();

// Sends ONE sample pitch email to the agency's own address (SMTP_USER),
// so you can preview exactly what a real prospect would receive.
// Trigger via the "Send Test Email" workflow (workflow_dispatch).

const DEMO_BUSINESS = process.env.TEST_BUSINESS || 'Alsóvárosi Fogászati Centrum';

const leads = loadJSON('database/leads.json', []);
const lead = leads.find(l => l.name === DEMO_BUSINESS) || leads[0];

if (!lead) {
  console.error('No lead found to build a test email from.');
  process.exit(1);
}

const pitch = preparePitch(lead);

const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const host = process.env.SMTP_HOST || 'smtp.gmail.com';
const port = parseInt(process.env.SMTP_PORT || '587');

if (!user || !pass) {
  console.error('SMTP_USER / SMTP_PASS not set. Add them as repository secrets first.');
  process.exit(1);
}

const transport = createTransport({
  host,
  port,
  secure: port === 465,
  auth: { user, pass }
});

const mail = {
  from: `"${config.agency.name}" <${user}>`,
  to: user,
  subject: `[TEST] ${pitch.subject}`,
  text: pitch.body
};
if (pitch.html) mail.html = pitch.html;

console.log(`Sending test email to ${user} for "${lead.name}"...`);
const info = await transport.sendMail(mail);
console.log(`Sent. Message ID: ${info.messageId}`);
