/* app.js — state, storage, tabs, forms */
"use strict";

/* ---------- state & storage ---------- */
const LS_KEY = "expense-tracker-v1";

function seed() {
  return {
    total: 60000,
    saved: 12500,
    spends: [
      { id: uid(), name: "Groceries - BigBasket", amount: 2450, order: 4, cardId: "card-flipkart", created: Date.now() - 5 * 864e5 },
      { id: uid(), name: "Netflix subscription",  amount: 649,  order: 3, cardId: "",              created: Date.now() - 4 * 864e5 },
      { id: uid(), name: "Petrol",                amount: 1500, order: 2, cardId: "card-neo",      created: Date.now() - 3 * 864e5 },
      { id: uid(), name: "Movie tickets - PVR",   amount: 720,  order: 1, cardId: "card-bms",      created: Date.now() - 2 * 864e5 },
      { id: uid(), name: "Zomato order",          amount: 385,  order: 0, cardId: "",              created: Date.now() - 864e5 },
    ],
    spendPaid: 0,
    cards: [
      { id: "card-slice",    name: "Slice Credit card",               amount: 0,       paidAmt: 0, art: "slice",         last4: "4821", img: null },
      { id: "card-flipkart", name: "Flipkart Axis Bank Credit Card",  amount: 1302,    paidAmt: 0, art: "flipkart-axis", last4: "7957", img: null },
      { id: "card-neo",      name: "Axis Bank Neo Credit Card",       amount: 4349.10, paidAmt: 0, art: "axis-neo",      last4: "7584", img: null },
      { id: "card-bms",      name: "BookMyShow RBL Bank Credit Card", amount: 11791,   paidAmt: 0, art: "bms",           last4: "4600", img: null },
    ],
    owes: [
      { id: uid(), name: "Aman",  amount: 500 },
      { id: uid(), name: "Sneha", amount: 1200 },
    ],
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return seed();
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.cards)) return seed();
    // migration: track paid amounts + this-month accrual per card
    s.cards.forEach(c => {
      if (typeof c.paidAmt !== "number") c.paidAmt = 0;
      if (!Array.isArray(c.monthItems)) c.monthItems = [];
    });
    // migration: one shared "Paid" amount for the Spends tab
    // (an earlier build tracked a paid amount on each spend — roll those into the total)
    if (!Array.isArray(s.spends)) s.spends = [];
    if (typeof s.spendPaid !== "number") {
      s.spendPaid = s.spends.reduce((a, sp) => a + Math.min(sp.paid || 0, sp.amount || 0), 0);
    }
    s.spendPaid = clamp(s.spendPaid, 0, s.spends.reduce((a, sp) => a + (sp.amount || 0), 0));
    normalizeSpendOrder(s.spends);
    return s;
  } catch { return seed(); }
}

const state = loadState();
const save = () => {
  state.spendPaid = spendPaid();   // keep the single Paid amount within 0..total
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { console.warn("Save failed", e); }
  if (typeof cloudQueuePush === "function") cloudQueuePush();   // cloud sync (firebase-sync.js)
};
let tab = "dashboard";
let paidFlashId = null;   // card that was just marked as paid → green flash

/* ---------- sums ---------- */
/* Spends ledger: Total Spend − Paid = Pending (one shared Paid amount) */
const spendTotal   = () => state.spends.reduce((a, s) => a + (s.amount || 0), 0);
const spendPaid    = () => clamp(state.spendPaid || 0, 0, spendTotal());
const spendPending = () => spendTotal() - spendPaid();
function sums() {
  return { paid: spendPaid(), pending: spendPending(), total: spendTotal(), saved: state.saved };
}

/* ---------- spend order (drag to reorder) ---------- */
const bySpendOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || b.created - a.created;
const orderedSpends = () => [...state.spends].sort(bySpendOrder);
function normalizeSpendOrder(list) {
  if (!Array.isArray(list)) return;
  const missing = list.filter(s => typeof s.order !== "number");
  if (!missing.length) return;
  const max = list.reduce((m, s) => typeof s.order === "number" && s.order > m ? s.order : m, -1);
  missing.sort((a, b) => (b.created || 0) - (a.created || 0))
    .forEach((s, i) => { s.order = max + 1 + i; });
}
/* card-based dashboard logic:
   Total  = every rupee that ever came due on the cards (current dues + marked-as-paid)
   Paid   = total marked as paid across cards
   Due    = what is still outstanding (shown in the Cards section) */
const cardDueTotal  = () => state.cards.reduce((a, c) => a + c.amount, 0);
const cardTotalEver = () => state.cards.reduce((a, c) => a + c.amount + (c.paidAmt || 0), 0);
const cardPaidTotal = () => state.cards.reduce((a, c) => a + (c.paidAmt || 0), 0);
/* "this month so far" accrual bucket (spends logged on a card since its last bill) */
const cardMonth     = c => (c.monthItems || []).reduce((a, m) => a + m.amount, 0);
const monthTotalAll = () => state.cards.reduce((a, c) => a + cardMonth(c), 0);
const flashCls = id => (id === flashId ? " row-flash" : id === paidFlashId ? " row-paid" : "");

/* undo a card payment (restores the due) */
function undoCard(id) {
  const c = state.cards.find(x => x.id === id);
  if (!c || !(c.paidAmt > 0)) return;
  c.amount = c.paidAmt;
  c.paidAmt = 0;
  flashId = c.id;
  save(); render(); toast("Payment undone \u2014 due restored");
}

/* ---------- row builders ---------- */
function spendRows(spends, { icons = false, plain = false } = {}) {
  if (!spends.length) return `<div class="empty">No spends yet \u2014 add your first one</div>`;
  const sorted = [...spends].sort(bySpendOrder);
  return sorted.map((s, i) => `
    <div class="row${flashCls(s.id)}" style="--i:${i}">
      ${icons ? `<button type="button" class="drag-handle" data-drag="spend" data-id="${s.id}" aria-label="Drag to reorder" title="Drag to reorder">${ICON.grip}</button>` : ""}
      <div class="row-main">
        <span class="row-name">${esc(s.name)}</span>
      </div>
      <strong class="amt">${fmt(s.amount)}</strong>
      ${icons ? `
      <button class="icon-btn" data-action="edit-spend" data-id="${s.id}" aria-label="Edit spend">${ICON.pencil}</button>
      <button class="icon-btn danger" data-action="del-spend" data-id="${s.id}" aria-label="Delete spend">${ICON.trash}</button>` : ""}
    </div>`).join("");
}

function cardRows({ mini = false } = {}) {
  if (!state.cards.length) return `<div class="empty">No cards yet</div>`;
  return state.cards.map((c, i) => mini ? `
    <div class="row${flashCls(c.id)}" style="--i:${i}">
      <div class="row-main"><span class="row-name">${esc(c.name)}</span></div>
      <strong class="amt">${fmt(c.amount)}</strong>
    </div>` : `
    <div class="card-row${flashCls(c.id)}${c.id === paidFlashId ? " row-paid" : ""}" data-action="holo" data-id="${c.id}" role="button" tabindex="0" aria-label="Show hologram of ${esc(c.name)}" style="--i:${i}">
      <div class="thumb">${cardFaceHTML(c)}</div>
      <div class="card-info">
        <strong>${esc(c.name)}</strong>
        <span class="due">Bill to pay</span>
        <em data-num="${c.amount}" data-key="card-${c.id}">${fmt(c.amount)}</em>
        ${c.amount > 0
          ? `<button class="pay-pill" data-action="pay-card" data-id="${c.id}">${ICON.check} Mark as paid</button>`
          : c.paidAmt > 0
            ? `<span class="paid-line"><span class="paid-state">${ICON.check} Fully paid</span>
               <button class="undo-pill" data-action="undo-card" data-id="${c.id}" title="Undo — restore the due">${ICON.undo} Undo</button></span>`
            : `<span class="paid-state">${ICON.check} Fully paid</span>`}
        <div class="month-line">
          <span class="m-lbl">Upcoming bill</span>
          <b class="month-amt" data-action="month-list" data-id="${c.id}" data-num="${cardMonth(c)}" data-key="cardm-${c.id}" title="Tap to view &amp; edit">${fmt(cardMonth(c))}</b>
          <button class="month-add" data-action="month-add" data-id="${c.id}" aria-label="Add to upcoming bill" title="Add to upcoming bill">${ICON.plus}</button>
        </div>
      </div>
      <div class="card-actions">
        <button class="icon-btn" data-action="new-bill" data-id="${c.id}" aria-label="New bill arrived" title="New bill arrived">${ICON.receipt}</button>
        <button class="icon-btn" data-action="edit-card" data-id="${c.id}" aria-label="Edit card">${ICON.pencil}</button>
        <button class="icon-btn danger" data-action="del-card" data-id="${c.id}" aria-label="Delete card">${ICON.trash}</button>
      </div>
    </div>`).join("");
}

function oweRows() {
  if (!state.owes.length) return `<div class="empty">Nobody here \u2014 add someone</div>`;
  return state.owes.map((o, i) => `
    <div class="row${flashCls(o.id)}" style="--i:${i}">
      <div class="avatar">${esc(o.name.trim().charAt(0).toUpperCase() || "?")}</div>
      <div class="row-main"><span class="row-name">${esc(o.name)}</span></div>
      <strong class="amt">${fmt(o.amount)}</strong>
      <button class="icon-btn" data-action="edit-owe" data-id="${o.id}" aria-label="Edit">${ICON.pencil}</button>
      <button class="icon-btn danger" data-action="del-owe" data-id="${o.id}" aria-label="Delete">${ICON.trash}</button>
    </div>`).join("");
}

/* ---------- views ---------- */
const lgRow = (op, label, value, num, key, action = "", cls = "") => `
  <div class="lg-row">
    <span class="lg-op">${op}</span>
    <span class="lg-lbl">${label}${action ? `<button class="lg-ed" data-action="${action}" aria-label="Edit ${label}">${ICON.pencil}</button>` : ""}</span>
    <strong class="lg-amt ${cls}" data-num="${num}" data-key="${key}">${value}</strong>
  </div>`;

function budgetBar() {
  const total = cardTotalEver(), paid = cardPaidTotal();
  const pct = (total > 0 ? Math.min(100, (paid / total) * 100) : 0).toFixed(2);
  return `
    <div class="budget-bar" aria-hidden="true">
      <span class="seg paid" style="width:${pct}%"></span>
    </div>
    <div class="budget-legend">
      <span class="l-paid"><b></b>Paid ${fmt(paid)}</span>
      <span class="l-out"><b></b>Outstanding ${fmt(total - paid)}</span>
    </div>`;
}

const VIEWS = {
  dashboard() {
    const total = cardTotalEver(), paid = cardPaidTotal();
    const { saved, pending } = sums();
    const upcoming = monthTotalAll();
    const rem = total - paid - upcoming - saved - pending;
    return `<div class="page">
      <header class="page-head"><h1>Dashboard</h1><p>Your money at a glance</p></header>

      <section class="panel">
        <div class="ledger">
          ${lgRow("", "Total", fmt(total), total, "total")}
          ${lgRow("&minus;", "Paid", fmt(paid), paid, "paid", "", "c-green")}
          ${upcoming > 0 ? lgRow("&minus;", "Upcoming", fmt(upcoming), upcoming, "upcoming", "", "c-cyan") : ""}
          ${lgRow("&minus;", "Saved", fmt(saved), saved, "saved", "edit-saved", "c-violet")}
          ${lgRow("&minus;", "Pending", fmt(pending), pending, "pending", "", "c-amber")}
          <div class="lg-total ${rem < 0 ? "neg" : ""}">
            <span class="lg-op">=</span>
            <span class="lg-lbl">Remaining</span>
            <strong data-num="${rem}" data-key="rem">${fmt(rem)}</strong>
          </div>
        </div>
        ${budgetBar()}
        <p class="note">Total &amp; Paid come from your cards &middot; Upcoming = swipes waiting for the next bill &middot; Remaining = Total &minus; Paid &minus; Upcoming &minus; Saved &minus; Pending. ${typeof dataNote === "function" ? dataNote() : "Data stays on this device."}</p>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>Spends</h2></div>
        <div class="rows">${spendRows(state.spends, { plain: true })}</div>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>Cards</h2></div>
        <div class="rows">${cardRows({ mini: true })}</div>
      </section>
    </div>`;
  },

  spends() {
    const total = spendTotal(), paid = spendPaid(), pending = spendPending();
    return `<div class="page">
      <header class="page-head"><h1>Spends</h1><p>Every expense, one by one</p></header>

      <section class="panel">
        <div class="ledger">
          ${lgRow("", "Total Spend", fmt(total), total, "spendTotal")}
          <div class="lg-row">
            <span class="lg-op">&minus;</span>
            <span class="lg-lbl">Paid</span>
            <label class="lg-input">
              <span>&#8377;</span>
              <input type="number" data-input="spend-paid" min="0" step="0.01" inputmode="decimal"
                value="${paid ? paid : ""}" placeholder="0.00" aria-label="Amount paid">
            </label>
          </div>
          <div class="lg-total${pending > 0 ? "" : " settled"}">
            <span class="lg-op">=</span>
            <span class="lg-lbl">Pending</span>
            <strong data-num="${pending}" data-key="spendPending">${fmt(pending)}</strong>
          </div>
        </div>
        <p class="note">Enter how much you've paid &middot; Total Spend &minus; Paid = Pending</p>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>All spends</h2>
          <div class="head-actions">
            <button class="mini-clear" data-action="clear-spends">${ICON.trash} Clear all</button>
            <button class="mini-add" data-action="add-spend">${ICON.plus} Add</button>
          </div>
        </div>
        <div class="rows">${spendRows(state.spends, { icons: true })}</div>
      </section>
    </div>`;
  },

  cards() {
    const n = state.cards.length;
    return `<div class="page">
      <header class="page-head"><h1>Cards</h1><p>Swipe up to deal the next card &middot; tap to flip</p></header>

      <section class="panel cards-hero">
        <span>Total due</span>
        <div class="due-col">
          <strong data-num="${cardDueTotal()}" data-key="dueTotal">${fmt(cardDueTotal())}</strong>
          ${cardPaidTotal() > 0 ? `<small>incl. ${fmt(cardPaidTotal())} paid</small>` : ""}
          ${monthTotalAll() > 0 ? `<small class="cyan">upcoming bill ${fmt(monthTotalAll())}</small>` : ""}
        </div>
      </section>

      <section class="panel deck-panel">
        <div class="panel-head"><h2>Your cards</h2><button class="mini-add" data-action="add-card">${ICON.plus} Add</button></div>
        ${n === 0 ? `<div class="empty" style="margin:0 16px 12px">No cards yet \u2014 add your first one</div>` : `
        <div class="deck" id="deck">
          ${state.cards.map((c, i) => `
          <div class="deck-card" data-i="${i}">
            <div class="deck-inner">
              <div class="deck-face deck-front">${cardFaceHTML(c)}
                <button class="front-l4" data-action="l4-edit" data-id="${c.id}" aria-label="Edit last 4 digits" title="Last 4 digits">${ICON.pencil}</button>
              </div>
              <div class="deck-face deck-back" data-art="${c.art || artFor(c.name)}">
                <div class="db-top">
                  <div class="db-title">
                    <strong class="db-name">${esc(c.name)}</strong>
                    <span class="db-sub">&bull;&bull;&bull;&bull;${c.last4 ? " " + esc(c.last4) : ""}</span>
                  </div>
                  <button class="icon-btn db-holo" data-action="holo" data-id="${c.id}" aria-label="Show hologram" title="Hologram">${ICON.sparkle}</button>
                </div>
                <div class="db-mid">
                  <span class="db-lbl">Bill to pay</span>
                  <em class="db-amt" data-num="${c.amount}" data-key="deck-${c.id}">${fmt(c.amount)}</em>
                </div>
                ${c.amount > 0
                  ? `<button class="pay-pill" data-action="pay-card" data-id="${c.id}">${ICON.check} Mark as paid</button>`
                  : c.paidAmt > 0
                    ? `<span class="paid-line"><span class="paid-state">${ICON.check} Fully paid</span>
                       <button class="undo-pill" data-action="undo-card" data-id="${c.id}">${ICON.undo} Undo</button></span>`
                    : `<span class="paid-state">${ICON.check} Fully paid</span>`}
                <div class="db-up">
                  <div class="db-up-l">
                    <span class="m-lbl">Upcoming bill</span>
                    <b class="month-amt" data-action="month-list" data-id="${c.id}" data-num="${cardMonth(c)}" data-key="deckm-${c.id}">${fmt(cardMonth(c))}</b>
                  </div>
                  <div class="db-up-btns">
                    <button class="month-add" data-action="month-add" data-id="${c.id}" aria-label="Add to upcoming bill" title="Add to upcoming bill">${ICON.plus}</button>
                    <button class="icon-btn db-mini" data-action="edit-upcoming" data-id="${c.id}" aria-label="Edit upcoming bill" title="Edit total">${ICON.pencil}</button>
                  </div>
                </div>
                <div class="db-row">
                  <button class="db-btn" data-action="new-bill" data-id="${c.id}">${ICON.receipt} New bill</button>
                  <button class="db-btn" data-action="edit-card" data-id="${c.id}">${ICON.pencil} Edit</button>
                  <button class="db-btn db-danger" data-action="del-card" data-id="${c.id}">${ICON.trash} Delete</button>
                </div>
              </div>
            </div>
            <i class="deck-shade" aria-hidden="true"></i>
          </div>`).join("")}
        </div>
        <div class="deck-dots">${state.cards.map((_, i) =>
          `<button class="deck-dot ${i === deckIndex ? "on" : ""}" data-action="dot" data-i="${i}" aria-label="Go to card ${i + 1}"></button>`).join("")}</div>
        <p class="deck-hint">Scroll or swipe to deal the cards &middot; tap to flip</p>`}
      </section>
    </div>`;
  },

  owe() {
    return `<div class="page">
      <header class="page-head"><h1>Owe</h1><p>People and amounts</p></header>
      <section class="panel">
        <div class="panel-head"><h2>People</h2><button class="mini-add" data-action="add-owe">${ICON.plus} Add</button></div>
        <div class="rows">${oweRows()}</div>
      </section>
    </div>`;
  },
};

/* ---------- tabbar (persistent sliding indicator) ---------- */
function renderTabbar() {
  const tabs = [
    ["dashboard", "Dashboard", ICON.grid],
    ["spends", "Spends", ICON.receipt],
    ["cards", "Cards", ICON.card],
    ["owe", "Owe", ICON.owe],
  ];
  document.getElementById("tabBtns").innerHTML = tabs.map(([id, label, icon]) => `
    <button class="tab ${tab === id ? "active" : ""}" data-action="tab" data-tab="${id}" ${tab === id ? 'aria-current="page"' : ""}>
      ${icon}<span>${label}</span>
    </button>`).join("");
  placeTabInd();
}

function render(fresh = false) {
  renderTabbar();
  const view = document.getElementById("view");
  view.innerHTML = VIEWS[tab]();
  if (fresh) view.querySelector(".page")?.classList.add("fresh");
  runCountUps(view);
  setupTilts();
  if (tab === "cards") initDeck();
  scheduleFacePrewarm();
  flashId = null;
  paidFlashId = null;
}

/* ---------- modal & form system ---------- */
const modalRoot = document.getElementById("modal-root");
let formImage = null;
let modalCloseTimer = null;

function closeModal() {
  const bd = modalRoot.firstElementChild;
  if (!bd) return;
  bd.classList.add("closing");
  clearTimeout(modalCloseTimer);
  modalCloseTimer = setTimeout(() => { modalRoot.innerHTML = ""; }, 200);
}

/* ---------- iOS keyboard vs bottom sheets ---------- */
/* Safari overlays the keyboard without resizing fixed elements, so on touch
   devices (where sheets are bottom-anchored) the lower half of an open modal —
   including its action buttons — stays behind the keyboard and taps land
   nowhere. While an input inside a sheet is focused, lift it by the measured
   keyboard overlap via the visual viewport. */
(function keyboardLift() {
  const vv = window.visualViewport;
  if (!vv || !window.matchMedia("(pointer:coarse)").matches) return;
  let bd = null;
  const lift = () => {
    if (!bd) return;
    if (!bd.isConnected) { bd = null; vv.removeEventListener("resize", lift); return; }
    const overlap = Math.round(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    if (overlap > 80) { bd.classList.add("kb"); bd.style.setProperty("--kb", overlap + "px"); }
    else { bd.classList.remove("kb"); bd.style.removeProperty("--kb"); }
  };
  modalRoot.addEventListener("focusin", e => {
    bd = e.target.closest(".modal-backdrop");
    if (!bd) return;
    lift();
    vv.addEventListener("resize", lift);
  });
  modalRoot.addEventListener("focusout", () => setTimeout(() => {
    if (!modalRoot.contains(document.activeElement)) {
      vv.removeEventListener("resize", lift);
      if (bd) { bd.classList.remove("kb"); bd.style.removeProperty("--kb"); bd = null; }
    }
  }, 120));
})();

function openForm(title, fields, submitLabel, cb, init = {}) {
  clearTimeout(modalCloseTimer);   // a pending close must not wipe the new modal
  formImage = init.img || null;
  const body = fields.map(f => {
    if (f.type === "select") return `
      <label class="field"><span>${f.label}</span>
        <select name="${f.name}">${f.options.map(([v, t]) =>
          `<option value="${v}" ${v === f.value ? "selected" : ""}>${t}</option>`).join("")}
        </select></label>`;
    if (f.type === "file") return `
      <label class="field"><span>${f.label}</span>
        <input type="file" name="${f.name}" accept="image/*" id="f-img">
        <div class="img-preview" id="imgPrev">${formImage ? `<img src="${formImage}" alt="preview">` : ""}</div>
      </label>`;
    if (f.type === "checkbox") return `
      <label class="check"><input type="checkbox" name="${f.name}" ${f.checked ? "checked" : ""}> ${f.label}</label>`;
    return `
      <label class="field"><span>${f.label}</span>
        <input name="${f.name}" type="${f.type || "text"}" ${f.step ? `step="${f.step}"` : ""}
          value="${f.value ?? ""}" placeholder="${f.placeholder || ""}" ${f.required ? "required" : ""}
          ${f.maxlength ? `maxlength="${f.maxlength}"` : ""} ${f.inputmode ? `inputmode="${f.inputmode}"` : ""}
          ${f.type === "number" ? 'inputmode="decimal"' : ""}>
      </label>`;
  }).join("");

  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-close="1">
      <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <h3>${esc(title)}</h3>
        <form id="modalForm">${body}
          <div class="modal-actions">
            <button type="button" class="btn-ghost" data-close="1">Cancel</button>
            <button type="submit" class="btn-primary">${esc(submitLabel)}</button>
          </div>
        </form>
      </div>
    </div>`;

  const backdrop = modalRoot.firstElementChild;
  backdrop.addEventListener("pointerdown", e => { if (e.target.dataset.close) closeModal(); });
  backdrop.querySelector(".btn-ghost").addEventListener("click", closeModal);
  document.addEventListener("keydown", function onEsc(e) {
    if (e.key === "Escape") { closeModal(); document.removeEventListener("keydown", onEsc); }
  });

  const fileInput = document.getElementById("f-img");
  if (fileInput) fileInput.addEventListener("change", () => {
    const f = fileInput.files[0];
    if (!f) return;
    readImage(f, url => {
      formImage = url;
      const prev = document.getElementById("imgPrev");
      if (prev) prev.innerHTML = `<img src="${url}" alt="preview">`;
    });
  });

  document.getElementById("modalForm").addEventListener("submit", e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const out = {};
    for (const [k, v] of fd.entries()) out[k] = v;
    out.img = formImage;
    cb(out, closeModal);
  });
}

function parseAmount(v) {
  if (v === "" || v === null || v === undefined) return NaN;
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

/* ---------- premium confirm dialog (replaces native confirm) ---------- */
function confirmDialog(title, message, okLabel = "Delete") {
  return new Promise(resolve => {
    let done = false;
    const finish = val => {
      if (done) return;
      done = true;
      document.removeEventListener("keydown", onEsc);
      closeModal();
      resolve(val);
    };
    const onEsc = e => { if (e.key === "Escape") finish(false); };
    document.addEventListener("keydown", onEsc);

    modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal confirm" role="alertdialog" aria-modal="true" aria-label="${esc(title)}">
          <div class="confirm-icon">${ICON.trash}</div>
          <h3>${esc(title)}</h3>
          <p>${message}</p>
          <div class="modal-actions">
            <button type="button" class="btn-ghost">Cancel</button>
            <button type="button" class="btn-danger">${esc(okLabel)}</button>
          </div>
        </div>
      </div>`;

    const bd = modalRoot.firstElementChild;
    bd.addEventListener("pointerdown", e => {
      if (e.target === bd) finish(false);
    });
    bd.querySelector(".btn-ghost").addEventListener("click", () => finish(false));
    bd.querySelector(".btn-danger").addEventListener("click", () => finish(true));
  });
}

/* ---------- form openers ---------- */
function formSaved() {
  openForm("Set Saved", [{ name: "v", label: "Saved amount", type: "number", step: "0.01", value: state.saved, required: true }],
    "Save", (d, close) => {
      const n = parseAmount(d.v);
      if (isNaN(n)) return alert("Enter a valid amount");
      state.saved = n; save(); render(); toast("Savings updated"); close();
    });
}

function formSpend(id) {
  const editing = state.spends.find(s => s.id === id);
  openForm(editing ? "Edit spend" : "Add spend", [
    { name: "name", label: "Name", value: editing?.name, required: true, placeholder: "e.g. Groceries" },
    { name: "amount", label: "Amount", type: "number", step: "0.01", value: editing?.amount ?? "", required: true },
  ], editing ? "Save" : "Add", (d, close) => {
    const amount = parseAmount(d.amount);
    if (!d.name.trim()) return alert("Enter a name");
    if (isNaN(amount)) return alert("Enter a valid amount");
    if (editing) {
      Object.assign(editing, { name: d.name.trim(), amount });
      flashId = editing.id;
      save(); render(); toast("Spend updated"); close();
    } else {
      const minOrder = state.spends.reduce((m, sp) => Math.min(m, typeof sp.order === "number" ? sp.order : 0), 0);
      const s = { id: uid(), name: d.name.trim(), amount, order: state.spends.length ? minOrder - 1 : 0, cardId: "", created: Date.now() };
      state.spends.push(s);
      flashId = s.id;
      save(); render(); toast("Spend added"); close();
    }
  });
}

function formCard(id) {
  const editing = state.cards.find(c => c.id === id);
  const fields = [
    { name: "name", label: "Card name", value: editing?.name, required: true, placeholder: "e.g. HDFC Millennia" },
    { name: "amount", label: "Amount to pay", type: "number", step: "0.01",
      value: editing ? (editing.amount || "") : "", placeholder: "e.g. 1,302.00 — leave empty if nothing due" },
  ];

  openForm(editing ? "Edit card" : "Add card", fields, editing ? "Save" : "Add", (d, close) => {
    const amount = d.amount === "" ? 0 : parseAmount(d.amount);
    if (!d.name.trim()) return alert("Enter a card name");
    if (isNaN(amount)) return alert("Enter a valid amount");
    if (editing) {
      editing.name = d.name.trim();
      editing.amount = amount;
      editing.art = artFor(editing.name);
      flashId = editing.id;
    } else {
      const c = {
        id: uid(), name: d.name.trim(), amount,
        art: artFor(d.name), last4: "",
        img: null,
      };
      state.cards.push(c);
      flashId = c.id;
    }
    save(); render(); toast(editing ? "Card updated" : "Card added"); close();
  });
}

/* last-4 digits only — opened from the small pencil on the card's front face */
function formLast4(id) {
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  openForm(`Last 4 digits \u2014 ${c.name}`, [
    { name: "last4", label: "Last 4 digits", value: c.last4 || "",
      placeholder: "e.g. 4821 \u2014 on the front of your card", maxlength: "4", inputmode: "numeric" },
  ], "Save", (d, close) => {
    c.last4 = String(d.last4 || "").replace(/\D/g, "").slice(0, 4);
    save(); render();
    toast(c.last4 ? "Last 4 digits updated \u2713" : "Last 4 digits cleared");
    close();
  });
}

/* ---------- this-month tracker & new-bill flow ---------- */
function formMonthSpend(id) {
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  const fromMonth = !!modalRoot.querySelector(".m-total");   // opened from the upcoming-bill modal
  openForm(`Add to upcoming bill \u2014 ${c.name}`, [
    { name: "name", label: "Name (optional)", placeholder: "e.g. Swiggy dinner" },
    { name: "amount", label: "Amount", type: "number", step: "0.01", required: true, placeholder: "e.g. 450" },
  ], "Add", (d, close) => {
    const amount = parseAmount(d.amount);
    if (isNaN(amount)) return alert("Enter a valid amount");
    if (!Array.isArray(c.monthItems)) c.monthItems = [];
    c.monthItems.push({ id: uid(), name: (d.name || "").trim(), amount, created: Date.now() });
    flashId = c.id;
    save(); render(); close();
    toast(`${fmt(amount)} added to ${c.name} \u00B7 upcoming bill`);
    if (fromMonth) openMonthModal(id);   // stay in the list you were adding to
  });
}

function openMonthModal(id) {
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  clearTimeout(modalCloseTimer);   // a pending close must not wipe this modal
  const items = [...(c.monthItems || [])].sort((a, b) => b.created - a.created);
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-close="1">
      <div class="modal" role="dialog" aria-modal="true" aria-label="Upcoming bill \u2014 ${esc(c.name)}">
        <h3>Upcoming bill \u2014 ${esc(c.name)}</h3>
        <div class="rows">
          ${items.length ? items.map((m, i) => `
            <div class="row" style="--i:${i}">
              <div class="row-main"><span class="row-name">${esc(m.name || "Spend")}</span></div>
              <strong class="amt">${fmt(m.amount)}</strong>
              <button class="icon-btn danger" data-action="del-month-item" data-id="${c.id}" data-mid="${m.id}" aria-label="Remove from upcoming bill">${ICON.trash}</button>
            </div>`).join("")
          : `<div class="empty">Nothing here yet \u2014 tap + or edit the total</div>`}
        </div>
        <div class="m-total">
          <span class="m-total-lbl">Upcoming bill total</span>
          <span class="m-total-right">
            <strong>${fmt(cardMonth(c))}</strong>
            <button class="icon-btn" data-action="edit-upcoming" data-id="${c.id}" aria-label="Edit upcoming bill amount" title="Edit total">${ICON.pencil}</button>
          </span>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn-ghost" data-close="1">Done</button>
          <button type="button" class="mini-add" data-action="month-add" data-id="${c.id}">${ICON.plus} Add</button>
        </div>
      </div>
    </div>`;
  const bd = modalRoot.firstElementChild;
  bd.addEventListener("pointerdown", e => { if (e.target.dataset.close) closeModal(); });
  bd.querySelector(".btn-ghost").addEventListener("click", closeModal);
  document.addEventListener("keydown", function onEsc(e) {
    if (e.key === "Escape") { closeModal(); document.removeEventListener("keydown", onEsc); }
  });
}

/* directly set the upcoming-bill total (logs the difference as an adjustment) */
function formSetUpcoming(id) {
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  openForm(`Set upcoming bill \u2014 ${c.name}`, [
    { name: "amount", label: "Upcoming bill amount", type: "number", step: "0.01", required: false,
      value: cardMonth(c), placeholder: "e.g. 8,000 \u2014 leave empty to clear" },
  ], "Set", (d, close) => {
    const amount = d.amount === "" ? 0 : parseAmount(d.amount);
    if (isNaN(amount)) return alert("Enter a valid amount");
    const delta = amount - cardMonth(c);
    if (delta !== 0) {
      if (!Array.isArray(c.monthItems)) c.monthItems = [];
      c.monthItems.push({ id: uid(), name: "Manual edit", amount: delta, created: Date.now() });
    }
    flashId = c.id;
    save(); render(); close();
    toast(`Upcoming bill set to ${fmt(amount)}`);
  });
}

function formNewBill(id) {
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  openForm(`New bill \u2014 ${c.name}`, [
    { name: "amount", label: "Bill amount (from the statement)", type: "number", step: "0.01", required: false,
      placeholder: "e.g. 4,349.10 \u2014 leave empty if nothing due" },
  ], "Set bill", (d, close) => {
    const amount = d.amount === "" ? 0 : parseAmount(d.amount);
    if (isNaN(amount)) return alert("Enter a valid amount");
    c.amount = amount;
    c.monthItems = [];
    flashId = c.id;
    save(); render(); close();
    toast(`New bill ${fmt(amount)} set \u00B7 upcoming bill cleared`);
  });
}

function formOwe(id) {
  const editing = state.owes.find(o => o.id === id);
  openForm(editing ? "Edit" : "Add person", [
    { name: "name", label: "Name", value: editing?.name, required: true },
    { name: "amount", label: "Amount", type: "number", step: "0.01", value: editing?.amount ?? "", required: true },
  ], editing ? "Save" : "Add", (d, close) => {
    const amount = parseAmount(d.amount);
    if (!d.name.trim()) return alert("Enter a name");
    if (isNaN(amount)) return alert("Enter a valid amount");
    if (editing) { Object.assign(editing, { name: d.name.trim(), amount }); flashId = editing.id; toast("Updated"); }
    else {
      const o = { id: uid(), name: d.name.trim(), amount };
      state.owes.push(o); flashId = o.id; toast("Person added");
    }
    save(); render(); close();
  });
}

/* ---------- global event delegation ---------- */
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const id = el.dataset.id;
  switch (el.dataset.action) {
    case "tab":
      tab = el.dataset.tab; deckFlipped = false;
      /* start every tab at the very top — before the new (often shorter) page is
         rendered, so the browser can't clamp a stale scroll offset mid-swap */
      document.querySelector(".shell").scrollTop = 0;
      window.scrollTo(0, 0);
      render(true);
      break;
    case "dot": deckIndex = +el.dataset.i; deckFlipped = false; render(); break;
    case "edit-saved": formSaved(); break;
    case "add-spend": formSpend(); break;
    case "edit-spend": formSpend(id); break;
    case "del-spend": {
      const s = state.spends.find(x => x.id === id);
      if (await confirmDialog("Delete spend?", `\u201C${esc(s?.name || "This spend")}\u201D will be removed permanently.`)) {
        state.spends = state.spends.filter(x => x.id !== id); save(); render(); toast("Spend deleted");
      }
      break;
    }
    case "clear-spends": {
      const n = state.spends.length;
      if (!n) { toast("No spends to clear"); break; }
      const amt = state.spends.reduce((a, s) => a + s.amount, 0);
      if (await confirmDialog("Clear all spends?",
        `All ${n} spend${n === 1 ? "" : "s"} \u2014 ${fmt(amt)} in total \u2014 will be removed permanently.`,
        "Clear all")) {
        state.spends = []; save(); render(); toast(`${n} spend${n === 1 ? "" : "s"} cleared`);
      }
      break;
    }
    case "add-card": formCard(); break;
    case "edit-card": e.stopPropagation(); formCard(id); break;
    case "l4-edit": e.stopPropagation(); formLast4(id); break;
    case "new-bill": e.stopPropagation(); formNewBill(id); break;
    case "month-add": e.stopPropagation(); formMonthSpend(id); break;
    case "month-list": openMonthModal(id); break;
    case "edit-upcoming": formSetUpcoming(id); break;
    case "del-month-item": {
      const c = state.cards.find(x => x.id === id);
      const m = c?.monthItems?.find(x => x.id === el.dataset.mid);
      if (await confirmDialog("Remove from upcoming bill?",
        `\u201C${esc(m?.name || "This spend")} (${m ? fmt(m.amount) : ""})\u201D will be removed from ${esc(c?.name || "the card")}'s upcoming bill.`)) {
        c.monthItems = c.monthItems.filter(x => x.id !== el.dataset.mid);
        save(); render();
        toast("Removed from upcoming bill");
        if (tab === "cards") openMonthModal(id);
      }
      break;
    }
    case "del-card": {
      const c = state.cards.find(x => x.id === id);
      if (await confirmDialog("Delete card?", `\u201C${esc(c?.name || "This card")}\u201D will be removed. Your spends stay.`)) {
        state.cards = state.cards.filter(x => x.id !== id); save();
        deckFlipped = false;
        render(); toast("Card deleted");
      }
      break;
    }
    case "add-owe": formOwe(); break;
    case "edit-owe": formOwe(id); break;
    case "pay-card": {
      const c = state.cards.find(x => x.id === id);
      if (!c || c.amount <= 0) break;
      c.paidAmt = (c.paidAmt || 0) + c.amount;
      c.amount = 0;
      paidFlashId = c.id;
      save(); render();
      toast(`${c.name} marked as paid \u2713`, { label: "Undo", fn: () => undoCard(c.id) });
      break;
    }
    case "undo-card": undoCard(id); break;
    case "del-owe": {
      const o = state.owes.find(x => x.id === id);
      if (await confirmDialog("Remove entry?", `\u201C${esc(o?.name || "This entry")}\u201D will be removed.`)) {
        state.owes = state.owes.filter(x => x.id !== id); save(); render(); toast("Deleted");
      }
      break;
    }
    case "holo": {
      if (e.target.closest(".card-actions") || e.target.closest(".pay-pill") || e.target.closest(".undo-pill")) break;
      const card = state.cards.find(c => c.id === id);
      if (card) openHologram(card);
      break;
    }
  }
});

document.addEventListener("keydown", e => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const el = e.target.closest('[data-action="holo"]');
  if (el) { e.preventDefault(); const card = state.cards.find(c => c.id === el.dataset.id); if (card) openHologram(card); }
});

/* ---------- single Paid box on the Spends tab ---------- */
function syncSpendPaidUI() {
  const pending = spendPending();
  const el = document.querySelector('[data-key="spendPending"]');
  if (!el) return;
  el.dataset.num = pending;
  el.textContent = fmt(pending);
  el.closest(".lg-total")?.classList.toggle("settled", pending <= 0);
  lastNums.spendPending = pending;
}

/* live update while typing — no re-render, so the input keeps focus */
document.addEventListener("input", e => {
  const el = e.target.closest('[data-input="spend-paid"]');
  if (!el) return;
  const v = el.value === "" ? 0 : parseAmount(el.value);
  state.spendPaid = isNaN(v) ? 0 : Math.max(0, v);
  syncSpendPaidUI();
});

/* commit on blur / Enter: clamp to the total and persist */
document.addEventListener("change", e => {
  const el = e.target.closest('[data-input="spend-paid"]');
  if (!el) return;
  const v = el.value === "" ? 0 : parseAmount(el.value);
  state.spendPaid = isNaN(v) ? 0 : Math.max(0, v);
  state.spendPaid = spendPaid();
  el.value = state.spendPaid || "";
  syncSpendPaidUI();
  save();
});

/* ---------- drag to reorder spends ---------- */
let spendDrag = null;

function stopSpendDrag() {
  if (!spendDrag) return;
  const d = spendDrag;
  spendDrag = null;
  d.row.classList.remove("dragging");
  d.row.style.transform = "";
  d.container.classList.remove("reordering");
  d.line.remove();
  document.removeEventListener("pointermove", d.onMove);
  document.removeEventListener("pointerup", d.onUp);
  document.removeEventListener("pointercancel", d.onUp);
}

function beginSpendDrag(e, handle) {
  if (spendDrag) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  const row = handle.closest(".row");
  const container = row && row.closest(".rows");
  if (!row || !container) return;
  e.preventDefault();

  const line = document.createElement("div");
  line.className = "drop-line";
  container.classList.add("reordering");
  container.appendChild(line);
  row.classList.add("dragging");

  const d = spendDrag = {
    id: handle.dataset.id, row, container, line,
    startY: e.clientY, moved: false, dropIndex: 0,
  };
  const cTop = container.getBoundingClientRect().top;
  const others = () => [...container.querySelectorAll(".row")].filter(r => r !== row);

  d.onMove = ev => {
    if (spendDrag !== d) return;
    const dy = ev.clientY - d.startY;
    if (Math.abs(dy) > 4) d.moved = true;
    row.style.transform = `translateY(${dy}px)`;

    const list = others();
    let idx = 0;
    list.forEach(r => {
      const b = r.getBoundingClientRect();
      if (ev.clientY > b.top + b.height / 2) idx++;
    });
    d.dropIndex = idx;
    const y = idx < list.length
      ? list[idx].getBoundingClientRect().top - cTop
      : list.length
        ? list[list.length - 1].getBoundingClientRect().bottom - cTop
        : row.getBoundingClientRect().bottom - cTop;
    line.style.top = y + "px";
  };

  d.onUp = () => {
    if (spendDrag !== d) return;
    stopSpendDrag();
    if (!d.moved) return;
    const list = orderedSpends();
    const from = list.findIndex(s => s.id === d.id);
    if (from < 0) return;
    const [moved] = list.splice(from, 1);
    list.splice(clamp(d.dropIndex, 0, list.length), 0, moved);
    list.forEach((s, i) => { s.order = i; });
    save(); render();
    toast("Spend order updated");
  };

  document.addEventListener("pointermove", d.onMove);
  document.addEventListener("pointerup", d.onUp);
  document.addEventListener("pointercancel", d.onUp);
}

document.addEventListener("pointerdown", e => {
  const handle = e.target.closest('[data-drag="spend"]');
  if (handle) beginSpendDrag(e, handle);
});

/* arrow keys reorder when the handle is focused */
document.addEventListener("keydown", e => {
  const handle = e.target.closest('[data-drag="spend"]');
  if (!handle || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
  e.preventDefault();
  const list = orderedSpends();
  const i = list.findIndex(s => s.id === handle.dataset.id);
  const j = i + (e.key === "ArrowUp" ? -1 : 1);
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((s, k) => { s.order = k; });
  save(); render();
  document.querySelector(`[data-drag="spend"][data-id="${handle.dataset.id}"]`)?.focus();
});

/* ---------- boot ---------- */
render(true);
