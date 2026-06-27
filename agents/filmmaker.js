import { getLeadsByStage, updateLead, loadConfig, slugify, logAction } from '../lib/state.js';
import { categoryHu } from '../lib/categories.js';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, copyFileSync, unlinkSync } from 'fs';
import sharp from 'sharp';

const config = loadConfig();
const REMOTION_DIR = 'remotion';

function renderForLead(lead) {
  const slug = slugify(lead.name);
  const projectDir = `projects/${slug}`;
  const pub = `${REMOTION_DIR}/public`;
  mkdirSync(pub, { recursive: true });

  const hasHero = existsSync(`${projectDir}/hero.png`);
  const hasLogo = existsSync(`${projectDir}/logo.png`);
  // Remotion reads assets from its own public/ via staticFile().
  if (hasHero) copyFileSync(`${projectDir}/hero.png`, `${pub}/hero.png`);
  if (hasLogo) copyFileSync(`${projectDir}/logo.png`, `${pub}/logo.png`);

  const props = JSON.stringify({
    businessName: lead.name,
    catHu: categoryHu(lead.category),
    price: String(config.pricing.packages[0].price),
    hasHero,
    hasLogo
  });

  const outAbs = `${process.cwd()}/${projectDir}/promo.mp4`;
  const stillAbs = `${process.cwd()}/${projectDir}/.frame.png`;

  execFileSync('npx', ['remotion', 'render', 'Promo', outAbs, `--props=${props}`, '--concurrency=2', '--log=error'],
    { cwd: REMOTION_DIR, stdio: 'inherit' });
  execFileSync('npx', ['remotion', 'still', 'Promo', stillAbs, '--frame=40', `--props=${props}`, '--log=error'],
    { cwd: REMOTION_DIR, stdio: 'inherit' });

  return { projectDir, stillAbs };
}

async function makePosters(projectDir, stillAbs) {
  await sharp(stillAbs).resize(720, 1280).jpeg({ quality: 80 }).toFile(`${projectDir}/promo-poster.jpg`);
  const play = Buffer.from(
    `<svg width="220" height="220" xmlns="http://www.w3.org/2000/svg"><circle cx="110" cy="110" r="92" fill="white" opacity="0.95"/><polygon points="88,62 88,158 168,110" fill="#2563eb"/></svg>`
  );
  await sharp(stillAbs).resize(720, 1280).composite([{ input: play, gravity: 'center' }]).jpeg({ quality: 82 }).toFile(`${projectDir}/mail-poster.jpg`);
  try { unlinkSync(stillAbs); } catch {}
}

let browserReady = false;
function ensureBrowser() {
  if (browserReady) return;
  try {
    execFileSync('npx', ['remotion', 'browser', 'ensure'], { cwd: REMOTION_DIR, stdio: 'inherit' });
    browserReady = true;
  } catch (err) {
    console.error(`[Filmmaker] Browser ensure failed: ${err.message}`);
  }
}

export async function filmForLead(lead) {
  console.log(`[Filmmaker] Rendering promo video for: ${lead.name}`);
  logAction('filmmaker', 'render_start', { name: lead.name });
  ensureBrowser();
  const { projectDir, stillAbs } = renderForLead(lead);
  if (existsSync(stillAbs)) await makePosters(projectDir, stillAbs);
  updateLead(lead.name, lead.city, { stage: 'filmed', has_video: true });
  console.log(`[Filmmaker] ${lead.name}: promo.mp4 + posters ready`);
  logAction('filmmaker', 'render_complete', { name: lead.name });
}

export async function runFilmmaker() {
  console.log('[Filmmaker] Starting video generation...');
  logAction('filmmaker', 'run_start');

  if (!existsSync(`${REMOTION_DIR}/node_modules`)) {
    console.log('[Filmmaker] Remotion not installed; skipping video stage.');
    for (const lead of getLeadsByStage('built')) {
      updateLead(lead.name, lead.city, { stage: 'filmed', has_video: false });
    }
    return;
  }

  const leads = getLeadsByStage('built');
  console.log(`[Filmmaker] ${leads.length} videos to render`);
  let done = 0;

  for (const lead of leads) {
    try {
      await filmForLead(lead);
      done++;
    } catch (err) {
      console.error(`[Filmmaker] Failed for ${lead.name}: ${err.message}`);
      logAction('filmmaker', 'render_error', { name: lead.name, error: err.message });
      updateLead(lead.name, lead.city, { stage: 'filmed', has_video: false });
    }
  }

  console.log(`[Filmmaker] Complete. Rendered ${done}/${leads.length} videos.`);
  logAction('filmmaker', 'run_complete', { rendered: done, total: leads.length });
}

if (process.argv[1]?.endsWith('filmmaker.js')) {
  runFilmmaker();
}
