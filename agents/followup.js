import { loadJSON, saveJSON, loadConfig, slugify, logAction, updateLead } from '../lib/state.js';
import { loadEnv } from '../lib/env.js';
import { getRepliedAddresses } from '../lib/inbox.js';
import { createTransport } from 'nodemailer';

loadEnv();

const config = loadConfig();
const FOLLOWUP_DAYS = config.goals.followup_after_days || 3;

function getTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = parseInt(process.env.SMTP_PORT || '587');
  if (!host || !user || !pass) return null;
  return createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

function followupText(name, previewUrl) {
  return `Kedves ${name} csapata!

Néhány napja küldtem Önöknek egy ingyenes weboldal-előnézetet, és csak biztosra szerettem volna menni, hogy megérkezett.

Megtekinthetik itt: Minta weboldal megtekintése (${previewUrl})

Ha érdekli a lehetőség, vagy bármilyen kérdése van, elég csak válaszolnia erre az e-mailre.

Üdvözlettel,
${config.agency.name}
${config.agency.owner_email}`;
}

function followupHtml(name, previewUrl) {
  return `<!DOCTYPE html><html lang="hu"><body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;max-width:600px;"><tr><td style="padding:32px 36px;">
      <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">Kedves <strong>${name}</strong> csapata!</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px;color:#374151;">Néhány napja küldtem Önöknek egy ingyenes weboldal-előnézetet, és csak biztosra szerettem volna menni, hogy megérkezett.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;"><tr><td align="center" style="border-radius:50px;background:#2563eb;">
        <a href="${previewUrl}" target="_blank" style="display:inline-block;padding:14px 36px;font-size:16px;font-weight:bold;color:#fff;text-decoration:none;border-radius:50px;">Minta weboldal megtekintése →</a>
      </td></tr></table>
      <p style="font-size:15px;line-height:1.6;margin:0 0 24px;color:#374151;">Ha érdekli a lehetőség, vagy bármilyen kérdése van, elég csak <strong>válaszolnia erre az e-mailre</strong>.</p>
      <p style="font-size:15px;line-height:1.4;margin:0;color:#111827;">Üdvözlettel,<br><strong>${config.agency.name}</strong></p>
    </td></tr></table>
  </td></tr></table>
</body></html>`;
}

export async function runFollowup() {
  console.log('[Follow-up] Starting...');
  logAction('followup', 'run_start');

  const log = loadJSON('database/campaigns.json', { sent_today: 0, messages: [] });
  const transport = getTransport();
  if (!transport) {
    console.log('[Follow-up] SMTP not configured. Aborting.');
    return;
  }

  // Who already replied? Don't chase them.
  const replied = await getRepliedAddresses(30);
  console.log(`[Follow-up] ${replied.size} reply address(es) found in inbox.`);

  const now = Date.now();
  let sent = 0;

  for (const m of log.messages) {
    if (m.status !== 'sent') continue;            // only successfully emailed
    if (m.follow_up_sent) continue;               // already followed up
    const emailLc = (m.to || '').trim().toLowerCase();
    if (!emailLc || emailLc === 'n/a') continue;

    if (replied.has(emailLc)) {
      m.responded = true;                          // they answered — leave them
      continue;
    }

    const ageDays = (now - new Date(m.sent_at).getTime()) / 86400000;
    if (ageDays < FOLLOWUP_DAYS) continue;         // not old enough yet

    const slug = slugify(m.business_name);
    const previewUrl = `${config.agency.site_base_url}/${slug}/`;

    try {
      await transport.sendMail({
        from: `"${config.agency.name}" <${process.env.SMTP_USER}>`,
        to: m.to,
        subject: `Emlékeztető - weboldal előnézet (${m.business_name})`,
        text: followupText(m.business_name, previewUrl),
        html: followupHtml(m.business_name, previewUrl)
      });
      m.follow_up_sent = new Date().toISOString();
      sent++;
      updateLead(m.business_name, m.city, { stage: 'followed_up', followed_up_at: m.follow_up_sent });
      console.log(`[Follow-up] Sent reminder to ${m.business_name} (${m.to})`);
      logAction('followup', 'sent', { name: m.business_name, to: m.to });
    } catch (err) {
      console.error(`[Follow-up] Failed for ${m.business_name}: ${err.message}`);
      logAction('followup', 'error', { name: m.business_name, error: err.message });
    }
  }

  saveJSON('database/campaigns.json', log);
  console.log(`[Follow-up] Complete. Reminders sent: ${sent}`);
  logAction('followup', 'run_complete', { sent });
}

if (process.argv[1]?.endsWith('followup.js')) {
  runFollowup();
}
