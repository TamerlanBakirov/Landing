import { loadEnv } from './env.js';

loadEnv();

// Generates a bespoke hero image per business via OpenAI's image API.
// Returns a base64 data URI, or null when no key / no credit / any error —
// callers then fall back to a free Unsplash photo. Once a billing or auth
// error is seen we disable further calls for the whole run to avoid
// hammering a dead key.
let disabled = false;

const HERO_PROMPTS = {
  'restaurant': 'Warm, inviting fine-dining restaurant interior, elegant table settings, soft ambient lighting, professional architectural photography, cinematic depth',
  'dentist': 'Bright modern dental clinic interior, spotless minimalist design, advanced equipment, calming natural light, professional medical photography',
  'hair salon': 'Stylish upscale hair salon interior, modern styling chairs and mirrors, warm designer lighting, professional interior photography',
  'auto repair': 'Clean professional auto repair workshop, modern diagnostic equipment, well-lit organized garage, professional industrial photography',
  'bakery': 'Cozy artisan bakery interior, fresh bread and pastries on display, warm golden lighting, professional food photography',
  'beauty salon': 'Luxurious modern beauty salon interior, elegant treatment area, soft relaxing lighting, professional spa photography',
  'gym': 'Modern fitness gym interior, premium equipment, dramatic lighting, energetic professional photography',
  'plumber': 'Professional modern bathroom with quality fixtures, clean contemporary design, bright photography',
  'florist': 'Charming florist shop interior, abundant fresh colorful flowers, natural daylight, professional photography',
  'pharmacy': 'Clean modern pharmacy interior, organized shelves, bright professional lighting, welcoming healthcare photography',
  'photographer': 'Professional photography studio interior, lighting equipment and backdrops, creative modern space',
  'law firm': 'Elegant professional law office interior, classic bookshelves, refined lighting, corporate photography',
  'veterinary clinic': 'Friendly modern veterinary clinic interior, clean welcoming examination room, warm professional lighting'
};

function heroPrompt(category, city) {
  const base = HERO_PROMPTS[category] || `Modern professional ${category} business interior in a European city, clean contemporary design, inviting lighting, high-end photography`;
  return `${base}. Located in ${city}, Hungary. Photorealistic, no text, no people's faces, 16:9 wide composition, premium quality.`;
}

const LOGO_ICONS = {
  'restaurant': 'an elegant fork, spoon and plate or a chef hat',
  'dentist': 'a clean stylized tooth',
  'hair salon': 'elegant scissors or a comb',
  'auto repair': 'a wrench and gear',
  'bakery': 'a wheat stalk or a loaf of bread',
  'beauty salon': 'a lotus flower or an elegant face silhouette',
  'gym': 'a dumbbell or a strong abstract mark',
  'plumber': 'a water drop and wrench',
  'florist': 'a blooming flower',
  'pharmacy': 'a medical cross or mortar and pestle',
  'photographer': 'a camera or aperture',
  'law firm': 'scales of justice or a column',
  'veterinary clinic': 'a paw print with a heart'
};

export async function generateLogo(category, name, accentHex) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || disabled) return null;

  const icon = LOGO_ICONS[category] || 'a clean abstract geometric mark';
  const prompt = `A minimalist modern emblem logo for "${name}", a ${category} business. Centered symbol featuring ${icon}. Flat vector style, clean geometric design, primary color ${accentHex || '#2563eb'} with white, simple and professional brand mark, app-icon look, NO text, NO letters, fully transparent background.`;

  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'medium',
        background: 'transparent'
      })
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 401 || res.status === 403 || body.includes('billing')) {
        disabled = true;
        console.log(`[AI Logo] Disabled for this run (HTTP ${res.status})`);
      } else {
        console.log(`[AI Logo] Failed (HTTP ${res.status}), skipping logo.`);
      }
      return null;
    }

    const data = await res.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return null;
    return `data:image/png;base64,${b64}`;
  } catch (err) {
    console.log(`[AI Logo] Error (${err.message}), skipping logo.`);
    return null;
  }
}

export async function generateHeroImage(category, city) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || disabled) return null;

  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: heroPrompt(category, city),
        n: 1,
        size: '1536x1024',
        quality: 'medium'
      })
    });

    if (!res.ok) {
      const body = await res.text();
      // Auth or billing problems won't fix themselves mid-run — stop trying.
      if (res.status === 401 || res.status === 403 || body.includes('billing')) {
        disabled = true;
        console.log(`[AI Image] Disabled for this run (HTTP ${res.status}): ${body.slice(0, 120)}`);
      } else {
        console.log(`[AI Image] Failed (HTTP ${res.status}), using Unsplash fallback.`);
      }
      return null;
    }

    const data = await res.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return null;
    return `data:image/png;base64,${b64}`;
  } catch (err) {
    console.log(`[AI Image] Error (${err.message}), using Unsplash fallback.`);
    return null;
  }
}
