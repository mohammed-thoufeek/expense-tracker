/* holo.js — interactive 3D hologram card viewer (mouse + touch) with cinematic entrance
   Perf notes (iOS): the animation loop only runs while something is actually moving
   (an always-on rAF loop burned CPU even when idle), rect reads are cached instead of
   forced per pointermove, and all pointer work is coalesced into one apply per frame. */
"use strict";

let holoRAF = null;

function openHologram(card) {
  const root = document.getElementById("holo-root");
  root.innerHTML = `
    <div class="holo-overlay" id="holoOv">
      <div class="holo-grid" aria-hidden="true"></div>
      <div class="holo-dust" aria-hidden="true">${"<i></i>".repeat(10)}</div>
      <button class="holo-close" id="holoX" aria-label="Close hologram">${ICON.x}</button>
      <div class="holo-stage">
        <div class="holo-enter">
          <div class="holo-float">
            <div class="holo-card" id="holoCard">
              <div class="holo-face">
                ${cardFaceHTML(card)}
                <div class="holo-sheen"></div>
                <div class="holo-lines"></div>
                <div class="holo-glare"></div>
              </div>
              <div class="holo-edge"></div>
            </div>
          </div>
          <div class="holo-beam" aria-hidden="true"></div>
        </div>
      </div>
      <div class="holo-meta">
        <strong>${esc(card.name)}</strong>
        <span>${card.amount > 0 ? fmt(card.amount) + " to pay" : "Fully paid \u2713"}</span>
        ${cardMonth(card) > 0 ? `<span class="m-tag">upcoming bill ${fmt(cardMonth(card))}</span>` : ""}
      </div>
      <div class="holo-hint">Drag to rotate &middot; hover to tilt &middot; Esc to close</div>
    </div>`;

  const cardEl = document.getElementById("holoCard");
  const sheen = root.querySelector(".holo-sheen");
  const lines = root.querySelector(".holo-lines");
  const TOUCH = matchMedia("(pointer:coarse)").matches;

  /* --- physics state --- */
  let rx = -6, ry = 16;          // current rotation
  let trx = -6, try_ = 16;       // target rotation
  let dragging = false, lx = 0, ly = 0, vx = 0, vy = 0;
  let rect = null, pe = null, closing = false, rafOn = false;
  let lastSheen = "", lastLines = "", lastGx = "", lastGy = "";

  /* the card is in a fixed stage — cache its rect once per interaction
     instead of forcing layout on every pointermove */
  const cacheRect = () => { rect = cardEl.getBoundingClientRect(); };
  cacheRect();

  /* glare follows the pointer (change-gated, consumed once per frame) */
  const setGlare = () => {
    if (!rect || !pe) return;
    const gx = clamp(((pe.x - rect.left) / rect.width) * 100, -40, 140).toFixed(0) + "%";
    const gy = clamp(((pe.y - rect.top) / rect.height) * 100, -40, 140).toFixed(0) + "%";
    pe = null;
    if (gx !== lastGx) { lastGx = gx; cardEl.style.setProperty("--gx", gx); }
    if (gy !== lastGy) { lastGy = gy; cardEl.style.setProperty("--gy", gy); }
  };

  /* sheen/scanlines track the rotation. On touch the sheen stays static —
     repainting a blurred, blend-mode gradient layer per frame is the
     single heaviest thing in this view on iPhones. */
  const applyVars = () => {
    if (!TOUCH) {
      const s = (50 + ry * 1.2).toFixed(2) + "|" + (50 - rx * 1.2).toFixed(2);
      if (s !== lastSheen) {
        lastSheen = s;
        sheen.style.setProperty("--shx", (50 + ry * 1.2).toFixed(2) + "%");
        sheen.style.setProperty("--shy", (50 - rx * 1.2).toFixed(2) + "%");
      }
    }
    const ly = (clamp(ry, -30, 30) * 2.4).toFixed(1) + "px";
    if (ly !== lastLines) { lastLines = ly; lines.style.setProperty("--ly", ly); }
  };

  /* runs only while something is moving; stops when the card settles */
  const loop = () => {
    rafOn = false;
    if (closing || !cardEl.isConnected) { holoRAF = null; return; }
    setGlare();
    if (!dragging) {                       // inertia after release
      try_ += vx; trx += vy; vx *= .95; vy *= .95;
      trx = clamp(trx, -72, 72);
    }
    rx += (trx - rx) * .12;
    ry += (try_ - ry) * .12;
    cardEl.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    applyVars();
    const busy = dragging ||
      Math.abs(trx - rx) > .05 || Math.abs(try_ - ry) > .05 ||
      Math.abs(vx) > .005 || Math.abs(vy) > .005;
    if (busy) { rafOn = true; holoRAF = requestAnimationFrame(loop); }
    else {                                 // snap to the target and stop
      rx = trx; ry = try_;
      cardEl.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      applyVars();
      holoRAF = null;
    }
  };
  const kick = () => { if (!rafOn && !closing) { rafOn = true; holoRAF = requestAnimationFrame(loop); } };

  cardEl.addEventListener("pointerdown", e => {
    dragging = true; lx = e.clientX; ly = e.clientY; vx = vy = 0;
    cardEl.setPointerCapture(e.pointerId);
    cacheRect();
    pe = { x: e.clientX, y: e.clientY };
    if (navigator.vibrate) navigator.vibrate(8);
    kick();
  });

  cardEl.addEventListener("pointermove", e => {
    pe = { x: e.clientX, y: e.clientY };   // applied once per frame inside the loop
    kick();
    if (dragging) {
      try_ += (e.clientX - lx) * .45;
      trx = clamp(trx - (e.clientY - ly) * .45, -72, 72);
      vx = (e.clientX - lx) * .03;
      vy = -(e.clientY - ly) * .03;
      lx = e.clientX; ly = e.clientY;
    } else if (!TOUCH && rect) {           // tilt toward cursor (mouse only)
      const nx = (e.clientX - rect.left) / rect.width - .5;
      const ny = (e.clientY - rect.top) / rect.height - .5;
      trx = -ny * 22; try_ = 16 + nx * 30;
    }
  });

  const release = () => { dragging = false; kick(); };
  cardEl.addEventListener("pointerup", release);
  cardEl.addEventListener("pointercancel", release);
  cardEl.addEventListener("contextmenu", e => e.preventDefault());
  window.addEventListener("resize", cacheRect);

  /* --- close with exit animation --- */
  const close = () => {
    if (closing) return;
    closing = true;
    document.getElementById("holoOv")?.classList.add("closing");
    setTimeout(() => {
      if (rafOn) cancelAnimationFrame(holoRAF);
      rafOn = false; holoRAF = null;
      window.removeEventListener("resize", cacheRect);
      document.removeEventListener("keydown", onKey);
      root.innerHTML = "";
    }, 240);
  };
  const onKey = e => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  document.getElementById("holoX").addEventListener("click", close);
  document.getElementById("holoOv").addEventListener("click", e => {
    if (e.target.id === "holoOv") close();
  });
}
