/* ui.js — premium micro-interactions: count-up, ripples, toasts, 3D thumb tilt, tab indicator */
"use strict";

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const lastNums = {};
let flashId = null;   // id of the row that was just added/edited → one-shot flash

/* ---------- animated money counters ---------- */
function countUp(el) {
  const target = Number(el.dataset.num || 0);
  const key = el.dataset.key || target;
  const from = Math.min(lastNums[key] ?? target * .4, target);
  lastNums[key] = target;
  if (reduceMotion || from === target) { el.textContent = fmt(target); return; }
  const dur = 900, t0 = performance.now();
  const ease = t => 1 - Math.pow(2, -10 * t);
  const step = now => {
    const p = Math.min(1, (now - t0) / dur);
    el.textContent = fmt(from + (target - from) * ease(p));
    if (p < 1) requestAnimationFrame(step); else el.textContent = fmt(target);
  };
  requestAnimationFrame(step);
}
function runCountUps(root) { root.querySelectorAll("[data-num]").forEach(countUp); }

/* ---------- ripples ---------- */
document.addEventListener("pointerdown", e => {
  const b = e.target.closest(".mini-add, .mini-clear, .btn-primary, .btn-ghost, .btn-danger, .icon-btn, .tab, .pay-pill, .month-add");
  if (!b || reduceMotion) return;
  const r = b.getBoundingClientRect();
  const s = document.createElement("span");
  s.className = "ripple";
  s.style.left = (e.clientX - r.left) + "px";
  s.style.top = (e.clientY - r.top) + "px";
  b.appendChild(s);
  setTimeout(() => s.remove(), 650);
});

/* ---------- toasts ---------- */
let toastBox = null;
function toast(msg, action) {
  if (!toastBox) {
    toastBox = document.createElement("div");
    toastBox.id = "toasts";
    document.body.appendChild(toastBox);
  }
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = svgWrap('<path d="M5 12.5l4.5 4.5L19 7.5"/>') + `<span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement("button");
    b.className = "toast-act";
    b.textContent = action.label || "Undo";
    b.addEventListener("click", () => { dismiss(); action.fn?.(); });
    t.appendChild(b);
  }
  toastBox.appendChild(t);
  const dismiss = () => { t.classList.add("out"); setTimeout(() => t.remove(), 340); };
  setTimeout(dismiss, action ? 5500 : 2100);
}

/* ---------- 3D tilt on card thumbnails (mouse only — touch gets nothing from this,
   and iOS synthesizes mousemove on taps which would thrash layout) ---------- */
function setupTilts() {
  if (reduceMotion || !matchMedia("(hover:hover) and (pointer:fine)").matches) return;
  document.querySelectorAll(".card-row .thumb").forEach(th => {
    th.onmousemove = e => {
      const r = th.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - .5;
      const ny = (e.clientY - r.top) / r.height - .5;
      th.style.transform = `perspective(520px) rotateY(${(nx * 12).toFixed(2)}deg) rotateX(${(-ny * 9).toFixed(2)}deg) scale(1.05)`;
    };
    th.onmouseleave = () => { th.style.transform = ""; };
  });
}

/* ---------- sliding tab indicator ---------- */
function placeTabInd() {
  const bar = document.getElementById("tabbar");
  const active = bar?.querySelector(".tab.active");
  const ind = bar?.querySelector(".tab-ind");
  if (!bar || !active || !ind) return;
  ind.style.left = active.offsetLeft + "px";
  ind.style.width = active.offsetWidth + "px";
}
window.addEventListener("resize", placeTabInd);
