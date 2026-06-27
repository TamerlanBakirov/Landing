import { appendLead, logAction, loadConfig, slugify } from '../lib/state.js';
import { searchPlaces } from '../lib/google-places.js';

const config = loadConfig();
const CHAINS = config.target.exclude_chains.map(c => c.toLowerCase());

function isChain(name) {
  const lower = name.toLowerCase();
  return CHAINS.some(chain => lower.includes(chain));
}

function scoreLead(data) {
  let score = 50;

  if (!data.website || data.website === '') score += 25;
  else if (data.website_issues?.length > 3) score += 15;
  else if (data.website_issues?.length > 0) score += 5;

  if (data.rating >= 4.0) score += 10;
  else if (data.rating >= 3.0) score += 5;
  else if (data.rating < 3.0) score -= 10;

  if (data.reviews >= 50) score += 5;
  else if (data.reviews >= 20) score += 3;

  if (!data.email && !data.phone) score -= 15;
  if (data.phone) score += 5;
  if (data.email) score += 5;

  return Math.max(0, Math.min(100, score));
}

export async function scoutCity(city, categories = null) {
  const cats = categories || config.target.categories;
  let totalFound = 0;

  for (const category of cats) {
    console.log(`[Scout] Searching: ${category} in ${city}, Hungary`);
    logAction('scout', 'search_start', { city, category });

    let results = [];
    try {
      const places = await searchPlaces(category, city);
      console.log(`[Scout] Google Places returned ${places.length} results for ${category} in ${city}`);

      for (const place of places) {
        if (isChain(place.name)) {
          logAction('scout', 'skip_chain', { name: place.name, city });
          continue;
        }

          results.push({
          name: place.name,
          address: place.address,
          rating: place.rating,
          reviews: place.reviews,
          phone: place.phone || '',
          website: place.website || '',
          email: place.email || '',
          opening_hours: place.opening_hours || '',
          place_id: place.place_id
        });
      }
    } catch (err) {
      console.log(`[Scout] API error for ${category} in ${city}: ${err.message}`);
      logAction('scout', 'search_error', { city, category, error: err.message });
      continue;
    }

    for (const biz of results) {
      // Only target businesses that have NO website but DO have an email.
      // No website = needs our product. Has email = we can auto-contact them.
      if (biz.website && biz.website !== '') {
        logAction('scout', 'skip_has_website', { name: biz.name, city, website: biz.website });
        continue;
      }
      if (!biz.email || biz.email === '') {
        logAction('scout', 'skip_no_email', { name: biz.name, city });
        continue;
      }

      const slug = slugify(biz.name);

      const lead = {
        id: `${slug}-${slugify(city)}`,
        name: biz.name,
        city,
        country: 'Hungary',
        category,
        address: biz.address || '',
        website: biz.website || '',
        email: biz.email || '',
        phone: biz.phone || '',
        rating: biz.rating || 0,
        reviews: biz.reviews || 0,
        opening_hours: biz.opening_hours || '',
        place_id: biz.place_id || '',
        screenshot: null,
        social_links: [],
        has_social_media: false,
        website_issues: [],
        stage: 'scouted',
        score: 0,
        retries: 0
      };

      lead.score = scoreLead(lead);

      const added = appendLead(lead);
      if (added) {
        totalFound++;
        logAction('scout', 'lead_added', {
          name: lead.name,
          city,
          score: lead.score,
          has_website: !!lead.website
        });
        console.log(`[Scout] + ${lead.name} (Score: ${lead.score}, No website, Email: ${lead.email})`);
      }
    }
  }

  logAction('scout', 'city_complete', { city, total_found: totalFound });
  console.log(`[Scout] ${city} complete. Found ${totalFound} new leads.`);
  return totalFound;
}

export async function runScout() {
  console.log('[Scout] Starting lead generation via Google Places API...');
  logAction('scout', 'run_start', { cities: config.target.cities.map(c => c.name) });

  let totalLeads = 0;

  for (const city of config.target.cities) {
    const found = await scoutCity(city.name);
    totalLeads += found;
  }

  console.log(`[Scout] Complete. Total new leads: ${totalLeads}`);
  logAction('scout', 'run_complete', { total_leads: totalLeads });
  return totalLeads;
}

if (process.argv[1]?.endsWith('scout.js')) {
  runScout().catch(console.error);
}
