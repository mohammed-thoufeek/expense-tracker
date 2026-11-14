/* app.js — state, storage, tabs, forms */
"use strict";

/* ---------- state & storage ---------- */
const LS_KEY = "expense-tracker-v1";

function seed() {
  return {
    total: 60000,
    saved: 12500,
    spends: [
      { id: uid(), name: "Groceries - BigBasket", amount: 2450, status: "paid",    cardId: "card-flipkart", created: Date.now() - 5 * 864e5 },
      { id: uid(), name: "Netflix subscription",  amount: 649,  status: "paid",    cardId: "",              created: Date.now() - 4 * 864e5 },
      { id: uid(), name: "Petrol",                amount: 1500, status: "paid",    cardId: "card-neo",      created: Date.now() - 3 * 864e5 },
      { id: uid(), name: "Movie tickets - PVR",   amount: 720,  status: "pending", cardId: "card-bms",      created: Date.now() - 2 * 864e5 },
      { id: uid(), name: "Zomato order",          amount: 385,  status: "pending", cardId: "",              created: Date.now() - 864e5 },
    ],
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
    return s;
  } catch { return seed(); }
}

const state = loadState();
const save = () => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { console.warn("Save failed", e); }
  if (typeof cloudQueuePush === "function") cloudQueuePush();   // cloud sync (firebase-sync.js)
};
let tab = "dashboard";
let paidFlashId = null;   // card that was just marked as paid → green flash

/* ---------- sums ---------- */
function sums() {
  const paid = state.spends.filter(s => s.status === "paid").reduce((a, s) => a + s.amount, 0);
  const pending = state.spends.filter(s => s.status === "pending").reduce((a, s) => a + s.amount, 0);
  return { paid, pending, total: state.total, saved: state.saved };
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
  const sorted = [...spends].sort((a, b) => b.created - a.created);
  return sorted.map((s, i) => `
    <div class="row${flashCls(s.id)}" style="--i:${i}">
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
const eqChip = (label, value, num, key, action) => `
  <div class="eq-chip">
    <span class="lbl">${label}</span>
    <span class="val"><strong class="val-n" data-num="${num}" data-key="${key}">${value}</strong>${action ? `<button class="ed" data-action="${action}" aria-label="Edit ${label}">${ICON.pencil}</button>` : ""}</span>
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
    const rem = total - paid - saved - pending;
    return `<div class="page">
      <header class="page-head"><h1>Dashboard</h1><p>Your money at a glance</p></header>

      <section class="panel">
        <div class="eq-chips">
          ${eqChip("Total", fmt(total), total, "total")}
          <span class="eq-op">&minus;</span>
          ${eqChip("Paid", fmt(paid), paid, "paid")}
          <span class="eq-op">&minus;</span>
          ${eqChip("Saved", fmt(saved), saved, "saved", "edit-saved")}
          <span class="eq-op">&minus;</span>
          ${eqChip("Pending", fmt(pending), pending, "pending")}
        </div>
        <div class="eq-result">
          <span class="eq-op">=</span>
          <div class="rem-pill ${rem < 0 ? "neg" : ""}">
            <span>Remaining</span><strong data-num="${rem}" data-key="rem">${fmt(rem)}</strong>
          </div>
        </div>
        ${budgetBar()}
        <p class="note">Total &amp; Paid come from your cards &middot; Remaining = Total &minus; Paid &minus; Saved &minus; Pending. ${typeof dataNote === "function" ? dataNote() : "Data stays on this device."}</p>
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
    const { paid, pending } = sums();
    return `<div class="page">
      <header class="page-head"><h1>Spends</h1><p>Every expense, one by one</p></header>

      <section class="panel total-hero">
        <span>Total spent</span>
        <strong data-num="${paid + pending}" data-key="totalSpent">${fmt(paid + pending)}</strong>
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
      const s = { id: uid(), name: d.name.trim(), amount, status: "paid", cardId: "", created: Date.now() };
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
      placeholder: "e.g. 8,000 \u2014 leave empty to clear" },
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
    if (tab === "cards") openMonthModal(id);
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
    case "tab": tab = el.dataset.tab; deckFlipped = false; render(true); window.scrollTo({ top: 0, behavior: "smooth" }); break;
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

/* ---------- boot ---------- */
render(true);
