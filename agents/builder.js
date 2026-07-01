import { loadJSON, saveJSON, updateLead, logAction, loadConfig, slugify, getLeadsByStage } from '../lib/state.js';
import { scoreLead } from './scout.js';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { generatePortfolio } from '../scripts/portfolio.js';
import { generateHeroImage, generateLogo } from '../lib/openai-image.js';
import sharp from 'sharp';

const config = loadConfig();

// ════════════════════════════════════════════════════════════════
// PHOTOS — verified Unsplash stock photos per category (free, no key).
// Fetched at build time and embedded as base64 so sites are self-contained.
// ════════════════════════════════════════════════════════════════
const UNSPLASH = 'https://images.unsplash.com/';

function heroUrl(id) { return `${UNSPLASH}${id}?w=1200&q=55&auto=format&fit=crop&h=675`; }
function aboutUrl(id) { return `${UNSPLASH}${id}?w=700&q=60&auto=format&fit=crop&h=525`; }
function galleryUrl(id) { return `${UNSPLASH}${id}?w=500&q=55&auto=format&fit=crop&h=375`; }

const photoCache = new Map();

function src(url) {
  return photoCache.get(url) || url;
}

async function prefetchPhotos(category, city, projectDir) {
  const photos = getPhotos(category);
  const hero = heroUrl(photos.hero);
  const heroFile = projectDir ? `${projectDir}/hero.png` : null;

  // Hero: reuse a previously generated hero.png if present (saves an API
  // call/cost), else generate a bespoke AI image, else Unsplash fallback.
  // Delete hero.png to force a fresh AI hero on the next build.
  if (!photoCache.has(hero)) {
    if (heroFile && existsSync(heroFile)) {
      const buf = readFileSync(heroFile);
      photoCache.set(hero, `data:image/png;base64,${buf.toString('base64')}`);
      console.log(`[Builder] Reusing existing hero image for ${category}`);
    } else {
      try {
        const aiHero = await generateHeroImage(category, city);
        if (aiHero) {
          photoCache.set(hero, aiHero);
          if (heroFile) writeFileSync(heroFile, Buffer.from(aiHero.split(',')[1], 'base64'));
          console.log(`[Builder] AI hero image generated for ${category} in ${city}`);
        }
      } catch (err) {
        console.error(`[Builder] AI hero failed: ${err.message}`);
      }
    }
  }

  const urls = new Set([
    hero,
    aboutUrl(photos.gallery[0].id),
    ...photos.gallery.map(g => galleryUrl(g.id))
  ]);

  for (const url of urls) {
    if (photoCache.has(url)) continue;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      photoCache.set(url, `data:image/jpeg;base64,${buf.toString('base64')}`);
    } catch (err) {
      console.error(`[Builder] Photo fetch failed (${url}): ${err.message}`);
    }
  }
}

const PHOTOS = {
  restaurant: {
    hero: 'photo-1517248135467-4c7edcad34c4',
    gallery: [
      { id: 'photo-1414235077428-338989a2e8c0', hu: 'Elegáns belső tér', en: 'Elegant interior' },
      { id: 'photo-1466978913421-dad2ebd01d17', hu: 'Friss fogások', en: 'Fresh dishes' },
      { id: 'photo-1555396273-367ea4eb4db5', hu: 'Hangulatos asztalok', en: 'Cozy tables' },
      { id: 'photo-1565299624946-b28f40a0ae38', hu: 'Házi specialitások', en: 'House specialties' },
      { id: 'photo-1504674900247-0877df9cc836', hu: 'Gourmet élmények', en: 'Gourmet experiences' },
      { id: 'photo-1414235077428-338989a2e8c0', hu: 'Vendégváró tér', en: 'Welcoming space' }
    ]
  },
  dentist: {
    hero: 'photo-1629909613654-28e377c37b09',
    gallery: [
      { id: 'photo-1588776814546-1ffcf47267a5', hu: 'Modern rendelő', en: 'Modern clinic' },
      { id: 'photo-1606811841689-23dfddce3e95', hu: 'Kényelmes kezelőszék', en: 'Comfortable chair' },
      { id: 'photo-1612349317150-e413f6a5b16d', hu: 'Korszerű eszközök', en: 'Modern equipment' },
      { id: 'photo-1629909613654-28e377c37b09', hu: 'Steril környezet', en: 'Sterile environment' },
      { id: 'photo-1588776814546-1ffcf47267a5', hu: 'Szakértő csapat', en: 'Expert team' },
      { id: 'photo-1606811841689-23dfddce3e95', hu: 'Fájdalommentes ellátás', en: 'Painless care' }
    ]
  },
  'hair salon': {
    hero: 'photo-1560066984-138dadb4c035',
    gallery: [
      { id: 'photo-1521590832167-7bcbfaa6381f', hu: 'Profi hajformázás', en: 'Pro styling' },
      { id: 'photo-1562322140-8baeececf3df', hu: 'Elegáns szalon', en: 'Elegant salon' },
      { id: 'photo-1599351431202-1e0f0137899a', hu: 'Precíz hajvágás', en: 'Precise cuts' },
      { id: 'photo-1633681926022-84c23e8cb2d6', hu: 'Hajfestés', en: 'Hair coloring' },
      { id: 'photo-1560066984-138dadb4c035', hu: 'Modern környezet', en: 'Modern space' },
      { id: 'photo-1521590832167-7bcbfaa6381f', hu: 'Stílusos megjelenés', en: 'Stylish looks' }
    ]
  },
  'auto repair': {
    hero: 'photo-1486262715619-67b85e0b08d3',
    gallery: [
      { id: 'photo-1625047509168-a7026f36de04', hu: 'Szakszerű javítás', en: 'Expert repair' },
      { id: 'photo-1530046339160-ce3e530c7d2f', hu: 'Tapasztalt szerelők', en: 'Skilled mechanics' },
      { id: 'photo-1487754180451-c456f719a1fc', hu: 'Motor diagnosztika', en: 'Engine diagnostics' },
      { id: 'photo-1503376780353-7e6692767b70', hu: 'Minden márka', en: 'All brands' },
      { id: 'photo-1486262715619-67b85e0b08d3', hu: 'Modern műhely', en: 'Modern workshop' },
      { id: 'photo-1625047509168-a7026f36de04', hu: 'Megbízható szerviz', en: 'Reliable service' }
    ]
  },
  bakery: {
    hero: 'photo-1509440159596-0249088772ff',
    gallery: [
      { id: 'photo-1517433670267-08bbd4be890f', hu: 'Friss pékáruk', en: 'Fresh baked goods' },
      { id: 'photo-1486427944299-d1955d23e34d', hu: 'Házi sütemények', en: 'Homemade pastries' },
      { id: 'photo-1555507036-ab1f4038808a', hu: 'Ropogós croissant', en: 'Crispy croissants' },
      { id: 'photo-1509440159596-0249088772ff', hu: 'Kovászos kenyér', en: 'Sourdough bread' },
      { id: 'photo-1517433670267-08bbd4be890f', hu: 'Napi frissesség', en: 'Daily freshness' },
      { id: 'photo-1486427944299-d1955d23e34d', hu: 'Édes finomságok', en: 'Sweet treats' }
    ]
  },
  'beauty salon': {
    hero: 'photo-1560750588-73207b1ef5b8',
    gallery: [
      { id: 'photo-1487412947147-5cebf100ffc2', hu: 'Wellness élmény', en: 'Wellness experience' },
      { id: 'photo-1570172619644-dfd03ed5d881', hu: 'Relaxáló masszázs', en: 'Relaxing massage' },
      { id: 'photo-1487070183336-b863922373d4', hu: 'Manikűr & pedikűr', en: 'Manicure & pedicure' },
      { id: 'photo-1519415943484-9fa1873496d4', hu: 'Arckezelések', en: 'Facial treatments' },
      { id: 'photo-1596178065887-1198b6148b2b', hu: 'Bőrápolás', en: 'Skincare' },
      { id: 'photo-1560750588-73207b1ef5b8', hu: 'Nyugodt környezet', en: 'Calm atmosphere' }
    ]
  },
  default: {
    hero: 'photo-1497366216548-37526070297c',
    gallery: [
      { id: 'photo-1497366811353-6870744d04b2', hu: 'Professzionális csapat', en: 'Professional team' },
      { id: 'photo-1497366216548-37526070297c', hu: 'Modern környezet', en: 'Modern space' },
      { id: 'photo-1497366811353-6870744d04b2', hu: 'Minőségi szolgáltatás', en: 'Quality service' },
      { id: 'photo-1497366216548-37526070297c', hu: 'Ügyfélközpontúság', en: 'Client focus' },
      { id: 'photo-1497366811353-6870744d04b2', hu: 'Szakértelem', en: 'Expertise' },
      { id: 'photo-1497366216548-37526070297c', hu: 'Megbízhatóság', en: 'Reliability' }
    ]
  }
};

function getPhotos(category) {
  return PHOTOS[category] || PHOTOS.default;
}

// ════════════════════════════════════════════════════════════════
// BILINGUAL CATEGORY DATA (Hungarian + English)
// ════════════════════════════════════════════════════════════════
const ICONS = {
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  wrench: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>`,
  scissors: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M6 2v6l4 4-4 4v6"/><path d="M18 2v6l-4 4 4 4v6"/></svg>`,
  tooth: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z"/><path d="M10 21h4"/></svg>`,
  bread: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M18.36 9l.6 3H5.04l.6-3h12.72M20 4H4v2h16V4zm0 18H4v-8h16v8z"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M12 21l-1.45-1.32C5.4 14.36 2 11.28 2 7.5 2 4.42 4.42 2 7.5 2c1.74 0 3.41.81 4.5 2.09C13.09 2.81 14.76 2 16.5 2 19.58 2 22 4.42 22 7.5c0 3.78-3.4 6.86-8.55 11.18L12 21z"/></svg>`,
  car: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`,
  sparkle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M12 3l1.45 3.55L17 8l-3.55 1.45L12 13l-1.45-3.55L7 8l3.55-1.45L12 3z"/><path d="M5 15l.7 1.8L7.5 17.5l-1.8.7L5 20l-.7-1.8L2.5 17.5l1.8-.7z"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M12 2l8 3v6c0 5-3.5 9.7-8 11-4.5-1.3-8-6-8-11V5l8-3z"/><path d="M9 12l2 2 4-4"/></svg>`,
  truck: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4z"/></svg>`,
  coffee: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><path d="M6 1v3M10 1v3M14 1v3"/></svg>`,
  face: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>`,
  hand: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2a8 8 0 0 1-8-8 2 2 0 1 1 4 0"/></svg>`
};

const CATEGORY_DATA = {
  restaurant: {
    heroSub: { hu: (c) => `Autentikus ízek, felejthetetlen élmények ${c} szívében`, en: (c) => `Authentic flavors and unforgettable experiences in the heart of ${c}` },
    heroCta: { hu: 'Asztalfoglalás', en: 'Book a table' },
    gradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)',
    accentGrad: 'linear-gradient(135deg, #e94560, #f5a623)',
    accent: '#e94560', accentLight: 'rgba(233,69,96,0.1)', icon: '🍽️',
    pattern: 'radial-gradient(circle at 20% 80%, rgba(233,69,96,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(245,166,35,0.1) 0%, transparent 50%)',
    services: [
      { icon: ICONS.check, hu: ['Friss alapanyagok', 'Minden nap friss, helyi alapanyagokból készítjük ételeinket a legjobb minőségben.'], en: ['Fresh ingredients', 'We prepare our dishes daily from fresh, local ingredients of the highest quality.'] },
      { icon: ICONS.bread, hu: ['Változatos menü', 'Hagyományos magyar és nemzetközi ételek széles választéka minden ízlésnek.'], en: ['Varied menu', 'A wide selection of traditional Hungarian and international dishes for every taste.'] },
      { icon: ICONS.heart, hu: ['Hangulatos terem', 'Elegáns belső tér, amely tökéletes helyszín üzleti ebédekhez és családi vacsorákhoz.'], en: ['Cozy dining room', 'An elegant interior, perfect for business lunches and family dinners.'] },
      { icon: ICONS.sparkle, hu: ['Rendezvények', 'Születésnap, céges vacsora vagy esküvő - bármilyen alkalomra tökéletes helyszín.'], en: ['Events', 'Birthday, corporate dinner or wedding - the perfect venue for any occasion.'] },
      { icon: ICONS.truck, hu: ['Házhozszállítás', 'Rendeljen kényelmesen otthonról! Gyors házhozszállítás egész városban.'], en: ['Delivery', 'Order conveniently from home! Fast delivery across the whole city.'] },
      { icon: ICONS.coffee, hu: ['Napi menü', 'Minden hétköznap friss napi menü kedvező áron, levesválasztékkal.'], en: ['Daily menu', 'A fresh daily menu at a great price every weekday, with a choice of soups.'] }
    ],
    stats: [
      { num: '4.8', suffix: '★', hu: 'Google értékelés', en: 'Google rating' },
      { num: '2000', suffix: '+', hu: 'Elégedett vendég', en: 'Happy guests' },
      { num: '15', suffix: '+', hu: 'Év tapasztalat', en: 'Years of experience' }
    ],
    testimonials: [
      { hu: 'Fantasztikus ételek és csodálatos hangulat! A gulyás egyszerűen tökéletes volt.', en: 'Fantastic food and a wonderful atmosphere! The goulash was simply perfect.', author: 'Szabó Anna', roleHu: 'Törzsvendég', roleEn: 'Regular guest' },
      { hu: 'A legjobb étterem a környéken. Kedves kiszolgálás és gyönyörű belső tér.', en: 'The best restaurant in the area. Friendly service and a beautiful interior.', author: 'Nagy Péter', roleHu: 'Gasztro blogger', roleEn: 'Food blogger' },
      { hu: 'Minden családi ünnepet itt tartunk. Soha nem csalódtunk!', en: 'We hold every family celebration here. We have never been disappointed!', author: 'Kiss Katalin', roleHu: 'Rendszeres vendég', roleEn: 'Regular guest' }
    ]
  },
  dentist: {
    heroSub: { hu: (c) => `Modern fogászati ellátás, fájdalommentes kezelések ${c}-ban`, en: (c) => `Modern dental care and painless treatments in ${c}` },
    heroCta: { hu: 'Időpontfoglalás', en: 'Book appointment' },
    gradient: 'linear-gradient(135deg, #0c2340 0%, #0d4f8b 50%, #0077b6 100%)',
    accentGrad: 'linear-gradient(135deg, #00b4d8, #48cae4)',
    accent: '#00b4d8', accentLight: 'rgba(0,180,216,0.1)', icon: '🦷',
    pattern: 'radial-gradient(circle at 30% 70%, rgba(0,180,216,0.12) 0%, transparent 50%), radial-gradient(circle at 70% 30%, rgba(72,202,228,0.08) 0%, transparent 50%)',
    services: [
      { icon: ICONS.tooth, hu: ['Általános fogászat', 'Szűrővizsgálat, fogkő-eltávolítás, tömés és megelőző kezelések.'], en: ['General dentistry', 'Check-ups, scaling, fillings and preventive treatments.'] },
      { icon: ICONS.sparkle, hu: ['Fogfehérítés', 'Professzionális fogfehérítés látványos eredménnyel, akár egyetlen alkalom alatt.'], en: ['Teeth whitening', 'Professional teeth whitening with striking results, even in a single session.'] },
      { icon: ICONS.shield, hu: ['Implantáció', 'Tartós megoldás hiányzó fogak pótlására, természetes megjelenéssel.'], en: ['Implants', 'A lasting solution for missing teeth with a natural appearance.'] },
      { icon: ICONS.star, hu: ['Esztétikai fogászat', 'Héjak, koronák és mosoly-tervezés a tökéletes megjelenésért.'], en: ['Cosmetic dentistry', 'Veneers, crowns and smile design for the perfect look.'] },
      { icon: ICONS.heart, hu: ['Gyermekfogászat', 'Gyengéd, barátságos kezelések a legkisebb páciensek számára.'], en: ['Pediatric dentistry', 'Gentle, friendly treatments for our youngest patients.'] },
      { icon: ICONS.check, hu: ['Fogszabályozás', 'Láthatatlan és hagyományos fogszabályozók felnőtteknek és gyerekeknek.'], en: ['Orthodontics', 'Invisible and traditional braces for adults and children.'] }
    ],
    stats: [
      { num: '4.9', suffix: '★', hu: 'Páciens értékelés', en: 'Patient rating' },
      { num: '5000', suffix: '+', hu: 'Sikeres kezelés', en: 'Successful treatments' },
      { num: '20', suffix: '+', hu: 'Év tapasztalat', en: 'Years of experience' }
    ],
    testimonials: [
      { hu: 'Végre találtam egy fogorvost, akitől nem félek! Profi, fájdalommentes kezelés.', en: "Finally found a dentist I'm not afraid of! Professional, painless treatment.", author: 'Tóth Mária', roleHu: 'Páciens', roleEn: 'Patient' },
      { hu: 'A fogfehérítés eredménye lenyűgöző volt. Végre magabiztosan mosolygok!', en: 'The whitening result was stunning. I finally smile with confidence!', author: 'Kovács László', roleHu: 'Páciens', roleEn: 'Patient' },
      { hu: 'A gyerekeink is szeretnek ide járni. Nagyon kedves és türelmes csapat.', en: 'Our kids love coming here too. A very kind and patient team.', author: 'Horváth Éva', roleHu: 'Szülő', roleEn: 'Parent' }
    ]
  },
  'hair salon': {
    heroSub: { hu: (c) => `Stílus és elegancia - prémium fodrászat ${c}-ban`, en: (c) => `Style and elegance - premium hair salon in ${c}` },
    heroCta: { hu: 'Foglaljon időpontot', en: 'Book now' },
    gradient: 'linear-gradient(135deg, #2d1b4e 0%, #4c1d95 50%, #7c3aed 100%)',
    accentGrad: 'linear-gradient(135deg, #c084fc, #e879f9)',
    accent: '#a855f7', accentLight: 'rgba(168,85,247,0.1)', icon: '✂️',
    pattern: 'radial-gradient(circle at 25% 75%, rgba(168,85,247,0.12) 0%, transparent 50%), radial-gradient(circle at 75% 25%, rgba(232,121,249,0.08) 0%, transparent 50%)',
    services: [
      { icon: ICONS.scissors, hu: ['Hajvágás & Styling', 'Személyre szabott hajvágás és formázás a legújabb trendek szerint.'], en: ['Haircut & Styling', 'Personalized cuts and styling following the latest trends.'] },
      { icon: ICONS.sparkle, hu: ['Festés & Melírozás', 'Professzionális hajfestés prémium termékekkel, ragyogó eredménnyel.'], en: ['Coloring & Highlights', 'Professional hair coloring with premium products and radiant results.'] },
      { icon: ICONS.star, hu: ['Keratinos kezelés', 'Sima, fényes, egészséges haj keratinos hajegyenesítő kezeléssel.'], en: ['Keratin treatment', 'Smooth, shiny, healthy hair with keratin straightening treatment.'] },
      { icon: ICONS.heart, hu: ['Menyasszonyi frizura', 'Álomszép esküvői frizurák, próbaalkalom és helyszíni készítés.'], en: ['Bridal hair', 'Dream wedding hairstyles, with trial sessions and on-site styling.'] },
      { icon: ICONS.check, hu: ['Szakállvágás', 'Precíz szakálligazítás és formázás a tökéletes megjelenésért.'], en: ['Beard trim', 'Precise beard trimming and shaping for the perfect look.'] },
      { icon: ICONS.shield, hu: ['Hajápolás', 'Professzionális hajápoló kezelések a gyönyörű, egészséges hajért.'], en: ['Hair care', 'Professional hair care treatments for beautiful, healthy hair.'] }
    ],
    stats: [
      { num: '4.9', suffix: '★', hu: 'Ügyfél értékelés', en: 'Client rating' },
      { num: '3000', suffix: '+', hu: 'Elégedett ügyfél', en: 'Happy clients' },
      { num: '12', suffix: '+', hu: 'Év tapasztalat', en: 'Years of experience' }
    ],
    testimonials: [
      { hu: 'Mindig pontosan olyan lesz a frizurám, amilyet elképzeltem. Csodálatos csapat!', en: 'My hair always turns out exactly as I imagined. A wonderful team!', author: 'Varga Zsófia', roleHu: 'Törzsvendég', roleEn: 'Regular client' },
      { hu: 'A festés színe hónapok után is gyönyörű. Csak ide járok!', en: 'The color stays beautiful even months later. I only come here!', author: 'Molnár Andrea', roleHu: 'Törzsvendég', roleEn: 'Regular client' },
      { hu: 'Az esküvői frizurám tökéletes volt! Mindenki dicsérte.', en: 'My wedding hairstyle was perfect! Everyone complimented it.', author: 'Balogh Réka', roleHu: 'Menyasszony', roleEn: 'Bride' }
    ]
  },
  'auto repair': {
    heroSub: { hu: (c) => `Megbízható autójavítás és szerviz ${c}-ban`, en: (c) => `Reliable car repair and service in ${c}` },
    heroCta: { hu: 'Kérjen árajánlatot', en: 'Get a quote' },
    gradient: 'linear-gradient(135deg, #111827 0%, #1f2937 50%, #374151 100%)',
    accentGrad: 'linear-gradient(135deg, #ef4444, #f59e0b)',
    accent: '#ef4444', accentLight: 'rgba(239,68,68,0.1)', icon: '🔧',
    pattern: 'radial-gradient(circle at 20% 80%, rgba(239,68,68,0.1) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(245,158,11,0.08) 0%, transparent 50%)',
    services: [
      { icon: ICONS.wrench, hu: ['Általános szerviz', 'Teljes körű szerviz és karbantartás minden autómárkához.'], en: ['General service', 'Full service and maintenance for all car brands.'] },
      { icon: ICONS.car, hu: ['Karosszéria javítás', 'Horpadás javítás, fényezés és karosszéria munkák szakszerűen.'], en: ['Body repair', 'Dent removal, painting and bodywork done professionally.'] },
      { icon: ICONS.shield, hu: ['Diagnosztika', 'Korszerű komputer-diagnosztika a pontos hibafelismeréshez.'], en: ['Diagnostics', 'Modern computer diagnostics for accurate fault detection.'] },
      { icon: ICONS.clock, hu: ['Fékrendszer', 'Fékbetét csere, féktárcsa javítás, teljes fékrendszer felülvizsgálat.'], en: ['Brake system', 'Brake pad replacement, disc repair and full brake inspection.'] },
      { icon: ICONS.check, hu: ['Olajcsere', 'Gyors olajcsere és szűrőcsere minden típusú járműhöz.'], en: ['Oil change', 'Quick oil and filter change for all types of vehicles.'] },
      { icon: ICONS.truck, hu: ['Műszaki vizsga', 'Teljes műszaki vizsgára való felkészítés és lebonyolítás.'], en: ['Technical inspection', 'Full preparation and handling of the technical inspection.'] }
    ],
    stats: [
      { num: '4.7', suffix: '★', hu: 'Ügyfél értékelés', en: 'Client rating' },
      { num: '8000', suffix: '+', hu: 'Javított autó', en: 'Cars repaired' },
      { num: '18', suffix: '+', hu: 'Év tapasztalat', en: 'Years of experience' }
    ],
    testimonials: [
      { hu: 'Gyors, megbízható szerviz, fair árakkal. Mindig ide hozom az autómat.', en: 'Fast, reliable service at fair prices. I always bring my car here.', author: 'Takács Gábor', roleHu: 'Törzsügyfél', roleEn: 'Regular customer' },
      { hu: 'Precíz diagnosztika, őszinte tanácsadás. Nem akarnak felesleges munkát eladni.', en: "Precise diagnostics, honest advice. They don't sell unnecessary work.", author: 'Farkas Zoltán', roleHu: 'Ügyfél', roleEn: 'Customer' },
      { hu: 'A karosszéria javítás után olyan volt az autóm, mint új! Profi munka.', en: 'After the bodywork my car looked brand new! Professional work.', author: 'Németh István', roleHu: 'Ügyfél', roleEn: 'Customer' }
    ]
  },
  bakery: {
    heroSub: { hu: (c) => `Frissen sült kenyér és pékáruk, hagyományos receptek ${c}-ban`, en: (c) => `Freshly baked bread and pastries, traditional recipes in ${c}` },
    heroCta: { hu: 'Termékeink', en: 'Our products' },
    gradient: 'linear-gradient(135deg, #451a03 0%, #78350f 50%, #92400e 100%)',
    accentGrad: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
    accent: '#d97706', accentLight: 'rgba(217,119,6,0.1)', icon: '🥐',
    pattern: 'radial-gradient(circle at 20% 80%, rgba(217,119,6,0.12) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(251,191,36,0.08) 0%, transparent 50%)',
    services: [
      { icon: ICONS.check, hu: ['Friss kenyerek', 'Házi kovászos kenyér, rozskenyér, ciabatta - naponta frissen sütve.'], en: ['Fresh breads', 'Homemade sourdough, rye bread, ciabatta - baked fresh every day.'] },
      { icon: ICONS.star, hu: ['Torták & Sütemények', 'Egyedi torták, rétes, kürtőskalács és finom sütemények minden alkalomra.'], en: ['Cakes & Pastries', 'Custom cakes, strudel, chimney cake and delicious pastries for any occasion.'] },
      { icon: ICONS.bread, hu: ['Péksütemények', 'Croissant, briós, pogácsa és más péksütemények frissen.'], en: ['Baked goods', 'Croissants, brioche, scones and other pastries, fresh.'] },
      { icon: ICONS.heart, hu: ['Rendelésre készítés', 'Egyedi rendelésre készített torták és sütemények esküvőre, születésnapra.'], en: ['Made to order', 'Custom-made cakes and pastries for weddings and birthdays.'] },
      { icon: ICONS.shield, hu: ['Gluténmentes', 'Gluténmentes és laktózmentes termékek étel-érzékenyek számára.'], en: ['Gluten-free', 'Gluten-free and lactose-free products for those with food sensitivities.'] },
      { icon: ICONS.coffee, hu: ['Kávézó', 'Kellemes kávézó sarok frissen főzött kávéval és péksüteményekkel.'], en: ['Café', 'A pleasant café corner with freshly brewed coffee and pastries.'] }
    ],
    stats: [
      { num: '4.8', suffix: '★', hu: 'Ügyfél értékelés', en: 'Customer rating' },
      { num: '500', suffix: '+', hu: 'Napi vásárló', en: 'Daily customers' },
      { num: '25', suffix: '+', hu: 'Év hagyomány', en: 'Years of tradition' }
    ],
    testimonials: [
      { hu: 'A legjobb kovászos kenyér a városban! Nem veszek máshol kenyeret.', en: "The best sourdough in town! I don't buy bread anywhere else.", author: 'Horváth Judit', roleHu: 'Törzsvendég', roleEn: 'Regular customer' },
      { hu: 'Az esküvői tortánk gyönyörű és isteni finom volt. Köszönjük!', en: 'Our wedding cake was beautiful and delicious. Thank you!', author: 'Szabó Bence', roleHu: 'Ügyfél', roleEn: 'Customer' },
      { hu: 'Reggeli nélkül nem indulhat a nap a friss croissantjuk nélkül!', en: "The day can't start without their fresh croissants!", author: 'Kiss Dóra', roleHu: 'Rendszeres vásárló', roleEn: 'Regular customer' }
    ]
  },
  'beauty salon': {
    heroSub: { hu: (c) => `Szépség és wellness - professzionális szépségápolás ${c}-ban`, en: (c) => `Beauty and wellness - professional beauty care in ${c}` },
    heroCta: { hu: 'Foglaljon időpontot', en: 'Book now' },
    gradient: 'linear-gradient(135deg, #4a044e 0%, #831843 50%, #be185d 100%)',
    accentGrad: 'linear-gradient(135deg, #f472b6, #fb7185)',
    accent: '#ec4899', accentLight: 'rgba(236,72,153,0.1)', icon: '💆',
    pattern: 'radial-gradient(circle at 25% 75%, rgba(236,72,153,0.12) 0%, transparent 50%), radial-gradient(circle at 75% 25%, rgba(244,114,182,0.08) 0%, transparent 50%)',
    services: [
      { icon: ICONS.face, hu: ['Arc kezelések', 'Tisztító, hidratáló és anti-aging arc kezelések prémium termékekkel.'], en: ['Facial treatments', 'Cleansing, hydrating and anti-aging facials with premium products.'] },
      { icon: ICONS.sparkle, hu: ['Manikűr & Pedikűr', 'Klasszikus és géllakk manikűr, pedikűr a gyönyörű körmökért.'], en: ['Manicure & Pedicure', 'Classic and gel manicure, pedicure for beautiful nails.'] },
      { icon: ICONS.star, hu: ['Szőrtelenítés', 'Gyanta és lézeres szőrtelenítés tartós eredménnyel.'], en: ['Hair removal', 'Waxing and laser hair removal with lasting results.'] },
      { icon: ICONS.heart, hu: ['Smink', 'Alkalmi és esküvői smink professzionális sminkesektől.'], en: ['Makeup', 'Occasion and bridal makeup by professional makeup artists.'] },
      { icon: ICONS.hand, hu: ['Masszázs', 'Relaxáló, sport és gyógymasszázs a testi-lelki felfrissülésért.'], en: ['Massage', 'Relaxing, sports and therapeutic massage for body and soul.'] },
      { icon: ICONS.check, hu: ['Szemöldök formázás', 'Szemöldök formázás, festés és laminálás a tökéletes ívért.'], en: ['Eyebrow shaping', 'Eyebrow shaping, tinting and lamination for the perfect arch.'] }
    ],
    stats: [
      { num: '4.9', suffix: '★', hu: 'Ügyfél értékelés', en: 'Client rating' },
      { num: '4000', suffix: '+', hu: 'Elégedett ügyfél', en: 'Happy clients' },
      { num: '10', suffix: '+', hu: 'Év tapasztalat', en: 'Years of experience' }
    ],
    testimonials: [
      { hu: 'Minden alkalommal kipihentem magam! Csodálatos szépségszalon.', en: 'I relax every single time! A wonderful beauty salon.', author: 'Papp Viktória', roleHu: 'Törzsvendég', roleEn: 'Regular client' },
      { hu: 'A géllakk hetekig tartott, és a kiszolgálás mindig kedves.', en: 'The gel polish lasted for weeks, and the service is always kind.', author: 'Szűcs Anita', roleHu: 'Rendszeres ügyfél', roleEn: 'Regular client' },
      { hu: 'Az esküvői sminkem tökéletes volt egész nap! Köszönöm!', en: 'My wedding makeup was perfect all day! Thank you!', author: 'Balogh Nóra', roleHu: 'Menyasszony', roleEn: 'Bride' }
    ]
  }
};

function getDefaultData() {
  return {
    heroSub: { hu: (c) => `Professzionális szolgáltatások ${c}-ban`, en: (c) => `Professional services in ${c}` },
    heroCta: { hu: 'Kapcsolat', en: 'Contact' },
    gradient: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #2563eb 100%)',
    accentGrad: 'linear-gradient(135deg, #3b82f6, #60a5fa)',
    accent: '#2563eb', accentLight: 'rgba(37,99,235,0.1)', icon: '⭐',
    pattern: 'radial-gradient(circle at 20% 80%, rgba(37,99,235,0.12) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(96,165,250,0.08) 0%, transparent 50%)',
    services: [
      { icon: ICONS.check, hu: ['Prémium minőség', 'Kiváló minőségű szolgáltatás, személyre szabott megoldásokkal.'], en: ['Premium quality', 'High-quality service with personalized solutions.'] },
      { icon: ICONS.clock, hu: ['Gyors kiszolgálás', 'Időben és hatékonyan végezzük el a munkát.'], en: ['Fast service', 'We do the job on time and efficiently.'] },
      { icon: ICONS.star, hu: ['Garanciával', 'Munkánkra garanciát vállalunk.'], en: ['Guaranteed', 'We guarantee our work.'] },
      { icon: ICONS.shield, hu: ['Kedvező árak', 'Versenyképes árak, kiváló ár-érték arány.'], en: ['Great prices', 'Competitive prices, excellent value for money.'] },
      { icon: ICONS.heart, hu: ['Rugalmas időpontok', 'Hétköznap és hétvégén is rendelkezésre állunk.'], en: ['Flexible hours', 'Available on weekdays and weekends.'] },
      { icon: ICONS.wrench, hu: ['Szakértelem', 'Tapasztalt csapatunk professzionális megoldásokat nyújt.'], en: ['Expertise', 'Our experienced team provides professional solutions.'] }
    ],
    stats: [
      { num: '4.8', suffix: '★', hu: 'Értékelés', en: 'Rating' },
      { num: '1000', suffix: '+', hu: 'Elégedett ügyfél', en: 'Happy clients' },
      { num: '10', suffix: '+', hu: 'Év tapasztalat', en: 'Years of experience' }
    ],
    testimonials: [
      { hu: 'Kiváló szolgáltatás, nagyon profik és kedvesek!', en: 'Excellent service, very professional and kind!', author: 'Szabó Anna', roleHu: 'Ügyfél', roleEn: 'Customer' },
      { hu: 'Gyors, precíz munka, fair árak. Visszatérő ügyfél vagyok.', en: "Fast, precise work, fair prices. I'm a returning customer.", author: 'Nagy Péter', roleHu: 'Ügyfél', roleEn: 'Customer' },
      { hu: 'Mindig megbízható és pontos. Csak ajánlani tudom!', en: 'Always reliable and punctual. Highly recommend!', author: 'Kiss Katalin', roleHu: 'Ügyfél', roleEn: 'Customer' }
    ]
  };
}

function getCategoryData(category) {
  return CATEGORY_DATA[category] || getDefaultData();
}

// Shared UI strings (bilingual)
const UI = {
  navServices: { hu: 'Szolgáltatások', en: 'Services' },
  navAbout: { hu: 'Rólunk', en: 'About' },
  navGallery: { hu: 'Galéria', en: 'Gallery' },
  navReviews: { hu: 'Vélemények', en: 'Reviews' },
  servicesLabel: { hu: 'Szolgáltatások', en: 'Services' },
  servicesTitle: { hu: 'Miben segíthetünk?', en: 'How can we help?' },
  aboutLabel: { hu: 'Rólunk', en: 'About us' },
  aboutTitle: { hu: 'Miért válasszon minket?', en: 'Why choose us?' },
  aboutFeatures: [
    { hu: 'Tapasztalt, képzett szakemberek', en: 'Experienced, qualified professionals' },
    { hu: 'Korszerű eszközök és technológia', en: 'Modern tools and technology' },
    { hu: 'Rugalmas időpontok, gyors kiszolgálás', en: 'Flexible hours, fast service' },
    { hu: 'Versenyképes árak, átlátható feltételek', en: 'Competitive prices, transparent terms' }
  ],
  galleryLabel: { hu: 'Galéria', en: 'Gallery' },
  galleryTitle: { hu: 'Pillanatképek', en: 'Gallery' },
  galleryDesc: { hu: 'Tekintse meg munkánkat és környezetünket', en: 'Take a look at our work and our space' },
  reviewsLabel: { hu: 'Vélemények', en: 'Reviews' },
  reviewsTitle: { hu: 'Ügyfeleink mondták', en: 'What our clients say' },
  reviewsDesc: { hu: 'Büszkék vagyunk elégedett ügyfeleinkre', en: 'We are proud of our happy clients' },
  ctaTitle: { hu: 'Készen áll a kezdésre?', en: 'Ready to get started?' },
  ctaDesc: { hu: 'Vegye fel velünk a kapcsolatot még ma, és tapasztalja meg a különbséget!', en: 'Get in touch with us today and experience the difference!' },
  contactLabel: { hu: 'Kapcsolat', en: 'Contact' },
  contactTitle: { hu: 'Írjon nekünk', en: 'Write to us' },
  contactDesc: { hu: 'Szívesen válaszolunk kérdéseire', en: 'We are happy to answer your questions' },
  formName: { hu: 'Név', en: 'Name' },
  formEmail: { hu: 'Email', en: 'Email' },
  formPhone: { hu: 'Telefon', en: 'Phone' },
  formSubject: { hu: 'Tárgy', en: 'Subject' },
  formMessage: { hu: 'Üzenet', en: 'Message' },
  formSubmit: { hu: 'Üzenet küldése →', en: 'Send message →' },
  phName: { hu: 'Az Ön neve', en: 'Your name' },
  phMsg: { hu: 'Miben segíthetünk?', en: 'How can we help?' },
  subjBooking: { hu: 'Időpontfoglalás', en: 'Booking' },
  subjQuote: { hu: 'Árajánlat kérés', en: 'Request a quote' },
  subjGeneral: { hu: 'Általános kérdés', en: 'General question' },
  subjOther: { hu: 'Egyéb', en: 'Other' },
  infoAddress: { hu: 'Cím', en: 'Address' },
  infoPhone: { hu: 'Telefon', en: 'Phone' },
  infoEmail: { hu: 'Email', en: 'Email' },
  infoHours: { hu: 'Nyitvatartás', en: 'Opening hours' },
  hours: { hu: 'Hétfő – Péntek: 9:00 – 18:00<br>Szombat: 9:00 – 14:00', en: 'Mon – Fri: 9:00 – 18:00<br>Saturday: 9:00 – 14:00' },
  footerNav: { hu: 'Navigáció', en: 'Navigation' },
  footerContact: { hu: 'Elérhetőség', en: 'Contact' },
  footerHours: { hu: 'Nyitvatartás', en: 'Opening hours' },
  fHours1: { hu: 'H–P: 9:00 – 18:00', en: 'Mon–Fri: 9:00 – 18:00' },
  fHours2: { hu: 'Sz: 9:00 – 14:00', en: 'Sat: 9:00 – 14:00' },
  fHours3: { hu: 'V: Zárva', en: 'Sun: Closed' },
  rights: { hu: 'Minden jog fenntartva.', en: 'All rights reserved.' }
};

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// Emit data-hu / data-en attributes for client-side language switching.
function L(o) {
  return `data-hu="${esc(o.hu)}" data-en="${esc(o.en)}"`;
}

function generateHTML(lead, diagnosis, logoDataUri) {
  const cat = getCategoryData(lead.category);
  const photos = getPhotos(lead.category);
  const rating = cat.stats[0].num;
  const slug = slugify(lead.name);
  const hasVideo = existsSync(`projects/${slug}/promo.mp4`);
  const notifyTopic = config.agency.notify_topic || '';

  const subHu = cat.heroSub.hu(lead.city);
  const subEn = cat.heroSub.en(lead.city);

  const aboutP1 = {
    hu: `${lead.name} ${lead.city} egyik legmegbízhatóbb ${lead.category} szolgáltatója. Évek tapasztalatával és elhivatott csapatunkkal mindent megteszünk ügyfeleink elégedettségéért.`,
    en: `${lead.name} is one of the most trusted ${lead.category} providers in ${lead.city}. With years of experience and a dedicated team, we do everything for our clients' satisfaction.`
  };
  const aboutP2 = {
    hu: `Számunkra a minőség és a személyes odafigyelés az első. Ezt tükrözi a ${rating}★-os értékelésünk és a több ezer visszatérő ügyfelünk.`,
    en: `Quality and personal attention come first for us. This is reflected in our ${rating}★ rating and our thousands of returning clients.`
  };
  const servicesDesc = {
    hu: `Teljes körű ${lead.category} szolgáltatásaink ${lead.city}-ban`,
    en: `Our full range of ${lead.category} services in ${lead.city}`
  };

  return `<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script>document.documentElement.className += ' js';</script>
  <meta name="description" content="${esc(lead.name)} - ${esc(lead.category)} ${esc(lead.city)}. ${cat.stats[1].num}+ ${esc(UI.reviewsDesc.hu)}">
  <meta property="og:title" content="${esc(lead.name)} | ${esc(lead.city)}">
  <meta property="og:description" content="${esc(subHu)}">
  <title>${esc(lead.name)} | ${esc(lead.city)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    :root { --accent: ${cat.accent}; --accent-light: ${cat.accentLight}; }
    html { scroll-behavior: smooth; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #1f2937; line-height: 1.6; overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
      transition: opacity 0.25s ease;
    }
    body.lang-switching { opacity: 0.3; }
    .container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }

    /* ═══ SCROLL PROGRESS BAR ═══ */
    .scroll-progress {
      position: fixed; top: 0; left: 0; height: 3px; width: 0%; z-index: 2000;
      background: ${cat.accentGrad}; box-shadow: 0 0 10px ${cat.accent};
      transition: width 0.1s linear;
    }

    /* ═══ WHATSAPP FLOATING BUTTON ═══ */
    .wa-float {
      position: fixed; bottom: 24px; right: 24px; width: 58px; height: 58px;
      background: #25D366; border-radius: 50%; display: flex; align-items: center;
      justify-content: center; box-shadow: 0 6px 24px rgba(37,211,102,0.45);
      z-index: 1500; transition: transform 0.2s; animation: waPulse 2.5s infinite;
    }
    .wa-float:hover { transform: scale(1.1); }
    .wa-float svg { width: 32px; height: 32px; fill: #fff; }
    @keyframes waPulse { 0%,100% { box-shadow: 0 6px 24px rgba(37,211,102,0.45); } 50% { box-shadow: 0 6px 30px rgba(37,211,102,0.7); } }

    /* ═══ NAVBAR ═══ */
    .navbar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
      background: rgba(255,255,255,0.85); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      border-bottom: 1px solid rgba(0,0,0,0.06); transition: all 0.3s;
    }
    .navbar.scrolled { box-shadow: 0 4px 30px rgba(0,0,0,0.08); }
    .navbar .container { display: flex; justify-content: space-between; align-items: center; height: 72px; }
    .nav-brand { text-decoration: none; display: inline-flex; align-items: center; max-width: 70%; min-width: 0; }
    .nav-logo { height: 52px; width: auto; max-width: 300px; object-fit: contain; }
    .nav-brand-text { font-size: 20px; font-weight: 800; color: #111827; letter-spacing: -0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .nav-brand-text span { color: var(--accent); }
    .nav-right { display: flex; align-items: center; gap: 24px; }
    .nav-links { display: flex; align-items: center; gap: 32px; list-style: none; }
    .nav-links a { text-decoration: none; color: #6b7280; font-weight: 500; font-size: 15px; transition: color 0.2s; position: relative; }
    .nav-links a:not(.nav-cta-btn)::after {
      content: ''; position: absolute; left: 0; bottom: -4px; width: 0; height: 2px;
      background: var(--accent); transition: width 0.3s;
    }
    .nav-links a:not(.nav-cta-btn):hover::after { width: 100%; }
    .nav-links a:hover { color: #111827; }
    .nav-cta-btn {
      background: ${cat.accentGrad}; color: #fff !important; padding: 10px 28px; border-radius: 50px;
      font-weight: 600; font-size: 14px; box-shadow: 0 4px 15px ${cat.accentLight};
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .nav-cta-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,0.15); }
    /* Language toggle */
    .lang-toggle {
      display: inline-flex; background: #f3f4f6; border-radius: 50px; padding: 3px; gap: 2px;
    }
    .lang-opt {
      border: none; background: transparent; cursor: pointer; font-family: inherit;
      font-size: 13px; font-weight: 700; color: #9ca3af; padding: 6px 12px; border-radius: 50px;
      transition: all 0.25s;
    }
    .lang-opt.active { background: #fff; color: var(--accent); box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
    .hamburger { display: none; background: none; border: none; cursor: pointer; padding: 8px; }
    .hamburger span { display: block; width: 24px; height: 2px; background: #374151; margin: 6px 0; transition: all 0.3s; border-radius: 2px; }
    .hamburger.active span:nth-child(1) { transform: translateY(8px) rotate(45deg); }
    .hamburger.active span:nth-child(2) { opacity: 0; }
    .hamburger.active span:nth-child(3) { transform: translateY(-8px) rotate(-45deg); }

    /* ═══ HERO ═══ */
    .hero {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      position: relative; overflow: hidden; padding: 120px 24px 80px;
    }
    .hero-bg {
      position: absolute; inset: 0; z-index: 0;
      background-size: cover; background-position: center;
      animation: kenburns 22s ease-out infinite alternate;
    }
    @keyframes kenburns { from { transform: scale(1); } to { transform: scale(1.12); } }
    .hero::before {
      content: ''; position: absolute; inset: 0; z-index: 1;
      background: linear-gradient(135deg, rgba(15,23,42,0.88), rgba(15,23,42,0.72)), ${cat.pattern};
    }
    /* Animated aurora glow sweeping behind the hero content */
    .hero-aurora {
      position: absolute; inset: -30%; z-index: 1; pointer-events: none;
      background: conic-gradient(from 0deg at 50% 50%, ${cat.accent}, transparent 25%, rgba(255,255,255,0.25) 50%, transparent 75%, ${cat.accent});
      filter: blur(80px); opacity: 0.35; animation: auroraSpin 24s linear infinite;
    }
    @keyframes auroraSpin { to { transform: rotate(360deg); } }
    /* Floating parallax orbs (mouse-reactive glow) */
    .hero-orb { position: absolute; z-index: 2; border-radius: 50%; filter: blur(70px); pointer-events: none; animation: orbPulse 7s ease-in-out infinite alternate; transition: transform 0.4s cubic-bezier(0.2,0,0.2,1); }
    .orb1 { width: 360px; height: 360px; background: ${cat.accent}; top: -80px; left: -60px; opacity: 0.5; }
    .orb2 { width: 320px; height: 320px; background: #ffffff; bottom: -60px; right: -40px; opacity: 0.16; animation-delay: 2.5s; }
    @keyframes orbPulse { from { opacity: 0.3; } to { opacity: 0.6; } }
    .hero-content { position: relative; z-index: 3; text-align: center; max-width: 800px; transition: transform 0.1s linear; }
    @keyframes heroIn { from { opacity: 0; transform: translateY(34px); } to { opacity: 1; transform: translateY(0); } }
    .hero-badge {
      display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.1);
      backdrop-filter: blur(10px); padding: 8px 20px; border-radius: 50px; margin-bottom: 32px;
      border: 1px solid rgba(255,255,255,0.15);
      animation: heroIn 0.7s 0.1s both;
    }
    .hero-badge span { color: rgba(255,255,255,0.9); font-size: 14px; font-weight: 500; }
    .hero h1 {
      font-size: clamp(40px, 6vw, 72px); font-weight: 900; color: #fff; line-height: 1.1;
      margin-bottom: 24px; letter-spacing: -2px; animation: heroIn 0.7s 0.25s both;
    }
    .hero-sub {
      font-size: clamp(17px, 2vw, 21px); color: rgba(255,255,255,0.8); max-width: 600px;
      margin: 0 auto 40px; line-height: 1.7; animation: heroIn 0.7s 0.4s both;
    }
    .hero-btns { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; animation: heroIn 0.7s 0.55s both; }
    .btn-primary {
      display: inline-flex; align-items: center; gap: 8px; background: ${cat.accentGrad}; color: #fff;
      padding: 16px 36px; border-radius: 50px; font-size: 16px; font-weight: 700; text-decoration: none;
      border: none; cursor: pointer; box-shadow: 0 8px 30px rgba(0,0,0,0.2);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,0,0,0.3); }
    .btn-secondary {
      display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.1); color: #fff;
      padding: 16px 36px; border-radius: 50px; font-size: 16px; font-weight: 600; text-decoration: none;
      border: 1px solid rgba(255,255,255,0.2); backdrop-filter: blur(10px); transition: all 0.2s;
    }
    .btn-secondary:hover { background: rgba(255,255,255,0.2); transform: translateY(-2px); }
    .hero-stats {
      display: flex; justify-content: center; gap: 48px; margin-top: 64px; padding-top: 48px;
      border-top: 1px solid rgba(255,255,255,0.1); animation: heroIn 0.7s 0.7s both;
    }
    .hero-stat { text-align: center; }
    .hero-stat-num { font-size: 36px; font-weight: 900; color: #fff; }
    .hero-stat-label { font-size: 14px; color: rgba(255,255,255,0.6); margin-top: 4px; }

    /* ═══ SECTIONS ═══ */
    .section { padding: 100px 0; }
    .section-header { text-align: center; margin-bottom: 64px; }
    .section-label {
      display: inline-block; font-size: 13px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 2px; color: var(--accent); margin-bottom: 16px; background: var(--accent-light);
      padding: 6px 16px; border-radius: 50px;
    }
    .section-title { font-size: clamp(32px, 4vw, 44px); font-weight: 800; color: #111827; line-height: 1.2; letter-spacing: -1px; }
    .section-desc { font-size: 18px; color: #6b7280; max-width: 600px; margin: 16px auto 0; }

    /* ═══ SERVICES ═══ */
    .services-section { background: #f9fafb; }
    .services-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
    .service-card {
      background: #fff; padding: 40px 32px; border-radius: 20px; border: 1px solid #f3f4f6;
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden;
    }
    .service-card::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
      background: ${cat.accentGrad}; transform: scaleX(0); transform-origin: left; transition: transform 0.4s;
    }
    .service-card:hover { box-shadow: 0 20px 60px rgba(0,0,0,0.1); border-color: transparent; }
    .service-card:hover::before { transform: scaleX(1); }
    /* 3D tilt (applied via JS on devices with a real pointer) */
    .tilt { transform-style: preserve-3d; will-change: transform; transition: transform 0.18s ease-out, box-shadow 0.3s; }
    .service-icon-wrap {
      width: 64px; height: 64px; border-radius: 16px; background: var(--accent-light);
      display: flex; align-items: center; justify-content: center; margin-bottom: 24px; color: var(--accent);
      transition: transform 0.4s;
    }
    .service-card:hover .service-icon-wrap { transform: scale(1.1) rotate(-5deg); }
    .service-card h3 { font-size: 20px; font-weight: 700; margin-bottom: 12px; color: #111827; }
    .service-card p { font-size: 15px; color: #6b7280; line-height: 1.7; }

    /* ═══ STATS BAR ═══ */
    .stats-bar { background: ${cat.gradient}; padding: 60px 0; position: relative; overflow: hidden; }
    .stats-bar::before { content: ''; position: absolute; inset: 0; background: ${cat.pattern}; }
    .stats-grid { display: flex; justify-content: center; gap: 80px; position: relative; z-index: 2; }
    .stat-item { text-align: center; }
    .stat-num { font-size: 48px; font-weight: 900; color: #fff; }
    .stat-label { font-size: 15px; color: rgba(255,255,255,0.7); margin-top: 4px; }

    /* ═══ GALLERY ═══ */
    .gallery-section { background: #f9fafb; }
    .gallery-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .gallery-item {
      position: relative; border-radius: 16px; overflow: hidden; aspect-ratio: 4/3; cursor: pointer;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
    }
    .gallery-item img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1); }
    .gallery-item:hover img { transform: scale(1.08); }
    .gallery-item::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.5), transparent 60%); opacity: 0; transition: opacity 0.3s; }
    .gallery-item:hover::after { opacity: 1; }
    .gallery-cap { position: absolute; bottom: 0; left: 0; right: 0; padding: 20px; color: #fff; font-weight: 600; font-size: 15px; z-index: 2; transform: translateY(10px); opacity: 0; transition: all 0.3s; }
    .gallery-item:hover .gallery-cap { transform: translateY(0); opacity: 1; }

    /* ═══ ABOUT ═══ */
    .about-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center; }
    .about-img-wrap { position: relative; border-radius: 24px; overflow: hidden; aspect-ratio: 4/3; box-shadow: 0 20px 60px rgba(0,0,0,0.12); }
    .about-img-wrap img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.6s; }
    .about-img-wrap:hover img { transform: scale(1.05); }
    .about-badge { position: absolute; bottom: 24px; left: 24px; background: rgba(255,255,255,0.95); backdrop-filter: blur(10px); padding: 16px 24px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.15); }
    .about-badge-num { font-size: 28px; font-weight: 900; color: var(--accent); }
    .about-badge-label { font-size: 13px; color: #6b7280; }
    .about-text h2 { font-size: clamp(28px, 3.5vw, 40px); font-weight: 800; color: #111827; margin-bottom: 20px; letter-spacing: -1px; line-height: 1.2; }
    .about-text p { font-size: 16px; color: #6b7280; line-height: 1.8; margin-bottom: 16px; }
    .about-features { list-style: none; margin-top: 24px; display: flex; flex-direction: column; gap: 14px; }
    .about-features li { display: flex; align-items: center; gap: 12px; font-size: 15px; color: #374151; font-weight: 500; }
    .about-check { width: 24px; height: 24px; min-width: 24px; border-radius: 50%; background: var(--accent-light); color: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; }

    /* ═══ TESTIMONIALS ═══ */
    .testimonials-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
    .testimonial-card { background: #fff; padding: 36px; border-radius: 20px; border: 1px solid #f3f4f6; transition: all 0.3s; }
    .testimonial-card:hover { box-shadow: 0 10px 40px rgba(0,0,0,0.06); transform: translateY(-4px); }
    .testimonial-stars { color: #f59e0b; font-size: 18px; margin-bottom: 20px; letter-spacing: 2px; }
    .testimonial-text { font-size: 16px; color: #4b5563; line-height: 1.8; font-style: italic; margin-bottom: 24px; }
    .testimonial-text::before { content: '“'; } .testimonial-text::after { content: '”'; }
    .testimonial-author { display: flex; align-items: center; gap: 12px; }
    .testimonial-avatar { width: 44px; height: 44px; border-radius: 50%; background: ${cat.accentGrad}; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 16px; }
    .testimonial-name { font-weight: 700; color: #111827; font-size: 15px; }
    .testimonial-role { font-size: 13px; color: #9ca3af; }

    /* ═══ CTA ═══ */
    .cta-section { background: ${cat.gradient}; padding: 100px 0; text-align: center; position: relative; overflow: hidden; }
    .cta-section::before { content: ''; position: absolute; inset: 0; background: ${cat.pattern}; }
    .cta-content { position: relative; z-index: 2; }
    .cta-content h2 { font-size: clamp(32px, 4vw, 48px); font-weight: 900; color: #fff; margin-bottom: 20px; letter-spacing: -1px; }
    .cta-content p { font-size: 18px; color: rgba(255,255,255,0.8); max-width: 500px; margin: 0 auto 40px; }

    /* ═══ CONTACT ═══ */
    .contact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: start; }
    .contact-form { display: flex; flex-direction: column; gap: 20px; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .form-field label { display: block; font-size: 14px; font-weight: 600; margin-bottom: 8px; color: #374151; }
    .form-field input, .form-field textarea, .form-field select {
      width: 100%; padding: 14px 18px; border: 2px solid #e5e7eb; border-radius: 12px;
      font-size: 15px; font-family: inherit; transition: all 0.2s; background: #fff;
    }
    .form-field input:focus, .form-field textarea:focus, .form-field select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 4px var(--accent-light); }
    .form-submit { background: ${cat.accentGrad}; color: #fff; padding: 16px 32px; border: none; border-radius: 12px; font-size: 16px; font-weight: 700; cursor: pointer; font-family: inherit; transition: all 0.2s; box-shadow: 0 4px 15px ${cat.accentLight}; }
    .form-submit:hover { transform: translateY(-1px); box-shadow: 0 8px 25px rgba(0,0,0,0.15); }
    .contact-info-list { display: flex; flex-direction: column; gap: 28px; }
    .contact-info-item { display: flex; gap: 16px; align-items: flex-start; }
    .contact-info-icon { width: 52px; height: 52px; min-width: 52px; border-radius: 14px; background: var(--accent-light); display: flex; align-items: center; justify-content: center; font-size: 22px; }
    .contact-info-item h4 { font-size: 16px; font-weight: 700; color: #111827; margin-bottom: 4px; }
    .contact-info-item p { font-size: 15px; color: #6b7280; }
    .map-container { margin-top: 32px; border-radius: 16px; overflow: hidden; height: 220px; border: 1px solid #e5e7eb; }
    .map-container iframe { width: 100%; height: 100%; border: 0; display: block; }

    /* ═══ PROMO VIDEO ═══ */
    .video-section { background: #fff; }
    .video-wrap { max-width: 360px; margin: 0 auto; border-radius: 28px; overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,0.22); background: #000; }
    .video-wrap video { width: 100%; display: block; }

    /* ═══ FOOTER ═══ */
    .footer { background: #111827; color: #fff; padding: 64px 0 32px; }
    .footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 48px; margin-bottom: 48px; }
    .footer-brand p { color: #9ca3af; font-size: 15px; margin-top: 16px; line-height: 1.7; }
    .footer-logo-box { display: inline-block; background: #fff; padding: 12px 18px; border-radius: 12px; }
    .footer-logo-box img { height: 48px; width: auto; max-width: 240px; object-fit: contain; display: block; }
    .footer-col h4 { font-size: 15px; font-weight: 700; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 1px; }
    .footer-col ul { list-style: none; display: flex; flex-direction: column; gap: 12px; }
    .footer-col a { text-decoration: none; color: #9ca3af; font-size: 15px; transition: color 0.2s; }
    .footer-col a:hover { color: #fff; }
    .footer-bottom { border-top: 1px solid #1f2937; padding-top: 32px; display: flex; justify-content: space-between; align-items: center; }
    .footer-bottom p { color: #6b7280; font-size: 14px; }
    .footer-social { display: flex; gap: 16px; }
    .footer-social a { width: 40px; height: 40px; border-radius: 10px; background: #1f2937; display: flex; align-items: center; justify-content: center; color: #9ca3af; text-decoration: none; font-size: 18px; transition: all 0.2s; }
    .footer-social a:hover { background: var(--accent); color: #fff; transform: translateY(-2px); }

    /* ═══ SCROLL REVEAL (progressive enhancement) ═══ */
    .reveal { opacity: 1; transform: none; }
    /* CSS safety net: even if JS never runs, content is forced visible after
       3s so a page can never get stuck blank/white. JS reveals it instantly. */
    .js .reveal { opacity: 0; transform: translateY(36px); transition: opacity 0.7s cubic-bezier(0.4,0,0.2,1), transform 0.7s cubic-bezier(0.4,0,0.2,1); animation: revealSafety 0.01s linear 3s forwards; }
    @keyframes revealSafety { to { opacity: 1; transform: none; } }
    .js .reveal-zoom { transform: scale(0.92) translateY(24px); }
    .js .reveal.visible { opacity: 1; transform: none; animation: none; }
    .reveal-delay-1 { transition-delay: 0.08s; }
    .reveal-delay-2 { transition-delay: 0.16s; }
    .reveal-delay-3 { transition-delay: 0.24s; }
    @media (prefers-reduced-motion: reduce) {
      .js .reveal { opacity: 1 !important; transform: none !important; }
      .hero-bg { animation: none; }
      .hero-badge, .hero h1, .hero-sub, .hero-btns, .hero-stats { animation: none; }
    }

    /* ═══ MOBILE ═══ */
    @media (max-width: 1024px) {
      .services-grid, .testimonials-grid { grid-template-columns: repeat(2, 1fr); }
      .footer-grid { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 768px) {
      .nav-links { display: none; }
      .nav-brand { max-width: calc(100% - 110px); }
      .nav-logo { height: 42px; max-width: 210px; }
      .nav-brand-text { font-size: 16px; }
      .hamburger { display: block; }
      .nav-links.active { display: flex; flex-direction: column; position: absolute; top: 72px; left: 0; right: 0; background: #fff; padding: 24px; gap: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); border-bottom: 1px solid #f3f4f6; }
      .services-grid, .testimonials-grid { grid-template-columns: 1fr; }
      .gallery-grid { grid-template-columns: repeat(2, 1fr); }
      .about-grid { grid-template-columns: 1fr; gap: 40px; }
      .about-img-wrap { order: -1; }
      .contact-grid { grid-template-columns: 1fr; gap: 48px; }
      .form-row { grid-template-columns: 1fr; }
      .hero-stats { flex-direction: column; gap: 24px; }
      .stats-grid { flex-direction: column; gap: 32px; }
      .footer-grid { grid-template-columns: 1fr; gap: 32px; }
      .footer-bottom { flex-direction: column; gap: 16px; text-align: center; }
      .hero { min-height: auto; padding: 140px 24px 80px; }
    }
  </style>
</head>
<body>

  <div class="scroll-progress" id="scrollProgress"></div>
  ${lead.phone ? `<a href="https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}" class="wa-float" target="_blank" rel="noopener" aria-label="WhatsApp"><svg viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.157 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.51 5.26l-.999 3.648 3.728-.979zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/></svg></a>` : ''}

  <!-- NAVBAR -->
  <nav class="navbar" id="navbar">
    <div class="container">
      <a href="#" class="nav-brand">${logoDataUri ? `<img src="${logoDataUri}" alt="${esc(lead.name)}" class="nav-logo">` : `<span class="nav-brand-text"><span>${lead.name.charAt(0)}</span>${esc(lead.name.slice(1))}</span>`}</a>
      <div class="nav-right">
        <ul class="nav-links" id="navLinks">
          <li><a href="#services" ${L(UI.navServices)}>${UI.navServices.hu}</a></li>
          <li><a href="#about" ${L(UI.navAbout)}>${UI.navAbout.hu}</a></li>
          <li><a href="#gallery" ${L(UI.navGallery)}>${UI.navGallery.hu}</a></li>
          <li><a href="#reviews" ${L(UI.navReviews)}>${UI.navReviews.hu}</a></li>
          <li><a href="#contact" class="nav-cta-btn" ${L(cat.heroCta)}>${cat.heroCta.hu}</a></li>
        </ul>
        <div class="lang-toggle" id="langToggle">
          <button class="lang-opt active" data-lang="hu">HU</button>
          <button class="lang-opt" data-lang="en">EN</button>
        </div>
        <button class="hamburger" id="hamburger" aria-label="Menu"><span></span><span></span><span></span></button>
      </div>
    </div>
  </nav>

  <!-- HERO -->
  <section class="hero" id="hero">
    <div class="hero-bg" style="background-image: url('${src(heroUrl(photos.hero))}');"></div>
    <div class="hero-aurora"></div>
    <div class="hero-orb orb1"></div>
    <div class="hero-orb orb2"></div>
    <div class="hero-content">
      <div class="hero-badge"><span>${cat.icon} ${esc(lead.city)} | ${esc(lead.category)}</span></div>
      <h1>${esc(lead.name)}</h1>
      <p class="hero-sub" ${L({ hu: subHu, en: subEn })}>${esc(subHu)}</p>
      <div class="hero-btns">
        <a href="#contact" class="btn-primary" ${L({ hu: cat.heroCta.hu + ' →', en: cat.heroCta.en + ' →' })}>${cat.heroCta.hu} →</a>
        <a href="#services" class="btn-secondary" ${L({ hu: UI.navServices.hu + ' ↓', en: UI.navServices.en + ' ↓' })}>${UI.navServices.hu} ↓</a>
      </div>
      <div class="hero-stats">
        ${cat.stats.map(s => `
        <div class="hero-stat">
          <div class="hero-stat-num"><span class="count" data-target="${s.num}">${s.num}</span>${s.suffix}</div>
          <div class="hero-stat-label" ${L(s)}>${s.hu}</div>
        </div>`).join('')}
      </div>
    </div>
  </section>

  <!-- SERVICES -->
  <section class="section services-section" id="services">
    <div class="container">
      <div class="section-header reveal">
        <span class="section-label" ${L(UI.servicesLabel)}>${UI.servicesLabel.hu}</span>
        <h2 class="section-title" ${L(UI.servicesTitle)}>${UI.servicesTitle.hu}</h2>
        <p class="section-desc" ${L(servicesDesc)}>${esc(servicesDesc.hu)}</p>
      </div>
      <div class="services-grid">
        ${cat.services.map((s, i) => `
        <div class="service-card tilt reveal reveal-zoom reveal-delay-${(i % 3) + 1}">
          <div class="service-icon-wrap">${s.icon}</div>
          <h3 ${L({ hu: s.hu[0], en: s.en[0] })}>${esc(s.hu[0])}</h3>
          <p ${L({ hu: s.hu[1], en: s.en[1] })}>${esc(s.hu[1])}</p>
        </div>`).join('')}
      </div>
    </div>
  </section>

  ${hasVideo ? `<!-- PROMO VIDEO -->
  <section class="section video-section" id="video">
    <div class="container">
      <div class="section-header reveal">
        <span class="section-label">Bemutató videó</span>
        <h2 class="section-title" ${L({ hu: 'Tekintse meg', en: 'Watch the video' })}>Tekintse meg</h2>
      </div>
      <div class="video-wrap reveal">
        <video controls playsinline preload="metadata" poster="promo-poster.jpg">
          <source src="promo.mp4" type="video/mp4">
        </video>
      </div>
    </div>
  </section>` : ''}

  <!-- ABOUT -->
  <section class="section" id="about">
    <div class="container">
      <div class="about-grid">
        <div class="about-text reveal">
          <span class="section-label" ${L(UI.aboutLabel)}>${UI.aboutLabel.hu}</span>
          <h2 ${L(UI.aboutTitle)}>${UI.aboutTitle.hu}</h2>
          <p ${L(aboutP1)}>${esc(aboutP1.hu)}</p>
          <p ${L(aboutP2)}>${esc(aboutP2.hu)}</p>
          <ul class="about-features">
            ${UI.aboutFeatures.map(f => `<li><span class="about-check">✓</span> <span ${L(f)}>${esc(f.hu)}</span></li>`).join('')}
          </ul>
        </div>
        <div class="about-img-wrap reveal reveal-delay-2">
          <img src="${src(aboutUrl(photos.gallery[0].id))}" alt="${esc(lead.name)}" loading="lazy">
          <div class="about-badge">
            <div class="about-badge-num">${cat.stats[2].num}${cat.stats[2].suffix}</div>
            <div class="about-badge-label" ${L(cat.stats[2])}>${cat.stats[2].hu}</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- STATS -->
  <section class="stats-bar">
    <div class="container">
      <div class="stats-grid">
        ${cat.stats.map(s => `
        <div class="stat-item reveal">
          <div class="stat-num"><span class="count" data-target="${s.num}">${s.num}</span>${s.suffix}</div>
          <div class="stat-label" ${L(s)}>${s.hu}</div>
        </div>`).join('')}
      </div>
    </div>
  </section>

  <!-- GALLERY -->
  <section class="section gallery-section" id="gallery">
    <div class="container">
      <div class="section-header reveal">
        <span class="section-label" ${L(UI.galleryLabel)}>${UI.galleryLabel.hu}</span>
        <h2 class="section-title" ${L(UI.galleryTitle)}>${UI.galleryTitle.hu}</h2>
        <p class="section-desc" ${L(UI.galleryDesc)}>${esc(UI.galleryDesc.hu)}</p>
      </div>
      <div class="gallery-grid">
        ${photos.gallery.map((g, i) => `
        <div class="gallery-item tilt reveal reveal-zoom reveal-delay-${(i % 3) + 1}">
          <img src="${src(galleryUrl(g.id))}" alt="${esc(g.hu)}" loading="lazy">
          <div class="gallery-cap" ${L(g)}>${esc(g.hu)}</div>
        </div>`).join('')}
      </div>
    </div>
  </section>

  <!-- TESTIMONIALS -->
  <section class="section" id="reviews">
    <div class="container">
      <div class="section-header reveal">
        <span class="section-label" ${L(UI.reviewsLabel)}>${UI.reviewsLabel.hu}</span>
        <h2 class="section-title" ${L(UI.reviewsTitle)}>${UI.reviewsTitle.hu}</h2>
        <p class="section-desc" ${L(UI.reviewsDesc)}>${esc(UI.reviewsDesc.hu)}</p>
      </div>
      <div class="testimonials-grid">
        ${cat.testimonials.map((t, i) => `
        <div class="testimonial-card reveal reveal-delay-${i + 1}">
          <div class="testimonial-stars">★★★★★</div>
          <p class="testimonial-text" ${L({ hu: t.hu, en: t.en })}>${esc(t.hu)}</p>
          <div class="testimonial-author">
            <div class="testimonial-avatar">${t.author.charAt(0)}</div>
            <div>
              <div class="testimonial-name">${esc(t.author)}</div>
              <div class="testimonial-role" ${L({ hu: t.roleHu, en: t.roleEn })}>${esc(t.roleHu)}</div>
            </div>
          </div>
        </div>`).join('')}
      </div>
    </div>
  </section>

  <!-- CTA -->
  <section class="cta-section">
    <div class="cta-content reveal">
      <h2 ${L(UI.ctaTitle)}>${UI.ctaTitle.hu}</h2>
      <p ${L(UI.ctaDesc)}>${esc(UI.ctaDesc.hu)}</p>
      <a href="#contact" class="btn-primary" ${L({ hu: cat.heroCta.hu + ' →', en: cat.heroCta.en + ' →' })}>${cat.heroCta.hu} →</a>
    </div>
  </section>

  <!-- CONTACT -->
  <section class="section" id="contact">
    <div class="container">
      <div class="section-header reveal">
        <span class="section-label" ${L(UI.contactLabel)}>${UI.contactLabel.hu}</span>
        <h2 class="section-title" ${L(UI.contactTitle)}>${UI.contactTitle.hu}</h2>
        <p class="section-desc" ${L(UI.contactDesc)}>${esc(UI.contactDesc.hu)}</p>
      </div>
      <div class="contact-grid">
        <form class="contact-form reveal" id="contactForm">
          <div class="form-row">
            <div class="form-field">
              <label ${L(UI.formName)}>${UI.formName.hu}</label>
              <input type="text" name="name" required data-hu-ph="${esc(UI.phName.hu)}" data-en-ph="${esc(UI.phName.en)}" placeholder="${esc(UI.phName.hu)}">
            </div>
            <div class="form-field">
              <label ${L(UI.formEmail)}>${UI.formEmail.hu}</label>
              <input type="email" name="email" required placeholder="pelda@email.com">
            </div>
          </div>
          <div class="form-row">
            <div class="form-field">
              <label ${L(UI.formPhone)}>${UI.formPhone.hu}</label>
              <input type="tel" name="phone" placeholder="+36 XX XXX XXXX">
            </div>
            <div class="form-field">
              <label ${L(UI.formSubject)}>${UI.formSubject.hu}</label>
              <select>
                <option ${L(UI.subjBooking)}>${UI.subjBooking.hu}</option>
                <option ${L(UI.subjQuote)}>${UI.subjQuote.hu}</option>
                <option ${L(UI.subjGeneral)}>${UI.subjGeneral.hu}</option>
                <option ${L(UI.subjOther)}>${UI.subjOther.hu}</option>
              </select>
            </div>
          </div>
          <div class="form-field">
            <label ${L(UI.formMessage)}>${UI.formMessage.hu}</label>
            <textarea name="message" rows="5" data-hu-ph="${esc(UI.phMsg.hu)}" data-en-ph="${esc(UI.phMsg.en)}" placeholder="${esc(UI.phMsg.hu)}"></textarea>
          </div>
          <button type="submit" class="form-submit" ${L(UI.formSubmit)}>${UI.formSubmit.hu}</button>
        </form>
        <div class="reveal reveal-delay-2">
          <div class="contact-info-list">
            <div class="contact-info-item">
              <div class="contact-info-icon">📍</div>
              <div><h4 ${L(UI.infoAddress)}>${UI.infoAddress.hu}</h4><p>${esc(lead.address || lead.city + ', Magyarország')}</p></div>
            </div>
            ${lead.phone ? `
            <div class="contact-info-item">
              <div class="contact-info-icon">📞</div>
              <div><h4 ${L(UI.infoPhone)}>${UI.infoPhone.hu}</h4><p><a href="tel:${esc(lead.phone)}" style="color:#6b7280;text-decoration:none;">${esc(lead.phone)}</a></p></div>
            </div>` : ''}
            ${lead.email ? `
            <div class="contact-info-item">
              <div class="contact-info-icon">✉️</div>
              <div><h4 ${L(UI.infoEmail)}>${UI.infoEmail.hu}</h4><p><a href="mailto:${esc(lead.email)}" style="color:#6b7280;text-decoration:none;">${esc(lead.email)}</a></p></div>
            </div>` : ''}
            <div class="contact-info-item">
              <div class="contact-info-icon">🕐</div>
              <div><h4 ${L(UI.infoHours)}>${UI.infoHours.hu}</h4><p class="lang-html" ${L(UI.hours)}>${UI.hours.hu}</p></div>
            </div>
          </div>
          <div class="map-container"><iframe src="https://maps.google.com/maps?q=${encodeURIComponent((lead.address ? lead.address + ', ' : '') + lead.name + ', ' + lead.city + ', Hungary')}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="${esc(lead.name)} térkép"></iframe></div>
        </div>
      </div>
    </div>
  </section>

  <!-- FOOTER -->
  <footer class="footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          ${logoDataUri
            ? `<div class="footer-logo-box"><img src="${logoDataUri}" alt="${esc(lead.name)}"></div>`
            : `<a href="#" style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;text-decoration:none;"><span style="color:${cat.accent}">${lead.name.charAt(0)}</span>${esc(lead.name.slice(1))}</a>`}
          <p ${L({ hu: subHu, en: subEn })}>${esc(subHu)}</p>
        </div>
        <div class="footer-col">
          <h4 ${L(UI.footerNav)}>${UI.footerNav.hu}</h4>
          <ul>
            <li><a href="#services" ${L(UI.navServices)}>${UI.navServices.hu}</a></li>
            <li><a href="#gallery" ${L(UI.navGallery)}>${UI.navGallery.hu}</a></li>
            <li><a href="#reviews" ${L(UI.navReviews)}>${UI.navReviews.hu}</a></li>
            <li><a href="#contact" ${L(UI.contactLabel)}>${UI.contactLabel.hu}</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4 ${L(UI.footerContact)}>${UI.footerContact.hu}</h4>
          <ul>
            <li><a href="#">${esc(lead.city)}, Magyarország</a></li>
            ${lead.phone ? `<li><a href="tel:${esc(lead.phone)}">${esc(lead.phone)}</a></li>` : ''}
            ${lead.email ? `<li><a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a></li>` : ''}
          </ul>
        </div>
        <div class="footer-col">
          <h4 ${L(UI.footerHours)}>${UI.footerHours.hu}</h4>
          <ul>
            <li><a href="#" ${L(UI.fHours1)}>${UI.fHours1.hu}</a></li>
            <li><a href="#" ${L(UI.fHours2)}>${UI.fHours2.hu}</a></li>
            <li><a href="#" ${L(UI.fHours3)}>${UI.fHours3.hu}</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; ${new Date().getFullYear()} ${esc(lead.name)}. <span ${L(UI.rights)}>${UI.rights.hu}</span></p>
        <div class="footer-social">
          <a href="#" aria-label="Facebook">f</a>
          <a href="#" aria-label="Instagram">ig</a>
          <a href="#" aria-label="Google">G</a>
        </div>
      </div>
    </div>
  </footer>

  <script>
    // Navbar scroll effect + hero parallax
    var navbar = document.getElementById('navbar');
    var heroBg = document.querySelector('.hero-bg');
    var heroContent = document.querySelector('.hero-content');
    var ticking = false;
    var progressBar = document.getElementById('scrollProgress');
    function onScroll() {
      var y = window.scrollY;
      navbar.classList.toggle('scrolled', y > 50);
      if (progressBar) {
        var docH = document.documentElement.scrollHeight - window.innerHeight;
        progressBar.style.width = (docH > 0 ? (y / docH) * 100 : 0) + '%';
      }
      if (y < window.innerHeight) {
        if (heroBg) heroBg.style.backgroundPositionY = (50 + y * 0.04) + '%';
        if (heroContent) {
          heroContent.style.transform = 'translateY(' + (y * 0.18) + 'px)';
          heroContent.style.opacity = Math.max(0, 1 - y / 650);
        }
      }
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { window.requestAnimationFrame(onScroll); ticking = true; }
    });

    // Mouse-reactive parallax orbs in the hero
    var hero = document.getElementById('hero');
    var orbs = document.querySelectorAll('.hero-orb');
    if (hero && orbs.length && window.matchMedia('(hover: hover)').matches) {
      hero.addEventListener('mousemove', function (e) {
        var cx = e.clientX / window.innerWidth - 0.5;
        var cy = e.clientY / window.innerHeight - 0.5;
        if (orbs[0]) orbs[0].style.transform = 'translate(' + (cx * 50) + 'px,' + (cy * 50) + 'px)';
        if (orbs[1]) orbs[1].style.transform = 'translate(' + (cx * -38) + 'px,' + (cy * -38) + 'px)';
      });
    }

    // 3D tilt on cards (pointer devices only)
    if (window.matchMedia('(hover: hover)').matches) {
      var tiltEls = document.querySelectorAll('.tilt');
      for (var ti = 0; ti < tiltEls.length; ti++) {
        (function (el) {
          var max = el.classList.contains('gallery-item') ? 9 : 6;
          el.addEventListener('mousemove', function (e) {
            var r = el.getBoundingClientRect();
            var px = (e.clientX - r.left) / r.width - 0.5;
            var py = (e.clientY - r.top) / r.height - 0.5;
            el.style.transform = 'perspective(800px) rotateX(' + (-py * max) + 'deg) rotateY(' + (px * max) + 'deg) translateY(-6px)';
          });
          el.addEventListener('mouseleave', function () { el.style.transform = ''; });
        })(tiltEls[ti]);
      }
    }

    // Mobile menu
    var hamburger = document.getElementById('hamburger');
    var navLinks = document.getElementById('navLinks');
    hamburger.addEventListener('click', function () {
      navLinks.classList.toggle('active');
      hamburger.classList.toggle('active');
    });
    var anchors = document.querySelectorAll('a[href^="#"]');
    for (var a = 0; a < anchors.length; a++) {
      anchors[a].addEventListener('click', function () {
        navLinks.classList.remove('active');
        hamburger.classList.remove('active');
      });
    }

    // ── Language switching ──
    function setLang(lang) {
      document.documentElement.lang = lang;
      document.body.classList.add('lang-switching');
      setTimeout(function () {
        var els = document.querySelectorAll('[data-hu]');
        for (var i = 0; i < els.length; i++) {
          var v = els[i].getAttribute('data-' + lang);
          if (v === null) continue;
          if (els[i].classList.contains('lang-html')) els[i].innerHTML = v;
          else els[i].textContent = v;
        }
        var phs = document.querySelectorAll('[data-hu-ph]');
        for (var j = 0; j < phs.length; j++) {
          var p = phs[j].getAttribute('data-' + lang + '-ph');
          if (p !== null) phs[j].setAttribute('placeholder', p);
        }
        var opts = document.querySelectorAll('.lang-opt');
        for (var k = 0; k < opts.length; k++) {
          opts[k].classList.toggle('active', opts[k].getAttribute('data-lang') === lang);
        }
        document.body.classList.remove('lang-switching');
      }, 200);
    }
    var langOpts = document.querySelectorAll('.lang-opt');
    for (var l = 0; l < langOpts.length; l++) {
      langOpts[l].addEventListener('click', function () { setLang(this.getAttribute('data-lang')); });
    }

    // ── Contact form ──
    var form = document.getElementById('contactForm');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = form.querySelector('.form-submit');
        var en = document.documentElement.lang === 'en';
        // Compose a mailto to the business so the message is actually delivered.
        var get = function (n) { var el = form.querySelector('[name=' + n + ']'); return el ? el.value : ''; };
        var subject = encodeURIComponent((en ? 'Inquiry from website - ' : 'Érdeklődés a weboldalról - ') + get('name'));
        var body = encodeURIComponent(
          (en ? 'Name: ' : 'Név: ') + get('name') + '\\n' +
          (en ? 'Email: ' : 'Email: ') + get('email') + '\\n' +
          (en ? 'Phone: ' : 'Telefon: ') + get('phone') + '\\n\\n' +
          get('message')
        );
        window.location.href = 'mailto:${lead.email || ''}?subject=' + subject + '&body=' + body;
        btn.textContent = en ? '✓ Opening email…' : '✓ Email megnyitása…';
        btn.style.background = '#16a34a';
      });
    }

    // ── Animated number counters ──
    function animateCount(el) {
      var raw = el.getAttribute('data-target');
      var target = parseFloat(raw);
      var decimals = (raw.indexOf('.') >= 0) ? 1 : 0;
      var duration = 1500;
      var startTime = null;
      function ease(t) { return 1 - Math.pow(1 - t, 3); }
      function step(now) {
        if (!startTime) startTime = now;
        var p = Math.min((now - startTime) / duration, 1);
        var val = target * ease(p);
        el.textContent = decimals ? val.toFixed(1) : Math.floor(val).toString();
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = decimals ? target.toFixed(1) : Math.round(target).toString();
      }
      requestAnimationFrame(step);
    }

    // ── Scroll reveal + counter triggers (with safe fallbacks) ──
    var revealEls = document.querySelectorAll('.reveal');
    var counters = document.querySelectorAll('.count');

    if ('IntersectionObserver' in window) {
      var revObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            revObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
      for (var r = 0; r < revealEls.length; r++) revObserver.observe(revealEls[r]);

      var countObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            countObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.5 });
      for (var c = 0; c < counters.length; c++) countObserver.observe(counters[c]);

      // Failsafe: reveal anything still hidden near viewport after 2.5s
      setTimeout(function () {
        for (var x = 0; x < revealEls.length; x++) {
          var rect = revealEls[x].getBoundingClientRect();
          if (rect.top < window.innerHeight + 200) revealEls[x].classList.add('visible');
        }
      }, 2500);
    } else {
      for (var y = 0; y < revealEls.length; y++) revealEls[y].classList.add('visible');
    }
  </script>
  <script>
    /* Visit counter + instant lead alert. Counts every visit (counterapi)
       and pushes a one-time-per-session notification to ntfy.sh so the
       agency knows the moment a prospect opens their site. */
    (function () {
      try { fetch('https://api.counterapi.dev/v1/pixelco/${slug}/up').catch(function () {}); } catch (e) {}
      try {
        if (${notifyTopic ? 'true' : 'false'} && !sessionStorage.getItem('pc_notified')) {
          sessionStorage.setItem('pc_notified', '1');
          fetch('https://ntfy.sh/${notifyTopic}', {
            method: 'POST',
            headers: { 'Title': 'Pixel & Co. - lead aktiv', 'Tags': 'eyes' },
            body: ${JSON.stringify(lead.name)} + ' epp megnyitotta a weboldalat!'
          }).catch(function () {});
        }
      } catch (e) {}
    })();
  </script>
</body>
</html>`;
}

export async function buildForLead(lead) {
  const slug = slugify(lead.name);
  const projectDir = `projects/${slug}`;

  console.log(`[Builder] Building website for: ${lead.name}`);
  logAction('builder', 'build_start', { name: lead.name, city: lead.city });

  mkdirSync(projectDir, { recursive: true });

  const diagnosisPath = `database/diagnosis/${slug}.json`;
  const diagnosis = existsSync(diagnosisPath) ? loadJSON(diagnosisPath) : null;

  // Hero is per-business, not per-category: drop any shared cache entry so
  // each business gets its own AI hero (or reuses its own hero.png).
  photoCache.delete(heroUrl(getPhotos(lead.category).hero));

  await prefetchPhotos(lead.category, lead.city, projectDir);

  // Bespoke AI logo (transparent PNG with the name). Reuse logo.png if it
  // already exists (delete it to force a fresh logo); otherwise generate,
  // auto-trim the transparent margins so it fills the navbar, and save.
  let logoDataUri = null;
  const logoFile = `${projectDir}/logo.png`;
  try {
    if (existsSync(logoFile)) {
      logoDataUri = `data:image/png;base64,${readFileSync(logoFile).toString('base64')}`;
      console.log(`[Builder] Reusing existing logo for ${lead.name}`);
    } else {
      const accent = getCategoryData(lead.category).accent;
      const raw = await generateLogo(lead.category, lead.name, accent);
      if (raw) {
        let buf = Buffer.from(raw.split(',')[1], 'base64');
        try { buf = await sharp(buf).trim({ threshold: 10 }).toBuffer(); } catch (e) { /* keep untrimmed */ }
        writeFileSync(logoFile, buf);
        logoDataUri = `data:image/png;base64,${buf.toString('base64')}`;
        console.log(`[Builder] AI logo generated for ${lead.name}`);
      }
    }
  } catch (err) {
    console.error(`[Builder] AI logo failed: ${err.message}`);
  }

  const html = generateHTML(lead, diagnosis, logoDataUri);
  writeFileSync(`${projectDir}/index.html`, html, 'utf-8');

  const metadata = {
    business_name: lead.name,
    city: lead.city,
    category: lead.category,
    generated_at: new Date().toISOString(),
    files: ['index.html'],
    languages: ['hu', 'en'],
    recommended_package: diagnosis?.recommendation?.package || 'Standard'
  };

  saveJSON(`${projectDir}/metadata.json`, metadata);
  updateLead(lead.name, lead.city, { stage: 'built', project_dir: projectDir });

  logAction('builder', 'build_complete', { name: lead.name, project_dir: projectDir });
  console.log(`[Builder] ${lead.name} website generated at ${projectDir}/`);
  return true;
}

export async function runBuilder() {
  console.log('[Builder] Starting website generation...');
  logAction('builder', 'run_start');

  const config = loadConfig();

  // Self-heal: recompute scores with the current formula so leads scored by
  // an earlier (buggy) version are re-evaluated. Without this, leads scored
  // under the old rating penalty stay stuck below the build gate forever.
  const diagnosed = getLeadsByStage('diagnosed');
  for (const lead of diagnosed) {
    const fresh = scoreLead(lead);
    if (fresh !== lead.score) {
      updateLead(lead.name, lead.city, { score: fresh });
      lead.score = fresh;
    }
  }

  // Build the highest-scoring qualified leads first, capped per run so we keep
  // AI-generation cost/time bounded and roughly in step with the daily send rate.
  const buildLimit = config.goals.daily_build_limit || config.goals.daily_outreach_limit || 10;
  const leads = diagnosed
    .filter(l => (l.score || 0) >= config.goals.min_build_score)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, buildLimit);

  console.log(`[Builder] ${diagnosed.length} diagnosed leads; building top ${leads.length} (limit ${buildLimit})`);

  let built = 0;

  for (const lead of leads) {
    try {
      const result = await buildForLead(lead);
      if (result) built++;
    } catch (err) {
      logAction('builder', 'build_error', { name: lead.name, error: err.message });
      console.error(`[Builder] Error building for ${lead.name}: ${err.message}`);
    }
  }

  console.log(`[Builder] Complete. Built ${built} websites.`);

  // Refresh the portfolio landing page (GitHub Pages entry point).
  try {
    generatePortfolio();
  } catch (err) {
    console.error(`[Builder] Portfolio generation failed: ${err.message}`);
  }

  logAction('builder', 'run_complete', { built, total: leads.length });
}

if (process.argv[1]?.endsWith('builder.js')) {
  runBuilder().catch(console.error);
}
