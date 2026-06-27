import { readdirSync, existsSync } from 'fs';
import { loadJSON } from '../lib/state.js';

// Reads the public visit counters (counterapi.dev) for every generated site
// and prints a ranked report — which business sites are getting attention.
const WORKSPACE = 'pixelco';

async function getCount(slug) {
  try {
    const res = await fetch(`https://api.counterapi.dev/v1/${WORKSPACE}/${slug}/`);
    if (!res.ok) return 0;
    const data = await res.json();
    return data.count || 0;
  } catch {
    return 0;
  }
}

async function main() {
  const dir = 'projects';
  if (!existsSync(dir)) { console.log('No projects yet.'); return; }
  const slugs = readdirSync(dir).filter(s => existsSync(`${dir}/${s}/index.html`));

  const leads = loadJSON('database/leads.json', []);
  const nameBySlug = {};
  for (const l of leads) nameBySlug[(l.id || '').replace(/-[a-z]+$/, '')] = l.name;

  const rows = [];
  for (const slug of slugs) {
    const count = await getCount(slug);
    rows.push({ slug, count });
  }
  rows.sort((a, b) => b.count - a.count);

  const total = rows.reduce((s, r) => s + r.count, 0);
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║          PIXEL & CO. — SITE VISITS             ║');
  console.log('╠════════════════════════════════════════════════╣');
  for (const r of rows) {
    const bar = '█'.repeat(Math.min(r.count, 20));
    console.log(`║ ${String(r.count).padStart(4)}  ${r.slug.slice(0, 34).padEnd(34)} ║`);
    if (r.count > 0) console.log(`║       ${bar.padEnd(40)} ║`);
  }
  console.log('╠════════════════════════════════════════════════╣');
  console.log(`║ Total visits: ${String(total).padEnd(33)}║`);
  console.log(`║ Sites with traffic: ${String(rows.filter(r => r.count > 0).length + '/' + rows.length).padEnd(27)}║`);
  console.log('╚════════════════════════════════════════════════╝');
  console.log('\nTip: sites with visits are warm leads — prioritize them.\n');
}

main();
