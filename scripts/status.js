import { loadJSON, loadConfig } from '../lib/state.js';

const config = loadConfig();

function getStatus() {
  const leads = loadJSON('database/leads.json', []);
  const campaigns = loadJSON('database/campaigns.json', {});
  const responses = loadJSON('database/responses.json', {});
  const today = new Date().toISOString().split('T')[0];
  const todayLogs = loadJSON(`database/logs/${today}.json`, []);

  const stageCount = {};
  const cityCount = {};
  const categoryCount = {};
  const scoreDistribution = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };

  leads.forEach(l => {
    stageCount[l.stage] = (stageCount[l.stage] || 0) + 1;
    cityCount[l.city] = (cityCount[l.city] || 0) + 1;
    categoryCount[l.category] = (categoryCount[l.category] || 0) + 1;

    const score = l.score || 0;
    if (score <= 20) scoreDistribution['0-20']++;
    else if (score <= 40) scoreDistribution['21-40']++;
    else if (score <= 60) scoreDistribution['41-60']++;
    else if (score <= 80) scoreDistribution['61-80']++;
    else scoreDistribution['81-100']++;
  });

  const avgScore = leads.length > 0
    ? (leads.reduce((sum, l) => sum + (l.score || 0), 0) / leads.length).toFixed(1)
    : 0;

  const highScoreLeads = leads.filter(l => (l.score || 0) >= config.goals.min_build_score);

  const monthlyRevenueEstimate = (responses.meetings_scheduled || []).length *
    config.pricing.packages[1].price * 0.3;

  console.log(`
╔══════════════════════════════════════════════════════════╗
║              AI WEB AGENCY - DASHBOARD                   ║
║              ${new Date().toISOString().split('T')[0]}                              ║
╠══════════════════════════════════════════════════════════╣

  📊 OVERVIEW
  ─────────────────────────────
  Total Leads:        ${leads.length}
  Average Score:      ${avgScore}
  High-Score Leads:   ${highScoreLeads.length} (score ≥ ${config.goals.min_build_score})
  Messages Sent:      ${campaigns.sent_today || 0}/${config.goals.daily_outreach_limit}
  Responses:          ${(responses.conversations || []).length}
  Meetings Scheduled: ${(responses.meetings_scheduled || []).length}
  Needs Human:        ${(responses.requires_human || []).length}

  💰 REVENUE
  ─────────────────────────────
  Monthly Target:     €${config.goals.monthly_revenue_target}
  Est. Pipeline:      €${monthlyRevenueEstimate.toFixed(0)}
  Progress:           ${((monthlyRevenueEstimate / config.goals.monthly_revenue_target) * 100).toFixed(0)}%

  📍 BY CITY
  ─────────────────────────────`);

  Object.entries(cityCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([city, count]) => {
      console.log(`  ${city.padEnd(20)} ${count} leads`);
    });

  console.log(`
  📈 PIPELINE STAGES
  ─────────────────────────────`);

  const stageOrder = config.pipeline.stages;
  stageOrder.forEach(stage => {
    const count = stageCount[stage] || 0;
    const bar = '█'.repeat(Math.min(count, 30));
    console.log(`  ${stage.padEnd(20)} ${String(count).padStart(4)} ${bar}`);
  });

  if (stageCount['check_failed']) {
    console.log(`  ${'check_failed'.padEnd(20)} ${String(stageCount['check_failed']).padStart(4)} ${'░'.repeat(stageCount['check_failed'])}`);
  }
  if (stageCount['rejected']) {
    console.log(`  ${'rejected'.padEnd(20)} ${String(stageCount['rejected']).padStart(4)} ${'░'.repeat(stageCount['rejected'])}`);
  }

  console.log(`
  📊 SCORE DISTRIBUTION
  ─────────────────────────────`);

  Object.entries(scoreDistribution).forEach(([range, count]) => {
    const bar = '█'.repeat(count);
    console.log(`  ${range.padEnd(10)} ${String(count).padStart(4)} ${bar}`);
  });

  console.log(`
  🏷️  TOP CATEGORIES
  ─────────────────────────────`);

  Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([cat, count]) => {
      console.log(`  ${cat.padEnd(20)} ${count}`);
    });

  console.log(`
  📝 TODAY'S ACTIVITY
  ─────────────────────────────
  Log entries: ${todayLogs.length}
`);

  const agentActivity = {};
  todayLogs.forEach(log => {
    agentActivity[log.agent] = (agentActivity[log.agent] || 0) + 1;
  });

  Object.entries(agentActivity)
    .sort((a, b) => b[1] - a[1])
    .forEach(([agent, count]) => {
      console.log(`  ${agent.padEnd(15)} ${count} actions`);
    });

  if ((responses.requires_human || []).length > 0) {
    console.log(`
  ⚠️  REQUIRES HUMAN ATTENTION
  ─────────────────────────────`);
    (responses.requires_human || []).forEach(r => {
      console.log(`  [${r.business_name}] ${r.message?.substring(0, 60) || 'Review needed'}...`);
    });
  }

  console.log(`
╚══════════════════════════════════════════════════════════╝`);
}

getStatus();
