import { loadJSON, saveJSON, updateLead, logAction, loadConfig, slugify } from '../lib/state.js';
import { existsSync } from 'fs';

const config = loadConfig();

function loadResponses() {
  return loadJSON('database/responses.json', {
    conversations: [],
    meetings_scheduled: [],
    requires_human: []
  });
}

function saveResponses(responses) {
  saveJSON('database/responses.json', responses);
}

const BUYING_SIGNALS = [
  'how much', 'price', 'cost', 'pricing', 'ár', 'mennyibe',
  'interested', 'érdekel', 'want', 'need', 'szükségem',
  'when', 'mikor', 'how long', 'mennyi idő',
  'meeting', 'call', 'talk', 'találkozó', 'hívás', 'beszél',
  'start', 'begin', 'let\'s go', 'kezdjük', 'indulhat',
  'package', 'csomag', 'plan', 'terv',
  'yes', 'igen', 'sure', 'persze', 'ok', 'oké',
  'send', 'küld', 'show', 'mutasd'
];

const REJECTION_SIGNALS = [
  'not interested', 'nem érdekel', 'no thanks', 'nem köszönöm',
  'unsubscribe', 'leiratkozás', 'stop', 'remove', 'töröl',
  'don\'t contact', 'ne keressen', 'spam'
];

const FAQ_RESPONSES = {
  pricing: {
    triggers: ['price', 'cost', 'how much', 'ár', 'mennyibe', 'pricing'],
    response_en: `Great question! Here are our packages:\n\n` +
      config.pricing.packages.map(p => `**${p.name}** - €${p.price}\n${p.features.slice(0, 3).join(', ')}`).join('\n\n') +
      `\n\nAll packages include ${config.pricing.monthly_maintenance.features.join(', ')} for €${config.pricing.monthly_maintenance.price}/month.\n\nWould you like to schedule a call to discuss which package fits best?`,
    response_hu: `Remek kérdés! Íme a csomagjaink:\n\n` +
      config.pricing.packages.map(p => `**${p.name}** - €${p.price}\n${p.features.slice(0, 3).join(', ')}`).join('\n\n') +
      `\n\nMinden csomag tartalmaz havi karbantartást €${config.pricing.monthly_maintenance.price}/hó.\n\nSzeretne egy hívást egyeztetni a legjobb csomag kiválasztásához?`
  },
  timeline: {
    triggers: ['how long', 'when ready', 'delivery', 'mennyi idő', 'mikor kész', 'szállítás'],
    response_en: `Delivery times:\n` +
      config.pricing.packages.map(p => `- ${p.name}: ${p.delivery_days} business days`).join('\n') +
      `\n\nWe start immediately after our consultation call.`,
    response_hu: `Szállítási idők:\n` +
      config.pricing.packages.map(p => `- ${p.name}: ${p.delivery_days} munkanap`).join('\n') +
      `\n\nAz konzultációs hívás után azonnal kezdjük a munkát.`
  },
  process: {
    triggers: ['how does it work', 'process', 'steps', 'hogyan működik', 'folyamat', 'lépések'],
    response_en: `Here's how it works:\n\n1. Free 15-min Google Meet consultation\n2. We discuss your needs and pick the right package\n3. I create your custom website design\n4. You review and request changes\n5. We launch your new website!\n\nReady to start? Just reply with a time that works and I'll send you a Google Meet invite!`,
    response_hu: `Így működik:\n\n1. Ingyenes 15 perces Google Meet konzultáció\n2. Megbeszéljük igényeit és kiválasztjuk a megfelelő csomagot\n3. Elkészítem az egyedi weboldal designt\n4. Ön átnézi és kéri a változtatásokat\n5. Elindítjuk az új weboldalát!\n\nKészen áll? Válaszoljon egy Önnek megfelelő időponttal, és küldöm a Google Meet meghívót!`
  },
  what_included: {
    triggers: ['what\'s included', 'include', 'features', 'mit tartalmaz', 'funkciók'],
    response_en: `Every website includes:\n- Mobile responsive design\n- Contact form\n- SEO optimization\n- Fast loading speed\n- SSL security\n- Google Maps integration\n\nHigher packages add more features. Would you like details on a specific package?`,
    response_hu: `Minden weboldal tartalmazza:\n- Mobilbarát design\n- Kapcsolatfelvételi űrlap\n- SEO optimalizáció\n- Gyors betöltési sebesség\n- SSL biztonság\n- Google Maps integráció\n\nMagasabb csomagok további funkciókat tartalmaznak. Szeretne részleteket egy adott csomagról?`
  }
};

function detectLanguage(text) {
  const hungarianWords = ['szia', 'hello', 'köszönöm', 'igen', 'nem', 'szeretném', 'érdekel', 'mennyibe', 'mikor', 'hogyan', 'kérem'];
  const lower = text.toLowerCase();
  const hunCount = hungarianWords.filter(w => lower.includes(w)).length;
  return hunCount >= 1 ? 'hu' : 'en';
}

function detectBuyingIntent(text) {
  const lower = text.toLowerCase();

  if (REJECTION_SIGNALS.some(s => lower.includes(s))) {
    return { intent: 'rejection', confidence: 0.9 };
  }

  const signalMatches = BUYING_SIGNALS.filter(s => lower.includes(s));

  if (signalMatches.length >= 3) {
    return { intent: 'high_buying', confidence: 0.9, signals: signalMatches };
  }
  if (signalMatches.length >= 1) {
    return { intent: 'moderate_buying', confidence: 0.6, signals: signalMatches };
  }

  return { intent: 'neutral', confidence: 0.3, signals: [] };
}

function findFAQMatch(text) {
  const lower = text.toLowerCase();

  for (const [key, faq] of Object.entries(FAQ_RESPONSES)) {
    if (faq.triggers.some(t => lower.includes(t))) {
      return { key, faq };
    }
  }

  return null;
}

function generateAutoResponse(message, lead) {
  const lang = detectLanguage(message);
  const intent = detectBuyingIntent(message);
  const faqMatch = findFAQMatch(message);

  if (intent.intent === 'rejection') {
    return {
      auto_reply: false,
      action: 'mark_rejected',
      note: 'Lead has rejected outreach. Removing from pipeline.',
      suggested_response: lang === 'hu'
        ? 'Köszönjük a válaszát! Ha a jövőben meggondolná magát, szívesen segítünk. Szép napot!'
        : 'Thank you for your response! If you change your mind in the future, we\'d be happy to help. Have a great day!'
    };
  }

  if (faqMatch) {
    return {
      auto_reply: true,
      response: lang === 'hu' ? faqMatch.faq.response_hu : faqMatch.faq.response_en,
      faq_category: faqMatch.key,
      intent
    };
  }

  if (intent.intent === 'high_buying') {
    return {
      auto_reply: true,
      response: lang === 'hu'
        ? `Örülök az érdeklődésnek! 🎉\n\nSzeretném megmutatni személyesen is, mit tudunk nyújtani a ${lead.name} számára.\n\nMondjon egy Önnek megfelelő időpontot, és küldöm a Google Meet meghívót az ingyenes 15 perces konzultációhoz!\n\nVárom a beszélgetést!`
        : `Great to hear your interest! 🎉\n\nI'd love to show you personally what we can do for ${lead.name}.\n\nJust tell me a time that works for you and I'll send a Google Meet invite for a free 15-minute consultation!\n\nLooking forward to chatting!`,
      intent,
      action: 'schedule_meeting'
    };
  }

  return {
    auto_reply: false,
    action: 'require_human',
    note: `Unrecognized response from ${lead.name}. Needs human review.`,
    intent,
    original_message: message
  };
}

export function processResponse(leadId, message, channel = 'email') {
  const leads = loadJSON('database/leads.json', []);
  const lead = leads.find(l => l.id === leadId);

  if (!lead) {
    console.log(`[Mobile] Lead not found: ${leadId}`);
    return null;
  }

  console.log(`[Mobile] Processing response from ${lead.name} via ${channel}`);
  logAction('mobile', 'response_received', { name: lead.name, channel, message_preview: message.substring(0, 100) });

  const intent = detectBuyingIntent(message);
  const lang = detectLanguage(message);
  const autoResponse = generateAutoResponse(message, lead);

  const responses = loadResponses();
  const conversation = {
    lead_id: leadId,
    business_name: lead.name,
    city: lead.city,
    channel,
    received_at: new Date().toISOString(),
    message,
    language: lang,
    intent,
    auto_response: autoResponse,
    status: autoResponse.auto_reply ? 'auto_replied' : 'pending_human'
  };

  responses.conversations.push(conversation);

  if (autoResponse.action === 'schedule_meeting') {
    updateLead(lead.name, lead.city, { stage: 'meeting_scheduled' });
    responses.meetings_scheduled.push({
      lead_id: leadId,
      business_name: lead.name,
      scheduled_at: new Date().toISOString(),
      meeting_method: 'google_meet',
      meeting_email: config.agency.meeting_email
    });
    console.log(`[Mobile] Meeting scheduling initiated for ${lead.name}`);
  } else if (autoResponse.action === 'mark_rejected') {
    updateLead(lead.name, lead.city, { stage: 'rejected' });
    console.log(`[Mobile] ${lead.name} marked as rejected`);
  } else if (autoResponse.action === 'require_human') {
    updateLead(lead.name, lead.city, { stage: 'requires_human' });
    responses.requires_human.push({
      lead_id: leadId,
      business_name: lead.name,
      message,
      flagged_at: new Date().toISOString()
    });
    console.log(`[Mobile] ${lead.name} flagged for human review`);
  } else {
    updateLead(lead.name, lead.city, { stage: 'responded' });
  }

  saveResponses(responses);

  logAction('mobile', 'response_processed', {
    name: lead.name,
    intent: intent.intent,
    auto_reply: autoResponse.auto_reply,
    action: autoResponse.action || 'auto_reply'
  });

  return autoResponse;
}

export function getStatus() {
  const leads = loadJSON('database/leads.json', []);
  const responses = loadResponses();
  const campaigns = loadJSON('database/campaigns.json', {});

  const stageCount = {};
  leads.forEach(l => {
    stageCount[l.stage] = (stageCount[l.stage] || 0) + 1;
  });

  return {
    total_leads: leads.length,
    stages: stageCount,
    total_responses: responses.conversations.length,
    meetings_scheduled: responses.meetings_scheduled.length,
    requires_human: responses.requires_human.length,
    messages_sent_today: campaigns.sent_today || 0,
    daily_limit: config.goals.daily_outreach_limit
  };
}

export function runMobile() {
  console.log('[Mobile] Monitoring responses...');
  logAction('mobile', 'run_start');

  const status = getStatus();
  console.log('\n--- Agency Status ---');
  console.log(`Total leads: ${status.total_leads}`);
  console.log('Pipeline stages:');
  Object.entries(status.stages).forEach(([stage, count]) => {
    console.log(`  ${stage}: ${count}`);
  });
  console.log(`Responses received: ${status.total_responses}`);
  console.log(`Meetings scheduled: ${status.meetings_scheduled}`);
  console.log(`Requires human: ${status.requires_human}`);
  console.log(`Messages sent today: ${status.messages_sent_today}/${status.daily_limit}`);

  const responses = loadResponses();
  if (responses.requires_human.length > 0) {
    console.log('\n--- Requires Human Attention ---');
    responses.requires_human.forEach(r => {
      console.log(`  [${r.business_name}] ${r.message?.substring(0, 80)}...`);
    });
  }

  logAction('mobile', 'status_check', status);
  return status;
}

if (process.argv[1]?.endsWith('mobile.js')) {
  runMobile();
}
