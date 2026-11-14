/* holo.js — interactive 3D hologram card viewer (mouse + touch) with cinematic entrance */
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

  /* --- physics state --- */
  let rx = -6, ry = 16;          // current rotation
  let trx = -6, try_ = 16;       // target rotation
  let dragging = false, lx = 0, ly = 0, vx = 0, vy = 0;

  const setGlare = e => {
    const r = cardEl.getBoundingClientRect();
    const x = clamp(((e.clientX - r.left) / r.width) * 100, -40, 140);
    const y = clamp(((e.clientY - r.top) / r.height) * 100, -40, 140);
    cardEl.style.setProperty("--gx", x + "%");
    cardEl.style.setProperty("--gy", y + "%");
  };

  const applyVars = () => {
    sheen.style.setProperty("--shx", (50 + ry * 1.2) + "%");
    sheen.style.setProperty("--shy", (50 - rx * 1.2) + "%");
    lines.style.setProperty("--ly", (ry * 2.4) + "px");
  };

  const loop = () => {
    if (!document.getElementById("holoCard")) { holoRAF = null; return; }
    if (!dragging) {                       // inertia after release
      try_ += vx; trx += vy; vx *= .95; vy *= .95;
      trx = clamp(trx, -72, 72);
    }
    rx += (trx - rx) * .12;
    ry += (try_ - ry) * .12;
    cardEl.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    applyVars();
    holoRAF = requestAnimationFrame(loop);
  };

  cardEl.addEventListener("pointerdown", e => {
    dragging = true; lx = e.clientX; ly = e.clientY; vx = vy = 0;
    cardEl.setPointerCapture(e.pointerId);
    if (navigator.vibrate) navigator.vibrate(8);
  });

  cardEl.addEventListener("pointermove", e => {
    setGlare(e);
    if (dragging) {
      try_ += (e.clientX - lx) * .45;
      trx = clamp(trx - (e.clientY - ly) * .45, -72, 72);
      vx = (e.clientX - lx) * .03;
      vy = -(e.clientY - ly) * .03;
      lx = e.clientX; ly = e.clientY;
    } else if (e.pointerType === "mouse") {  // tilt toward cursor
      const r = cardEl.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - .5;
      const ny = (e.clientY - r.top) / r.height - .5;
      trx = -ny * 22; try_ = 16 + nx * 30;
    }
  });

  const release = () => { dragging = false; };
  cardEl.addEventListener("pointerup", release);
  cardEl.addEventListener("pointercancel", release);
  cardEl.addEventListener("contextmenu", e => e.preventDefault());

  /* --- close with exit animation --- */
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    const ov = document.getElementById("holoOv");
    ov?.classList.add("closing");
    setTimeout(() => {
      if (holoRAF) cancelAnimationFrame(holoRAF), holoRAF = null;
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

  loop();
}
