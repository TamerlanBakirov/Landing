import { loadEnv } from './env.js';

loadEnv();

const BASE_URL = 'https://maps.googleapis.com/maps/api/place';
let lastCallTime = 0;

function getApiKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error('GOOGLE_MAPS_API_KEY not set in .env');
  return key;
}

async function rateLimit() {
  const elapsed = Date.now() - lastCallTime;
  if (elapsed < 200) {
    await new Promise(r => setTimeout(r, 200 - elapsed));
  }
  lastCallTime = Date.now();
}

async function fetchJSON(url) {
  await rateLimit();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function searchPlaces(category, city, country = 'Hungary') {
  const key = getApiKey();
  const query = `${category} in ${city}, ${country}`;
  const url = `${BASE_URL}/textsearch/json?query=${encodeURIComponent(query)}&key=${key}&language=hu`;

  const data = await fetchJSON(url);

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Places API: ${data.status} - ${data.error_message || ''}`);
  }

  return (data.results || []).filter(p => p.business_status === 'OPERATIONAL').map(place => ({
    name: place.name,
    address: place.formatted_address || '',
    rating: place.rating || 0,
    reviews: place.user_ratings_total || 0,
    place_id: place.place_id,
    types: place.types || [],
    location: place.geometry?.location || null
  }));
}

export async function getPlaceDetails(placeId) {
  const key = getApiKey();
  const fields = 'formatted_phone_number,website,url,opening_hours';
  const url = `${BASE_URL}/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${key}&language=hu`;

  const data = await fetchJSON(url);

  if (data.status !== 'OK') {
    return { phone: '', website: '', google_maps_url: '', opening_hours: [] };
  }

  return {
    phone: data.result.formatted_phone_number || '',
    website: data.result.website || '',
    google_maps_url: data.result.url || '',
    opening_hours: data.result.opening_hours?.weekday_text || []
  };
}
