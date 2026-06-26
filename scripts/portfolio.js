import { loadJSON, slugify } from '../lib/state.js';
import { writeFileSync } from 'fs';

// Generates a portfolio landing page (index.html at repo root) that links
// to every generated business website. Used as the GitHub Pages entry point.

const CATEGORY_LABELS = {
  restaurant: { hu: 'Étterem', en: 'Restaurant', emoji: '🍽️' },
  dentist: { hu: 'Fogászat', en: 'Dentist', emoji: '🦷' },
  'hair salon': { hu: 'Fodrászat', en: 'Hair salon', emoji: '✂️' },
  'auto repair': { hu: 'Autószerviz', en: 'Auto repair', emoji: '🔧' },
  plumber: { hu: 'Vízszerelő', en: 'Plumber', emoji: '🚿' },
  bakery: { hu: 'Pékség', en: 'Bakery', emoji: '🥐' },
  gym: { hu: 'Edzőterem', en: 'Gym', emoji: '🏋️' },
  photographer: { hu: 'Fotós', en: 'Photographer', emoji: '📷' },
  'cleaning service': { hu: 'Takarítás', en: 'Cleaning', emoji: '🧹' },
  'beauty salon': { hu: 'Szépségszalon', en: 'Beauty salon', emoji: '💆' }
};

const ACCENTS = {
  restaurant: '#e94560', dentist: '#00b4d8', 'hair salon': '#a855f7',
  'auto repair': '#ef4444', bakery: '#d97706', 'beauty salon': '#ec4899',
  plumber: '#2563eb', gym: '#111827', photographer: '#6366f1', 'cleaning service': '#10b981'
};

function catLabel(cat) {
  return CATEGORY_LABELS[cat] || { hu: cat, en: cat, emoji: '⭐' };
}

export function generatePortfolio() {
  const leads = loadJSON('database/leads.json', []);
  const built = leads
    .filter(l => l.stage === 'built' || l.project_dir)
    .sort((a, b) => (a.city || '').localeCompare(b.city || '') || (a.name || '').localeCompare(b.name || ''));

  const cards = built.map((l, i) => {
    const slug = slugify(l.name);
    const lab = catLabel(l.category);
    const accent = ACCENTS[l.category] || '#2563eb';
    return `
      <a class="card reveal" style="--accent:${accent}; transition-delay:${(i % 6) * 0.05}s" href="projects/${slug}/index.html">
        <div class="card-top">
          <span class="card-emoji">${lab.emoji}</span>
          <span class="card-cat" data-hu="${lab.hu}" data-en="${lab.en}">${lab.hu}</span>
        </div>
        <h3 class="card-name">${l.name}</h3>
        <div class="card-city">📍 ${l.city}</div>
        <div class="card-go"><span data-hu="Weboldal megtekintése" data-en="View website">Weboldal megtekintése</span> →</div>
      </a>`;
  }).join('');

  const cityCount = new Set(built.map(l => l.city)).size;
  const catCount = new Set(built.map(l => l.category)).size;

  const html = `<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script>document.documentElement.className += ' js';</script>
  <title>AI Web Agency — Portfólió</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',-apple-system,sans-serif;background:#0a0a0f;color:#fff;line-height:1.6;overflow-x:hidden;-webkit-font-smoothing:antialiased}
    .container{max-width:1200px;margin:0 auto;padding:0 24px}
    a{text-decoration:none;color:inherit}

    /* HERO */
    .phero{position:relative;text-align:center;padding:120px 24px 80px;overflow:hidden;background:radial-gradient(circle at 50% 0%,#1e293b,#0a0a0f 70%)}
    .phero::before{content:'';position:absolute;top:-150px;left:50%;transform:translateX(-50%);width:600px;height:600px;background:radial-gradient(circle,rgba(99,102,241,0.25),transparent 70%);filter:blur(40px);pointer-events:none;animation:pulse 6s ease-in-out infinite alternate}
    @keyframes pulse{from{opacity:.5}to{opacity:1}}
    .badge{display:inline-block;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);padding:8px 20px;border-radius:50px;font-size:14px;color:rgba(255,255,255,0.8);margin-bottom:28px;position:relative;z-index:2;animation:fadeUp .7s .1s both}
    .phero h1{font-size:clamp(38px,7vw,76px);font-weight:900;letter-spacing:-2px;line-height:1.05;margin-bottom:24px;position:relative;z-index:2;background:linear-gradient(135deg,#fff,#a5b4fc);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:fadeUp .7s .25s both}
    .phero p{font-size:clamp(16px,2vw,20px);color:rgba(255,255,255,0.6);max-width:560px;margin:0 auto 40px;position:relative;z-index:2;animation:fadeUp .7s .4s both}
    @keyframes fadeUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:none}}
    .pstats{display:flex;justify-content:center;gap:56px;position:relative;z-index:2;animation:fadeUp .7s .55s both}
    .pstat-num{font-size:42px;font-weight:900;background:linear-gradient(135deg,#818cf8,#c084fc);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
    .pstat-label{font-size:13px;color:rgba(255,255,255,0.5);margin-top:4px}

    /* LANG */
    .lang-toggle{position:fixed;top:20px;right:20px;z-index:100;display:inline-flex;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:50px;padding:3px}
    .lang-opt{border:none;background:transparent;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;color:rgba(255,255,255,0.5);padding:6px 14px;border-radius:50px;transition:all .25s}
    .lang-opt.active{background:#fff;color:#0a0a0f}

    /* GRID */
    .gallery{padding:80px 0 100px}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
    .card{background:linear-gradient(145deg,#15151f,#101018);border:1px solid rgba(255,255,255,0.07);border-radius:20px;padding:28px;display:flex;flex-direction:column;gap:10px;transition:transform .35s cubic-bezier(0.4,0,0.2,1),border-color .35s,box-shadow .35s;position:relative;overflow:hidden}
    .card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--accent);transform:scaleX(0);transform-origin:left;transition:transform .35s}
    .card:hover{transform:translateY(-6px);border-color:rgba(255,255,255,0.15);box-shadow:0 24px 60px rgba(0,0,0,0.5)}
    .card:hover::before{transform:scaleX(1)}
    .card-top{display:flex;align-items:center;gap:10px}
    .card-emoji{font-size:24px}
    .card-cat{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--accent)}
    .card-name{font-size:21px;font-weight:800;color:#fff;letter-spacing:-0.5px}
    .card-city{font-size:14px;color:rgba(255,255,255,0.45)}
    .card-go{margin-top:8px;font-size:14px;font-weight:600;color:rgba(255,255,255,0.7);transition:color .25s}
    .card:hover .card-go{color:var(--accent)}

    .reveal{opacity:1;transform:none}
    .js .reveal{opacity:0;transform:translateY(30px);transition:opacity .6s cubic-bezier(0.4,0,0.2,1),transform .6s cubic-bezier(0.4,0,0.2,1)}
    .js .reveal.visible{opacity:1;transform:none}

    footer{border-top:1px solid rgba(255,255,255,0.07);padding:40px 0;text-align:center;color:rgba(255,255,255,0.4);font-size:14px}

    @media(max-width:1024px){.grid{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:640px){.grid{grid-template-columns:1fr}.pstats{gap:32px}}
  </style>
</head>
<body>
  <div class="lang-toggle">
    <button class="lang-opt active" data-lang="hu">HU</button>
    <button class="lang-opt" data-lang="en">EN</button>
  </div>

  <section class="phero">
    <span class="badge" data-hu="AI Web Agency · Magyarország" data-en="AI Web Agency · Hungary">AI Web Agency · Magyarország</span>
    <h1 data-hu="Weboldal portfólió" data-en="Website portfolio">Weboldal portfólió</h1>
    <p data-hu="Egyedi, modern weboldalak magyar helyi vállalkozásoknak. Kattintson bármelyik kártyára az élő demó megtekintéséhez." data-en="Custom, modern websites for local Hungarian businesses. Click any card to view the live demo.">Egyedi, modern weboldalak magyar helyi vállalkozásoknak. Kattintson bármelyik kártyára az élő demó megtekintéséhez.</p>
    <div class="pstats">
      <div><div class="pstat-num">${built.length}</div><div class="pstat-label" data-hu="Weboldal" data-en="Websites">Weboldal</div></div>
      <div><div class="pstat-num">${cityCount}</div><div class="pstat-label" data-hu="Város" data-en="Cities">Város</div></div>
      <div><div class="pstat-num">${catCount}</div><div class="pstat-label" data-hu="Iparág" data-en="Industries">Iparág</div></div>
    </div>
  </section>

  <section class="gallery">
    <div class="container">
      <div class="grid">${cards}
      </div>
    </div>
  </section>

  <footer>
    <p>&copy; ${new Date().getFullYear()} AI Web Agency · <span data-hu="Készült AI-val" data-en="Built with AI">Készült AI-val</span></p>
  </footer>

  <script>
    function setLang(lang){
      document.documentElement.lang=lang;
      var els=document.querySelectorAll('[data-hu]');
      for(var i=0;i<els.length;i++){var v=els[i].getAttribute('data-'+lang);if(v!==null)els[i].textContent=v;}
      var opts=document.querySelectorAll('.lang-opt');
      for(var k=0;k<opts.length;k++)opts[k].classList.toggle('active',opts[k].getAttribute('data-lang')===lang);
    }
    var lo=document.querySelectorAll('.lang-opt');
    for(var l=0;l<lo.length;l++)lo[l].addEventListener('click',function(){setLang(this.getAttribute('data-lang'));});

    var revealEls=document.querySelectorAll('.reveal');
    if('IntersectionObserver' in window){
      var ob=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('visible');ob.unobserve(e.target);}});},{threshold:0.1,rootMargin:'0px 0px -40px 0px'});
      for(var r=0;r<revealEls.length;r++)ob.observe(revealEls[r]);
      setTimeout(function(){for(var x=0;x<revealEls.length;x++){var rc=revealEls[x].getBoundingClientRect();if(rc.top<window.innerHeight+200)revealEls[x].classList.add('visible');}},2500);
    }else{for(var y=0;y<revealEls.length;y++)revealEls[y].classList.add('visible');}
  </script>
</body>
</html>`;

  writeFileSync('index.html', html, 'utf-8');
  console.log(`[Portfolio] Generated index.html linking ${built.length} sites`);
}

if (process.argv[1]?.endsWith('portfolio.js')) {
  generatePortfolio();
}
