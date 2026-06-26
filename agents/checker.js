import { loadJSON, saveJSON, updateLead, logAction, loadConfig, slugify, getLeadsByStage } from '../lib/state.js';
import { existsSync } from 'fs';

const config = loadConfig();
const MIN_CONFIDENCE = config.goals.min_checker_confidence;

function checkBusinessName(lead, diagnosis) {
  const issues = [];

  if (!lead.name || lead.name.trim() === '') {
    issues.push({ field: 'name', severity: 'critical', message: 'Business name is empty' });
  }

  if (diagnosis?.business_name && diagnosis.business_name !== lead.name) {
    issues.push({ field: 'name', severity: 'warning', message: 'Name mismatch between lead and diagnosis' });
  }

  return issues;
}

function checkLinks(lead, projectDir) {
  const issues = [];

  if (lead.website && !lead.website.match(/^https?:\/\/.+\..+/)) {
    issues.push({ field: 'website', severity: 'critical', message: `Invalid website URL: ${lead.website}` });
  }

  if (lead.email && !lead.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    issues.push({ field: 'email', severity: 'critical', message: `Invalid email: ${lead.email}` });
  }

  if (projectDir && !existsSync(`${projectDir}/index.html`)) {
    issues.push({ field: 'project', severity: 'critical', message: 'Generated website HTML not found' });
  }

  return issues;
}

function checkGrammar(text) {
  const issues = [];

  if (!text || text.trim() === '') return issues;

  if (/\s{2,}/.test(text)) {
    issues.push({ field: 'grammar', severity: 'minor', message: 'Multiple consecutive spaces found' });
  }

  if (/[A-Z]{5,}/.test(text)) {
    issues.push({ field: 'grammar', severity: 'minor', message: 'Excessive capitalization detected' });
  }

  const spamWords = ['guaranteed', 'free money', 'act now', 'limited time', 'urgent', 'winner', 'congratulations', 'click here'];
  for (const word of spamWords) {
    if (text.toLowerCase().includes(word)) {
      issues.push({ field: 'spam', severity: 'warning', message: `Spam trigger word found: "${word}"` });
    }
  }

  return issues;
}

function checkPersonalization(lead, outreachMessage) {
  const issues = [];

  if (!outreachMessage) {
    issues.push({ field: 'personalization', severity: 'critical', message: 'No outreach message generated' });
    return issues;
  }

  const msg = JSON.stringify(outreachMessage);

  if (!msg.includes(lead.name)) {
    issues.push({ field: 'personalization', severity: 'critical', message: 'Business name not mentioned in outreach' });
  }

  if (!msg.includes(lead.city)) {
    issues.push({ field: 'personalization', severity: 'warning', message: 'City not mentioned in outreach' });
  }

  if (msg.includes('undefined') || msg.match(/"null"/)) {
    issues.push({ field: 'personalization', severity: 'critical', message: 'Undefined or null values in message' });
  }

  if (msg.includes('PLACEHOLDER')) {
    issues.push({ field: 'personalization', severity: 'warning', message: 'Placeholder text found - update before sending' });
  }

  if (msg.includes('[') && msg.includes(']') && msg.match(/\[.*?(NAME|COMPANY|CITY|PHONE).*?\]/)) {
    issues.push({ field: 'personalization', severity: 'critical', message: 'Template variables not replaced' });
  }

  return issues;
}

function checkScreenshots(lead, projectDir) {
  const issues = [];

  if (projectDir && existsSync(`${projectDir}/screenshots`)) {
    const afterDesktop = `${projectDir}/screenshots/after-desktop.png`;
    const afterMobile = `${projectDir}/screenshots/after-mobile.png`;

    if (!existsSync(afterDesktop)) {
      issues.push({ field: 'screenshots', severity: 'warning', message: 'Desktop screenshot of new site missing' });
    }
    if (!existsSync(afterMobile)) {
      issues.push({ field: 'screenshots', severity: 'warning', message: 'Mobile screenshot of new site missing' });
    }
  }

  return issues;
}

function checkForHallucinations(lead, diagnosis) {
  const issues = [];

  if (diagnosis) {
    if (diagnosis.current_state?.website_url === 'None' && diagnosis.current_state?.loading_speed !== 'unknown') {
      issues.push({ field: 'hallucination', severity: 'critical', message: 'Loading speed reported for non-existent website' });
    }

    if (diagnosis.current_state?.website_url === 'None' && diagnosis.seo_audit?.title && diagnosis.seo_audit.title !== 'Missing') {
      issues.push({ field: 'hallucination', severity: 'critical', message: 'SEO data reported for non-existent website' });
    }
  }

  return issues;
}

function calculateSpamScore(outreachMessage) {
  if (!outreachMessage) return 100;

  const text = JSON.stringify(outreachMessage).toLowerCase();
  let score = 0;

  const triggers = {
    'free': 10, 'guaranteed': 15, 'act now': 20, 'limited time': 15,
    'click here': 10, 'buy now': 15, 'order now': 10, 'special offer': 10,
    '!!!': 15, '???': 10, 'URGENT': 20, 'winner': 20, 'congratulations': 15,
    'million': 10, 'earn money': 15, 'make money': 15
  };

  for (const [trigger, points] of Object.entries(triggers)) {
    if (text.includes(trigger)) score += points;
  }

  const exclamationCount = (text.match(/!/g) || []).length;
  if (exclamationCount > 3) score += exclamationCount * 2;

  const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
  if (capsRatio > 0.3) score += 20;

  return Math.max(0, 100 - score);
}

export function checkLead(lead) {
  const slug = slugify(lead.name);
  const diagnosisPath = `database/diagnosis/${slug}.json`;
  const diagnosis = existsSync(diagnosisPath) ? loadJSON(diagnosisPath) : null;
  const projectDir = lead.project_dir || `projects/${slug}`;

  console.log(`[Checker] Verifying: ${lead.name}`);
  logAction('checker', 'check_start', { name: lead.name });

  const allIssues = [
    ...checkBusinessName(lead, diagnosis),
    ...checkLinks(lead, projectDir),
    ...checkPersonalization(lead, diagnosis?.outreach_message),
    ...checkScreenshots(lead, projectDir),
    ...checkForHallucinations(lead, diagnosis),
    ...checkGrammar(JSON.stringify(diagnosis?.outreach_message || ''))
  ];

  const spamScore = calculateSpamScore(diagnosis?.outreach_message);

  const criticalCount = allIssues.filter(i => i.severity === 'critical').length;
  const warningCount = allIssues.filter(i => i.severity === 'warning').length;
  const minorCount = allIssues.filter(i => i.severity === 'minor').length;

  const confidence = Math.max(0, 100 - (criticalCount * 15) - (warningCount * 5) - (minorCount * 2));
  const passed = confidence >= MIN_CONFIDENCE && spamScore >= 70;

  const report = {
    business_name: lead.name,
    city: lead.city,
    checked_at: new Date().toISOString(),
    confidence,
    spam_score: spamScore,
    passed,
    issues: allIssues,
    summary: {
      critical: criticalCount,
      warnings: warningCount,
      minor: minorCount,
      total: allIssues.length
    }
  };

  saveJSON(`database/diagnosis/${slug}-check.json`, report);

  if (passed) {
    updateLead(lead.name, lead.city, { stage: 'checked', checker_confidence: confidence, spam_score: spamScore });
    console.log(`[Checker] PASS: ${lead.name} (confidence: ${confidence}%, spam: ${spamScore}%)`);
  } else {
    updateLead(lead.name, lead.city, {
      stage: 'check_failed',
      checker_confidence: confidence,
      spam_score: spamScore,
      check_issues: allIssues.filter(i => i.severity === 'critical').map(i => i.message)
    });
    console.log(`[Checker] FAIL: ${lead.name} (confidence: ${confidence}%, spam: ${spamScore}%)`);
    allIssues.filter(i => i.severity === 'critical').forEach(i => {
      console.log(`  - ${i.message}`);
    });
  }

  logAction('checker', 'check_complete', {
    name: lead.name,
    passed,
    confidence,
    spam_score: spamScore,
    issues: allIssues.length
  });

  return report;
}

export function runChecker() {
  console.log('[Checker] Starting verification...');
  logAction('checker', 'run_start');

  const leads = getLeadsByStage('filmed');
  console.log(`[Checker] ${leads.length} leads to verify`);

  let passed = 0;
  let failed = 0;

  for (const lead of leads) {
    try {
      const report = checkLead(lead);
      if (report.passed) passed++;
      else failed++;
    } catch (err) {
      logAction('checker', 'check_error', { name: lead.name, error: err.message });
      console.error(`[Checker] Error checking ${lead.name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`[Checker] Complete. Passed: ${passed}, Failed: ${failed}`);
  logAction('checker', 'run_complete', { passed, failed, total: leads.length });
}

if (process.argv[1]?.endsWith('checker.js')) {
  runChecker();
}
