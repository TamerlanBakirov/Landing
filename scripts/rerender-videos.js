// Re-render every existing promo video with the current Promo composition
// (e.g. after a video template change) and refresh posters + site HTML.
// Pipeline stages are left untouched.
//
//   node scripts/rerender-videos.js            # all projects with promo.mp4
//   node scripts/rerender-videos.js <slug>     # one project

import { loadJSON, slugify } from '../lib/state.js';
import { filmForLead } from '../agents/filmmaker.js';
import { existsSync } from 'fs';

const onlySlug = process.argv[2] || null;
const leads = loadJSON('database/leads.json', []);

const targets = leads.filter(l => {
  const slug = slugify(l.name);
  if (onlySlug && slug !== onlySlug) return false;
  return existsSync(`projects/${slug}/promo.mp4`);
});

console.log(`[Rerender] ${targets.length} video(s) to re-render`);

let done = 0;
for (const lead of targets) {
  try {
    await filmForLead(lead, { keepStage: true });
    done++;
  } catch (err) {
    console.error(`[Rerender] Failed for ${lead.name}: ${err.message}`);
  }
}

console.log(`[Rerender] Complete. Re-rendered ${done}/${targets.length} videos.`);
