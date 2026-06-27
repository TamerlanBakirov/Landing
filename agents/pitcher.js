import { loadJSON, saveJSON, updateLead, logAction, loadConfig, slugify, getLeadsByStage } from '../lib/state.js';
import { loadEnv } from '../lib/env.js';
import { existsSync } from 'fs';
import { createTransport } from 'nodemailer';

loadEnv();

const config = loadConfig();
const DAILY_LIMIT = config.goals.daily_outreach_limit;

function getMailTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  return createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
}

function loadCampaignLog() {
  return loadJSON('database/campaigns.json', {
    sent_today: 0,
    last_reset: new Date().toISOString().split('T')[0],
    messages: []
  });
}

function saveCampaignLog(log) {
  saveJSON('database/campaigns.json', log);
}

function resetDailyCounterIfNeeded(log) {
  const today = new Date().toISOString().split('T')[0];
  if (log.last_reset !== today) {
    log.sent_today = 0;
    log.last_reset = today;
  }
  return log;
}

function isDuplicate(log, leadId) {
  return log.messages.some(m => m.lead_id === leadId);
}

function generateEmailContent(lead, diagnosis) {
  const outreach = diagnosis?.outreach_message || {};
  const pkg = diagnosis?.recommendation || {};

  const slug = slugify(lead.name);
  const previewUrl = `${config.agency.site_base_url}/${slug}/`;
  const pricePkg = config.pricing.packages[0];

  const subject = outreach.subject_hu || `Ingyenes weboldal előnézet - ${lead.name}`;
  const body = outreach.body_hu || `Kedves ${lead.name} csapata!

Észrevettem, hogy a ${lead.name}-nak még nincs weboldala.

Készítettem Önöknek egy kész weboldal-előnézetet. Tekintse meg itt: Minta weboldal megtekintése (${previewUrl})

A teljes weboldal mindössze €${pricePkg.price}, és tartalmazza: ${pricePkg.features.slice(0, 4).join(', ')}.

Ha tetszik, vagy bármilyen kérdése van, egyszerűen válaszoljon erre az e-mailre - mindent e-mailben megbeszélünk.

Üdvözlettel,
${config.agency.name}
${config.agency.owner_email}`;

  const html = outreach.body_html_hu || null;

  return { subject, body, html };
}

export function preparePitch(lead) {
  const slug = slugify(lead.name);
  const diagnosisPath = `database/diagnosis/${slug}.json`;
  const diagnosis = existsSync(diagnosisPath) ? loadJSON(diagnosisPath) : null;

  console.log(`[Pitcher] Preparing outreach for: ${lead.name}`);
  logAction('pitcher', 'prepare_start', { name: lead.name });

  const email = generateEmailContent(lead, diagnosis);

  const pitch = {
    lead_id: lead.id,
    business_name: lead.name,
    city: lead.city,
    prepared_at: new Date().toISOString(),
    email_to: lead.email || lead.phone || '',
    subject: email.subject,
    body: email.body,
    html: email.html,
    attachments: {
      website_preview: existsSync(`projects/${slug}/index.html`) ? `projects/${slug}/index.html` : null,
      diagnosis_report: diagnosis ? `database/diagnosis/${slug}.json` : null
    },
    status: 'ready_to_send'
  };

  saveJSON(`database/diagnosis/${slug}-pitch.json`, pitch);

  logAction('pitcher', 'prepare_complete', {
    name: lead.name,
    has_email: !!lead.email,
    has_phone: !!lead.phone
  });

  return pitch;
}

async function sendEmail(transport, pitch, lead) {
  if (!lead.email) {
    console.log(`[Pitcher] No email for ${lead.name}, skipping email send`);
    return false;
  }

  // No file attachment — the preview is a live GitHub Pages link inside
  // the body, so recipients open it in the browser instead of downloading
  // an HTML file they might fear is a virus.
  const mailOptions = {
    from: `"${config.agency.name}" <${process.env.SMTP_USER}>`,
    to: lead.email,
    subject: pitch.subject,
    text: pitch.body
  };
  if (pitch.html) mailOptions.html = pitch.html;

  await transport.sendMail(mailOptions);
  return true;
}

export async function sendPitch(lead, pitch) {
  let log = loadCampaignLog();
  log = resetDailyCounterIfNeeded(log);

  if (log.sent_today >= DAILY_LIMIT) {
    console.log(`[Pitcher] Daily limit reached (${DAILY_LIMIT}). Queuing for tomorrow.`);
    logAction('pitcher', 'daily_limit_reached', { sent_today: log.sent_today });
    return false;
  }

  if (isDuplicate(log, lead.id)) {
    console.log(`[Pitcher] Already contacted ${lead.name}. Skipping.`);
    logAction('pitcher', 'skip_duplicate', { name: lead.name });
    return false;
  }

  const transport = getMailTransport();
  let emailSent = false;

  if (transport && lead.email) {
    try {
      emailSent = await sendEmail(transport, pitch, lead);
      console.log(`[Pitcher] Email sent to ${lead.email} for ${lead.name}`);
    } catch (err) {
      console.error(`[Pitcher] Email send failed for ${lead.name}: ${err.message}`);
      logAction('pitcher', 'email_error', { name: lead.name, error: err.message });
    }
  } else if (!transport) {
    console.log(`[Pitcher] SMTP not configured. Pitch saved but not sent.`);
  }

  const message = {
    lead_id: lead.id,
    business_name: lead.name,
    city: lead.city,
    channel: lead.email ? 'email' : 'queued',
    sent_at: new Date().toISOString(),
    status: emailSent ? 'sent' : 'pending_manual',
    subject: pitch.subject,
    to: lead.email || 'N/A'
  };

  log.messages.push(message);
  log.sent_today++;
  saveCampaignLog(log);

  updateLead(lead.name, lead.city, {
    stage: 'pitched',
    pitched_at: new Date().toISOString(),
    pitch_channel: emailSent ? 'email_sent' : 'pending_manual',
    email_sent: emailSent
  });

  console.log(`[Pitcher] ${lead.name}: ${emailSent ? 'Email sent' : 'Saved (manual send needed)'} (${log.sent_today}/${DAILY_LIMIT} today)`);
  logAction('pitcher', 'pitch_complete', {
    name: lead.name,
    email_sent: emailSent,
    daily_count: log.sent_today
  });

  return true;
}

export async function runPitcher() {
  console.log('[Pitcher] Starting outreach...');
  logAction('pitcher', 'run_start');

  const leads = getLeadsByStage('checked');
  console.log(`[Pitcher] ${leads.length} leads ready for outreach`);

  let prepared = 0;
  let sent = 0;

  for (const lead of leads) {
    try {
      const pitch = preparePitch(lead);
      prepared++;

      const didSend = await sendPitch(lead, pitch);
      if (didSend) sent++;

      if (sent >= DAILY_LIMIT) {
        console.log(`[Pitcher] Daily limit reached. Stopping.`);
        break;
      }
    } catch (err) {
      logAction('pitcher', 'pitch_error', { name: lead.name, error: err.message });
      console.error(`[Pitcher] Error pitching ${lead.name}: ${err.message}`);
    }
  }

  console.log(`[Pitcher] Complete. Prepared: ${prepared}, Sent: ${sent}`);
  logAction('pitcher', 'run_complete', { prepared, sent, total: leads.length });
}

if (process.argv[1]?.endsWith('pitcher.js')) {
  runPitcher();
}
