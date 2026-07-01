// Refresh every already-built website with the current builder template.
// Reuses each project's cached hero.png/logo.png (no AI cost) and keeps
// pipeline stages untouched, so pitched leads stay pitched.
//
//   node scripts/rebuild-sites.js            # rebuild all existing projects
//   node scripts/rebuild-sites.js <slug>     # rebuild one project

import { loadJSON, slugify } from '../lib/state.js';
import { buildForLead } from '../agents/builder.js';
import { existsSync } from 'fs';

const onlySlug = process.argv[2] || null;
const leads = loadJSON('database/leads.json', []);

const targets = leads.filter(l => {
  const slug = slugify(l.name);
  if (onlySlug && slug !== onlySlug) return false;
  return existsSync(`projects/${slug}/index.html`);
});

console.log(`[Rebuild] ${targets.length} existing site(s) to refresh`);

let done = 0;
for (const lead of targets) {
  try {
    await buildForLead(lead, { keepStage: true });
    done++;
  } catch (err) {
    console.error(`[Rebuild] Failed for ${lead.name}: ${err.message}`);
  }
}

console.log(`[Rebuild] Complete. Refreshed ${done}/${targets.length} sites.`);
