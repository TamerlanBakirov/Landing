import { loadJSON, logAction, loadConfig } from '../lib/state.js';
import { runScout, scoutCity } from '../agents/scout.js';
import { runDiagnoser } from '../agents/diagnoser.js';
import { runBuilder } from '../agents/builder.js';
import { runFilmmaker } from '../agents/filmmaker.js';
import { runChecker } from '../agents/checker.js';
import { runPitcher } from '../agents/pitcher.js';
import { runMobile } from '../agents/mobile.js';
// Browser only needed if agents use Playwright (currently disabled due to proxy)

const config = loadConfig();

const STAGES = {
  scout: { run: runScout, label: 'Scout Agent (Lead Generation)' },
  diagnose: { run: runDiagnoser, label: 'Diagnoser Agent (Website Analysis)' },
  build: { run: runBuilder, label: 'Builder Agent (Website Generation)' },
  film: { run: runFilmmaker, label: 'Filmmaker Agent (Video Assets)' },
  check: { run: runChecker, label: 'Checker Agent (Quality Verification)' },
  pitch: { run: runPitcher, label: 'Pitcher Agent (Outreach)' },
  monitor: { run: runMobile, label: 'Mobile Agent (Response Monitoring)' }
};

function printBanner() {
  console.log(`
╔══════════════════════════════════════════════╗
║         AI WEB AGENCY - ORCHESTRATOR         ║
╠══════════════════════════════════════════════╣
║  Country: ${config.target.country.padEnd(35)}║
║  Cities:  ${config.target.cities.map(c => c.name).join(', ').padEnd(35)}║
║  Goal:    €${config.goals.monthly_revenue_target}/month${' '.repeat(24)}║
║  Email:   ${config.agency.owner_email.padEnd(35)}║
╚══════════════════════════════════════════════╝
`);
}

function printStageHeader(stage) {
  const info = STAGES[stage];
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`▶ ${info.label}`);
  console.log(`${'═'.repeat(50)}\n`);
}

async function runStage(stageName) {
  const stage = STAGES[stageName];
  if (!stage) {
    console.error(`Unknown stage: ${stageName}`);
    return;
  }

  printStageHeader(stageName);
  logAction('orchestrator', 'stage_start', { stage: stageName });

  const start = Date.now();
  try {
    await stage.run();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n✓ ${stage.label} completed in ${elapsed}s`);
    logAction('orchestrator', 'stage_complete', { stage: stageName, elapsed_s: elapsed });
  } catch (err) {
    console.error(`\n✗ ${stage.label} failed: ${err.message}`);
    logAction('orchestrator', 'stage_error', { stage: stageName, error: err.message });
  }
}

async function runFullPipeline() {
  printBanner();
  console.log('Starting full pipeline...\n');
  logAction('orchestrator', 'pipeline_start');

  const pipelineStart = Date.now();

  for (const stageName of Object.keys(STAGES)) {
    await runStage(stageName);
  }

  // closeBrowser() not needed - agents run without Playwright

  const totalElapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Pipeline complete in ${totalElapsed}s`);
  console.log(`${'═'.repeat(50)}\n`);

  printPipelineSummary();

  logAction('orchestrator', 'pipeline_complete', { elapsed_s: totalElapsed });
}

function printPipelineSummary() {
  const leads = loadJSON('database/leads.json', []);
  const campaigns = loadJSON('database/campaigns.json', {});
  const responses = loadJSON('database/responses.json', {});

  const stageCount = {};
  leads.forEach(l => {
    stageCount[l.stage] = (stageCount[l.stage] || 0) + 1;
  });

  const avgScore = leads.length > 0
    ? (leads.reduce((sum, l) => sum + (l.score || 0), 0) / leads.length).toFixed(1)
    : 0;

  console.log(`
╔══════════════════════════════════════════════╗
║            PIPELINE SUMMARY                  ║
╠══════════════════════════════════════════════╣
║  Total Leads:      ${String(leads.length).padEnd(26)}║
║  Average Score:    ${String(avgScore).padEnd(26)}║
║  Messages Today:   ${String(campaigns.sent_today || 0).padEnd(26)}║
║  Responses:        ${String((responses.conversations || []).length).padEnd(26)}║
║  Meetings:         ${String((responses.meetings_scheduled || []).length).padEnd(26)}║
╠══════════════════════════════════════════════╣`);

  Object.entries(stageCount).forEach(([stage, count]) => {
    console.log(`║  ${stage.padEnd(18)} ${String(count).padEnd(26)}║`);
  });

  console.log(`╚══════════════════════════════════════════════╝`);
}

async function runSingleCity(cityName) {
  printBanner();
  console.log(`Running pipeline for: ${cityName}\n`);

  await scoutCity(cityName);
  await runStage('diagnose');
  await runStage('build');
  await runStage('film');
  await runStage('check');
  await runStage('pitch');
  await runStage('monitor');

  // closeBrowser() not needed - agents run without Playwright
  printPipelineSummary();
}

const args = process.argv.slice(2);

if (args.includes('--full-pipeline')) {
  runFullPipeline().catch(err => {
    console.error('Pipeline failed:', err);
    process.exit(1);
  });
} else if (args.includes('--city')) {
  const cityIdx = args.indexOf('--city');
  const cityName = args[cityIdx + 1];
  if (!cityName) {
    console.error('Usage: node orchestrator.js --city "Budapest"');
    process.exit(1);
  }
  runSingleCity(cityName).catch(err => {
    console.error('City pipeline failed:', err);
    process.exit(1);
  });
} else if (args.includes('--stage')) {
  const stageIdx = args.indexOf('--stage');
  const stageName = args[stageIdx + 1];
  runStage(stageName).then(() => {}).catch(err => {
    console.error('Stage failed:', err);
    process.exit(1);
  });
} else if (args.includes('--status')) {
  printBanner();
  printPipelineSummary();
} else {
  printBanner();
  console.log(`Usage:
  node orchestrator.js --full-pipeline     Run the complete pipeline
  node orchestrator.js --city "Budapest"   Run pipeline for a single city
  node orchestrator.js --stage scout       Run a single stage
  node orchestrator.js --status            Show pipeline status

Stages: ${Object.keys(STAGES).join(', ')}
`);
}
