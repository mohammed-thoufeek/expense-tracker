/* cards.js — icons, helpers, and generated credit-card artwork */
"use strict";

/* ---------- tiny helpers ---------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const inrFmt = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = n => "\u20B9" + inrFmt.format(Number(n) || 0);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* downscale an uploaded image to a data URL so localStorage stays small */
function readImage(file, cb) {
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      const max = 760, s = Math.min(1, max / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      cb(c.toDataURL("image/jpeg", 0.85));
    };
    img.src = r.result;
  };
  r.readAsDataURL(file);
}

/* ---------- icon set ---------- */
const svgWrap = inner => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICON = {
  grid:   svgWrap('<path d="M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z"/>'),
  receipt:svgWrap('<path d="M6 3.5h12V20l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 20z"/><path d="M9 8.5h6M9 12h6"/>'),
  card:   svgWrap('<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10.5h18M7 15h4"/>'),
  owe:    svgWrap('<circle cx="9.5" cy="8" r="3"/><path d="M4.5 19c.6-3 2.6-4.6 5-4.6s4.4 1.6 5 4.6"/><circle cx="16.5" cy="9" r="2.3"/><path d="M16.8 14.3c1.9.4 3.2 1.9 3.7 4.2"/>'),
  plus:   svgWrap('<path d="M12 5v14M5 12h14"/>'),
  pencil: svgWrap('<path d="M4.5 19.5l1-4L16 5l3 3L8.5 18.5z"/><path d="M14 7l3 3"/>'),
  trash:  svgWrap('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7M10 10.5v6M14 10.5v6"/>'),
  x:      svgWrap('<path d="M6 6l12 12M18 6L6 18"/>'),
  image:  svgWrap('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4.5 17l4.5-4 3.5 3 3-2.5 4 3.5"/>'),
  check:  svgWrap('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  undo:   svgWrap('<path d="M8 5L4 9l4 4"/><path d="M4 9h10.5a5.5 5.5 0 015.5 5.5V19"/>'),
  sparkle: svgWrap('<path d="M12 3l2 5.6 5.5 2.4-5.5 2.4L12 19l-2-5.6L4.5 11l5.5-2.4z"/>'),
};

const CARDHOLDER = "MOHAMMED";
const FONT = 'font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif"';

/* ---------- per-brand background art (drawn under the shared chrome) ---------- */
const ART = {
  /* Flipkart Axis — blue→pink flowing ribbons */
  "flipkart-axis": u => `
    <radialGradient id="axbg${u}" cx="0.2" cy="0" r="1.4">
      <stop offset="0" stop-color="#251327"/><stop offset=".55" stop-color="#120a14"/><stop offset="1" stop-color="#08060a"/>
    </radialGradient>
    <rect width="340" height="214" fill="url(#axbg${u})"/>
    <linearGradient id="rib${u}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#37a3f2"/><stop offset=".5" stop-color="#7a4bd6"/><stop offset="1" stop-color="#e0479e"/>
    </linearGradient>
    <g filter="url(#soft${u})" opacity=".6">
      <path d="M-40 170 C 30 40, 120 250, 200 120 S 310 40, 390 140" stroke="url(#rib${u})" stroke-width="42" fill="none" stroke-linecap="round"/>
    </g>
    <path d="M-40 170 C 30 40, 120 250, 200 120 S 310 40, 390 140" stroke="url(#rib${u})" stroke-width="17" fill="none" stroke-linecap="round"/>
    <path d="M-40 200 C 50 80, 140 260, 220 160 S 320 70, 390 170" stroke="url(#rib${u})" stroke-width="7" fill="none" stroke-linecap="round" opacity=".6"/>
    <path d="M-40 150 C 20 60, 110 230, 190 110 S 300 20, 390 120" stroke="url(#rib${u})" stroke-width="3" fill="none" stroke-linecap="round" opacity=".5"/>`,

  /* Axis Neo — pink goggles */
  "axis-neo": u => `
    <radialGradient id="nb${u}" cx="0.75" cy="0.15" r="1.3">
      <stop offset="0" stop-color="#3a1220"/><stop offset=".6" stop-color="#17090e"/><stop offset="1" stop-color="#08050a"/>
    </radialGradient>
    <rect width="340" height="214" fill="url(#nb${u})"/>
    <linearGradient id="pg${u}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff6f9c"/><stop offset=".55" stop-color="#d33066"/><stop offset="1" stop-color="#57122b"/>
    </linearGradient>
    <g filter="url(#soft${u})" opacity=".55"><ellipse cx="240" cy="110" rx="120" ry="80" fill="#a01d4a"/></g>
    <g transform="translate(236,104) rotate(-12)">
      <path d="M-92 -6 C -60 -34, 60 -34, 92 -6" stroke="url(#pg${u})" stroke-width="10" fill="none" stroke-linecap="round"/>
      <ellipse rx="44" ry="37" fill="#140a10" stroke="url(#pg${u})" stroke-width="14"/>
      <ellipse cx="88" rx="44" ry="37" fill="#140a10" stroke="url(#pg${u})" stroke-width="14"/>
      <ellipse cy="-2" rx="26" ry="20" fill="#3d1626" opacity=".8"/>
      <ellipse cx="88" cy="-2" rx="26" ry="20" fill="#3d1626" opacity=".8"/>
      <path d="M-44 0 C -30 -8, 30 -8, 44 0" stroke="url(#pg${u})" stroke-width="9" fill="none"/>
    </g>
    <path d="M-20 150 C 60 130, 120 190, 210 160 S 320 130, 380 170" stroke="url(#pg${u})" stroke-width="26" fill="none" stroke-linecap="round" opacity=".3" filter="url(#soft2${u})"/>`,

  /* BookMyShow RBL — dark damask + film reel + spotlight */
  "bms": u => `
    <radialGradient id="rbbg${u}" cx="0.3" cy="0.2" r="1.5">
      <stop offset="0" stop-color="#241519"/><stop offset=".6" stop-color="#150e12"/><stop offset="1" stop-color="#0a0709"/>
    </radialGradient>
    <rect width="340" height="214" fill="url(#rbbg${u})"/>
    <g filter="url(#soft${u})" opacity=".5">
      <circle cx="300" cy="40" r="60" fill="#5e1620"/><circle cx="60" cy="190" r="70" fill="#4a1522"/>
    </g>
    <path d="M180 0 L340 0 L260 214 L120 214 Z" fill="#fff" opacity=".04"/>
    <g opacity=".8">
      <circle cx="268" cy="150" r="36" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="9"/>
      <circle cx="268" cy="150" r="13" fill="#fff" opacity=".2"/>
      <circle cx="292" cy="150" r="6.5" fill="#fff" opacity=".22"/><circle cx="280" cy="171" r="6.5" fill="#fff" opacity=".22"/>
      <circle cx="256" cy="171" r="6.5" fill="#fff" opacity=".22"/><circle cx="244" cy="150" r="6.5" fill="#fff" opacity=".22"/>
      <circle cx="256" cy="129" r="6.5" fill="#fff" opacity=".22"/><circle cx="280" cy="129" r="6.5" fill="#fff" opacity=".22"/>
    </g>
    <g opacity=".07" stroke="#fff" fill="none" stroke-width="2">
      <path d="M20 120 C 80 60, 140 180, 200 120"/><path d="M40 190 C 100 130, 160 250, 220 190"/>
    </g>
    <circle cx="120" cy="30" r="2.5" fill="#ff6b6b" opacity=".8"/><circle cx="170" cy="60" r="1.8" fill="#fff" opacity=".5"/>`,

  /* Slice — vibrant neon blobs */
  "slice": u => `
    <linearGradient id="sbg${u}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1b0f1e"/><stop offset="1" stop-color="#0d0710"/>
    </linearGradient>
    <rect width="340" height="214" fill="url(#sbg${u})"/>
    <g filter="url(#soft${u})" opacity=".85">
      <circle cx="250" cy="70" r="70" fill="#ff3d8b"/><circle cx="320" cy="160" r="80" fill="#ff8a3d"/><circle cx="180" cy="190" r="60" fill="#7b2ff7"/>
    </g>
    <path d="M-30 150 C 60 40, 150 240, 240 120 S 330 60, 400 130" stroke="#fff" stroke-opacity=".28" stroke-width="3" fill="none"/>
    <path d="M-30 170 C 70 60, 160 250, 250 140 S 335 80, 400 150" stroke="#fff" stroke-opacity=".12" stroke-width="14" fill="none" stroke-linecap="round"/>`,

  /* Generic — for user cards without a photo */
  "generic": u => `
    <radialGradient id="gbg${u}" cx="0.2" cy="0" r="1.4">
      <stop offset="0" stop-color="#23202c"/><stop offset="1" stop-color="#0b0a10"/>
    </radialGradient>
    <rect width="340" height="214" fill="url(#gbg${u})"/>
    <linearGradient id="grb${u}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#22d3ee"/><stop offset=".5" stop-color="#a78bfa"/><stop offset="1" stop-color="#f472b6"/>
    </linearGradient>
    <g filter="url(#soft${u})" opacity=".45">
      <circle cx="280" cy="50" r="55" fill="#6d28d9"/><circle cx="90" cy="200" r="60" fill="#0ea5e9"/>
    </g>
    <path d="M-30 160 C 60 60, 160 240, 260 120 S 340 80, 400 140" stroke="url(#grb${u})" stroke-width="10" fill="none" stroke-linecap="round" opacity=".4"/>`,
};

/* ---------- brand logos ---------- */
const LOGO = {
  "flipkart-axis": () => `
    <g fill="#fff">
      <path d="M28 40 L38 18 L48 40 H42.5 L38 28.5 L33.5 40 Z"/>
      <text x="54" y="35" ${FONT} font-size="15" font-weight="700" letter-spacing="1">AXIS BANK</text>
    </g>`,
  "axis-neo": () => `
    <g fill="#fff">
      <path d="M28 40 L38 18 L48 40 H42.5 L38 28.5 L33.5 40 Z"/>
      <text x="54" y="35" ${FONT} font-size="15" font-weight="700" letter-spacing="1">AXIS BANK</text>
    </g>`,
  "bms": () => `
    <rect x="20" y="15" width="26" height="26" rx="7" fill="#e02b2b"/>
    <text x="33" y="33.5" text-anchor="middle" ${FONT} font-size="17" font-weight="800" fill="#fff" font-family="Georgia, serif">b</text>
    <text x="52" y="30" ${FONT} font-size="14" font-weight="700" letter-spacing="1.4" fill="#fff">RBL BANK</text>
    <text x="52" y="43" ${FONT} font-size="8" letter-spacing="2.4" fill="#ff7070">BOOKMYSHOW</text>`,
  "slice": () => `
    <text x="22" y="35" ${FONT} font-size="21" font-weight="800" font-style="italic" fill="#fff">slice</text>
    <text x="22" y="47" ${FONT} font-size="7.5" letter-spacing="3.2" fill="#ffb8d6">CREDIT CARD</text>`,
  "generic": (name) => `
    <text x="22" y="34" ${FONT} font-size="${name.length > 18 ? 12 : 15}" font-weight="750" letter-spacing=".5" fill="#fff">${esc(name)}</text>`,
};

/* pick an art style automatically from the card name */
function artFor(name) {
  const n = name.toLowerCase();
  if (n.includes("slice")) return "slice";
  if (n.includes("flipkart")) return "flipkart-axis";
  if (n.includes("neo")) return "axis-neo";
  if (n.includes("rbl") || n.includes("bookmyshow")) return "bms";
  return "generic";
}

/* ---------- full card face (SVG) ---------- */
function cardArtSVG(card) {
  const u = String(card.id || "x").replace(/[^a-zA-Z0-9]/g, "");
  const amt = fmt(card.amount);
  const art = card.art || artFor(card.name);
  const bg = ART[art] ? ART[art](u) : ART.generic(u);
  const logo = (LOGO[art] || LOGO.generic)(card.name);
  const pillW = Math.round(amt.length * 7.6) + 34;

  return `<svg viewBox="0 0 340 214" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" ${FONT} role="img" aria-label="${esc(card.name)}">
  <defs>
    <linearGradient id="gold${u}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f7e08c"/><stop offset=".45" stop-color="#d9a83f"/><stop offset=".75" stop-color="#f3d87c"/><stop offset="1" stop-color="#c08a2d"/>
    </linearGradient>
    <radialGradient id="vig${u}" cx="0.5" cy="0.45" r="0.95">
      <stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/>
    </radialGradient>
    <clipPath id="clip${u}"><rect width="340" height="214" rx="16"/></clipPath>
    <filter id="soft${u}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="14"/></filter>
    <filter id="soft2${u}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5"/></filter>
  </defs>
  <g clip-path="url(#clip${u})">
    ${bg}
    <rect width="340" height="214" fill="url(#vig${u})"/>
  </g>
  ${logo}
  <text x="24" y="106" font-size="12" letter-spacing="3" font-weight="600" fill="rgba(255,255,255,.85)">&#183;&#183;${card.last4 ? " " + esc(card.last4) : "&#183;&#183;"}</text>
  <g transform="translate(24,118)">
    <rect width="46" height="34" rx="6" fill="url(#gold${u})" stroke="#7d5c17" stroke-width="1"/>
    <path d="M0 11.5h13M0 22.5h13M33 11.5h13M33 22.5h13M13 1v32M33 1v32M13 11.5h20M13 22.5h20" stroke="#7d5c17" stroke-width="1.3" fill="none"/>
    <rect x="17" y="13" width="12" height="8" rx="2" fill="none" stroke="#7d5c17" stroke-width="1.3"/>
  </g>
  <text x="50" y="194" font-size="13" letter-spacing="2.6" font-weight="650" fill="rgba(255,255,255,.96)">${CARDHOLDER}</text>
  <g transform="translate(316,26)">
    <rect x="${-pillW}" y="-12" width="${pillW}" height="24" rx="12" fill="rgba(20,14,20,.5)"/>
    <circle cx="${-pillW + 16}" cy="0" r="8" fill="#fff"/>
    <path d="M${-pillW + 12.5} 0l2.4 2.6 4.4-5" stroke="#151515" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="-8" y="4.8" text-anchor="end" font-size="13.5" font-weight="700" fill="#fff">${amt}</text>
  </g>
</svg>`;
}

/* face = uploaded photo or generated art.
   Generated art is pre-rasterized to a bitmap once per card: iOS WebKit
   rasterizes SVG Gaussian filters on the CPU and re-rasterizes while the
   deck/holo transforms scale every frame — a plain <img> composites on the
   GPU instead. */
const FACE_PNG = new Map();   // faceKey → dataURL (JPEG, baked filters)
const FACE_BUSY = new Set();  // keys currently being rasterized
const faceKey = card =>
  `${card.id}|${card.art || artFor(card.name)}|${card.name}|${card.last4 || ""}|${card.amount}`;

function rasterFace(card) {
  const key = faceKey(card);
  if (FACE_PNG.has(key) || FACE_BUSY.has(key)) return;
  FACE_BUSY.add(key);
  const url = URL.createObjectURL(new Blob([cardArtSVG(card)], { type: "image/svg+xml" }));
  const img = new Image();
  img.onload = () => {
    try {
      const c = document.createElement("canvas");
      c.width = 680; c.height = 428;                     // 2× the 340×214 viewBox
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#0c0a10";                          // rounded-corner backdrop
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const png = c.toDataURL("image/jpeg", 0.92);
      FACE_PNG.set(key, png);
      /* upgrade any face already on screen (deck, thumbs, hologram) */
      const sel = CSS.escape(key);
      document.querySelectorAll(`[data-facekey="${sel}"]`).forEach(el => {
        el.removeAttribute("data-facekey");
        el.outerHTML = `<img src="${png}" alt="${esc(card.name)}" draggable="false" decoding="async">`;
      });
    } catch {} finally { URL.revokeObjectURL(url); FACE_BUSY.delete(key); }
  };
  img.onerror = () => { URL.revokeObjectURL(url); FACE_BUSY.delete(key); };
  img.src = url;
}

/* render every generated face once, just after a render settles */
let prewarmT = null;
function scheduleFacePrewarm() {
  clearTimeout(prewarmT);
  prewarmT = setTimeout(() => state.cards.forEach(c => { if (!c.img) rasterFace(c); }), 350);
}

function cardFaceHTML(card) {
  if (card.img) return `<img src="${card.img}" alt="${esc(card.name)}" draggable="false" decoding="async">`;
  const key = faceKey(card);
  const png = FACE_PNG.get(key);
  if (png) return `<img src="${png}" alt="${esc(card.name)}" draggable="false" decoding="async">`;
  rasterFace(card);   // async — until then the crisp inline SVG shows, then swaps in place
  return cardArtSVG(card).replace("<svg ", `<svg data-facekey="${esc(key)}" `);
}
