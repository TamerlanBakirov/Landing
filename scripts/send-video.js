import { loadEnv } from '../lib/env.js';
import { loadConfig } from '../lib/state.js';
import { createTransport } from 'nodemailer';
import { existsSync } from 'fs';

loadEnv();
const config = loadConfig();

const VIDEO = process.env.VIDEO_PATH || 'assets/promo-sample.mp4';
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

if (!user || !pass) { console.error('SMTP not set'); process.exit(1); }
if (!existsSync(VIDEO)) { console.error('Video not found: ' + VIDEO); process.exit(1); }

const transport = createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: { user, pass }
});

const info = await transport.sendMail({
  from: `"${config.agency.name}" <${user}>`,
  to: user,
  subject: '[MINTA] Promóciós videó - Pannónia Dental',
  text: `Szia!

Itt egy minta promóciós videó, amelyet a rendszer automatikusan tud készíteni minden vállalkozásnak (logó + bemutató + szolgáltatások + CTA).

A videó mellékletként csatolva.

${config.agency.name}`,
  attachments: [{ filename: 'pixelco-promo-pannonia.mp4', path: VIDEO }]
});

console.log('Sent video email. Message ID:', info.messageId);
