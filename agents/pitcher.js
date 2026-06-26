import { loadJSON, saveJSON, updateLead, logAction, loadConfig, slugify, getLeadsByStage } from '../lib/state.js';
import { existsSync } from 'fs';

const config = loadConfig();
const DAILY_LIMIT = config.goals.daily_outreach_limit;

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

function generateEmailTemplate(lead, diagnosis) {
  const outreach = diagnosis?.outreach_message || {};
  const pkg = diagnosis?.recommendation || {};

  return {
    channel: 'email',
    to: lead.email,
    subject: outreach.subject_en || `Website proposal for ${lead.name}`,
    body: `Dear ${lead.name} team,

${outreach.opening || `I came across your business while researching ${lead.category} services in ${lead.city}.`}

${outreach.value_proposition || `I help local businesses like yours get more customers through modern, mobile-friendly websites.`}

${outreach.offer || `I've prepared a custom preview of what your new website could look like.`}

${outreach.package_mention || `Starting from just €${config.pricing.packages[0].price}, you can have a professional online presence.`}

${outreach.cta || `Would you be open to a quick 15-minute Google Meet call? Just reply and I'll send you a meeting invite.`}

Best regards,
AI Web Agency
${config.agency.owner_email}

P.S. I've attached a preview of your potential new website. No obligation - just wanted to show you what's possible.`,
    body_hu: `Kedves ${lead.name} csapata!

${lead.website
  ? `Megnéztem a weboldalukat, és észrevettem néhány területet, ahol hatékonyabban szolgálhatná az üzletüket.`
  : `Észrevettem, hogy a ${lead.name}-nak még nincs modern weboldala. A mai digitális világban ez azt jelenti, hogy potenciális ügyfelek nem találják meg Önöket online.`}

Modern, mobilbarát weboldalakat készítek ${lead.category} vállalkozásoknak Magyarországon. Ügyfeleim jellemzően 40-85%-kal több online megkeresést kapnak az új oldal indítása után.

Készítettem egy egyedi előnézetet arról, hogyan nézhetne ki az Önök új weboldala - kötelezettség nélkül.

${pkg.name ? `${pkg.name} csomagunk (€${pkg.price}) tartalmazza: ${(pkg.features || []).slice(0, 3).join(', ')}.` : ''}

Nyitottak lennének egy gyors 15 perces Google Meet beszélgetésre? Válaszoljon erre az üzenetre, és küldök egy meghívót.

Üdvözlettel,
AI Web Agency
${config.agency.owner_email}

UI.: Csatoltam az Önök potenciális új weboldalának előnézetét. Semmi kötelezettség - csak szerettem volna megmutatni a lehetőségeket.`
  };
}

function generateLinkedInTemplate(lead, diagnosis) {
  const pkg = diagnosis?.recommendation || {};

  return {
    channel: 'linkedin',
    target: lead.name,
    connection_note: `Hi! I specialize in creating websites for ${lead.category} businesses in ${lead.city}. I'd love to connect and share some ideas for ${lead.name}.`,
    follow_up: `Thanks for connecting! I noticed ${lead.website ? 'your website could be working harder for you' : `${lead.name} doesn't have a website yet`}. I prepared a free preview of a modern site design for your business. Want me to send it over? No strings attached.`
  };
}

function generateWhatsAppTemplate(lead, diagnosis) {
  return {
    channel: 'whatsapp',
    to: lead.phone,
    message_hu: `Szia! 👋

Weboldal készítő vagyok, és ${lead.city}-i ${lead.category} vállalkozásoknak segítek modern weboldalakkal több ügyfelet szerezni.

Készítettem egy ingyenes előnézetet a ${lead.name} számára - érdekli?

Kötelezettségmentes, 15 perces Google Meet konzultáció - válaszoljon és küldöm a meghívót!

Üdv, AI Web Agency`,
    message_en: `Hi! 👋

I create modern websites for ${lead.category} businesses in ${lead.city}.

I prepared a free website preview for ${lead.name} - interested?

No-obligation 15min Google Meet consultation - just reply and I'll send the invite!

Best, AI Web Agency`
  };
}

function generateInstagramDMTemplate(lead) {
  return {
    channel: 'instagram',
    target: lead.name,
    message: `Hi ${lead.name} team! 🙌

Love what you're doing in ${lead.city}! I create modern websites for local businesses and I think an upgraded online presence could really help grow your ${lead.category} business.

I actually made a free preview of what your new site could look like. Want to see it?

No commitment, just thought you'd appreciate it! 😊`
  };
}

function selectBestChannel(lead) {
  if (lead.email) return 'email';
  if (lead.phone) return 'whatsapp';
  if (lead.social_links?.some(l => l.includes('instagram'))) return 'instagram';
  if (lead.social_links?.some(l => l.includes('linkedin'))) return 'linkedin';
  return 'email';
}

export function preparePitch(lead) {
  const slug = slugify(lead.name);
  const diagnosisPath = `database/diagnosis/${slug}.json`;
  const diagnosis = existsSync(diagnosisPath) ? loadJSON(diagnosisPath) : null;

  console.log(`[Pitcher] Preparing outreach for: ${lead.name}`);
  logAction('pitcher', 'prepare_start', { name: lead.name });

  const bestChannel = selectBestChannel(lead);

  const pitch = {
    lead_id: lead.id,
    business_name: lead.name,
    city: lead.city,
    prepared_at: new Date().toISOString(),
    recommended_channel: bestChannel,
    channels: {
      email: lead.email ? generateEmailTemplate(lead, diagnosis) : null,
      linkedin: generateLinkedInTemplate(lead, diagnosis),
      whatsapp: lead.phone ? generateWhatsAppTemplate(lead, diagnosis) : null,
      instagram: generateInstagramDMTemplate(lead)
    },
    attachments: {
      website_preview: existsSync(`projects/${slug}/index.html`) ? `projects/${slug}/index.html` : null,
      video_frames: existsSync(`projects/${slug}/video-frames`) ? `projects/${slug}/video-frames` : null,
      screenshots: existsSync(`projects/${slug}/screenshots`) ? `projects/${slug}/screenshots` : null,
      diagnosis_report: diagnosis ? `database/diagnosis/${slug}.json` : null
    },
    status: 'ready_to_send'
  };

  saveJSON(`database/diagnosis/${slug}-pitch.json`, pitch);

  logAction('pitcher', 'prepare_complete', {
    name: lead.name,
    channel: bestChannel,
    has_email: !!lead.email,
    has_phone: !!lead.phone
  });

  return pitch;
}

export function sendPitch(lead, pitch) {
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

  const message = {
    lead_id: lead.id,
    business_name: lead.name,
    city: lead.city,
    channel: pitch.recommended_channel,
    sent_at: new Date().toISOString(),
    status: 'pending_approval',
    pitch_summary: {
      channel: pitch.recommended_channel,
      to: pitch.channels[pitch.recommended_channel]?.to || lead.name,
      subject: pitch.channels.email?.subject || `Outreach to ${lead.name}`,
      has_attachments: Object.values(pitch.attachments).some(v => v !== null)
    }
  };

  log.messages.push(message);
  log.sent_today++;
  saveCampaignLog(log);

  updateLead(lead.name, lead.city, {
    stage: 'pitched',
    pitched_at: new Date().toISOString(),
    pitch_channel: pitch.recommended_channel
  });

  console.log(`[Pitcher] Pitch ready for ${lead.name} via ${pitch.recommended_channel} (${log.sent_today}/${DAILY_LIMIT} today)`);
  logAction('pitcher', 'pitch_queued', {
    name: lead.name,
    channel: pitch.recommended_channel,
    daily_count: log.sent_today
  });

  return true;
}

export function runPitcher() {
  console.log('[Pitcher] Starting outreach preparation...');
  logAction('pitcher', 'run_start');

  const leads = getLeadsByStage('checked');
  console.log(`[Pitcher] ${leads.length} leads ready for outreach`);

  let prepared = 0;
  let sent = 0;

  for (const lead of leads) {
    try {
      const pitch = preparePitch(lead);
      prepared++;

      const didSend = sendPitch(lead, pitch);
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

  console.log(`[Pitcher] Complete. Prepared: ${prepared}, Queued: ${sent}`);
  logAction('pitcher', 'run_complete', { prepared, sent, total: leads.length });
}

if (process.argv[1]?.endsWith('pitcher.js')) {
  runPitcher();
}
