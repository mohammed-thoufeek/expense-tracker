/* deck.js — CRED-style vertical card deck: scroll-like scrubbing with spring settle + flip-to-back */
"use strict";

let deckIndex = 0;     // active card in the deck (persists across renders)
let deckFlipped = false;

function initDeck() {
  const deck = document.getElementById("deck");
  if (!deck) return;
  const cards = [...deck.querySelectorAll(".deck-card")];
  if (!cards.length) return;
  const n = cards.length;
  deckIndex = Math.max(0, Math.min(deckIndex, n - 1));
  let idx = deckIndex;
  const dots = [...document.querySelectorAll(".deck-dot")];

  /* position every card from a float deck position (0 = first card on top) */
  const apply = base => {
    const cur = Math.max(0, Math.min(Math.round(base), n - 1));
    cards.forEach((el, i) => {
      const pos = i - base;                    // 0 = front, + = peeking below, − = exiting above
      const a = Math.abs(pos);
      const vis = a < 2.6;
      el.style.zIndex = String(100 - Math.round(a * 10));
      const fade = pos < 0 ? Math.min(1, -pos * 1.4) : Math.max(0, (pos - 1.6) * 0.9);
      el.style.opacity = vis ? String(Math.max(0, 1 - fade)) : "0";
      el.style.pointerEvents = vis ? "auto" : "none";
      const y = pos * (pos < 0 ? 40 : 26);     // exit upward faster than the peek spacing
      el.style.transform =
        `translate(-50%,-50%) translateX(${(pos * 10).toFixed(1)}px) translateY(${y.toFixed(1)}px)` +
        ` scale(${(1 - Math.min(a, 2.5) * 0.055).toFixed(3)})` +
        ` rotateX(${(pos * 14).toFixed(1)}deg)`;
      el.style.setProperty("--dim", (Math.min(Math.max(pos, 0), 1) * 0.42).toFixed(2));
      el.classList.toggle("flipped", deckFlipped && i === cur);
    });
    dots.forEach((d, i) => d.classList.toggle("on", i === cur));
  };

  const settle = () => {
    deck.classList.add("settling");
    apply(idx);
    setTimeout(() => deck.classList.remove("settling"), 640);
  };

  const flip = () => {
    deckFlipped = !deckFlipped;
    cards[idx].classList.toggle("flipped", deckFlipped);
  };

  let down = null;
  let raf = 0, live = 0;

  /* iOS fires pointermove at up to 120Hz — coalesce style writes to one per frame */
  const scrub = raw => {
    live = raw;
    if (down) down.raw = raw;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; apply(down ? down.raw : idx); });
  };
  const stopRaf = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };

  deck.addEventListener("pointerdown", e => {
    if (e.target.closest("button") || e.target.closest(".month-amt")) return;
    down = { y: e.clientY, base: idx, moved: false, card: e.target.closest(".deck-card") };
    try { deck.setPointerCapture(e.pointerId); } catch {}
    deck.classList.remove("settling");
  });

  deck.addEventListener("pointermove", e => {
    if (!down) return;
    const dy = e.clientY - down.y;
    if (Math.abs(dy) > 8) down.moved = true;
    let raw = down.base - dy / 130;            // scroll-like: one drag travels many cards
    if (raw < 0) raw *= 0.25;                  // rubber-band below the first card
    if (raw > n - 1) raw = (n - 1) + (raw - (n - 1)) * 0.25;
    scrub(raw);
  });

  const up = e => {
    if (!down) return;
    stopRaf();
    const dy = e.clientY - down.y;
    const d = down;
    down = null;
    if (!d.moved) {                            // it's a tap
      if (d.card && +d.card.dataset.i !== idx) {
        idx = +d.card.dataset.i; deckIndex = idx; deckFlipped = false; settle();
      } else if (d.card) flip();
      return;
    }
    const target = Math.max(0, Math.min(Math.round(d.raw ?? idx), n - 1));
    if (target !== idx) deckFlipped = false;   // arrived at a new card → show the front
    idx = target; deckIndex = target;
    settle();
  };
  deck.addEventListener("pointerup", up);
  deck.addEventListener("pointercancel", () => { if (down) { stopRaf(); down = null; settle(); } });
  deck.addEventListener("contextmenu", e => e.preventDefault());

  /* mouse wheel scrubs the deck too — like a scrollbar */
  deck.addEventListener("wheel", e => {
    e.preventDefault();
    const ni = Math.max(0, Math.min(idx + (e.deltaY > 0 ? 1 : -1), n - 1));
    if (ni !== idx) { idx = ni; deckIndex = ni; deckFlipped = false; settle(); }
  }, { passive: false });

  apply(idx);
}
