const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const CATEGORY_MAP = {
  'restaurant': ['amenity=restaurant', 'amenity=cafe'],
  'dentist': ['amenity=dentist', 'healthcare=dentist'],
  'hair salon': ['shop=hairdresser'],
  'auto repair': ['shop=car_repair'],
  'plumber': ['craft=plumber'],
  'electrician': ['craft=electrician'],
  'bakery': ['shop=bakery'],
  'gym': ['leisure=fitness_centre'],
  'yoga studio': ['leisure=fitness_centre'],
  'law firm': ['office=lawyer'],
  'accountant': ['office=accountant'],
  'real estate agency': ['office=estate_agent'],
  'veterinary clinic': ['amenity=veterinary'],
  'photographer': ['craft=photographer'],
  'florist': ['shop=florist'],
  'tailor': ['shop=tailor'],
  'cleaning service': ['shop=cleaning'],
  'moving company': ['office=moving_company'],
  'car wash': ['amenity=car_wash'],
  'beauty salon': ['shop=beauty'],
  'spa': ['leisure=spa', 'amenity=spa'],
  'tattoo studio': ['shop=tattoo'],
  'pet shop': ['shop=pet'],
  'pharmacy': ['amenity=pharmacy'],
  'optician': ['shop=optician']
};

function buildOverpassQuery(category, city) {
  const tags = CATEGORY_MAP[category] || [`name~"${category}",i`];

  const filters = tags.map(tag => {
    const [key, value] = tag.split('=');
    if (key === 'name~') {
      return `node[${tag}](area.city);\n  way[${tag}](area.city);`;
    }
    return `node["${key}"="${value}"](area.city);\n  way["${key}"="${value}"](area.city);`;
  }).join('\n  ');

  return `[out:json][timeout:30];
area["name"="${city}"]["boundary"="administrative"]->.city;
(
  ${filters}
);
out center body;`;
}

export async function searchPlaces(category, city) {
  const query = buildOverpassQuery(category, city);

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'AI-Web-Agency/1.0 (lead generation tool)',
      'Accept': 'application/json'
    },
    body: `data=${encodeURIComponent(query)}`
  });

  if (!res.ok) throw new Error(`Overpass API HTTP ${res.status}`);
  const data = await res.json();

  return (data.elements || [])
    .filter(el => el.tags?.name)
    .map(el => ({
      name: el.tags.name,
      address: [el.tags['addr:street'], el.tags['addr:housenumber'], el.tags['addr:city']].filter(Boolean).join(' ') || '',
      rating: 0,
      reviews: 0,
      place_id: String(el.id),
      phone: el.tags.phone || el.tags['contact:phone'] || '',
      website: el.tags.website || el.tags['contact:website'] || '',
      email: el.tags.email || el.tags['contact:email'] || '',
      opening_hours: el.tags.opening_hours || '',
      types: Object.entries(el.tags).filter(([k]) => ['amenity', 'shop', 'craft', 'leisure', 'office', 'healthcare'].includes(k)).map(([k, v]) => `${k}:${v}`)
    }));
}

export async function getPlaceDetails(placeId) {
  return { phone: '', website: '', google_maps_url: '', opening_hours: [] };
}
