import { loadJSON, saveJSON, updateLead, logAction, loadConfig, slugify, getLeadsByStage } from '../lib/state.js';
import { categoryHu } from '../lib/categories.js';
import { existsSync, mkdirSync } from 'fs';

const config = loadConfig();

async function analyzeWithPageSpeed(url) {
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&category=seo&category=performance&category=best-practices&strategy=mobile`;

  try {
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const perf = data.lighthouseResult?.categories?.performance?.score ?? null;
    const seo = data.lighthouseResult?.categories?.seo?.score ?? null;
    const bp = data.lighthouseResult?.categories?.['best-practices']?.score ?? null;
    const audits = data.lighthouseResult?.audits || {};

    return {
      performance_score: perf !== null ? Math.round(perf * 100) : null,
      seo_score: seo !== null ? Math.round(seo * 100) : null,
      best_practices_score: bp !== null ? Math.round(bp * 100) : null,
      loading_time_ms: audits['interactive']?.numericValue || 0,
      first_contentful_paint: audits['first-contentful-paint']?.displayValue || 'N/A',
      speed_index: audits['speed-index']?.displayValue || 'N/A',
      is_mobile_friendly: audits['viewport']?.score === 1,
      has_meta_description: audits['meta-description']?.score === 1,
      has_title: audits['document-title']?.score === 1,
      has_https: audits['is-on-https']?.score === 1,
      has_viewport: audits['viewport']?.score === 1,
      image_optimization: audits['uses-optimized-images']?.score ?? null,
      source: 'pagespeed_api'
    };
  } catch (err) {
    console.log(`[Diagnoser] PageSpeed API failed for ${url}: ${err.message}`);
    return null;
  }
}

function buildAnalysis(lead, pageSpeedData) {
  const analysis = {
    has_website: false,
    mobile_responsive: false,
    loading_speed: 'unknown',
    loading_time_ms: 0,
    has_ssl: false,
    has_meta_description: false,
    has_title: false,
    has_h1: false,
    has_favicon: false,
    has_contact_form: false,
    has_cta: false,
    has_social_links: false,
    has_google_maps: false,
    performance_score: null,
    seo_score: null,
    issues: [],
    strengths: [],
    source: 'estimate'
  };

  if (!lead.website || lead.website === '') {
    analysis.issues.push('No website exists');
    analysis.issues.push('Missing online presence entirely');
    analysis.issues.push('No way for customers to find info online');
    analysis.issues.push('No contact form for online inquiries');
    analysis.issues.push('No SEO - invisible in search results');
    analysis.issues.push('No mobile presence');
    analysis.design_era = 'none';
    return analysis;
  }

  analysis.has_website = true;
  analysis.has_ssl = lead.website.startsWith('https');

  if (pageSpeedData) {
    analysis.source = 'pagespeed_api';
    analysis.performance_score = pageSpeedData.performance_score;
    analysis.seo_score = pageSpeedData.seo_score;
    analysis.loading_time_ms = pageSpeedData.loading_time_ms;
    analysis.mobile_responsive = pageSpeedData.is_mobile_friendly;
    analysis.has_meta_description = pageSpeedData.has_meta_description;
    analysis.has_title = pageSpeedData.has_title;

    if (pageSpeedData.performance_score !== null && pageSpeedData.performance_score < 50) {
      analysis.issues.push(`Poor performance score: ${pageSpeedData.performance_score}/100`);
    } else if (pageSpeedData.performance_score !== null && pageSpeedData.performance_score < 80) {
      analysis.issues.push(`Average performance score: ${pageSpeedData.performance_score}/100`);
    } else if (pageSpeedData.performance_score !== null) {
      analysis.strengths.push(`Good performance score: ${pageSpeedData.performance_score}/100`);
    }

    if (pageSpeedData.seo_score !== null && pageSpeedData.seo_score < 50) {
      analysis.issues.push(`Poor SEO score: ${pageSpeedData.seo_score}/100`);
    } else if (pageSpeedData.seo_score !== null && pageSpeedData.seo_score < 80) {
      analysis.issues.push(`SEO needs improvement: ${pageSpeedData.seo_score}/100`);
    } else if (pageSpeedData.seo_score !== null) {
      analysis.strengths.push(`Good SEO score: ${pageSpeedData.seo_score}/100`);
    }

    if (!pageSpeedData.is_mobile_friendly) {
      analysis.issues.push('Not optimized for mobile devices');
    } else {
      analysis.strengths.push('Mobile-friendly design');
    }

    if (!pageSpeedData.has_meta_description) {
      analysis.issues.push('Missing meta description');
    }

    if (!pageSpeedData.has_https) {
      analysis.issues.push('No SSL certificate (HTTP only)');
    } else {
      analysis.strengths.push('Has SSL certificate');
    }

    if (pageSpeedData.loading_time_ms > 5000) {
      analysis.issues.push(`Slow loading time: ${(pageSpeedData.loading_time_ms / 1000).toFixed(1)}s`);
      analysis.loading_speed = 'slow';
    } else if (pageSpeedData.loading_time_ms > 3000) {
      analysis.issues.push(`Average loading time: ${(pageSpeedData.loading_time_ms / 1000).toFixed(1)}s`);
      analysis.loading_speed = 'average';
    } else {
      analysis.loading_speed = 'fast';
    }
  } else {
    if (!analysis.has_ssl) analysis.issues.push('No SSL certificate (HTTP only)');
    analysis.issues.push('Likely not optimized for mobile devices');
    analysis.issues.push('Missing modern SEO optimization');
    analysis.issues.push('No analytics tracking detected');
  }

  if (lead.website.includes('.wix.') || lead.website.includes('.weebly.') || lead.website.includes('.wordpress.com')) {
    analysis.issues.push('Using free website builder (looks unprofessional)');
    analysis.design_era = 'template-based';
  }

  if (lead.rating >= 4.0) analysis.strengths.push(`Strong Google rating: ${lead.rating}`);
  if (lead.reviews >= 50) analysis.strengths.push(`Good review count: ${lead.reviews}`);
  if (lead.phone) analysis.strengths.push('Has phone contact');

  return analysis;
}

function generateAuditReport(lead, analysis) {
  const issueCount = analysis.issues.length;
  const conversionIncrease = Math.min(issueCount * 8, 85);

  // Single fixed package — see config.pricing.packages[0].
  const pkg = config.pricing.packages[0];
  const packageRecommendation = pkg.name;

  return {
    business_name: lead.name,
    city: lead.city,
    category: lead.category,
    generated_at: new Date().toISOString(),
    analysis_source: analysis.source,
    current_state: {
      has_website: analysis.has_website,
      website_url: lead.website || 'None',
      design_era: analysis.design_era || 'unknown',
      loading_speed: analysis.loading_speed,
      loading_time_ms: analysis.loading_time_ms,
      mobile_responsive: analysis.mobile_responsive,
      ssl_secured: analysis.has_ssl,
      performance_score: analysis.performance_score,
      seo_score: analysis.seo_score
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
  const pkg = config.pricing.packages[0];
  const catHu = categoryHu(lead.category);
  const slug = slugify(lead.name);
  const previewUrl = `${config.agency.site_base_url}/${slug}/`;
  const agency = config.agency.name;

  const benefits = [
    'Modern, mobilbarát megjelenés',
    'Megjelenés a Google keresőben',
    'Több megkeresés, több ügyfél',
    'Néhány nap alatt elkészül'
  ];

  // Plain-text fallback (no raw URL — the link label carries it in HTML).
  const body_hu = `Kedves ${lead.name} csapata!

Modern, mobilbarát weboldalakat készítünk magyarországi vállalkozásoknak – és a ${lead.name} számára már el is készítettünk egy ingyenes előnézetet.

Tekintse meg, hogyan nézne ki az Önök új weboldala:
Minta weboldal megtekintése → ${previewUrl}

Miért érdemes?
Amikor valaki ${catHu} szolgáltatást keres ${lead.city}-ban, az Önök vállalkozása ma még nem jelenik meg a Google találatai között. Egy modern weboldal ezen változtat:
- ${benefits.join('\n- ')}

A teljes weboldal ára mindössze €${pkg.price}.

Érdekli? Egyszerűen válaszoljon erre az e-mailre, és megbeszéljük a részleteket – kötelezettség nélkül.

Üdvözlettel,
${agency}
${config.agency.owner_email}`;

  return {
    subject_hu: `Ingyenes weboldal előnézet a ${lead.name} számára`,
    subject_en: `Free website preview for ${lead.name}`,
    preview_url: previewUrl,
    body_hu,
    body_html_hu: renderHtmlEmail({
      lead, catHu, previewUrl, price: pkg.price, benefits,
      agency, ownerEmail: config.agency.owner_email
    }),
    body_en: `Dear ${lead.name} team,\n\nWe build modern, mobile-friendly websites for Hungarian businesses — and we've already prepared a free preview for ${lead.name}.\n\nSee how your new website could look: ${previewUrl}\n\nWhen someone searches for ${lead.category} services in ${lead.city}, your business doesn't currently show up on Google. A modern website changes that.\n\nThe complete website costs just €${pkg.price}.\n\nInterested? Simply reply to this email and we'll discuss the details — no obligation.\n\nBest regards,\n${agency}\n${config.agency.owner_email}`
  };
}

// Clean sales-oriented HTML email: hook → preview button (+ video injected
// below it) → why it matters + benefits → price → reply CTA → signature.
function renderHtmlEmail({ lead, catHu, previewUrl, price, benefits, agency, ownerEmail }) {
  const benefitRows = benefits.map(b =>
    `<tr><td style="padding:6px 0;font-size:15px;color:#374151;">
       <span style="color:#16a34a;font-weight:bold;">✓</span>&nbsp;&nbsp;${b}
     </td></tr>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="hu"><body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;">
        <tr><td style="padding:36px 38px 12px;">
          <p style="font-size:16px;line-height:1.6;margin:0 0 18px;">Kedves <strong>${lead.name}</strong> csapata!</p>
          <p style="font-size:15px;line-height:1.65;margin:0 0 22px;color:#374151;">Modern, mobilbarát weboldalakat készítünk magyarországi vállalkozásoknak – és a <strong>${lead.name}</strong> számára már el is készítettünk egy <strong>ingyenes előnézetet</strong>.</p>
          <p style="font-size:15px;line-height:1.6;margin:0 0 18px;color:#374151;">Tekintse meg, hogyan nézne ki az Önök új weboldala:</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 26px;"><tr><td align="center" style="border-radius:50px;background:#2563eb;">
            <a href="${previewUrl}" target="_blank" style="display:inline-block;padding:15px 40px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:50px;">Minta weboldal megtekintése →</a>
          </td></tr></table>
          <p style="font-size:16px;font-weight:bold;line-height:1.5;margin:14px 0 10px;color:#111827;">Miért érdemes?</p>
          <p style="font-size:15px;line-height:1.65;margin:0 0 14px;color:#374151;">Amikor valaki <strong>${catHu}</strong> szolgáltatást keres ${lead.city}-ban, az Önök vállalkozása ma még nem jelenik meg a Google találatai között. Egy modern weboldal ezen változtat:</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">${benefitRows}</table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#f0f7ff;border-radius:12px;">
            <tr><td style="padding:18px 22px;font-size:16px;color:#111827;">A teljes weboldal ára mindössze <strong style="font-size:20px;color:#2563eb;">€${price}</strong></td></tr>
          </table>
          <p style="font-size:15px;line-height:1.65;margin:0 0 26px;color:#374151;">Érdekli? Egyszerűen <strong>válaszoljon erre az e-mailre</strong>, és megbeszéljük a részleteket – kötelezettség nélkül.</p>
          <p style="font-size:15px;line-height:1.5;margin:0;color:#111827;">Üdvözlettel,<br><strong>${agency}</strong><br><a href="mailto:${ownerEmail}" style="color:#2563eb;text-decoration:none;">${ownerEmail}</a></p>
        </td></tr>
      </table>
      <p style="font-size:12px;color:#9ca3af;margin:16px 0 0;">${agency}</p>
    </td></tr>
  </table>
</body></html>`;
}

export async function diagnoseLead(lead) {
  console.log(`[Diagnoser] Analyzing: ${lead.name} (${lead.city})`);
  logAction('diagnoser', 'analyze_start', { name: lead.name, city: lead.city });

  let pageSpeedData = null;
  if (lead.website) {
    console.log(`[Diagnoser] Running PageSpeed analysis for ${lead.website}...`);
    pageSpeedData = await analyzeWithPageSpeed(lead.website);
  }

  const analysis = buildAnalysis(lead, pageSpeedData);
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
    package: report.recommendation.package,
    source: analysis.source
  });

  console.log(`[Diagnoser] ${lead.name}: ${analysis.issues.length} issues found (${analysis.source}), recommending ${report.recommendation.package} package`);
  return report;
}

export async function runDiagnoser() {
  console.log('[Diagnoser] Starting website analysis...');
  logAction('diagnoser', 'run_start');

  const leads = getLeadsByStage('scouted');
  console.log(`[Diagnoser] ${leads.length} leads to analyze`);

  let processed = 0;

  for (const lead of leads) {
    try {
      await diagnoseLead(lead);
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
