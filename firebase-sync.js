/* firebase-sync.js — cloud sync: Firebase email login + one Firestore doc per user.
   The whole tracker state is stored as one JSON string in trackers/{uid}.
   With FIREBASE_CONFIG = null the app runs exactly as before (local-only, no UI). */
"use strict";

window.__SYNC_BUILD = "exptracker-sync-2026-11-14a-ios-login";

/* =====================================================================
   PASTE YOUR firebaseConfig HERE (Firebase console → Project settings →
   Your apps → Web app → Config). It looks like:
   { apiKey: "...", authDomain: "...", projectId: "...",
     storageBucket: "...", messagingSenderId: "...", appId: "..." }
   ===================================================================== */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBGkj__aiwVIntqmpS4gwu7ryWDSVq6YOc",
  authDomain: "expense-tracker-4c79b.firebaseapp.com",
  projectId: "expense-tracker-4c79b",
  storageBucket: "expense-tracker-4c79b.firebasestorage.app",
  messagingSenderId: "591219446572",
  appId: "1:591219446572:web:c560a5fb7861f674af5289",
};

/* ---------- sync state ---------- */
let fbAuth = null, fbDb = null;
let cloudUser = null;
let syncState = "signedout";   // signedout | syncing | synced | error
let pushTimer = null, pushBusy = false, pushQueued = false;
let lastPushed = "";           // JSON we last wrote ourselves (to ignore our own echo)
let snapUnsub = null;
let chipEl = null;

/* ---------- cloud icons ---------- */
const CICON = {
  cloud: svgWrap('<path d="M17.5 19a4.5 4.5 0 00-.4-8.98A6 6 0 005.2 11.2 3.9 3.9 0 006.3 19z"/>'),
  check: svgWrap('<path d="M17.5 19a4.5 4.5 0 00-.4-8.98A6 6 0 005.2 11.2 3.9 3.9 0 006.3 19z"/><path d="M9 14.5l2 2 4-4.5"/>'),
  off:   svgWrap('<path d="M17.5 19a4.5 4.5 0 00-.4-8.98A6 6 0 005.2 11.2 3.9 3.9 0 006.3 19z"/><path d="M4 4l16 16"/>'),
  alert: svgWrap('<path d="M17.5 19a4.5 4.5 0 00-.4-8.98A6 6 0 005.2 11.2 3.9 3.9 0 006.3 19z"/><path d="M12 10v3.5"/><path d="M12 16.5h.01"/>'),
};

/* ---------- tiny helpers ---------- */
function deepEq(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEq(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEq(a[k], b[k])) return false;
  return true;
}

function authErr(e) {
  const c = (e && e.code) || "";
  if (/invalid-credential|wrong-password|user-not-found/.test(c)) return "Wrong email or password";
  if (c.includes("email-already-in-use")) return "That email already has an account — try Sign in";
  if (c.includes("weak-password")) return "Password too weak — use at least 6 characters";
  if (c.includes("invalid-email")) return "That email doesn't look right";
  if (c.includes("too-many-requests")) return "Too many attempts — wait a minute and try again";
  if (/network/.test(c)) return "Network problem — check your connection";
  return ((e && e.message) || "Something went wrong").replace(/^Firebase:\s*/i, "").replace(/\(auth.*\)\.?/i, "").trim();
}

function pushErr(e) {
  const c = (e && e.code) || "";
  const msg = (e && e.message) || "";
  if (c.includes("permission-denied")) return "Sync blocked — the Firestore rules need updating";
  if (/too large|exceeds|resource-exhausted/i.test(msg + c)) return "Data too large to sync — try removing uploaded card images";
  if (/unavailable|network|failed-precondition/.test(c)) return "Can't reach the cloud — changes stay on this device and sync later";
  return "Sync problem: " + msg.replace(/^Firebase:\s*/i, "").trim();
}

/* ---------- chip (top-right cloud status) ---------- */
function injectChip() {
  chipEl = document.createElement("button");
  chipEl.type = "button";
  chipEl.id = "cloudChip";
  chipEl.className = "cloud-chip";
  chipEl.addEventListener("click", () => (cloudUser ? openAccount() : openLogin()));
  document.body.appendChild(chipEl);
  updateChip();
}

function updateChip() {
  if (!chipEl) return;
  let icon = CICON.cloud, label = "Sign in", cls = "";
  if (!navigator.onLine) { icon = CICON.off; label = "Offline"; cls = "warn"; }
  else switch (syncState) {
    case "syncing":   icon = CICON.cloud; label = "Syncing\u2026"; cls = "busy"; break;
    case "synced":    icon = CICON.check; label = "Synced";      cls = "live"; break;
    case "error":     icon = CICON.alert; label = "Sync error";  cls = "warn"; break;
    default:          icon = CICON.cloud; label = "Sign in";     cls = "";     break;
  }
  chipEl.className = "cloud-chip " + cls;
  chipEl.innerHTML = icon + `<span>${esc(label)}</span>`;
}

/* dashboard footnote that tells the truth about where data lives */
function dataNote() {
  if (!FIREBASE_CONFIG) return "Data stays on this device.";
  if (!cloudUser) return "Data stays on this device \u2014 sign in (top right) to sync.";
  if (syncState === "synced") return "Synced to your account \u2014 available on all your devices.";
  if (syncState === "error") return "Cloud sync hit a problem \u2014 open the chip at the top right.";
  return "Syncing to your cloud account\u2026";
}

/* ---------- login / account modals (reuse the app's modal styles) ---------- */
function setBusy(btn, on) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.textContent; btn.textContent = "Please wait\u2026"; btn.disabled = true; }
  else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
}

function openLogin() {
  clearTimeout(modalCloseTimer);
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-close="1">
      <div class="modal" role="dialog" aria-modal="true" aria-label="Cloud sync sign in">
        <h3>Sync across devices</h3>
        <p class="cloud-sub">One account, every device. This device keeps an offline copy too \u2014 everything merges into your account.</p>
        <form id="cloudForm">
          <label class="field"><span>Email</span>
            <input name="email" type="email" required placeholder="you@example.com" autocomplete="email"
              autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="next"></label>
          <label class="field"><span>Password</span>
            <input name="password" type="password" required minlength="6" placeholder="At least 6 characters" autocomplete="current-password"
              autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done"></label>
          <div class="modal-actions">
            <button type="button" class="btn-ghost" data-cloud="create">Create account</button>
            <button type="submit" class="btn-primary">Sign in</button>
          </div>
        </form>
        <button type="button" class="cloud-forgot" data-cloud="forgot">Forgot password?</button>
      </div>
    </div>`;

  const bd = modalRoot.firstElementChild;
  bd.addEventListener("pointerdown", e => { if (e.target.dataset.close) closeModal(); });
  document.addEventListener("keydown", function onEsc(e) {
    if (e.key === "Escape") { closeModal(); document.removeEventListener("keydown", onEsc); }
  });

  const form = document.getElementById("cloudForm");
  // iOS: Keychain autofill and pastes can leave a phantom trailing space in
  // either field — trim both so what gets submitted matches what's visible.
  const creds = () => ({ email: form.email.value.trim(), password: form.password.value.trim() });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const { email, password } = creds();
    const btn = form.querySelector(".btn-primary");
    setBusy(btn, true);
    try {
      await fbAuth.signInWithEmailAndPassword(email, password);
      closeModal(); toast("Signed in \u2014 syncing\u2026");
    } catch (err) {
      toast(authErr(err)); setBusy(btn, false);
      form.password.value = "";  // restart the next attempt clean — a half-edited masked field is easy to mis-type
      form.password.focus();
    }
  });

  bd.querySelector('[data-cloud="create"]').addEventListener("click", async () => {
    const { email, password } = creds();
    if (!email || password.length < 6) { toast("Enter an email and a 6+ character password"); return; }
    const btn = bd.querySelector('[data-cloud="create"]');
    setBusy(btn, true);
    try {
      await fbAuth.createUserWithEmailAndPassword(email, password);
      closeModal(); toast("Account created \u2014 syncing\u2026");
    } catch (err) { toast(authErr(err)); setBusy(btn, false); }
  });

  bd.querySelector('[data-cloud="forgot"]').addEventListener("click", async () => {
    const { email } = creds();
    if (!email) { toast("Type your email first, then tap this again"); form.email.focus(); return; }
    try { await fbAuth.sendPasswordResetEmail(email); toast("Password reset email sent \u2713"); }
    catch (err) { toast(authErr(err)); }
  });
}

function openAccount() {
  if (!cloudUser) { openLogin(); return; }
  clearTimeout(modalCloseTimer);
  const status = {
    synced: "Synced \u2014 data is current on every signed-in device",
    syncing: "Syncing\u2026",
    error: "Sync hit a problem \u2014 try \u201CSync now\u201D",
  }[syncState] || "Connected";
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-close="1">
      <div class="modal" role="dialog" aria-modal="true" aria-label="Cloud sync">
        <h3>Cloud sync</h3>
        <p class="cloud-sub">Signed in as <strong>${esc(cloudUser.email || "your account")}</strong><br>${esc(status)}</p>
        <div class="modal-actions">
          <button type="button" class="btn-ghost" data-cloud="syncnow">Sync now</button>
          <button type="button" class="btn-ghost" data-cloud="signout">Sign out</button>
          <button type="button" class="btn-primary" data-close="1">Done</button>
        </div>
      </div>
    </div>`;

  const bd = modalRoot.firstElementChild;
  bd.addEventListener("pointerdown", e => { if (e.target.dataset.close) closeModal(); });
  document.addEventListener("keydown", function onEsc(e) {
    if (e.key === "Escape") { closeModal(); document.removeEventListener("keydown", onEsc); }
  });
  bd.querySelector('[data-cloud="syncnow"]').addEventListener("click", () => { closeModal(); pushNow(); });
  bd.querySelector('[data-cloud="signout"]').addEventListener("click", async () => {
    try { await fbAuth.signOut(); } catch {}
    closeModal(); toast("Signed out \u2014 data stays on this device");
  });
}

/* two-choice dialog (cloud vs this device) — false = keep this device */
function chooseDialog(title, message, leftLabel, rightLabel) {
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
          <div class="confirm-icon cloud-ic">${CICON.cloud}</div>
          <h3>${esc(title)}</h3>
          <p>${esc(message)}</p>
          <div class="modal-actions">
            <button type="button" class="btn-ghost">${esc(leftLabel)}</button>
            <button type="button" class="btn-primary">${esc(rightLabel)}</button>
          </div>
        </div>
      </div>`;

    const bd = modalRoot.firstElementChild;
    bd.addEventListener("pointerdown", e => { if (e.target === bd) finish(false); });
    bd.querySelector(".btn-ghost").addEventListener("click", () => finish(false));
    bd.querySelector(".btn-primary").addEventListener("click", () => finish(true));
  });
}

/* ---------- state adoption (mutates the shared state object in place) ---------- */
function adoptState(d) {
  if (!d || typeof d !== "object") return;
  if (typeof d.total === "number") state.total = d.total;
  if (typeof d.saved === "number") state.saved = d.saved;
  state.spends = Array.isArray(d.spends) ? d.spends : [];
  state.cards = Array.isArray(d.cards) ? d.cards : [];
  state.owes = Array.isArray(d.owes) ? d.owes : [];
  state.cards.forEach(c => {
    if (typeof c.paidAmt !== "number") c.paidAmt = 0;
    if (!Array.isArray(c.monthItems)) c.monthItems = [];
  });
  deckIndex = 0;
  deckFlipped = false;
  render();
}

function backupLocal() {
  try { localStorage.setItem("expense-tracker-backup-" + Date.now(), JSON.stringify(state)); } catch {}
}

/* ---------- cloud read/write ---------- */
async function pushState(ref) {
  const json = JSON.stringify(state);
  await ref.set({ data: json, savedAt: Date.now(), v: 1 });
  lastPushed = json;
}

function cloudQueuePush() {
  if (!FIREBASE_CONFIG) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 700);
}

async function pushNow() {
  if (!FIREBASE_CONFIG || !fbDb || !cloudUser) return;
  if (pushBusy) { pushQueued = true; return; }
  pushBusy = true;
  syncState = "syncing"; updateChip();
  try {
    await pushState(fbDb.collection("trackers").doc(cloudUser.uid));
    syncState = "synced";
  } catch (err) {
    console.warn("[sync] push failed", err);
    syncState = "error";
    toast(pushErr(err));
  }
  pushBusy = false;
  updateChip();
  if (pushQueued) { pushQueued = false; cloudQueuePush(); }
}

/* live listener: any other device's change appears here within ~a second */
function startSnapshot(ref) {
  stopSnapshot();
  snapUnsub = ref.onSnapshot(sn => {
    if (!sn.exists) return;
    const raw = sn.data().data || "{}";
    if (raw === lastPushed) return;          // our own write coming back
    let d = null;
    try { d = JSON.parse(raw); } catch { return; }
    adoptState(d);
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
    toast("Updated from another device");
  }, err => {
    console.warn("[sync] snapshot", err);
    syncState = "error"; updateChip();
  });
}

function stopSnapshot() {
  if (snapUnsub) { try { snapUnsub(); } catch {} snapUnsub = null; }
}

/* ---------- first connection: decide who wins, local or cloud ---------- */
async function reconcile(ref) {
  const snap = await ref.get();
  const freshDevice = !localStorage.getItem(LS_KEY);
  const cloudRaw = snap.exists ? (snap.data().data || "{}") : null;

  /* nothing in the cloud yet — this device's state becomes the cloud copy.
     Never adopt empty defaults here: pushing is additive and can't destroy anything. */
  if (!cloudRaw) {
    const json = JSON.stringify(state);
    await pushState(ref);
    if (json === '{"total":0,"saved":0,"spends":[],"cards":[],"owes":[]}') {
      toast("Cloud sync connected \u2014 you're starting fresh");
    } else {
      toast("This device's data is now in the cloud \u2713");
    }
    return;
  }

  let cloudData = null;
  try { cloudData = JSON.parse(cloudRaw); } catch {}

  /* fresh device (or demo seed) + real cloud data → cloud wins silently */
  if (freshDevice && cloudData) {
    backupLocal();
    adoptState(cloudData);
    save();
    toast("Loaded your cloud data \u2713");
    return;
  }

  /* already identical → done */
  if (cloudData && deepEq(cloudData, state)) {
    toast("Cloud sync is up to date");
    return;
  }

  /* both sides have different data → let the user choose (loser gets backed up) */
  const useCloud = await chooseDialog(
    "Cloud data found",
    "This device has data that differs from your cloud copy. Which one should win?",
    "Keep this device", "Use cloud data"
  );
  if (useCloud && cloudData) {
    backupLocal();
    adoptState(cloudData);
    save();
    toast("Cloud data loaded \u2014 this device's copy was backed up locally");
  } else {
    try { localStorage.setItem("expense-tracker-backup-" + Date.now(), cloudRaw); } catch {}
    await pushState(ref);
    toast("This device's data is now the cloud copy");
  }
}

/* ---------- auth wiring ---------- */
async function onUser(u) {
  cloudUser = u;
  stopSnapshot();
  if (!u) { syncState = "signedout"; updateChip(); return; }
  syncState = "syncing"; updateChip();
  const ref = fbDb.collection("trackers").doc(u.uid);
  try {
    await reconcile(ref);
    syncState = "synced";
  } catch (err) {
    console.warn("[sync] reconcile failed", err);
    syncState = "error";
    toast(pushErr(err));
  }
  updateChip();
  startSnapshot(ref);
}

/* ---------- boot ---------- */
function initSync() {
  if (!FIREBASE_CONFIG) return;   // local-only mode: zero UI, zero network
  if (typeof firebase === "undefined") {
    console.warn("[sync] Firebase SDK did not load \u2014 running local-only");
    return;
  }
  try { firebase.initializeApp(FIREBASE_CONFIG); }
  catch (e) {
    if (!/already exists/.test(String(e.message))) { console.warn("[sync] init failed", e); return; }
  }
  fbAuth = firebase.auth();
  fbDb = firebase.firestore();
  injectChip();
  fbAuth.onAuthStateChanged(onUser);
  window.addEventListener("online", () => { updateChip(); if (cloudUser) cloudQueuePush(); });
  window.addEventListener("offline", updateChip);
}

initSync();
