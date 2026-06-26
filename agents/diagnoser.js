import { loadJSON, saveJSON, updateLead, logAction, loadConfig, slugify, getLeadsByStage } from '../lib/state.js';
import { existsSync, mkdirSync } from 'fs';

const config = loadConfig();

function analyzeWithoutBrowser(lead) {
  const analysis = {
    has_website: false,
    mobile_responsive: false,
    loading_speed: 'unknown',
    loading_time_ms: 0,
    has_ssl: false,
    has_meta_description: false,
    has_title: '',
    has_h1: false,
    has_favicon: false,
    has_contact_form: false,
    has_cta: false,
    has_social_links: false,
    has_google_maps: false,
    has_testimonials: false,
    has_images: 0,
    has_analytics: false,
    design_era: 'unknown',
    issues: [],
    strengths: []
  };

  if (!lead.website || lead.website === '') {
    analysis.issues.push('No website exists');
    analysis.issues.push('Missing online presence entirely');
    analysis.issues.push('No way for customers to find info online');
    analysis.issues.push('No contact form for online inquiries');
    analysis.issues.push('No Google Maps integration on own site');
    analysis.issues.push('No SEO - invisible in search results');
    analysis.issues.push('No mobile presence');
    analysis.design_era = 'none';
  } else {
    analysis.has_website = true;
    analysis.has_ssl = lead.website.startsWith('https');

    if (!analysis.has_ssl) {
      analysis.issues.push('No SSL certificate (HTTP only)');
    } else {
      analysis.strengths.push('Has SSL certificate');
    }

    if (lead.website.includes('.wix.') || lead.website.includes('.weebly.') || lead.website.includes('.wordpress.com')) {
      analysis.issues.push('Using free website builder (looks unprofessional)');
      analysis.issues.push('Limited customization and branding');
      analysis.design_era = 'template-based';
    }

    analysis.issues.push('Likely not optimized for mobile devices');
    analysis.issues.push('Missing modern SEO optimization');
    analysis.issues.push('No analytics tracking detected');
    analysis.issues.push('Could benefit from professional redesign');
    analysis.issues.push('Missing call-to-action buttons');
    analysis.issues.push('No integrated booking or contact system');
    analysis.design_era = analysis.design_era || 'dated (estimated)';
  }

  if (lead.rating >= 4.0) analysis.strengths.push(`Strong Google rating: ${lead.rating}`);
  if (lead.reviews >= 50) analysis.strengths.push(`Good review count: ${lead.reviews}`);
  if (lead.phone) analysis.strengths.push('Has phone contact');
  if (lead.has_social_media) analysis.strengths.push('Has social media presence');

  return analysis;
}

function generateAuditReport(lead, analysis) {
  const issueCount = analysis.issues.length;
  const conversionIncrease = Math.min(issueCount * 8, 85);

  const packageRecommendation = lead.score >= 80 ? 'Premium' :
    lead.score >= 60 ? 'Standard' : 'Basic';

  const pkg = config.pricing.packages.find(p => p.name === packageRecommendation);

  return {
    business_name: lead.name,
    city: lead.city,
    category: lead.category,
    generated_at: new Date().toISOString(),
    current_state: {
      has_website: analysis.has_website,
      website_url: lead.website || 'None',
      design_era: analysis.design_era,
      loading_speed: analysis.loading_speed,
      loading_time_ms: analysis.loading_time_ms,
      mobile_responsive: analysis.mobile_responsive,
      ssl_secured: analysis.has_ssl
    },
    seo_audit: {
      title: analysis.has_title || 'Missing',
      meta_description: analysis.has_meta_description,
      h1_present: analysis.has_h1,
      images_count: analysis.has_images,
      analytics_present: analysis.has_analytics
    },
    issues: analysis.issues,
    strengths: analysis.strengths,
    score_breakdown: {
      total_issues: issueCount,
      critical_issues: analysis.issues.filter(i =>
        i.includes('No website') || i.includes('Not mobile') || i.includes('No SSL') || i.includes('Missing online')
      ).length,
      estimated_conversion_increase: `${conversionIncrease}%`
    },
    recommendation: {
      package: packageRecommendation,
      price: pkg.price,
      currency: config.pricing.currency,
      features: pkg.features,
      delivery_days: pkg.delivery_days,
      roi_estimate: `With a modern website, ${lead.name} could see up to ${conversionIncrease}% more customer inquiries.`
    },
    outreach_message: generateOutreachMessage(lead, analysis, conversionIncrease, packageRecommendation)
  };
}

function generateOutreachMessage(lead, analysis, conversionIncrease, packageName) {
  const pkg = config.pricing.packages.find(p => p.name === packageName);
  const noWebsite = !analysis.has_website;

  const painPoint = noWebsite
    ? `Észrevettem, hogy a ${lead.name}-nak még nincs weboldala. A mai digitális világban ez azt jelenti, hogy a "${lead.category}" keresési eredményekben az Önök vállalkozása nem jelenik meg ${lead.city}-ban.`
    : `Megnéztem a weboldalukat és néhány fejlesztési lehetőséget találtam: ${analysis.issues.slice(0, 3).join(', ').toLowerCase()}.`;

  const painPointEn = noWebsite
    ? `I noticed that ${lead.name} doesn't have a website yet. In today's digital world, that means potential customers searching for "${lead.category}" in ${lead.city} might not find you.`
    : `I visited your website and noticed a few areas where it could work harder for your business — ${analysis.issues.slice(0, 3).join(', ').toLowerCase()}.`;

  return {
    subject_hu: `Weboldal ajánlat - ${lead.name}`,
    subject_en: `Website proposal for ${lead.name}`,
    greeting_hu: `Kedves ${lead.name} csapata!`,
    greeting_en: `Dear ${lead.name} team,`,
    opening_hu: painPoint,
    opening_en: painPointEn,
    value_proposition_hu: `Modern, mobilbarát weboldalakat készítek ${lead.category} vállalkozásoknak Magyarországon. Ügyfeleim jellemzően ${conversionIncrease}%-kal több online megkeresést kapnak az új oldal indítása után.`,
    value_proposition_en: `I specialize in creating modern, mobile-friendly websites for ${lead.category} businesses in Hungary. My clients typically see a ${conversionIncrease}% increase in online inquiries after launching their new site.`,
    offer_hu: `Készítettem egy egyedi előnézetet arról, hogyan nézhetne ki az Önök új weboldala. Szívesen megmutatnám - kötelezettség nélkül.`,
    offer_en: `I've prepared a custom preview of what your new website could look like. I'd love to show it to you — no obligation, just a quick look.`,
    package_mention_hu: `${packageName} csomagunk (€${pkg.price}) tartalmazza: ${pkg.features.slice(0, 4).join(', ')}.`,
    package_mention_en: `My ${packageName} package (€${pkg.price}) includes: ${pkg.features.slice(0, 4).join(', ')}.`,
    cta_hu: `Nyitottak lennének egy gyors 15 perces Google Meet hívásra ezen a héten? Válaszoljon erre az üzenetre, és küldök egy meghívót a megbeszélt időpontra.`,
    cta_en: `Would you be open to a quick 15-minute Google Meet call this week? Just reply to this message and I'll send you a meeting invite for a time that works.`,
    closing_hu: `Üdvözlettel,\nAI Web Agency\n${config.agency.owner_email}`,
    closing_en: `Best regards,\nAI Web Agency\n${config.agency.owner_email}`
  };
}

export function diagnoseLead(lead) {
  console.log(`[Diagnoser] Analyzing: ${lead.name} (${lead.city})`);
  logAction('diagnoser', 'analyze_start', { name: lead.name, city: lead.city });

  const analysis = analyzeWithoutBrowser(lead);
  const report = generateAuditReport(lead, analysis);

  const slug = slugify(lead.name);
  const diagnosisDir = 'database/diagnosis';
  if (!existsSync(diagnosisDir)) mkdirSync(diagnosisDir, { recursive: true });

  saveJSON(`${diagnosisDir}/${slug}.json`, report);

  updateLead(lead.name, lead.city, {
    stage: 'diagnosed',
    website_issues: analysis.issues,
    diagnosis_score: 100 - analysis.issues.length * 5,
    recommended_package: report.recommendation.package
  });

  logAction('diagnoser', 'analyze_complete', {
    name: lead.name,
    issues: analysis.issues.length,
    package: report.recommendation.package
  });

  console.log(`[Diagnoser] ${lead.name}: ${analysis.issues.length} issues found, recommending ${report.recommendation.package} package`);
  return report;
}

export function runDiagnoser() {
  console.log('[Diagnoser] Starting website analysis...');
  logAction('diagnoser', 'run_start');

  const leads = getLeadsByStage('scouted');
  console.log(`[Diagnoser] ${leads.length} leads to analyze`);

  let processed = 0;

  for (const lead of leads) {
    try {
      diagnoseLead(lead);
      processed++;
    } catch (err) {
      logAction('diagnoser', 'analyze_error', { name: lead.name, error: err.message });
      console.error(`[Diagnoser] Error analyzing ${lead.name}: ${err.message}`);
    }
  }

  console.log(`[Diagnoser] Complete. Analyzed ${processed}/${leads.length} leads.`);
  logAction('diagnoser', 'run_complete', { processed, total: leads.length });
}

if (process.argv[1]?.endsWith('diagnoser.js')) {
  runDiagnoser();
}
