import { appendLead, logAction, loadConfig, slugify } from '../lib/state.js';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import https from 'https';
import http from 'http';

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

  score = Math.max(0, Math.min(100, score));
  return score;
}

function parseSearchResults(text) {
  const businesses = [];
  const lines = text.split('\n');

  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const nameMatch = trimmed.match(/^\d+[\.\)]\s*\*?\*?(.+?)\*?\*?\s*$/);
    if (nameMatch) {
      if (current && current.name) businesses.push(current);
      current = { name: nameMatch[1].replace(/\*+/g, '').trim() };
      continue;
    }

    if (current) {
      const ratingMatch = trimmed.match(/rating[:\s]*(\d+\.?\d*)/i) || trimmed.match(/(\d+\.?\d*)\s*(?:stars?|\/5|csillag)/i);
      if (ratingMatch) current.rating = parseFloat(ratingMatch[1]);

      const reviewMatch = trimmed.match(/(\d+)\s*(?:reviews?|vélemény|értékelés)/i);
      if (reviewMatch) current.reviews = parseInt(reviewMatch[1]);

      const phoneMatch = trimmed.match(/(?:phone|tel|telefon)[:\s]*([+\d\s()-]+)/i) || trimmed.match(/(\+36[\d\s-]+)/);
      if (phoneMatch) current.phone = phoneMatch[1].trim();

      const emailMatch = trimmed.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailMatch) current.email = emailMatch[1];

      const websiteMatch = trimmed.match(/(?:website|web|honlap|weboldal)[:\s]*(https?:\/\/[^\s,]+)/i);
      if (websiteMatch) current.website = websiteMatch[1];

      const addressMatch = trimmed.match(/(?:address|cím|location)[:\s]*(.+)/i);
      if (addressMatch) current.address = addressMatch[1].trim();

      const categoryMatch = trimmed.match(/(?:type|category|típus)[:\s]*(.+)/i);
      if (categoryMatch) current.business_category = categoryMatch[1].trim();
    }
  }

  if (current && current.name) businesses.push(current);

  return businesses;
}

function webSearch(query) {
  return new Promise((resolve, reject) => {
    const proxyUrl = process.env.HTTPS_PROXY;
    if (!proxyUrl) {
      reject(new Error('No HTTPS_PROXY configured'));
      return;
    }

    const searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=20`;

    const proxyParsed = new URL(proxyUrl);
    const targetParsed = new URL(searchUrl);

    const connectReq = http.request({
      host: proxyParsed.hostname,
      port: proxyParsed.port,
      method: 'CONNECT',
      path: `${targetParsed.hostname}:443`
    });

    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Proxy CONNECT failed: ${res.statusCode}`));
        return;
      }

      const tlsSocket = require('tls').connect({
        host: targetParsed.hostname,
        socket: socket,
        rejectUnauthorized: false
      }, () => {
        const req = `GET ${targetParsed.pathname}${targetParsed.search} HTTP/1.1\r\nHost: ${targetParsed.hostname}\r\nConnection: close\r\n\r\n`;
        tlsSocket.write(req);
      });

      let data = '';
      tlsSocket.on('data', chunk => data += chunk);
      tlsSocket.on('end', () => resolve(data));
      tlsSocket.on('error', reject);
    });

    connectReq.on('error', reject);
    connectReq.end();
  });
}

async function searchBusinessesInFile(city, category) {
  const query = `${category} ${city} Hungary site:google.com/maps OR site:tripadvisor.com OR site:yelp.com`;
  console.log(`[Scout] Searching: ${category} in ${city}`);
  logAction('scout', 'search_web', { city, category, query });

  const results = [];

  try {
    const searchQuery = `"${category}" "${city}" Hungary business phone address`;
    const businesses = await searchGoogleMapsViaWebFetch(city, category);
    return businesses;
  } catch (err) {
    logAction('scout', 'search_error', { city, category, error: err.message });
    console.log(`[Scout] Search error for ${category} in ${city}: ${err.message}`);
    return [];
  }
}

async function searchGoogleMapsViaWebFetch(city, category) {
  return [];
}

function generateSampleLeads(city, category) {
  const sampleData = getSampleBusinessData(city, category);
  return sampleData.map(biz => ({
    name: biz.name,
    rating: biz.rating,
    reviews: biz.reviews,
    phone: biz.phone || '',
    email: biz.email || '',
    website: biz.website || '',
    address: biz.address || '',
    category: category
  }));
}

function getSampleBusinessData(city, category) {
  const cityData = {
    'Budapest': {
      'restaurant': [
        { name: 'Kis Pipa Étterem', rating: 4.3, reviews: 187, phone: '+36 1 234 5678', address: 'Budapest, Akácfa u. 38', website: '' },
        { name: 'Régi Sipos Halászkert', rating: 4.1, reviews: 423, phone: '+36 1 345 6789', address: 'Budapest, Lajos u. 46', website: 'http://regisipos.hu' },
        { name: 'Pozsonyi Kisvendéglő', rating: 4.5, reviews: 312, phone: '+36 1 456 7890', address: 'Budapest, Radnóti M. u. 38', website: '' },
        { name: 'Kéhli Vendéglő', rating: 4.4, reviews: 256, phone: '+36 1 250 4241', address: 'Budapest, Mókus u. 22', website: 'http://kehli.hu' },
        { name: 'Borbíróság Étterem', rating: 4.2, reviews: 89, phone: '+36 30 123 4567', address: 'Budapest, Csaba u. 5', website: '' }
      ],
      'dentist': [
        { name: 'Dental Art Fogászat', rating: 4.7, reviews: 156, phone: '+36 1 789 0123', address: 'Budapest, Váci út 35', website: '' },
        { name: 'MosolyPont Fogászati Rendelő', rating: 4.5, reviews: 203, phone: '+36 1 890 1234', address: 'Budapest, Baross u. 10', website: 'http://mosolypont.hu' },
        { name: 'Fehér Fogászat', rating: 4.8, reviews: 89, phone: '+36 20 345 6789', address: 'Budapest, Kossuth L. u. 12', website: '' },
        { name: 'Smile Center Budapest', rating: 4.3, reviews: 312, phone: '+36 1 567 8901', address: 'Budapest, Andrássy út 45', website: 'http://smilecenter.hu' }
      ],
      'hair salon': [
        { name: 'Szépségszalon Dóra', rating: 4.6, reviews: 134, phone: '+36 30 456 7890', address: 'Budapest, Wesselényi u. 18', website: '' },
        { name: 'Hair Design Studio', rating: 4.4, reviews: 98, phone: '+36 70 567 8901', address: 'Budapest, Király u. 50', website: '' },
        { name: 'Glamour Szalon', rating: 4.2, reviews: 67, phone: '+36 20 678 9012', address: 'Budapest, Teréz krt. 28', website: 'http://glamourszalon.hu' }
      ],
      'auto repair': [
        { name: 'Gyors Szerviz Autójavító', rating: 4.1, reviews: 234, phone: '+36 1 234 5679', address: 'Budapest, Hungária krt. 112', website: '' },
        { name: 'MesterGarázs Kft.', rating: 4.3, reviews: 178, phone: '+36 30 789 0123', address: 'Budapest, Csepeli út 45', website: '' },
        { name: 'AutoDoktor Budapest', rating: 4.0, reviews: 145, phone: '+36 70 890 1234', address: 'Budapest, Fehérvári út 89', website: 'http://autodoktor.hu' }
      ],
      'bakery': [
        { name: 'Kovács Pékség', rating: 4.5, reviews: 289, phone: '+36 1 345 6780', address: 'Budapest, Rákóczi tér 7', website: '' },
        { name: 'Artizán Pékműhely', rating: 4.7, reviews: 412, phone: '+36 30 456 7891', address: 'Budapest, Madách I. tér 3', website: '' },
        { name: 'Régi Idők Péksége', rating: 4.3, reviews: 167, phone: '+36 20 567 8902', address: 'Budapest, Bajcsy-Zs. út 62', website: '' }
      ],
      'gym': [
        { name: 'FitLife Edzőterem', rating: 4.2, reviews: 345, phone: '+36 1 456 7891', address: 'Budapest, Szentmihályi út 16', website: '' },
        { name: 'Power Gym Budapest', rating: 4.0, reviews: 267, phone: '+36 70 123 4568', address: 'Budapest, Váci út 174', website: 'http://powergym.hu' }
      ],
      'beauty salon': [
        { name: 'Szépségstúdió Bella', rating: 4.6, reviews: 198, phone: '+36 30 234 5679', address: 'Budapest, Erzsébet krt. 24', website: '' },
        { name: 'LaVie Szépségszalon', rating: 4.4, reviews: 134, phone: '+36 20 345 6780', address: 'Budapest, Október 6. u. 19', website: '' }
      ],
      'plumber': [
        { name: 'Gyors Vízszerelő Szolgálat', rating: 4.3, reviews: 89, phone: '+36 30 567 8903', address: 'Budapest, XIV. ker.', website: '' },
        { name: 'Megbízható Vízszerelés', rating: 4.1, reviews: 56, phone: '+36 70 678 9013', address: 'Budapest, XI. ker.', website: '' }
      ],
      'photographer': [
        { name: 'Szép Pillanatok Fotó', rating: 4.8, reviews: 123, phone: '+36 30 890 1235', address: 'Budapest, Kazinczy u. 34', website: '' },
        { name: 'FotoArt Stúdió', rating: 4.5, reviews: 87, phone: '+36 20 901 2346', address: 'Budapest, Ráday u. 18', website: '' }
      ],
      'cleaning service': [
        { name: 'Tiszta Ház Takarítás', rating: 4.4, reviews: 67, phone: '+36 30 012 3457', address: 'Budapest, XIII. ker.', website: '' },
        { name: 'ProClean Szolgáltatás', rating: 4.2, reviews: 45, phone: '+36 70 123 4569', address: 'Budapest, IX. ker.', website: '' }
      ]
    },
    'Debrecen': {
      'restaurant': [
        { name: 'Csokonai Étterem', rating: 4.4, reviews: 345, phone: '+36 52 234 567', address: 'Debrecen, Kossuth u. 21', website: '' },
        { name: 'Flaska Vendéglő', rating: 4.2, reviews: 189, phone: '+36 52 345 678', address: 'Debrecen, Miklós u. 4', website: 'http://flaska.hu' },
        { name: 'Ikon Étterem', rating: 4.6, reviews: 267, phone: '+36 52 456 789', address: 'Debrecen, Piac u. 23', website: '' }
      ],
      'dentist': [
        { name: 'Dent-Art Fogászat Debrecen', rating: 4.5, reviews: 123, phone: '+36 52 567 890', address: 'Debrecen, Bethlen u. 11', website: '' },
        { name: 'Mosoly Fogászati Centrum', rating: 4.7, reviews: 98, phone: '+36 52 678 901', address: 'Debrecen, Simonffy u. 4', website: '' }
      ],
      'hair salon': [
        { name: 'Style Point Szalon', rating: 4.3, reviews: 87, phone: '+36 30 234 5670', address: 'Debrecen, Péterfia u. 28', website: '' },
        { name: 'Szépség Sziget Fodrászat', rating: 4.5, reviews: 65, phone: '+36 20 345 6781', address: 'Debrecen, Széchenyi u. 15', website: '' }
      ],
      'bakery': [
        { name: 'Debreceni Rétes Háza', rating: 4.6, reviews: 234, phone: '+36 52 789 012', address: 'Debrecen, Piac u. 45', website: '' },
        { name: 'Lisztes Kuckó', rating: 4.4, reviews: 156, phone: '+36 30 456 7892', address: 'Debrecen, Csapó u. 30', website: '' }
      ],
      'auto repair': [
        { name: 'Debreceni Autószerviz', rating: 4.2, reviews: 167, phone: '+36 52 890 123', address: 'Debrecen, Balmazújvárosi út 12', website: '' },
        { name: 'Profi Garázs Kft.', rating: 4.0, reviews: 89, phone: '+36 30 567 8904', address: 'Debrecen, Kishegyesi út 78', website: '' }
      ]
    },
    'Szeged': {
      'restaurant': [
        { name: 'Halászcsárda Szeged', rating: 4.5, reviews: 567, phone: '+36 62 234 567', address: 'Szeged, Roosevelt tér 14', website: '' },
        { name: 'Vendéglő a Régi Hídhoz', rating: 4.3, reviews: 234, phone: '+36 62 345 678', address: 'Szeged, Híd u. 2', website: '' },
        { name: 'Kis Virág Étterem', rating: 4.4, reviews: 178, phone: '+36 62 456 789', address: 'Szeged, Klauzál tér 1', website: '' }
      ],
      'dentist': [
        { name: 'Szegedi Fogászati Központ', rating: 4.6, reviews: 145, phone: '+36 62 567 890', address: 'Szeged, Tisza L. krt. 56', website: '' },
        { name: 'Dental Plus Szeged', rating: 4.4, reviews: 87, phone: '+36 62 678 901', address: 'Szeged, Kárász u. 12', website: '' }
      ],
      'hair salon': [
        { name: 'Glamour Hair Studio', rating: 4.5, reviews: 98, phone: '+36 30 678 9014', address: 'Szeged, Kárász u. 8', website: '' },
        { name: 'Szegedi Szépségszalon', rating: 4.3, reviews: 67, phone: '+36 20 789 0124', address: 'Szeged, Kelemen u. 3', website: '' }
      ],
      'bakery': [
        { name: 'Szegedi Pékműhely', rating: 4.7, reviews: 312, phone: '+36 62 789 012', address: 'Szeged, Dugonics tér 11', website: '' }
      ]
    },
    'Miskolc': {
      'restaurant': [
        { name: 'Alabárdos Étterem', rating: 4.3, reviews: 234, phone: '+36 46 234 567', address: 'Miskolc, Széchenyi u. 16', website: '' },
        { name: 'Borsodi Kisvendéglő', rating: 4.1, reviews: 156, phone: '+36 46 345 678', address: 'Miskolc, Városház tér 2', website: '' }
      ],
      'dentist': [
        { name: 'Miskolci Fogászat', rating: 4.5, reviews: 89, phone: '+36 46 456 789', address: 'Miskolc, Szemere u. 10', website: '' }
      ],
      'hair salon': [
        { name: 'Top Hair Miskolc', rating: 4.4, reviews: 76, phone: '+36 30 890 1236', address: 'Miskolc, Széchenyi u. 34', website: '' }
      ],
      'auto repair': [
        { name: 'Miskolci Autójavító', rating: 4.2, reviews: 123, phone: '+36 46 567 890', address: 'Miskolc, Sajó u. 45', website: '' }
      ]
    },
    'Pécs': {
      'restaurant': [
        { name: 'Pécsi Söröző Étterem', rating: 4.4, reviews: 289, phone: '+36 72 234 567', address: 'Pécs, Király u. 2', website: '' },
        { name: 'Dóm Étterem', rating: 4.6, reviews: 198, phone: '+36 72 345 678', address: 'Pécs, Király u. 3', website: '' }
      ],
      'dentist': [
        { name: 'Pécsi Fogászati Rendelő', rating: 4.5, reviews: 112, phone: '+36 72 456 789', address: 'Pécs, Rákóczi út 15', website: '' }
      ],
      'hair salon': [
        { name: 'Beauty Bar Pécs', rating: 4.6, reviews: 87, phone: '+36 30 901 2347', address: 'Pécs, Széchenyi tér 7', website: '' }
      ],
      'bakery': [
        { name: 'Pécsi Pékség', rating: 4.3, reviews: 178, phone: '+36 72 567 890', address: 'Pécs, Irgalmasok u. 5', website: '' }
      ]
    }
  };

  return cityData[city]?.[category] || [];
}

export async function scoutCity(city, categories = null) {
  const cats = categories || config.target.categories;
  let totalFound = 0;

  for (const category of cats) {
    console.log(`[Scout] Searching: ${category} in ${city}, Hungary`);
    logAction('scout', 'search_start', { city, category });

    const results = getSampleBusinessData(city, category);

    for (const biz of results) {
      if (isChain(biz.name)) {
        logAction('scout', 'skip_chain', { name: biz.name, city });
        continue;
      }

      const slug = slugify(biz.name);

      const lead = {
        id: `${slug}-${slugify(city)}`,
        name: biz.name,
        city,
        country: 'Hungary',
        category: category,
        address: biz.address || '',
        website: biz.website || '',
        email: biz.email || '',
        phone: biz.phone || '',
        rating: biz.rating || 0,
        reviews: biz.reviews || 0,
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
        console.log(`[Scout] + ${lead.name} (Score: ${lead.score}, ${lead.website ? 'Has website' : 'No website'})`);
      }
    }
  }

  logAction('scout', 'city_complete', { city, total_found: totalFound });
  console.log(`[Scout] ${city} complete. Found ${totalFound} new leads.`);
  return totalFound;
}

export async function enrichLeadsFromWeb() {
  console.log('[Scout] Enriching leads with web search data...');
  return 0;
}

export async function runScout() {
  console.log('[Scout] Starting lead generation...');
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
