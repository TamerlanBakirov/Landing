import { loadJSON, saveJSON, updateLead, logAction, loadConfig, slugify, getLeadsByStage } from '../lib/state.js';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

const config = loadConfig();

function generatePromotionalVideoHTML(lead, projectDir) {
  const diagnosis = loadJSON(`database/diagnosis/${slugify(lead.name)}.json`, {});
  const metadata = loadJSON(`${projectDir}/metadata.json`, {});
  const colors = metadata.colors || { primary: '#2563EB', secondary: '#1E3A5F', accent: '#3B82F6', bg: '#F8FAFC' };

  return `<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1080, height=1920">
  <title>${lead.name} - Promotional Video</title>
  <style>
    @keyframes fadeIn { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
    @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
    @keyframes gradientShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: 1080px; height: 1920px; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }

    .slide {
      position: absolute; width: 1080px; height: 1920px;
      display: flex; flex-direction: column; justify-content: center; align-items: center;
      text-align: center; padding: 80px;
    }

    .slide-1 {
      background: linear-gradient(135deg, ${colors.secondary}, ${colors.primary});
      background-size: 400% 400%; animation: gradientShift 4s ease infinite; color: white;
    }
    .slide-1 .business-name { font-size: 72px; font-weight: 900; margin-bottom: 24px; animation: fadeIn 1s ease forwards; }
    .slide-1 .tagline { font-size: 36px; opacity: 0; animation: fadeIn 1s ease 0.5s forwards; }
    .slide-1 .city-badge { margin-top: 48px; background: rgba(255,255,255,0.2); padding: 16px 40px; border-radius: 50px; font-size: 28px; opacity: 0; animation: fadeIn 1s ease 1s forwards; }

    .slide-2 { background: #111827; color: white; }
    .slide-2 .problem-icon { font-size: 120px; margin-bottom: 40px; }
    .slide-2 h2 { font-size: 52px; font-weight: 800; margin-bottom: 32px; }
    .slide-2 .issues { font-size: 32px; line-height: 2; color: #9CA3AF; }
    .slide-2 .x-mark { color: #EF4444; font-size: 36px; margin-right: 16px; }

    .slide-3 { background: linear-gradient(180deg, ${colors.primary} 0%, ${colors.secondary} 100%); color: white; }
    .slide-3 h2 { font-size: 56px; font-weight: 800; margin-bottom: 48px; }
    .slide-3 .preview-frame { width: 800px; height: 1000px; background: white; border-radius: 24px; box-shadow: 0 40px 80px rgba(0,0,0,0.3); overflow: hidden; animation: slideUp 1s ease; }
    .slide-3 .preview-header { height: 60px; background: ${colors.primary}; display: flex; align-items: center; padding: 0 24px; gap: 8px; }
    .slide-3 .dot { width: 12px; height: 12px; border-radius: 50%; background: rgba(255,255,255,0.5); }
    .slide-3 .preview-body { padding: 40px; }
    .slide-3 .preview-hero { height: 200px; background: linear-gradient(135deg, ${colors.secondary}, ${colors.primary}); border-radius: 16px; margin-bottom: 24px; display: flex; align-items: center; justify-content: center; color: white; font-size: 32px; font-weight: 700; }
    .slide-3 .preview-cards { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
    .slide-3 .preview-card { height: 120px; background: ${colors.bg}; border-radius: 12px; }

    .slide-4 { background: white; color: ${colors.secondary}; }
    .slide-4 h2 { font-size: 48px; font-weight: 800; margin-bottom: 64px; }
    .slide-4 .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; width: 100%; }
    .slide-4 .stat-box { background: ${colors.bg}; padding: 48px; border-radius: 24px; text-align: center; }
    .slide-4 .stat-number { font-size: 72px; font-weight: 900; color: ${colors.primary}; }
    .slide-4 .stat-label { font-size: 24px; color: #6B7280; margin-top: 8px; }

    .slide-5 { background: linear-gradient(135deg, ${colors.primary}, ${colors.accent}); color: white; }
    .slide-5 h2 { font-size: 60px; font-weight: 900; margin-bottom: 32px; }
    .slide-5 .offer { font-size: 36px; margin-bottom: 48px; opacity: 0.9; }
    .slide-5 .cta-button { display: inline-block; background: white; color: ${colors.primary}; padding: 28px 64px; border-radius: 16px; font-size: 32px; font-weight: 800; animation: pulse 2s ease infinite; }
    .slide-5 .contact-info { margin-top: 48px; font-size: 24px; opacity: 0.8; }
  </style>
</head>
<body>
  <div class="slide slide-1" id="slide-1">
    <div class="business-name">${lead.name}</div>
    <div class="tagline">Megérdemli a legjobb online jelenlétet</div>
    <div class="city-badge">&#128205; ${lead.city}, Hungary</div>
  </div>

  <div class="slide slide-2" id="slide-2" style="display:none">
    <div class="problem-icon">&#9888;&#65039;</div>
    <h2>Jelenlegi helyzet</h2>
    <div class="issues">
      <div><span class="x-mark">&#10007;</span>${(diagnosis.issues || ['Nincs modern weboldal'])[0]}</div>
      <div><span class="x-mark">&#10007;</span>${(diagnosis.issues || ['', 'Elveszett ügyfelek'])[1] || 'Elveszett ügyfelek'}</div>
      <div><span class="x-mark">&#10007;</span>${(diagnosis.issues || ['', '', 'Gyenge online jelenlét'])[2] || 'Gyenge online jelenlét'}</div>
    </div>
  </div>

  <div class="slide slide-3" id="slide-3" style="display:none">
    <h2>Az Ön új weboldala</h2>
    <div class="preview-frame">
      <div class="preview-header"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
      <div class="preview-body">
        <div class="preview-hero">${lead.name}</div>
        <div class="preview-cards"><div class="preview-card"></div><div class="preview-card"></div><div class="preview-card"></div></div>
      </div>
    </div>
  </div>

  <div class="slide slide-4" id="slide-4" style="display:none">
    <h2>Várható eredmények</h2>
    <div class="stats-grid">
      <div class="stat-box"><div class="stat-number">+85%</div><div class="stat-label">Több megkeresés</div></div>
      <div class="stat-box"><div class="stat-number">24/7</div><div class="stat-label">Online elérhetőség</div></div>
      <div class="stat-box"><div class="stat-number">#1</div><div class="stat-label">Google találat</div></div>
      <div class="stat-box"><div class="stat-number">&#9733; ${lead.rating || '5.0'}</div><div class="stat-label">Értékelés megjelenítés</div></div>
    </div>
  </div>

  <div class="slide slide-5" id="slide-5" style="display:none">
    <h2>Készen áll?</h2>
    <div class="offer">Ingyenes konzultáció + weboldal előnézet</div>
    <div class="cta-button">Foglaljon időpontot &#8594;</div>
    <div class="contact-info">${config.agency.owner_email}</div>
  </div>

  <script>
    let current = 1;
    setInterval(() => {
      document.getElementById('slide-' + current).style.display = 'none';
      current = current >= 5 ? 1 : current + 1;
      document.getElementById('slide-' + current).style.display = 'flex';
    }, 2000);
  </script>
</body>
</html>`;
}

function generateVideoScript(lead) {
  const diagnosis = loadJSON(`database/diagnosis/${slugify(lead.name)}.json`, {});
  const issues = diagnosis.issues || [];

  return {
    duration: '10 seconds',
    format: '9:16 vertical (1080x1920)',
    slides: [
      { time: '0-2s', content: `${lead.name} logo + city`, narration: 'Business intro' },
      { time: '2-4s', content: 'Current website problems', narration: issues.slice(0, 3).join(', ') },
      { time: '4-6s', content: 'New website preview', narration: 'Modern redesign showcase' },
      { time: '6-8s', content: 'Expected results stats', narration: '+85% more inquiries' },
      { time: '8-10s', content: 'CTA - Book consultation', narration: 'Free consultation offer' }
    ],
    music: 'Upbeat corporate',
    style: 'Clean, modern, professional'
  };
}

export function filmForLead(lead) {
  const slug = slugify(lead.name);
  const projectDir = `projects/${slug}`;

  if (!existsSync(projectDir)) {
    console.log(`[Filmmaker] No project found for ${lead.name}, skipping`);
    return false;
  }

  console.log(`[Filmmaker] Creating video assets for: ${lead.name}`);
  logAction('filmmaker', 'film_start', { name: lead.name });

  const videoHTML = generatePromotionalVideoHTML(lead, projectDir);
  writeFileSync(`${projectDir}/promo-video.html`, videoHTML, 'utf-8');

  const videoScript = generateVideoScript(lead);
  saveJSON(`${projectDir}/video-script.json`, videoScript);

  const videoManifest = {
    business_name: lead.name,
    generated_at: new Date().toISOString(),
    promo_html: `${projectDir}/promo-video.html`,
    video_script: videoScript,
    resolution: '1080x1920',
    format: 'vertical',
    status: 'html_ready',
    note: 'Open promo-video.html in browser for animated preview. Use Higgsfield or ffmpeg to compile to MP4.'
  };

  saveJSON(`${projectDir}/video-manifest.json`, videoManifest);

  updateLead(lead.name, lead.city, { stage: 'filmed', video_manifest: `${projectDir}/video-manifest.json` });

  logAction('filmmaker', 'film_complete', { name: lead.name });
  console.log(`[Filmmaker] ${lead.name} video assets ready`);
  return true;
}

export function runFilmmaker() {
  console.log('[Filmmaker] Starting video production...');
  logAction('filmmaker', 'run_start');

  const leads = getLeadsByStage('built');
  console.log(`[Filmmaker] ${leads.length} leads to create videos for`);

  let filmed = 0;

  for (const lead of leads) {
    try {
      const result = filmForLead(lead);
      if (result) filmed++;
    } catch (err) {
      logAction('filmmaker', 'film_error', { name: lead.name, error: err.message });
      console.error(`[Filmmaker] Error filming ${lead.name}: ${err.message}`);
    }
  }

  console.log(`[Filmmaker] Complete. Created ${filmed} video packages.`);
  logAction('filmmaker', 'run_complete', { filmed, total: leads.length });
}

if (process.argv[1]?.endsWith('filmmaker.js')) {
  runFilmmaker();
}
