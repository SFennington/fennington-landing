import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getFirestore, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const DEFAULT_CATEGORIES = [
  "Housing", "Utilities", "Groceries", "Restaurants", "Transportation", "Fuel", "Vehicle expenses", "Insurance", "Medical", "Shopping", "Entertainment", "Subscriptions", "Kids", "Childcare", "Education", "Debt payments", "Taxes", "Transfers", "Credits to the Account", "Income", "Uncategorized"
];

const DEFAULT_SUBCATEGORIES = [
  { parent: "Kids", name: "Fun & Entertainment" },
  { parent: "Kids", name: "Sports and Activities" },
  { parent: "Kids", name: "Food & Treats" },
  { parent: "Kids", name: "Birthdays and Holidays" }
];

const ACCOUNT_CREDIT_CATEGORY = "Credits to the Account";
const TRANSFER_CATEGORY = "Transfers";
const ACCOUNT_FLOW_ROLES = ["clearing", "spending", "credit_card", "savings", "other"];
const FLOW_TYPES = ["external_income", "external_expense", "internal_transfer", "credit_card_payment", "credit_card_credit", "refund", "uncategorized"];
const INTERNAL_FLOW_TYPES = new Set(["internal_transfer", "credit_card_payment", "credit_card_credit"]);
const TRANSFER_MATCH_WINDOW_DAYS = 3;
const TRANSFER_MATCH_THRESHOLD = 80;
const TRANSFER_AMBIGUITY_GAP = 8;
const SPLIT_TOLERANCE = 0.01;
const DEMO_IMPORT_ID = "demo-import";
const DEMO_ACCOUNT_IDS = new Set(["checking-main", "checking-side", "credit-card"]);
const DEMO_RECURRING_IDS = new Set(["sunrise-apartments-monthly", "city-electric-monthly", "netflix-monthly"]);
const AI_ANALYSIS_MODEL = "gpt-4.1-nano";
const AI_INPUT_PRICE_PER_1M = 0.20;
const AI_OUTPUT_PRICE_PER_1M = 1.25;
const AI_WEB_SEARCH_PRICE_PER_1K = 10;
const AI_DEFAULT_BATCH_LIMIT = 50;
const AI_MAX_BATCH_LIMIT = 100;
const REVIEW_REASON_DEFINITIONS = [
  { key: "uncategorized", label: "Uncategorized" },
  { key: "low_confidence", label: "Low confidence" },
  { key: "possible_transfer", label: "Possible transfer" },
  { key: "possible_duplicate", label: "Possible duplicate" },
  { key: "recurring", label: "New recurring" },
  { key: "unusually_high_amount", label: "High amount" },
  { key: "split_review", label: "Split review" },
  { key: "flow_review", label: "Flow review" },
  { key: "other", label: "Other" }
];

const FEATURES = [
  "Automatic transaction categorization",
  "Manual review for uncertain transactions",
  "Monthly spending by category",
  "Recurring bill and subscription detection",
  "Income and overtime projections",
  "Spending trends over time",
  "Merchant and category rules that improve with use",
  "Multiple bank and credit-card accounts"
];

const BUILT_IN_RULES = [
  { match: /rent|mortgage|property management|apartment/i, category: "Housing", merchant: "Housing Payment", confidence: 92 },
  { match: /electric|power|gas company|water|sewer|internet|comcast|xfinity|verizon|at&t|phone/i, category: "Utilities", confidence: 88 },
  { match: /walmart|target|costco|kroger|aldi|trader joe|whole foods|market|grocery|supermarket/i, category: "Groceries", confidence: 86 },
  { match: /restaurant|pizza|cafe|coffee|doordash|uber eats|grubhub|mcdonald|chick-fil-a|burger|taco|sq \*/i, category: "Restaurants", confidence: 84 },
  { match: /shell|exxon|bp|chevron|speedway|circle k|pilot|fuel|gas station/i, category: "Fuel", confidence: 91 },
  { match: /auto|tire|mechanic|oil change|parts|dmv|registration/i, category: "Vehicle expenses", confidence: 84 },
  { match: /insurance|geico|progressive|state farm|allstate|liberty mutual/i, category: "Insurance", confidence: 88 },
  { match: /doctor|hospital|pharmacy|cvs|walgreens|medical|dental|vision/i, category: "Medical", confidence: 82 },
  { match: /amazon|etsy|store|shop|best buy|home depot|lowes/i, category: "Shopping", confidence: 78 },
  { match: /netflix|spotify|hulu|disney|prime video|apple\.com|subscription/i, category: "Subscriptions", confidence: 88 },
  { match: /movie|theater|steam|xbox|playstation|concert|ticket/i, category: "Entertainment", confidence: 82 },
  { match: /daycare|childcare|school lunch/i, category: "Childcare", confidence: 82 },
  { match: /tuition|school|university|student loan|books/i, category: "Education", confidence: 80 },
  { match: /credit card payment|payment thank you|online payment received|refund|reimbursement/i, category: "Transfers", confidence: 82, type: "transfer" },
  { match: /transfer|zelle|venmo|cash app|savings/i, category: "Transfers", confidence: 78, type: "transfer" },
  { match: /loan payment|minimum payment/i, category: "Debt payments", confidence: 80 },
  { match: /irs|tax|state revenue|withholding/i, category: "Taxes", confidence: 84 },
  { match: /payroll|direct deposit|salary|paycheck|wages/i, category: "Income", confidence: 94, type: "income" },
  { match: /online transfer/i, category: "Transfers", confidence: 74, type: "transfer" }
];

const config = window.FENNINGTON_FIREBASE_CONFIG || {};
const hasConfig = config.apiKey && !String(config.apiKey).startsWith("REPLACE_");
const sharedWorkspaceConfig = config.sharedWorkspace || {};
const financialApiBaseUrl = String(config.financialApiBaseUrl || config.apiBaseUrl || (window.location.hostname === "fennington.com" ? "https://fennington-financial.web.app/api" : "")).replace(/\/+$/, "");
const sharedWorkspaceId = sanitizeDocId(sharedWorkspaceConfig.id || config.financialWorkspaceId || "fennington-household");
const shouldAutoMigrateLegacyProfile = sharedWorkspaceConfig.autoMigrateLegacy === true;
const profileCollectionNames = ["accounts", "imports", "mappings", "categories", "transactions", "merchantMappings", "rules", "recurring", "overtimeScenarios", "monthlySummaries"];
const FIRESTORE_BATCH_WRITE_LIMIT = 450;
const els = {
  featureGrid: document.getElementById("featureGrid"),
  signInButton: document.getElementById("signInButton"),
  signOutButton: document.getElementById("signOutButton"),
  gateSignInButton: document.getElementById("gateSignInButton"),
  analyzeButton: document.getElementById("analyzeButton"),
  authStatus: document.getElementById("authStatus"),
  setupWarning: document.getElementById("setupWarning"),
  authGate: document.getElementById("authGate"),
  app: document.getElementById("financialApp"),
  modeLabel: document.getElementById("modeLabel"),
  profileSummary: document.getElementById("profileSummary"),
  createProfileButton: document.getElementById("createProfileButton"),
  deleteProfileButton: document.getElementById("deleteProfileButton"),
  themeToggleButton: document.getElementById("themeToggleButton")
};
const isAppPage = Boolean(els.app && els.authGate);

let auth = null;
let db = null;
let currentUser = null;
let mode = "signed-out";
let pendingImport = null;
let pendingAmazonImport = null;
let saveTimer = null;
let state = emptyState();
const pendingCategoryDeletes = new Set();
const categoryExpandedIds = new Set();
const recurringTransactionExpandedIds = new Set();
let categoryExpansionInitialized = false;
let selectedCategoryReportId = "";
let categoryFilterTerm = "";
let categorySortMode = "name-asc";
const rulesSortState = {
  category: { key: "", direction: "asc" },
  vendor: { key: "", direction: "asc" }
};
let themeMode = storedThemePreference();
let aiAnalysisRunning = false;
const persistedCollectionSnapshots = new Map();
let aiAnalysisStatus = null;
let aiAnalysisLastResult = null;
let aiAnalysisStatusTimer = null;

applyTheme();
renderFeatures();
setupMobileMenu();
setupTabs();
if (isAppPage) setupAuth();
bindStaticActions();

function emptyState() {
  return {
    profile: { id: "default", name: "Household Profile", confidenceThreshold: 78, deletedDefaultCategories: [], deletedDefaultCategoryIds: [], createdAt: new Date().toISOString() },
    accounts: [],
    imports: [],
    mappings: [],
    categories: defaultCategories(),
    transactions: [],
    merchantMappings: [],
    rules: [],
    recurring: [],
    incomeSettings: { hourlyRate: 28, normalWeeklyHours: 40, payFrequency: "biweekly", typicalNetPaycheck: 1850, expectedMonthlyIncome: 4000, overtimeHours: 8, overtimeMultiplier: 1.5, additionalExpectedIncome: 0, scenario: "expected" },
    overtimeScenarios: [
      { id: "none", name: "No overtime", hours: 0, multiplier: 1.5 },
      { id: "expected", name: "Expected overtime", hours: 8, multiplier: 1.5 },
      { id: "maximum", name: "Maximum realistic overtime", hours: 20, multiplier: 1.5 }
    ],
    monthlySummaries: [],
    filters: {},
    selectedMonth: monthKey(new Date())
  };
}

function renderFeatures() {
  if (!els.featureGrid) return;
  els.featureGrid.innerHTML = FEATURES.map((feature) => `<article class="feature-card"><strong>${escapeHtml(feature)}</strong><p>Included in the first-draft workflow.</p></article>`).join("");
}

function setupMobileMenu() {
  const toggle = document.getElementById("mobileToggle");
  const nav = document.getElementById("mainNav");
  if (!toggle || !nav) return;
  toggle.addEventListener("click", () => {
    nav.classList.toggle("active");
    toggle.setAttribute("aria-expanded", String(nav.classList.contains("active")));
  });
  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("active");
      toggle.setAttribute("aria-expanded", "false");
    });
  });
}

function setupTabs() {
  const tabSelect = document.getElementById("appTabSelect");
  const activateTab = (tabName) => {
    document.querySelectorAll(".app-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tabName));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
    document.getElementById(`${tabName}Tab`)?.classList.add("active");
    if (tabSelect) tabSelect.value = tabName;
  };
  document.querySelectorAll(".app-tabs button").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });
  if (tabSelect) tabSelect.addEventListener("change", (event) => activateTab(event.target.value));
}

function setupAuth() {
  if (!hasConfig) {
    els.setupWarning.hidden = false;
    els.authStatus.textContent = "Configuration required";
    els.signInButton.disabled = true;
    els.gateSignInButton.disabled = true;
    return;
  }
  const app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  const provider = new GoogleAuthProvider();
  const signIn = () => {
    scrollToApp();
    return signInWithPopup(auth, provider).catch((error) => showStatus(error.message));
  };
  els.signInButton.addEventListener("click", signIn);
  els.gateSignInButton.addEventListener("click", signIn);
  els.signOutButton.addEventListener("click", () => signOut(auth));
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    els.signInButton.hidden = Boolean(user);
    els.signOutButton.hidden = !user;
    els.authStatus.textContent = user?.email || "Not signed in";
    if (user) {
      await loadUserState();
      scrollToApp();
    }
    else showGate();
  });
}

function bindStaticActions() {
  if (!isAppPage) {
    els.signInButton?.addEventListener("click", () => navigateToApp());
    els.analyzeButton?.addEventListener("click", () => navigateToApp());
    return;
  }
  els.analyzeButton?.addEventListener("click", () => {
    if (currentUser) showApp("user");
    scrollToApp();
  });
  els.createProfileButton?.addEventListener("click", createProfile);
  els.deleteProfileButton?.addEventListener("click", deleteProfileData);
  els.themeToggleButton?.addEventListener("click", toggleTheme);
}

function storedThemePreference() {
  try { return localStorage.getItem("financialTheme") || "light"; }
  catch (_) { return "light"; }
}

function applyTheme() {
  document.body.classList.toggle("financial-dark", themeMode === "dark");
  if (els.themeToggleButton) {
    els.themeToggleButton.textContent = themeMode === "dark" ? "Light Theme" : "Dark Theme";
    els.themeToggleButton.setAttribute("aria-pressed", String(themeMode === "dark"));
  }
}

function toggleTheme() {
  themeMode = themeMode === "dark" ? "light" : "dark";
  try { localStorage.setItem("financialTheme", themeMode); }
  catch (_) { /* Theme preference is still applied for this page view. */ }
  applyTheme();
}

function navigateToApp() {
  window.location.href = "app.html";
}

function showGate() {
  mode = "signed-out";
  els.authGate.hidden = false;
  els.app.hidden = true;
}

function showApp(nextMode, options = {}) {
  mode = nextMode;
  els.authGate.hidden = true;
  els.app.hidden = false;
  els.modeLabel.textContent = "Authenticated profile";
  els.profileSummary.textContent = `${state.profile.name || "Financial Profile"} for ${currentUser?.email || "signed-in user"}.`;
  renderAll(options);
}

function scrollToApp() {
  document.getElementById("app")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadUserState() {
  state = emptyState();
  await ensureSharedWorkspace();
  const profileRef = sharedProfileRef();
  if (shouldAutoMigrateLegacyProfile) await migrateLegacyUserProfile(profileRef);
  const profileSnap = await getDoc(profileRef);
  if (profileSnap.exists()) state.profile = { id: "default", ...profileSnap.data() };
  else await setDoc(profileRef, { ...state.profile, workspaceId: sharedWorkspaceId, updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true });
  const loadedDocs = {};
  await Promise.all(profileCollectionNames.map(async (name) => {
    const snap = await getDocs(collection(profileRef, name));
    loadedDocs[name] = snap.docs;
    if (!snap.empty) state[name] = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
  }));
  await purgeDemoWorkspaceArtifacts(profileRef, loadedDocs);
  state.categories = uniqueCategoriesById(state.categories);
  resetPersistedCollectionSnapshots();
  const incomeSnap = await getDoc(doc(profileRef, "settings", "income"));
  if (incomeSnap.exists()) state.incomeSettings = { ...state.incomeSettings, ...incomeSnap.data() };
  if (!state.categories.length) state.categories = defaultCategories();
  state.selectedMonth = latestMonth(state.transactions) || monthKey(new Date());
  resetCategoryExpansion();
  showApp("user", { save: false });
}

async function migrateLegacyUserProfile(profileRef) {
  const existingProfile = await getDoc(profileRef);
  if (existingProfile.exists() && existingProfile.data().migrationComplete === true) return;
  const legacyProfileRef = doc(db, "users", currentUser.uid, "financialProfiles", "default");
  const legacyProfile = await getDoc(legacyProfileRef);
  if (!legacyProfile.exists()) return;

  await setDoc(profileRef, { ...legacyProfile.data(), workspaceId: sharedWorkspaceId, migratedFromUserId: currentUser.uid, migrationComplete: false, updatedAt: serverTimestamp() }, { merge: true });
  await Promise.all(profileCollectionNames.map(async (name) => {
    const [legacySnap, sharedSnap] = await Promise.all([getDocs(collection(legacyProfileRef, name)), getDocs(collection(profileRef, name))]);
    const sharedIds = new Set(sharedSnap.docs.map((item) => item.id));
    await copyMissingLegacyDocs(profileRef, name, legacySnap.docs.filter((item) => !sharedIds.has(item.id)));
  }));
  const incomeSnap = await getDoc(doc(legacyProfileRef, "settings", "income"));
  if (incomeSnap.exists()) await setDoc(doc(profileRef, "settings", "income"), { ...incomeSnap.data(), workspaceId: sharedWorkspaceId, updatedAt: serverTimestamp() }, { merge: true });
  await setDoc(profileRef, { migrationComplete: true, updatedAt: serverTimestamp() }, { merge: true });
}

async function copyMissingLegacyDocs(profileRef, name, docs) {
  for (let i = 0; i < docs.length; i += 100) {
    await Promise.all(docs.slice(i, i + 100).map((item) => setDoc(doc(profileRef, name, item.id), { ...item.data(), workspaceId: sharedWorkspaceId, updatedAt: serverTimestamp() }, { merge: true })));
  }
}

async function purgeDemoWorkspaceArtifacts(profileRef, loadedDocs = {}) {
  const demoAccountIds = new Set(DEMO_ACCOUNT_IDS);
  (loadedDocs.accounts || []).forEach((item) => {
    const account = { id: item.id, ...item.data() };
    if (isDemoAccount(account)) demoAccountIds.add(item.id);
  });

  const deleteRefs = [];
  const queueDeletes = (collectionName, predicate) => {
    (loadedDocs[collectionName] || []).forEach((item) => {
      const data = { id: item.id, ...item.data() };
      if (predicate(data, demoAccountIds)) deleteRefs.push(item.ref);
    });
  };

  queueDeletes("accounts", isDemoAccount);
  queueDeletes("transactions", isDemoTransaction);
  queueDeletes("imports", isDemoImport);
  queueDeletes("recurring", isDemoRecurring);
  const profilePatch = demoProfileCleanupPatch();
  removeDemoWorkspaceArtifactsFromState(demoAccountIds);

  if (deleteRefs.length) await commitBatchWrites(deleteRefs.map((ref) => (batch) => batch.delete(ref)));
  if (profilePatch) await setDoc(profileRef, profilePatch, { merge: true });
}

function demoProfileCleanupPatch() {
  const hasDemoName = /fictional demo/i.test(String(state.profile.name || ""));
  if (state.profile.demo !== true && !hasDemoName) return null;
  state.profile.name = "Household Profile";
  state.profile.demo = false;
  return { name: state.profile.name, demo: false, workspaceId: sharedWorkspaceId, updatedAt: serverTimestamp() };
}

function removeDemoWorkspaceArtifactsFromState(demoAccountIds = DEMO_ACCOUNT_IDS) {
  const accountIds = new Set([...demoAccountIds, ...state.accounts.filter(isDemoAccount).map((account) => account.id)]);
  state.accounts = state.accounts.filter((account) => !isDemoAccount(account));
  state.transactions = state.transactions.filter((tx) => !isDemoTransaction(tx, accountIds));
  state.imports = state.imports.filter((item) => !isDemoImport(item));
  state.recurring = state.recurring.filter((item) => !isDemoRecurring(item, accountIds));
}

function isDemoAccount(account) {
  const id = String(account.id || "");
  const name = String(account.name || "");
  const institution = String(account.institution || "");
  return DEMO_ACCOUNT_IDS.has(id) || account.userId === "demo" || /^demo\b/i.test(name) || /fennington demo/i.test(institution);
}

function isDemoTransaction(tx, demoAccountIds = DEMO_ACCOUNT_IDS) {
  const id = String(tx.id || "");
  return String(tx.importId || "") === DEMO_IMPORT_ID || /^demo-\d+$/i.test(id) || demoAccountIds.has(tx.accountId);
}

function isDemoImport(item) {
  return String(item.id || "") === DEMO_IMPORT_ID || String(item.importId || "") === DEMO_IMPORT_ID;
}

function isDemoRecurring(item, demoAccountIds = DEMO_ACCOUNT_IDS) {
  const id = String(item.id || "");
  if (item.userId === "demo") return true;
  if (!DEMO_RECURRING_IDS.has(id)) return false;
  return !state.transactions.some((tx) => tx.merchant === item.merchant && !isDemoTransaction(tx, demoAccountIds));
}

async function saveState() {
  if (mode !== "user" || !currentUser || !db) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await ensureSharedWorkspace();
      const profileRef = sharedProfileRef();
      await setDoc(doc(db, "users", currentUser.uid), { email: currentUser.email || "", householdId: sharedWorkspaceId, updatedAt: serverTimestamp() }, { merge: true });
      await setDoc(profileRef, { ...stripId(state.profile), workspaceId: sharedWorkspaceId, updatedAt: serverTimestamp() }, { merge: true });
      await setDoc(doc(profileRef, "settings", "income"), { ...state.incomeSettings, workspaceId: sharedWorkspaceId, updatedAt: serverTimestamp() }, { merge: true });
      const currentCategoryIds = new Set(state.categories.map((category) => category.id));
      const deletedCategoryIds = Array.from(pendingCategoryDeletes).filter((id) => !currentCategoryIds.has(id));
      await commitProfileCollectionWrites(profileRef, deletedCategoryIds);
      deletedCategoryIds.forEach((id) => pendingCategoryDeletes.delete(id));
    } catch (error) {
      showStatus(`Save failed: ${error.message}`);
    }
  }, 450);
}

async function commitProfileCollectionWrites(profileRef, deletedCategoryIds) {
  let batch = writeBatch(db);
  let writeCount = 0;
  const commits = [];
  const persistedUpdates = [];

  const queueWrite = (write) => {
    write(batch);
    writeCount += 1;
    if (writeCount >= FIRESTORE_BATCH_WRITE_LIMIT) {
      commits.push(batch.commit());
      batch = writeBatch(db);
      writeCount = 0;
    }
  };

  profileCollectionNames.forEach((name) => {
    const collectionSnapshots = persistedCollectionSnapshots.get(name) || new Map();
    state[name].forEach((item) => {
      const snapshot = persistedCollectionSnapshot(item);
      if (collectionSnapshots.get(item.id) === snapshot) return;
      queueWrite((currentBatch) => currentBatch.set(doc(profileRef, name, item.id), { ...item, workspaceId: sharedWorkspaceId, updatedAt: serverTimestamp() }, { merge: true }));
      persistedUpdates.push({ name, id: item.id, snapshot });
    });
  });
  deletedCategoryIds.forEach((id) => {
    queueWrite((currentBatch) => currentBatch.delete(doc(profileRef, "categories", id)));
    persistedUpdates.push({ name: "categories", id, snapshot: null });
  });

  if (writeCount) commits.push(batch.commit());
  await Promise.all(commits);
  persistedUpdates.forEach(({ name, id, snapshot }) => {
    if (snapshot === null) deletePersistedCollectionSnapshot(name, id);
    else markPersistedCollectionSnapshot(name, { id, __snapshot: snapshot });
  });
}

function financialApiUrl(path) {
  const normalizedPath = String(path || "").startsWith("/") ? String(path || "") : `/${path || ""}`;
  return financialApiBaseUrl ? `${financialApiBaseUrl}${normalizedPath}` : normalizedPath;
}

function markPersistedCollectionSnapshot(name, item) {
  if (!persistedCollectionSnapshots.has(name)) persistedCollectionSnapshots.set(name, new Map());
  persistedCollectionSnapshots.get(name).set(item.id, item.__snapshot || persistedCollectionSnapshot(item));
}

function deletePersistedCollectionSnapshot(name, id) {
  if (!persistedCollectionSnapshots.has(name)) persistedCollectionSnapshots.set(name, new Map());
  persistedCollectionSnapshots.get(name).delete(id);
}

function resetPersistedCollectionSnapshots() {
  persistedCollectionSnapshots.clear();
  profileCollectionNames.forEach((name) => {
    persistedCollectionSnapshots.set(name, new Map(state[name].map((item) => [item.id, persistedCollectionSnapshot(item)])));
  });
}

function persistedCollectionSnapshot(item) {
  return stableStringify({ ...item, workspaceId: sharedWorkspaceId, updatedAt: undefined });
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function saveCategoryState(affectedTransactions = []) {
  if (mode !== "user" || !currentUser || !db) return;
  clearTimeout(saveTimer);
  try {
    await ensureSharedWorkspace();
    const profileRef = sharedProfileRef();
    await setDoc(profileRef, { ...stripId(state.profile), workspaceId: sharedWorkspaceId, updatedAt: serverTimestamp() }, { merge: true });
    const batchWrites = [];
    state.categories.forEach((item) => {
      batchWrites.push((batch) => batch.set(doc(profileRef, "categories", item.id), { ...item, workspaceId: sharedWorkspaceId, updatedAt: serverTimestamp() }, { merge: true }));
    });
    const deletedCategoryIds = Array.from(pendingCategoryDeletes).filter((id) => !state.categories.some((category) => category.id === id));
    deletedCategoryIds.forEach((id) => {
      batchWrites.push((batch) => batch.delete(doc(profileRef, "categories", id)));
    });
    affectedTransactions.forEach((tx) => {
      batchWrites.push((batch) => batch.set(doc(profileRef, "transactions", tx.id), { ...tx, workspaceId: sharedWorkspaceId, updatedAt: serverTimestamp() }, { merge: true }));
    });
    await commitBatchWrites(batchWrites);
    state.categories.forEach((item) => markPersistedCollectionSnapshot("categories", item));
    affectedTransactions.forEach((tx) => markPersistedCollectionSnapshot("transactions", tx));
    deletedCategoryIds.forEach((id) => deletePersistedCollectionSnapshot("categories", id));
    deletedCategoryIds.forEach((id) => pendingCategoryDeletes.delete(id));
    showStatus("Categories saved.");
  } catch (error) {
    showStatus(`Category save failed: ${error.message}`);
  }
}

async function commitBatchWrites(batchWrites) {
  for (let i = 0; i < batchWrites.length; i += FIRESTORE_BATCH_WRITE_LIMIT) {
    const batch = writeBatch(db);
    batchWrites.slice(i, i + FIRESTORE_BATCH_WRITE_LIMIT).forEach((write) => write(batch));
    await batch.commit();
  }
}

function transactionSnapshot() {
  return new Map(state.transactions.map((tx) => [tx.id, { category: tx.category, needsReview: tx.needsReview }]));
}

function changedTransactionsSince(snapshot) {
  return state.transactions.filter((tx) => {
    const before = snapshot.get(tx.id);
    return before && (before.category !== tx.category || before.needsReview !== tx.needsReview);
  });
}

function renderAndSaveCategories(snapshot) {
  const affectedTransactions = snapshot ? changedTransactionsSince(snapshot) : [];
  renderAll({ save: false });
  saveCategoryState(affectedTransactions);
}

function sanitizeDocId(value) {
  return String(value || "")
    .trim()
    .replace(/[\/#?\[\]]/g, "-")
    .slice(0, 120) || "fennington-household";
}

function normalizedMemberEmails() {
  const configured = Array.isArray(sharedWorkspaceConfig.memberEmails) ? sharedWorkspaceConfig.memberEmails : [];
  const emails = [currentUser?.email, ...configured]
    .map((email) => String(email || "").trim())
    .filter(Boolean);
  return Array.from(new Set(emails));
}

function memberEmailMap() {
  return normalizedMemberEmails().reduce((acc, email) => {
    acc[email] = true;
    return acc;
  }, {});
}

function householdRef() {
  return doc(db, "households", sharedWorkspaceId);
}

function sharedProfileRef() {
  return doc(householdRef(), "financialProfiles", "default");
}

async function ensureSharedWorkspace() {
  const workspaceName = sharedWorkspaceConfig.name || "Household Workspace";
  await setDoc(householdRef(), {
    name: workspaceName,
    memberEmails: memberEmailMap(),
    memberUids: { [currentUser.uid]: "member" },
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  }, { merge: true });
}

function renderAll(options = {}) {
  ensureDefaultCategories();
  normalizeTransactionSplits();
  normalizeTransactionAmountSigns();
  normalizeCreditCardPaymentSigns();
  normalizeFinancialFlows();
  const previousRecurring = new Map(state.recurring.map((item) => [item.id, item]));
  state.recurring = detectRecurring(state.transactions).map((item) => ({ ...item, status: previousRecurring.get(item.id)?.status || item.status }));
  renderDashboard();
  renderAccounts();
  renderTransactions();
  renderReview();
  renderReports();
  renderIncome();
  renderRecurring();
  renderRules();
  renderCategories();
  if (options.save !== false) saveState();
}

function ensureDefaultCategories() {
  const deletedDefaults = new Set(state.profile.deletedDefaultCategories || []);
  const deletedDefaultIds = new Set(state.profile.deletedDefaultCategoryIds || []);
  state.categories = uniqueCategoriesById(state.categories);
  removeDeletedDefaultCategoryDocuments(deletedDefaults);
  removeRecreatedDefaultCategoryDuplicates();
  DEFAULT_CATEGORIES.forEach((name) => {
    const defaultId = slug(name);
    if (deletedDefaults.has(name) || deletedDefaultIds.has(defaultId)) return;
    if (!state.categories.some((cat) => cat.id === defaultId || cat.name.toLowerCase() === name.toLowerCase() || (cat.system && categoryBaseName(cat).toLowerCase() === name.toLowerCase()))) {
      state.categories.push({ id: uniqueId("cat"), name, parentId: "", system: true });
    }
  });
  DEFAULT_SUBCATEGORIES.forEach((item) => {
    const parent = state.categories.find((cat) => cat.name.toLowerCase() === item.parent.toLowerCase() && !cat.parentId);
    if (!parent) return;
    const name = subcategoryName(parent.name, item.name);
    const defaultSubcategoryId = slug(`${item.parent}-${item.name}`);
    if (deletedDefaults.has(name) || deletedDefaultIds.has(defaultSubcategoryId)) return;
    const category = state.categories.find((cat) => cat.id === defaultSubcategoryId || cat.name.toLowerCase() === name.toLowerCase() || (cat.system && categoryBaseName(cat).toLowerCase() === item.name.toLowerCase()));
    if (category) category.parentId = category.parentId || parent.id;
    else state.categories.push({ id: uniqueId("cat"), name, parentId: parent.id, system: true });
  });
}

function removeDeletedDefaultCategoryDocuments(deletedDefaults) {
  if (!deletedDefaults.size) return;
  const deletedNames = new Set(Array.from(deletedDefaults).map((name) => String(name).toLowerCase()));
  state.categories = state.categories.filter((cat) => {
    if (!cat.system || !deletedNames.has(cat.name.toLowerCase())) return true;
    pendingCategoryDeletes.add(cat.id);
    return false;
  });
}

function removeRecreatedDefaultCategoryDuplicates() {
  const defaultNames = new Set([...DEFAULT_CATEGORIES, ...DEFAULT_SUBCATEGORIES.map((item) => item.name)].map((name) => name.toLowerCase()));
  const movedDefaults = state.categories.filter((cat) => cat.system && cat.parentId && defaultNames.has(categoryBaseName(cat).toLowerCase()));
  if (!movedDefaults.length) return;
  const movedBaseNames = new Set(movedDefaults.map((cat) => categoryBaseName(cat).toLowerCase()));
  state.categories = state.categories.filter((cat) => {
    if (!cat.system) return true;
    const baseName = categoryBaseName(cat).toLowerCase();
    const isRecreatedTopLevel = !cat.parentId && movedBaseNames.has(baseName);
    const isRecreatedDefaultSubcategory = DEFAULT_SUBCATEGORIES.some((item) => {
      if (item.name.toLowerCase() !== baseName) return false;
      const parent = parentCategory(cat);
      return parent?.name.toLowerCase() === item.parent.toLowerCase() && movedDefaults.some((moved) => moved.id !== cat.id && categoryBaseName(moved).toLowerCase() === baseName);
    });
    if (!isRecreatedTopLevel && !isRecreatedDefaultSubcategory) return true;
    pendingCategoryDeletes.add(cat.id);
    return false;
  });
}

function rememberRenamedDefaultCategory(previousName, previousBaseName) {
  const previousBaseNameLower = previousBaseName.toLowerCase();
  const deletedNames = new Set(state.profile.deletedDefaultCategories || []);
  const deletedIds = new Set(state.profile.deletedDefaultCategoryIds || []);
  if (DEFAULT_CATEGORIES.some((name) => name.toLowerCase() === previousBaseNameLower)) {
    deletedNames.add(previousBaseName);
    deletedIds.add(slug(previousBaseName));
  }
  DEFAULT_SUBCATEGORIES.filter((item) => item.name.toLowerCase() === previousBaseNameLower).forEach((item) => {
    deletedNames.add(previousName);
    deletedIds.add(slug(`${item.parent}-${item.name}`));
  });
  state.profile.deletedDefaultCategories = Array.from(deletedNames);
  state.profile.deletedDefaultCategoryIds = Array.from(deletedIds);
}

function normalizeCreditCardPaymentSigns() {
  const creditAccounts = new Set(state.accounts.filter((account) => account.type === "credit").map((account) => account.id));
  state.transactions.forEach((tx) => {
    const looksLikePayment = tx.category === TRANSFER_CATEGORY || tx.type === "transfer" || /payment|autopay|thank you|payment received|online payment/i.test(`${tx.description} ${tx.merchant}`);
    if (creditAccounts.has(tx.accountId) && looksLikePayment) {
      if (tx.amount < 0) tx.amount = Math.abs(tx.amount);
      setCategory(tx, ACCOUNT_CREDIT_CATEGORY, Math.max(90, tx.confidence || 0), tx.source || "Payment sign normalization", "Credit-card payments are tracked as positive credits.", "transfer");
    }
  });
}

function normalizeTransactionAmountSigns() {
  state.transactions.forEach((tx) => normalizeTransactionAmountSign(tx));
}

function normalizeTransactionAmountSign(tx) {
  const amount = Number(tx.amount || 0);
  if (!Number.isFinite(amount) || amount === 0) return;
  if (tx.importDirection === "credit") {
    tx.amount = Math.abs(amount);
    if (tx.type === "expense") tx.type = typeForCategory(tx.category, tx.amount);
    return;
  }
  if (tx.importDirection === "debit") {
    tx.amount = -Math.abs(amount);
    if (tx.type === "income" && tx.category !== "Income") tx.type = typeForCategory(tx.category, tx.amount);
    return;
  }
  if (tx.type === "income") tx.amount = Math.abs(amount);
  if (tx.type === "expense") tx.amount = -Math.abs(amount);
}

function normalizeFinancialFlows() {
  normalizeAccountConfigs();
  state.transactions.forEach((tx) => normalizeTransactionFlow(tx));
  reconcileTransfers(state.transactions, state.accounts);
}

function normalizeAccountConfigs() {
  state.accounts.forEach((account) => {
    account.type = account.type || (/card|credit|visa|mastercard|amex|discover/i.test(`${account.name || ""} ${account.institution || ""}`) ? "credit" : "checking");
    account.flowRole = ACCOUNT_FLOW_ROLES.includes(account.flowRole) ? account.flowRole : inferAccountFlowRole(account);
    if (typeof account.includeInMoneyFlow !== "boolean") account.includeInMoneyFlow = true;
    if (typeof account.transferMatchingEnabled !== "boolean") account.transferMatchingEnabled = true;
  });
}

function inferAccountFlowRole(account) {
  const text = `${account.name || ""} ${account.institution || ""}`.toLowerCase();
  if (account.type === "credit") return "credit_card";
  if (/clearing|income|payroll|holding/.test(text)) return "clearing";
  if (/saving|reserve/.test(text)) return "savings";
  if (/checking|spend|bill|budget|main/.test(text)) return "spending";
  return "other";
}

function normalizeTransactionFlow(tx) {
  tx.flags = cleanFlowFlags(tx.flags || []);
  if (!FLOW_TYPES.includes(tx.flowType) || tx.flowSource !== "user") {
    tx.flowType = deriveTransactionFlowType(tx);
    tx.flowSource = tx.flowSource === "user" ? "user" : "auto";
    tx.flowConfidence = flowConfidenceFor(tx);
    tx.flowReason = flowReasonFor(tx);
  }
  applyReportingType(tx);
}

function cleanFlowFlags(flags = []) {
  return flags.filter((flag) => !["possible_transfer", "unmatched_transfer", "ambiguous_transfer"].includes(flag));
}

function deriveTransactionFlowType(tx) {
  const account = accountById(tx.accountId);
  if (isRefundLike(tx)) return "refund";
  if (account?.type === "credit" && tx.amount > 0 && (isPaymentLike(tx) || tx.category === ACCOUNT_CREDIT_CATEGORY)) return "credit_card_payment";
  if (isTransferLike(tx)) return "uncategorized";
  if (tx.category === "Income" || (tx.type === "income" && tx.amount > 0)) return "external_income";
  if (tx.amount < 0 || tx.type === "expense") return "external_expense";
  if (tx.amount > 0) return "external_income";
  return "uncategorized";
}

function flowConfidenceFor(tx) {
  if (tx.flowType === "uncategorized" && isTransferLike(tx)) return 60;
  if (tx.flowType === "credit_card_payment") return 88;
  if (tx.flowType === "external_income" || tx.flowType === "external_expense") return Math.max(70, Number(tx.confidence || 0));
  return Math.max(50, Number(tx.confidence || 0));
}

function flowReasonFor(tx) {
  if (tx.flowType === "credit_card_payment") return "Credit-card payment or credit is internal movement when the card account is tracked.";
  if (tx.flowType === "uncategorized" && isTransferLike(tx)) return "Transfer-like transaction needs a tracked counterparty before it is hidden from income and spending.";
  if (tx.flowType === "external_income") return "Income from outside the tracked account system.";
  if (tx.flowType === "external_expense") return "Expense to an outside vendor.";
  if (tx.flowType === "refund") return "Refund or reimbursement reduces reportable spending instead of becoming an internal transfer.";
  return "Flow classification is pending review.";
}

function applyReportingType(tx) {
  if (INTERNAL_FLOW_TYPES.has(tx.flowType)) tx.reportingType = "internal";
  else if (tx.flowType === "external_income") tx.reportingType = "income";
  else if (tx.flowType === "external_expense" || tx.flowType === "refund") tx.reportingType = "expense";
  else tx.reportingType = "review";
}

function reconcileTransfers(transactions, accounts) {
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  transactions.forEach((tx) => {
    if (tx.flowSource === "user") {
      applyReportingType(tx);
      return;
    }
    clearTransferLink(tx);
    if (tx.flowType === "credit_card_payment") markSingleSidedInternal(tx, tx.counterpartyAccountId || "", "Credit-card payment is internal to a tracked card account.");
  });

  const outCandidates = transactions.filter((tx) => tx.flowSource !== "user" && tx.amount < 0 && isTransferCandidate(tx));
  const inCandidates = transactions.filter((tx) => tx.flowSource !== "user" && tx.amount > 0 && isTransferCandidate(tx));
  const matchedIds = new Set();

  outCandidates.forEach((outTx) => {
    if (matchedIds.has(outTx.id)) return;
    const scored = inCandidates
      .filter((inTx) => !matchedIds.has(inTx.id) && outTx.accountId !== inTx.accountId && amountsClose(Math.abs(outTx.amount), Math.abs(inTx.amount)))
      .map((inTx) => ({ inTx, score: transferCandidateScore(outTx, inTx, accountMap) }))
      .filter((item) => item.score >= TRANSFER_MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score);
    if (!scored.length) return;
    const [best, second] = scored;
    if (second && best.score - second.score < TRANSFER_AMBIGUITY_GAP) {
      markAmbiguousTransfer(outTx, best.score, "Multiple possible transfer matches were found.");
      markAmbiguousTransfer(best.inTx, best.score, "Multiple possible transfer matches were found.");
      return;
    }
    linkTransferPair(outTx, best.inTx, best.score, accountMap);
    matchedIds.add(outTx.id);
    matchedIds.add(best.inTx.id);
  });

  outCandidates.concat(inCandidates).forEach((tx) => {
    if (matchedIds.has(tx.id) || tx.transferStatus) return;
    const counterparty = tx.amount < 0 ? inferSingleSidedCounterparty(tx, accountMap) : null;
    if (counterparty) markSingleSidedInternal(tx, counterparty.id, `Payment appears to go to tracked account ${counterparty.name}.`);
    else markUnmatchedTransfer(tx);
  });
}

function clearTransferLink(tx) {
  tx.transferGroupId = "";
  tx.transferPeerTransactionId = "";
  tx.counterpartyAccountId = "";
  tx.transferDirection = "";
  tx.transferStatus = "";
  tx.flags = cleanFlowFlags(tx.flags || []);
  if (INTERNAL_FLOW_TYPES.has(tx.flowType) && tx.flowType !== "credit_card_payment") tx.flowType = deriveTransactionFlowType(tx);
  applyReportingType(tx);
}

function isTransferCandidate(tx) {
  if (!accountById(tx.accountId)?.transferMatchingEnabled) return false;
  if (isLikelyExternalIncomeText(tx)) return false;
  return isTransferLike(tx) || tx.flowType === "credit_card_payment" || tx.flowType === "internal_transfer";
}

function transferCandidateScore(outTx, inTx, accountMap) {
  let score = 50;
  const dayGap = daysBetween(outTx.date, inTx.date);
  if (dayGap <= 1) score += 20;
  else if (dayGap <= TRANSFER_MATCH_WINDOW_DAYS) score += 14;
  else return 0;

  if (isTransferLike(outTx) || isTransferLike(inTx)) score += 12;
  if (isPaymentLike(outTx) || isPaymentLike(inTx)) score += 10;

  const from = accountMap.get(outTx.accountId);
  const to = accountMap.get(inTx.accountId);
  if (!from || !to || from.includeInMoneyFlow === false || to.includeInMoneyFlow === false) return 0;
  if (from.flowRole === "clearing" && to.flowRole === "spending") score += 18;
  if (from.flowRole === "spending" && to.flowRole === "clearing") score += 10;
  if (to.flowRole === "credit_card" && isPaymentLike(outTx)) score += 24;
  if (to.type === "credit" && inTx.amount > 0) score += 16;
  if (from.type !== "credit" && to.type !== "credit" && (from.type === "checking" || to.type === "checking")) score += 10;
  if (isRefundLike(outTx) || isRefundLike(inTx)) score -= 40;
  return score;
}

function linkTransferPair(outTx, inTx, score, accountMap) {
  const groupId = `transfer-${outTx.id}-${inTx.id}`;
  const toAccount = accountMap.get(inTx.accountId);
  const isCardPayment = toAccount?.flowRole === "credit_card" || toAccount?.type === "credit";
  const flowType = isCardPayment ? "credit_card_payment" : "internal_transfer";
  Object.assign(outTx, {
    flowType,
    reportingType: "internal",
    flowSource: "auto",
    transferGroupId: groupId,
    transferPeerTransactionId: inTx.id,
    counterpartyAccountId: inTx.accountId,
    transferDirection: "out",
    transferStatus: "matched",
    flowConfidence: score,
    flowReason: `Matched to transfer into ${accountName(inTx.accountId)}.`
  });
  Object.assign(inTx, {
    flowType,
    reportingType: "internal",
    flowSource: "auto",
    transferGroupId: groupId,
    transferPeerTransactionId: outTx.id,
    counterpartyAccountId: outTx.accountId,
    transferDirection: "in",
    transferStatus: "matched",
    flowConfidence: score,
    flowReason: `Matched to transfer out of ${accountName(outTx.accountId)}.`
  });
  outTx.needsReview = false;
  inTx.needsReview = false;
  outTx.flags = cleanFlowFlags(outTx.flags || []);
  inTx.flags = cleanFlowFlags(inTx.flags || []);
}

function inferSingleSidedCounterparty(tx, accountMap) {
  if (!isPaymentLike(tx)) return null;
  const source = accountMap.get(tx.accountId);
  if (!source || source.type === "credit") return null;
  const creditAccounts = Array.from(accountMap.values()).filter((account) => account.id !== tx.accountId && account.transferMatchingEnabled && account.includeInMoneyFlow !== false && (account.flowRole === "credit_card" || account.type === "credit"));
  if (!creditAccounts.length) return null;
  const haystack = normalizedFlowText(`${tx.description || ""} ${tx.merchant || ""} ${tx.vendor || ""}`);
  const named = creditAccounts.find((account) => accountNameTokens(account).some((token) => token.length >= 4 && haystack.includes(token)));
  if (named) return named;
  return creditAccounts.length === 1 ? creditAccounts[0] : null;
}

function accountNameTokens(account) {
  return normalizedFlowText(`${account.name || ""} ${account.institution || ""}`).split(" ").filter((token) => !["credit", "card", "bank", "account", "checking"].includes(token));
}

function markSingleSidedInternal(tx, counterpartyAccountId, reason) {
  tx.flowType = accountById(counterpartyAccountId)?.type === "credit" || accountById(counterpartyAccountId)?.flowRole === "credit_card" || tx.flowType === "credit_card_payment" ? "credit_card_payment" : "internal_transfer";
  tx.reportingType = "internal";
  tx.transferGroupId = tx.transferGroupId || `transfer-single-${tx.id}`;
  tx.counterpartyAccountId = counterpartyAccountId || "";
  tx.transferDirection = tx.amount < 0 ? "out" : "in";
  tx.transferStatus = "single_sided";
  tx.flowConfidence = Math.max(82, Number(tx.flowConfidence || 0));
  tx.flowReason = reason;
  tx.needsReview = false;
  tx.flags = cleanFlowFlags(tx.flags || []);
}

function markAmbiguousTransfer(tx, score, reason) {
  tx.flowType = "uncategorized";
  tx.reportingType = "review";
  tx.transferStatus = "ambiguous";
  tx.flowConfidence = score;
  tx.flowReason = reason;
  tx.needsReview = true;
  tx.flags = Array.from(new Set([...(cleanFlowFlags(tx.flags || [])), "ambiguous_transfer"]));
}

function markUnmatchedTransfer(tx) {
  tx.flowType = "uncategorized";
  tx.reportingType = "review";
  tx.transferStatus = "unmatched";
  tx.flowConfidence = Math.max(55, Number(tx.flowConfidence || 0));
  tx.flowReason = "Transfer-like transaction has no tracked counterparty match yet.";
  tx.needsReview = true;
  tx.flags = Array.from(new Set([...(cleanFlowFlags(tx.flags || [])), "unmatched_transfer"]));
}

function isTransferLike(tx) {
  const text = `${tx.description || ""} ${tx.merchant || ""} ${tx.vendor || ""}`;
  return tx.category === TRANSFER_CATEGORY || tx.category === ACCOUNT_CREDIT_CATEGORY || tx.type === "transfer" || /transfer|online transfer|zelle|venmo|cash app|savings|autopay|payment thank you|payment received|credit card payment|card payment/i.test(text);
}

function isPaymentLike(tx) {
  return /payment|autopay|thank you|cardmember|credit card|online pmt|online payment/i.test(`${tx.description || ""} ${tx.merchant || ""} ${tx.vendor || ""}`) || tx.category === ACCOUNT_CREDIT_CATEGORY;
}

function isRefundLike(tx) {
  return /refund|reversal|return|reimbursement|credit memo/i.test(`${tx.description || ""} ${tx.merchant || ""} ${tx.vendor || ""}`) && !isPaymentLike(tx);
}

function isLikelyExternalIncomeText(tx) {
  return /payroll|direct deposit|salary|paycheck|wages|airbnb|air bnb|payout|deposit from/i.test(`${tx.description || ""} ${tx.merchant || ""} ${tx.vendor || ""}`);
}

function normalizedFlowText(value) {
  return sanitize(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function transactionReportingMonth(tx) {
  return tx.recognizedMonth || tx.date?.slice(0, 7) || "";
}

function isReportableIncome(tx) {
  return tx.reportingType === "income";
}

function isReportableExpense(tx) {
  return tx.reportingType === "expense";
}

function reportableExpenseAmount(tx) {
  return tx.flowType === "refund" ? -Math.abs(tx.amount) : Math.abs(tx.amount);
}

function normalizeTransactionSplits() {
  state.transactions.forEach((tx) => normalizeTransactionSplitState(tx));
}

function normalizeTransactionSplitState(tx) {
  tx.splits = Array.isArray(tx.splits) ? tx.splits.map((split) => normalizeSplitLine(split, tx)).filter((split) => Math.abs(split.amount) > 0) : [];
  tx.splitTotal = splitTotal(tx);
  if (!tx.splits.length) {
    tx.splitStatus = "none";
    tx.itemizationSource = tx.itemizationSource || "";
    tx.itemizationMatchConfidence = Number(tx.itemizationMatchConfidence || 0);
    return;
  }
  const reconciled = splitReconciles(tx);
  if (!reconciled) tx.splitStatus = "needs_split_review";
  else if (tx.itemizationSource && tx.itemizationSource !== "manual") tx.splitStatus = "itemized";
  else tx.splitStatus = "split";
  if (!reconciled) {
    tx.needsReview = true;
    tx.flags = Array.from(new Set([...(tx.flags || []), "split_review"]));
  } else tx.flags = (tx.flags || []).filter((flag) => flag !== "split_review");
}

function normalizeSplitLine(split, tx) {
  const amount = round(Number(split.amount || 0));
  return {
    id: split.id || uniqueId("split"),
    date: normalizeDate(split.date || tx.date),
    description: sanitize(split.description || tx.merchant || tx.description || "Split line"),
    merchant: sanitize(split.merchant || tx.merchant || ""),
    amount,
    category: state.categories.some((cat) => cat.name === split.category) ? split.category : (split.category ? sanitize(split.category) : tx.category || "Uncategorized"),
    quantity: Number(split.quantity || 0),
    source: sanitize(split.source || "manual"),
    sourceOrderId: sanitize(split.sourceOrderId || ""),
    sourceItemId: sanitize(split.sourceItemId || ""),
    confidence: Math.max(0, Math.min(100, Number(split.confidence || 0))),
    needsReview: Boolean(split.needsReview)
  };
}

function splitTotal(tx) {
  return round((tx.splits || []).reduce((sum, split) => sum + Math.abs(Number(split.amount || 0)), 0));
}

function splitDifference(tx) {
  return round(reportableExpenseAmount(tx) - splitTotal(tx));
}

function splitReconciles(tx) {
  return Math.abs(splitDifference(tx)) <= SPLIT_TOLERANCE;
}

function hasValidSplits(tx) {
  return isReportableExpense(tx) && (tx.splits || []).length > 0 && splitReconciles(tx);
}

function reportingAllocationsForTransaction(tx) {
  if (!isReportableExpense(tx)) return [];
  if (hasValidSplits(tx)) {
    return tx.splits.map((split) => ({
      id: split.id,
      parentTransactionId: tx.id,
      date: transactionReportingMonth(tx) ? tx.date : split.date,
      month: transactionReportingMonth(tx),
      merchant: split.merchant || tx.merchant,
      description: split.description || tx.description,
      category: split.category || "Uncategorized",
      amount: round(Math.abs(split.amount)),
      source: split.source || "manual",
      transaction: tx
    }));
  }
  return [{
    id: tx.id,
    parentTransactionId: tx.id,
    date: tx.date,
    month: transactionReportingMonth(tx),
    merchant: tx.merchant,
    description: tx.description,
    category: tx.category || "Uncategorized",
    amount: reportableExpenseAmount(tx),
    source: "transaction",
    transaction: tx
  }];
}

function reportingAllocationsForTransactions(transactions) {
  return transactions.flatMap((tx) => reportingAllocationsForTransaction(tx));
}

function categoryTotalsForTransactions(transactions) {
  return reportingAllocationsForTransactions(transactions).reduce((totals, allocation) => {
    totals[allocation.category] = round((totals[allocation.category] || 0) + allocation.amount);
    return totals;
  }, {});
}

function categoryMatchesTransaction(tx, categoryName) {
  if (!categoryName) return true;
  if (tx.category === categoryName) return true;
  return reportingAllocationsForTransaction(tx).some((allocation) => allocation.category === categoryName);
}

function isInternalFlow(tx) {
  return tx.reportingType === "internal" || INTERNAL_FLOW_TYPES.has(tx.flowType);
}

function accountById(id) {
  return state.accounts.find((account) => account.id === id) || null;
}

function renderDashboard() {
  const tab = document.getElementById("dashboardTab");
  const months = monthOptions();
  const summary = monthlySummary(state.selectedMonth);
  tab.innerHTML = `
    <div class="toolbar">
      <div class="field"><label for="dashboardMonth">Dashboard month</label><select id="dashboardMonth">${months.map((m) => `<option value="${m}" ${m === state.selectedMonth ? "selected" : ""}>${m}</option>`).join("")}</select></div>
    </div>
    <div class="summary-grid">
      ${summaryCard("Income from outside", summary.actualIncome, "good")}
      ${summaryCard("Spending to outside vendors", summary.spending, "danger")}
      ${summaryCard("Net external cash flow", summary.netCashFlow, summary.netCashFlow >= 0 ? "good" : "danger")}
      ${summaryCard("Internal transfer volume", summary.internalTransferVolume, "warn", "Not counted as income or spending.")}
      ${summaryCard("Credit-card payments", summary.creditCardPayments, "warn", "Internal movement when cards are tracked.")}
      ${summaryCard("Transfers needing review", String(summary.unmatchedTransfers.count), "warn", "Count")}
      ${summaryCard("Projected income including potential overtime", projectedIncome(), "warn", "Potential overtime is not received income.")}
      ${summaryCard("Recurring monthly expenses", summary.recurring, "danger")}
      ${summaryCard("Transactions requiring review", summary.reviewCount, "warn", "Count")}
      ${summaryCard("Split/itemization review", String(summary.splitReviewCount), "warn", "Count")}
    </div>
    <div class="split-panel" style="margin-top:1rem">
      <section class="panel"><h3>Monthly Spending</h3>${categoryBars(summary.byCategory)}</section>
      <aside class="panel"><h3>Quick Status</h3>${quickStatus(summary)}</aside>
    </div>
  `;
  document.getElementById("dashboardMonth").addEventListener("change", (event) => {
    state.selectedMonth = event.target.value;
    renderAll();
  });
}


function csvImportDetailsHtml() {
  return `
    <details class="import-disclosure" ${pendingImport ? "open" : ""}>
      <summary>
        <span class="import-summary-copy">
          <span class="eyebrow">CSV import</span>
          <strong>Import transaction CSV files</strong>
          <small>Upload bank or credit-card exports without leaving Transactions.</small>
        </span>
        <span class="chip">${pendingImport ? "Preview ready" : "Expand import"}</span>
      </summary>
      <div class="import-disclosure-body">${csvImportPanelHtml()}</div>
    </details>
  `;
}

function csvImportPanelHtml() {
  const headers = pendingImport?.headers || [];
  return `
    <div class="split-panel csv-import-grid">
      <section class="panel import-upload-panel">
        <h3>Upload transaction CSV files</h3>
        <p class="status-line">Supported files: <code>.csv</code> or text CSV exports up to 5 MB. Extra columns are ignored unless mapped.</p>
        <div class="field"><label for="csvFile">CSV file or files</label><input id="csvFile" type="file" accept=".csv,text/csv" multiple></div>
        <div class="field"><label for="csvFolder">CSV folder, including subfolders</label><input id="csvFolder" type="file" accept=".csv,text/csv" webkitdirectory multiple></div>
        <div id="importStatus" class="status-line">No file selected.</div>
        ${pendingImport ? mappingForm(headers) : ""}
      </section>
      <aside class="panel import-preview-panel">
        <h3>Import preview</h3>
        <div id="importPreview">${pendingImport ? importPreviewHtml() : `<div class="empty-state">Upload a CSV to preview detected transactions, date range, totals, duplicates, and account selection.</div>`}</div>
      </aside>
    </div>
  `;
}

function bindImportControls(root = document) {
  root.querySelector("#csvFile")?.addEventListener("change", handleFile);
  root.querySelector("#csvFolder")?.addEventListener("change", handleFile);
  root.querySelector("#amazonFile")?.addEventListener("change", handleAmazonFile);
  root.querySelector("#applyAmazonItemizationButton")?.addEventListener("click", applyAmazonItemization);
  root.querySelector("#clearAmazonImportButton")?.addEventListener("click", () => {
    pendingAmazonImport = null;
    renderTransactions();
  });
  if (pendingImport) {
    root.querySelector("#previewImportButton")?.addEventListener("click", updateImportPreview);
    root.querySelector("#importTransactionsButton")?.addEventListener("click", importTransactions);
    root.querySelector("#saveMappingButton")?.addEventListener("click", saveMappingTemplate);
  }
}

function mappingForm(headers) {
  const options = `<option value="">Not mapped</option>${headers.map((h) => `<option value="${escapeAttr(h)}">${escapeHtml(h)}</option>`).join("")}`;
  const field = (id, label, required = false) => `<div class="field"><label for="map-${id}">${label}${required ? "" : " (optional)"}</label><select id="map-${id}">${options}</select></div>`;
  setTimeout(() => Object.entries(pendingImport.mapping).forEach(([key, value]) => {
    const el = document.getElementById(`map-${key}`);
    if (el) el.value = value || "";
    const expensesPositive = document.getElementById("expensesPositive");
    if (expensesPositive) expensesPositive.value = String(Boolean(pendingImport.expensesPositive));
  }));
  return `
    <div class="mapping-grid" style="margin-top:1rem">
      ${field("date", "Transaction date", true)}
      ${field("description", "Description", true)}
      ${field("amount", "Amount")}
      ${field("debit", "Debit")}
      ${field("credit", "Credit")}
      ${field("account", "Account name")}
      ${field("type", "Transaction type")}
      ${field("balance", "Balance")}
      <div class="field"><label for="selectedAccount">Selected account</label><input id="selectedAccount" value="${escapeAttr(pendingImport.accountName || "Imported Account")}"></div>
      <div class="field"><label for="institutionName">Institution template name</label><input id="institutionName" value="${escapeAttr(pendingImport.institution || "")}" placeholder="Bank or card issuer"></div>
      <div class="field"><label for="expensesPositive">Expenses are positive numbers</label><select id="expensesPositive"><option value="false">No</option><option value="true">Yes</option></select></div>
    </div>
    <div class="form-actions" style="margin-top:1rem">
      <button id="previewImportButton" class="btn btn-secondary" type="button">Refresh Preview</button>
      <button id="importTransactionsButton" class="btn btn-primary" type="button">Import Transactions</button>
      <button id="saveMappingButton" class="btn btn-secondary" type="button">Save Mapping Template</button>
    </div>
  `;
}

function importPreviewHtml() {
  const preview = buildImportPreview({ captureControls: false });
  return `
    <p><strong>${preview.count}</strong> detected transactions</p>
    <p>Date range: <strong>${escapeHtml(preview.range)}</strong></p>
    <p>Total debits: <strong>${money(preview.debits)}</strong></p>
    <p>Total credits: <strong>${money(preview.credits)}</strong></p>
    <p>Possible duplicates: <strong>${preview.duplicates}</strong></p>
    <p>Selected account: <strong>${escapeHtml(preview.accountName)}</strong></p>
    <div class="table-wrap" style="margin-top:1rem"><table><thead><tr><th>Date</th><th>Description</th><th>Amount</th></tr></thead><tbody>${preview.rows.slice(0, 6).map((row) => `<tr><td>${escapeHtml(row.date)}</td><td>${escapeHtml(row.description)}</td><td>${money(row.amount)}</td></tr>`).join("")}</tbody></table></div>
  `;
}

async function handleFile(event) {
  const files = Array.from(event.target.files || []).filter((file) => /\.csv$/i.test(file.name) || /csv|text/i.test(file.type || ""));
  if (!files.length) return showStatus("Please choose one or more CSV files.");
  const oversized = files.find((file) => file.size > 5 * 1024 * 1024);
  if (oversized) return showStatus(`${oversized.name} is larger than the 5 MB first-draft limit.`);
  const allHeaders = new Set();
  const bodyRows = [];
  for (const file of files) {
    const text = await file.text();
    const rows = parseCSV(text).filter((row) => row.some((cell) => String(cell).trim()));
    if (rows.length < 2) continue;
    const headers = rows[0].map((h) => sanitize(h));
    headers.forEach((header) => allHeaders.add(header));
    const sourceAccountName = inferAccountName(file);
    rows.slice(1).forEach((row) => {
      bodyRows.push({
        ...Object.fromEntries(headers.map((header, index) => [header, sanitize(row[index] || "")])),
        __sourceFileName: file.name,
        __sourceAccountName: sourceAccountName
      });
    });
  }
  const headers = Array.from(allHeaders);
  if (!bodyRows.length) return showStatus("No transaction rows were detected in the selected CSV files.");
  const accountNames = Array.from(new Set(bodyRows.map((row) => row.__sourceAccountName)));
  pendingImport = { fileName: files.length === 1 ? files[0].name : `${files.length} CSV files`, headers, rows: bodyRows, mapping: autoMap(headers), accountName: accountNames.length === 1 ? accountNames[0] : "Multiple source accounts", accountNames, institution: "" };
  renderTransactions();
}

function updateImportPreview() {
  captureMapping();
  const preview = document.getElementById("importPreview");
  if (preview) preview.innerHTML = importPreviewHtml();
}

function captureMapping() {
  if (!pendingImport) return;
  ["date", "description", "amount", "debit", "credit", "account", "type", "balance"].forEach((key) => {
    pendingImport.mapping[key] = document.getElementById(`map-${key}`)?.value || "";
  });
  pendingImport.accountName = sanitize(document.getElementById("selectedAccount")?.value || "Imported Account");
  pendingImport.institution = sanitize(document.getElementById("institutionName")?.value || "");
  pendingImport.expensesPositive = document.getElementById("expensesPositive")?.value === "true";
}

function importTransactions() {
  captureMapping();
  const preview = buildImportPreview({ captureControls: false });
  if (!pendingImport.mapping.date || !pendingImport.mapping.description || (!pendingImport.mapping.amount && !pendingImport.mapping.debit && !pendingImport.mapping.credit)) {
    showStatus("Map a date, description, and either amount or debit/credit columns before importing.");
    return;
  }
  const importId = uniqueId("import");
  const imported = preview.rows.map((row) => {
    let account = state.accounts.find((item) => item.name.toLowerCase() === row.accountName.toLowerCase());
    if (!account) {
      account = createImportedAccount(row.accountName, pendingImport.institution);
      state.accounts.push(account);
    }
    return makeTransaction({ ...row, accountId: account.id, importId }, uniqueId("tx"));
  });
  imported.forEach((tx) => applyCategorization(tx, state));
  imported.filter((tx) => tx.importDirection === "credit" && state.accounts.find((account) => account.id === tx.accountId)?.type === "credit").forEach((tx) => {
    setCategory(tx, ACCOUNT_CREDIT_CATEGORY, Math.max(90, tx.confidence || 0), "CSV credit column", "Mapped Credit column on a credit-card account was imported as a card payment or credit.", "transfer");
  });
  flagDuplicates(imported, state.transactions);
  state.transactions.push(...imported);
  state.imports.push({ id: importId, fileName: pendingImport.fileName, accountName: preview.accountName, count: imported.length, importedAt: new Date().toISOString(), duplicateCount: imported.filter((tx) => tx.flags.includes("possible_duplicate")).length });
  pendingImport = null;
  state.selectedMonth = latestMonth(state.transactions) || state.selectedMonth;
  renderAll();
  showStatus(`${imported.length} transactions imported. Low-confidence and possible duplicate items were added to the review queue. Use Analyze Transactions to run AI.`);
}

async function handleAmazonFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) return showStatus(`${file.name} is larger than the 5 MB first-draft limit.`);
  try {
    const text = await file.text();
    const items = parseAmazonPurchaseFile(text, file.name);
    if (!items.length) return showStatus("No Amazon item rows were detected. Include item title, date, and amount/price columns.");
    const groups = groupAmazonItems(items).map((group) => ({ ...group, match: matchAmazonGroupToTransaction(group) }));
    pendingAmazonImport = {
      fileName: file.name,
      itemCount: items.length,
      items,
      groups,
      matches: groups.filter((group) => group.match?.transaction)
    };
    renderTransactions();
    showStatus(`Amazon preview ready: ${pendingAmazonImport.matches.length} of ${groups.length} order groups can be itemized automatically.`);
  } catch (error) {
    showStatus(`Amazon import failed: ${error.message}`);
  }
}

function parseAmazonPurchaseFile(text, fileName = "amazon") {
  const trimmed = String(text || "").trim();
  if (!trimmed) return [];
  if (/\.json$/i.test(fileName) || trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed);
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed.orders) ? parsed.orders : Array.isArray(parsed.items) ? parsed.items : [];
    return rows.flatMap((row) => normalizeAmazonJsonRow(row)).filter(Boolean);
  }
  const rows = parseCSV(trimmed).filter((row) => row.some((cell) => sanitize(cell)));
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => sanitize(header));
  return rows.slice(1).map((row) => normalizeAmazonCsvRow(headers, row)).filter(Boolean);
}

function normalizeAmazonJsonRow(row) {
  if (Array.isArray(row.items)) {
    return row.items.map((item) => normalizeAmazonObject({ ...row, ...item, orderId: item.orderId || row.orderId || row.orderID || row.order_id })).filter(Boolean);
  }
  return normalizeAmazonObject(row);
}

function normalizeAmazonCsvRow(headers, row) {
  const object = Object.fromEntries(headers.map((header, index) => [header, row[index] || ""]));
  return normalizeAmazonObject(object);
}

function normalizeAmazonObject(object) {
  const valueFor = (...patterns) => {
    const key = Object.keys(object).find((name) => patterns.some((pattern) => pattern.test(name)));
    return key ? object[key] : "";
  };
  const orderId = sanitize(valueFor(/order\s*id/i, /^order$/i, /amazon.*id/i) || "unknown");
  const date = normalizeDate(valueFor(/shipment.*date/i, /order.*date/i, /purchase.*date/i, /^date$/i));
  const title = sanitize(valueFor(/title/i, /item/i, /product/i, /description/i, /name/i));
  const subtotal = parseMoney(valueFor(/item.*subtotal/i, /item.*total/i, /subtotal/i, /price/i, /amount/i));
  const tax = parseMoney(valueFor(/tax/i));
  const shipping = parseMoney(valueFor(/shipping/i));
  const discount = Math.abs(parseMoney(valueFor(/discount/i, /promotion/i, /promo/i)));
  const totalCharged = parseMoney(valueFor(/total.*charged/i, /charge.*amount/i, /^total$/i));
  const amount = round(Math.abs(subtotal || totalCharged) + Math.max(0, tax) + Math.max(0, shipping) - discount);
  if (!title || !amount) return null;
  return {
    id: uniqueId("amzitem"),
    orderId,
    date,
    title,
    amount,
    category: categoryForAmazonItem(title),
    seller: sanitize(valueFor(/seller/i, /merchant/i)),
    paymentHint: sanitize(valueFor(/payment/i, /card/i, /last.?4/i))
  };
}

function categoryForAmazonItem(title) {
  const itemText = sanitize(title);
  const rule = BUILT_IN_RULES.find((entry) => !entry.type || entry.type !== "transfer" ? entry.match.test(itemText) : false);
  if (rule?.category && state.categories.some((cat) => cat.name === rule.category)) return rule.category;
  if (/diaper|toy|school|kid|children|child|baby|formula/i.test(itemText) && state.categories.some((cat) => cat.name === "Kids")) return "Kids";
  if (/paper towel|toilet paper|cleaner|soap|detergent|trash bag|laundry/i.test(itemText) && state.categories.some((cat) => cat.name === "Shopping")) return "Shopping";
  return state.categories.some((cat) => cat.name === "Shopping") ? "Shopping" : "Uncategorized";
}

function groupAmazonItems(items) {
  const groups = new Map();
  items.forEach((item) => {
    const key = `${item.orderId || "unknown"}|${item.date}`;
    if (!groups.has(key)) groups.set(key, { id: key, orderId: item.orderId, date: item.date, items: [], total: 0 });
    const group = groups.get(key);
    group.items.push(item);
    group.total = round(group.total + item.amount);
  });
  return Array.from(groups.values()).sort((a, b) => b.date.localeCompare(a.date));
}

function isAmazonLikeTransaction(tx) {
  return /amazon|amzn|audible|kindle/i.test(`${tx.description || ""} ${tx.merchant || ""} ${tx.vendor || ""}`) && isReportableExpense(tx);
}

function matchAmazonGroupToTransaction(group) {
  const candidates = state.transactions.filter((tx) => {
    if (!isAmazonLikeTransaction(tx)) return false;
    if (tx.splits?.length && tx.splitStatus !== "needs_split_review") return false;
    if (Math.abs(reportableExpenseAmount(tx) - group.total) > SPLIT_TOLERANCE) return false;
    return daysBetween(tx.date, group.date) <= 10;
  }).map((tx) => ({ transaction: tx, score: 100 - daysBetween(tx.date, group.date) * 4 }));
  if (candidates.length === 1) return { transaction: candidates[0].transaction, confidence: Math.max(82, Math.round(candidates[0].score)), reason: "Exact amount and nearby Amazon date match." };
  if (candidates.length > 1) return { transaction: null, confidence: 0, reason: "Multiple same-amount Amazon transactions are nearby." };
  return { transaction: null, confidence: 0, reason: "No Amazon transaction with the same reconciled total was found." };
}

function applyAmazonItemization() {
  if (!pendingAmazonImport?.matches?.length) return showStatus("No Amazon groups are ready to apply.");
  let applied = 0;
  pendingAmazonImport.matches.forEach((group) => {
    const tx = group.match.transaction;
    if (!tx) return;
    tx.splits = group.items.map((item) => normalizeSplitLine({
      amount: item.amount,
      category: item.category,
      description: item.title,
      merchant: item.seller || "Amazon",
      source: "amazon",
      sourceOrderId: item.orderId,
      sourceItemId: item.id,
      confidence: group.match.confidence,
      needsReview: item.category === "Uncategorized"
    }, tx));
    tx.itemizationSource = "amazon_order_export";
    tx.itemizationMatchConfidence = group.match.confidence;
    tx.source = "Amazon itemization";
    tx.reason = "Matched Amazon item export to this bank/card transaction by amount and date.";
    tx.needsReview = tx.splits.some((split) => split.needsReview);
    normalizeTransactionSplitState(tx);
    applied += 1;
  });
  pendingAmazonImport = null;
  renderAll();
  showStatus(`Applied Amazon itemization to ${applied} transaction${applied === 1 ? "" : "s"}.`);
}

function createImportedAccount(name, institution = "") {
  const account = { id: uniqueId("acct"), name, institution, type: /card|credit|citi|visa|mastercard|amex|discover|capital one|chase/i.test(`${name} ${institution}`) ? "credit" : "checking" };
  account.flowRole = inferAccountFlowRole(account);
  account.includeInMoneyFlow = true;
  account.transferMatchingEnabled = true;
  return account;
}

function saveMappingTemplate() {
  captureMapping();
  const name = pendingImport.institution || window.prompt("Mapping template name:", pendingImport.fileName.replace(/\.csv$/i, ""));
  if (!name) return;
  state.mappings.push({ id: uniqueId("map"), name: sanitize(name), mapping: { ...pendingImport.mapping }, expensesPositive: Boolean(pendingImport.expensesPositive), createdAt: new Date().toISOString() });
  saveState();
  showStatus("Mapping template saved.");
}

function renderAccounts() {
  const tab = document.getElementById("accountsTab");
  if (!tab) return;
  const rows = state.accounts
    .map((account) => ({ account, ...accountActivityStats(account.id) }))
    .sort((a, b) => a.account.name.localeCompare(b.account.name));
  const creditCount = rows.filter((row) => row.account.type === "credit").length;
  const latest = rows.map((row) => row.latestDate).filter(Boolean).sort().pop() || "No activity";
  tab.innerHTML = `
    <section class="panel accounts-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Account center</p>
          <h3>Accounts</h3>
          <p class="status-line">Accounts are created from imported CSV files and used to group transactions, filters, and credit-card payments.</p>
        </div>
      </div>
      <div class="summary-grid compact-summary accounts-summary">
        ${summaryCard("Accounts", String(rows.length), "")}
        ${summaryCard("Credit accounts", String(creditCount), "")}
        ${summaryCard("Linked transactions", rows.reduce((sum, row) => sum + row.transactionCount, 0), "warn", "Count")}
        ${summaryCard("Latest activity", latest, "")}
      </div>
      ${rows.length ? `<div class="accounts-grid">${rows.map(accountCard).join("")}</div>${accountsTable(rows)}` : `<div class="empty-state">No accounts yet. Expand CSV import at the top of Transactions and import a CSV to create accounts automatically.</div>`}
    </section>
  `;
  bindAccountControls(tab);
}

function accountActivityStats(accountId) {
  const transactions = state.transactions.filter((tx) => tx.accountId === accountId);
  const externalIn = round(transactions.filter(isReportableIncome).reduce((sum, tx) => sum + tx.amount, 0));
  const externalOut = round(transactions.filter(isReportableExpense).reduce((sum, tx) => sum + reportableExpenseAmount(tx), 0));
  const internalIn = round(transactions.filter((tx) => isInternalFlow(tx) && tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0));
  const internalOut = round(transactions.filter((tx) => isInternalFlow(tx) && tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0));
  const unmatchedTransfers = transactions.filter((tx) => tx.transferStatus === "unmatched" || tx.transferStatus === "ambiguous").length;
  const reviewCount = transactions.filter((tx) => tx.needsReview || tx.category === "Uncategorized").length;
  const latestDate = transactions.map((tx) => tx.date).filter(Boolean).sort().pop() || "";
  return { transactionCount: transactions.length, externalIn, externalOut, internalIn, internalOut, unmatchedTransfers, reviewCount, latestDate };
}

function accountCard(row) {
  const { account, transactionCount, externalIn, externalOut, internalIn, internalOut, unmatchedTransfers, reviewCount, latestDate } = row;
  return `
    <article class="account-card" data-account-id="${escapeAttr(account.id)}">
      <div class="account-card-heading">
        <div>
          <span class="eyebrow">${escapeHtml(label(account.flowRole || account.type || "account"))}</span>
          <h4>${escapeHtml(account.name || "Unnamed account")}</h4>
          <p>${escapeHtml(account.institution || "Institution not set")}</p>
        </div>
        <span class="tag ${account.type === "credit" ? "warn" : "good"}">${escapeHtml(label(account.type || "account"))}</span>
      </div>
      <div class="settings-grid compact-account-config">
        <div class="field"><label>Type</label><select data-account-field="type"><option value="checking" ${account.type === "checking" ? "selected" : ""}>Checking</option><option value="credit" ${account.type === "credit" ? "selected" : ""}>Credit card</option></select></div>
        <div class="field"><label>Money-flow role</label><select data-account-field="flowRole">${ACCOUNT_FLOW_ROLES.map((role) => `<option value="${role}" ${account.flowRole === role ? "selected" : ""}>${escapeHtml(label(role.replace(/_/g, " ")))}</option>`).join("")}</select></div>
        <label class="field checkbox-field"><span>Include in flow</span><input data-account-field="includeInMoneyFlow" type="checkbox" ${account.includeInMoneyFlow !== false ? "checked" : ""}></label>
        <label class="field checkbox-field"><span>Match transfers</span><input data-account-field="transferMatchingEnabled" type="checkbox" ${account.transferMatchingEnabled !== false ? "checked" : ""}></label>
        <button class="mini-btn" data-account-save type="button">Save Account</button>
      </div>
      <dl class="account-metrics">
        <div><dt>Transactions</dt><dd>${transactionCount}</dd></div>
        <div><dt>External in</dt><dd class="positive">${money(externalIn)}</dd></div>
        <div><dt>External out</dt><dd class="negative">${money(externalOut)}</dd></div>
        <div><dt>Internal in</dt><dd class="positive">${money(internalIn)}</dd></div>
        <div><dt>Internal out</dt><dd class="negative">${money(internalOut)}</dd></div>
        <div><dt>Transfer review</dt><dd>${unmatchedTransfers}</dd></div>
        <div><dt>Needs review</dt><dd>${reviewCount}</dd></div>
      </dl>
      <p class="status-line">Latest activity: <strong>${escapeHtml(latestDate || "No activity")}</strong></p>
    </article>
  `;
}

function accountsTable(rows) {
  return `
    <div class="table-wrap accounts-table-wrap" tabindex="0" aria-label="Scrollable accounts table">
      <table class="accounts-table">
        <thead><tr><th>Account</th><th>Institution</th><th>Type</th><th>Role</th><th>Transactions</th><th>External in</th><th>External out</th><th>Internal in</th><th>Internal out</th><th>Transfer review</th><th>Needs review</th><th>Latest activity</th></tr></thead>
        <tbody>${rows.map(({ account, transactionCount, externalIn, externalOut, internalIn, internalOut, unmatchedTransfers, reviewCount, latestDate }) => `<tr><td><strong>${escapeHtml(account.name || "Unnamed account")}</strong></td><td>${escapeHtml(account.institution || "—")}</td><td>${escapeHtml(label(account.type || "account"))}</td><td>${escapeHtml(label((account.flowRole || "other").replace(/_/g, " ")))}</td><td>${transactionCount}</td><td class="positive">${money(externalIn)}</td><td class="negative">${money(externalOut)}</td><td class="positive">${money(internalIn)}</td><td class="negative">${money(internalOut)}</td><td>${unmatchedTransfers}</td><td>${reviewCount}</td><td>${escapeHtml(latestDate || "No activity")}</td></tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function bindAccountControls(root) {
  root.querySelectorAll("[data-account-save]").forEach((button) => button.addEventListener("click", () => {
    const card = button.closest("[data-account-id]");
    const account = state.accounts.find((item) => item.id === card?.dataset.accountId);
    if (!account) return;
    card.querySelectorAll("[data-account-field]").forEach((control) => {
      const field = control.dataset.accountField;
      account[field] = control.type === "checkbox" ? control.checked : sanitize(control.value);
    });
    if (account.type === "credit" && account.flowRole !== "credit_card") account.flowRole = "credit_card";
    renderAll();
    showStatus("Account money-flow settings saved.");
  }));
}

function renderTransactions() {
  const tab = document.getElementById("transactionsTab");
  const rows = filteredTransactions();
  const activeFilter = captureActiveFilter();
  tab.innerHTML = `
    <section class="panel transactions-panel">
      <div class="section-heading transaction-heading">
        <div>
          <p class="eyebrow">Transaction center</p>
          <h3>Transactions</h3>
          <p class="status-line">Review, recategorize, and annotate imported activity without losing sight of cash flow.</p>
        </div>
        <div class="transaction-count-pill" aria-label="Filtered transaction count">
          <strong>${rows.length}</strong>
          <span>of ${state.transactions.length} shown</span>
        </div>
      </div>
      ${csvImportDetailsHtml()}
      ${amazonImportDetailsHtml()}
      ${transactionInsightsHtml(rows)}
      ${aiAnalysisPanelHtml(rows)}
      ${filtersHtml()}
      <div class="transaction-table-shell">
        <div class="transaction-table-header">
          <div>
            <span class="eyebrow">Ledger</span>
            <strong>Transaction activity</strong>
            <p>Inline edits save back to the profile, rules, and review queue.</p>
          </div>
          <div class="table-legend" aria-label="Amount legend">
            <span><i class="legend-dot income"></i>Income / credits</span>
            <span><i class="legend-dot expense"></i>Spending</span>
          </div>
        </div>
        ${rows.length ? transactionTable(rows) : `<div class="empty-state">No transactions match the current filters.</div>`}
      </div>
    </section>
  `;
  bindImportControls(tab);
  bindAiAnalysisControls(tab);
  bindFilters();
  bindTransactionTable(tab);
  restoreActiveFilter(activeFilter);
}

function captureActiveFilter() {
  const el = document.activeElement;
  if (!el?.id?.startsWith("filter")) return null;
  return {
    id: el.id,
    selectionStart: typeof el.selectionStart === "number" ? el.selectionStart : null,
    selectionEnd: typeof el.selectionEnd === "number" ? el.selectionEnd : null,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };
}

function restoreActiveFilter(activeFilter) {
  if (!activeFilter) return;
  const el = document.getElementById(activeFilter.id);
  if (!el) return;
  el.focus({ preventScroll: true });
  if (activeFilter.selectionStart !== null && typeof el.setSelectionRange === "function") {
    el.setSelectionRange(activeFilter.selectionStart, activeFilter.selectionEnd);
  }
  window.scrollTo(activeFilter.scrollX, activeFilter.scrollY);
}

function aiAnalysisPanelHtml(rows) {
  const plan = buildAiAnalysisPlan(rows);
  const scope = state.filters.aiScope || "review";
  const limit = aiBatchLimit();
  const webLookup = state.filters.aiWebLookup === true;
  const status = aiAnalysisStatusHtml();
  const result = aiAnalysisLastResultHtml();
  return `
    <div class="ai-analysis-card" aria-label="AI transaction analysis controls">
      <div class="ai-analysis-heading">
        <div>
          <span class="eyebrow">OpenAI analysis</span>
          <strong>Analyze Transactions</strong>
          <p>Runs only after confirmation. Duplicate transaction patterns are grouped to reduce AI usage.</p>
        </div>
        <div class="form-actions">
          <button id="rerunRulesButton" class="btn btn-secondary" type="button" ${!plan.eligibleCount || aiAnalysisRunning ? "disabled" : ""}>Re Run Rules</button>
          <button id="aiAnalyzeButton" class="btn btn-primary" type="button" ${!plan.groups.length || aiAnalysisRunning ? "disabled" : ""}>${aiAnalysisRunning ? "Analyzing..." : "Analyze Transactions"}</button>
        </div>
      </div>
      <div class="ai-analysis-controls">
        <div class="field"><label for="aiAnalyzeScope">Transactions to analyze</label><select id="aiAnalyzeScope"><option value="review" ${scope === "review" ? "selected" : ""}>Needs review only</option><option value="filtered" ${scope === "filtered" ? "selected" : ""}>Current filtered view</option><option value="uncategorized" ${scope === "uncategorized" ? "selected" : ""}>Uncategorized only</option></select></div>
        <div class="field"><label for="aiAnalyzeLimit">Max unique AI requests</label><input id="aiAnalyzeLimit" type="number" min="1" max="${AI_MAX_BATCH_LIMIT}" step="1" value="${escapeAttr(limit)}"></div>
        <label class="field checkbox-field ai-web-lookup"><span>Use web lookup fallback</span><input id="aiWebLookup" type="checkbox" ${webLookup ? "checked" : ""}></label>
      </div>
      <div id="aiAnalysisEstimate" class="ai-analysis-estimate">${aiAnalysisEstimateHtml(plan)}</div>
      ${status}
      ${result}
    </div>
  `;
}

function bindAiAnalysisControls(root) {
  const scope = root.querySelector("#aiAnalyzeScope");
  const limit = root.querySelector("#aiAnalyzeLimit");
  const webLookup = root.querySelector("#aiWebLookup");
  const estimate = root.querySelector("#aiAnalysisEstimate");
  const updateEstimate = () => {
    state.filters.aiScope = scope?.value || "review";
    state.filters.aiLimit = aiBatchLimit(limit?.value);
    state.filters.aiWebLookup = Boolean(webLookup?.checked);
    if (estimate) estimate.innerHTML = aiAnalysisEstimateHtml(buildAiAnalysisPlan(filteredTransactions()));
    const button = root.querySelector("#aiAnalyzeButton");
    if (button) button.disabled = !buildAiAnalysisPlan(filteredTransactions()).groups.length || aiAnalysisRunning;
    const rerunButton = root.querySelector("#rerunRulesButton");
    if (rerunButton) rerunButton.disabled = !buildAiAnalysisPlan(filteredTransactions()).eligibleCount || aiAnalysisRunning;
  };
  scope?.addEventListener("change", updateEstimate);
  limit?.addEventListener("input", updateEstimate);
  webLookup?.addEventListener("change", updateEstimate);
  root.querySelector("#rerunRulesButton")?.addEventListener("click", () => rerunRulesForTransactions());
  root.querySelector("#aiAnalyzeButton")?.addEventListener("click", () => runAiAnalyzeTransactions(root));
}

function aiAnalysisEstimateHtml(plan) {
  const webLookupText = plan.webLookupEnabled ? `Web lookup worst-case estimate: ${formatUsd(plan.webLookupEstimate)}.` : "Web lookup fallback is disabled.";
  return `
    <div class="ai-estimate-grid">
      <span><strong>${plan.selectedTransactionCount}</strong> transactions selected</span>
      <span><strong>${plan.groups.length}</strong> unique AI requests</span>
      <span><strong>${plan.skippedCategorizedCount}</strong> already categorized skipped</span>
      <span><strong>${plan.skippedByLimitCount}</strong> deferred by limit</span>
    </div>
    <p>Estimated tokens: ${plan.estimatedInputTokens.toLocaleString()} input, ${plan.estimatedOutputTokens.toLocaleString()} output. Estimated AI cost: <strong>${formatUsd(plan.estimatedCost)}</strong>. ${webLookupText}</p>
  `;
}

function aiAnalysisStatusHtml() {
  if (!aiAnalysisRunning || !aiAnalysisStatus) return "";
  const elapsed = Math.max(0, Math.round((Date.now() - aiAnalysisStatus.startedAt) / 1000));
  return `
    <div id="aiAnalysisStatus" class="ai-analysis-status" role="status" aria-live="polite">
      <div class="ai-status-row">
        <span class="ai-status-spinner" aria-hidden="true"></span>
        <div>
          <strong>${escapeHtml(aiAnalysisStatus.message)}</strong>
          <p>${escapeHtml(aiAnalysisStatus.detail)} Elapsed: ${elapsed}s.</p>
        </div>
      </div>
      <div class="ai-progress" aria-label="AI transaction analysis in progress"><span></span></div>
    </div>
  `;
}

function aiAnalysisLastResultHtml() {
  if (!aiAnalysisLastResult) return "";
  const tone = aiAnalysisLastResult.type === "error" ? "danger" : aiAnalysisLastResult.type === "running" ? "warn" : "good";
  return `
    <div id="aiAnalysisLastResult" class="ai-analysis-result ${tone}" role="status" aria-live="polite">
      <strong>${escapeHtml(aiAnalysisLastResult.title)}</strong>
      <p>${escapeHtml(aiAnalysisLastResult.message)}</p>
    </div>
  `;
}

function setAiAnalysisLastResult(type, title, message) {
  aiAnalysisLastResult = { type, title, message };
  const target = document.getElementById("aiAnalysisLastResult");
  if (target) target.outerHTML = aiAnalysisLastResultHtml();
}

function setAiAnalysisStatus(message, detail) {
  if (!aiAnalysisStatus) aiAnalysisStatus = { startedAt: Date.now(), message, detail };
  aiAnalysisStatus.message = message;
  aiAnalysisStatus.detail = detail;
  const target = document.getElementById("aiAnalysisStatus");
  if (target) target.outerHTML = aiAnalysisStatusHtml();
}

function clearAiAnalysisStatus() {
  aiAnalysisRunning = false;
  aiAnalysisStatus = null;
  if (aiAnalysisStatusTimer) {
    window.clearInterval(aiAnalysisStatusTimer);
    aiAnalysisStatusTimer = null;
  }
}

function amazonImportDetailsHtml() {
  return `
    <details class="import-disclosure amazon-import-disclosure" ${pendingAmazonImport ? "open" : ""}>
      <summary>
        <span class="import-summary-copy">
          <span class="eyebrow">Amazon itemization</span>
          <strong>Import Amazon purchase items</strong>
          <small>Upload Amazon order/item CSV or JSON to match item lines to existing Amazon card transactions.</small>
        </span>
        <span class="chip">${pendingAmazonImport ? "Preview ready" : "Expand import"}</span>
      </summary>
      <div class="import-disclosure-body">
        <div class="split-panel amazon-import-grid">
          <section class="panel import-upload-panel">
            <h3>Upload Amazon order data</h3>
            <p class="status-line">This does not log into Amazon or create new bank transactions. It itemizes existing Amazon transactions when one clear amount/date match is found.</p>
            <div class="field"><label for="amazonFile">Amazon CSV or JSON file</label><input id="amazonFile" type="file" accept=".csv,.json,text/csv,application/json"></div>
            <div class="form-actions" style="margin-top:1rem">
              <button id="applyAmazonItemizationButton" class="btn btn-primary" type="button" ${pendingAmazonImport?.matches?.length ? "" : "disabled"}>Apply Matched Itemization</button>
              <button id="clearAmazonImportButton" class="btn btn-secondary" type="button" ${pendingAmazonImport ? "" : "disabled"}>Clear Preview</button>
            </div>
          </section>
          <aside class="panel import-preview-panel">
            <h3>Amazon preview</h3>
            <div id="amazonPreview">${pendingAmazonImport ? amazonImportPreviewHtml() : `<div class="empty-state">Upload an Amazon order/item export after importing your card transactions. Exact one-to-one matches can be itemized automatically; ambiguous matches stay in review.</div>`}</div>
          </aside>
        </div>
      </div>
    </details>
  `;
}

function amazonImportPreviewHtml() {
  const preview = pendingAmazonImport;
  const unmatchedCount = preview.groups.length - preview.matches.length;
  const rows = preview.groups.slice(0, 8).map((group) => {
    const matched = group.match?.transaction;
    const status = matched ? `<span class="tag good">Matched ${escapeHtml(matched.date)} ${money(matched.amount)}</span>` : `<span class="tag warn">Needs review</span>`;
    const reason = group.match?.reason || group.reason || "No single exact transaction match was found.";
    return `<tr><td>${escapeHtml(group.orderId || "Unknown")}</td><td>${escapeHtml(group.date || "")}</td><td>${money(group.total)}</td><td>${group.items.length}</td><td>${status}<small>${escapeHtml(reason)}</small></td></tr>`;
  }).join("");
  return `
    <p><strong>${preview.itemCount}</strong> item rows in <strong>${preview.groups.length}</strong> order/charge groups.</p>
    <p>Auto-matchable groups: <strong>${preview.matches.length}</strong>. Review needed: <strong>${unmatchedCount}</strong>.</p>
    <div class="table-wrap" style="margin-top:1rem"><table><thead><tr><th>Order</th><th>Date</th><th>Total</th><th>Items</th><th>Status</th></tr></thead><tbody>${rows || `<tr><td colspan="5">No item groups detected.</td></tr>`}</tbody></table></div>
  `;
}

function buildAiAnalysisPlan(rows = filteredTransactions()) {
  const scope = state.filters.aiScope || "review";
  const limit = aiBatchLimit();
  const webLookupEnabled = state.filters.aiWebLookup === true;
  const eligible = aiEligibleTransactions(rows, scope);
  const grouped = [];
  const byKey = new Map();
  eligible.forEach((tx) => {
    const key = aiTransactionKey(tx);
    if (!byKey.has(key)) {
      const group = { key, representative: tx, transactions: [] };
      byKey.set(key, group);
      grouped.push(group);
    }
    byKey.get(key).transactions.push(tx);
  });
  const groups = grouped.slice(0, limit);
  const selectedTransactionCount = groups.reduce((sum, group) => sum + group.transactions.length, 0);
  const payload = JSON.stringify({
    model: AI_ANALYSIS_MODEL,
    categories: state.categories.map((cat) => cat.name),
    transactions: groups.map((group) => aiRequestTransaction(group))
  });
  const estimatedInputTokens = Math.ceil((payload.length + 1400) / 4);
  const estimatedOutputTokens = Math.max(250, groups.length * 120);
  const modelCost = estimateOpenAiCost(estimatedInputTokens, estimatedOutputTokens);
  const webLookupEstimate = webLookupEnabled ? (groups.length / 1000) * AI_WEB_SEARCH_PRICE_PER_1K : 0;
  return {
    scope,
    limit,
    webLookupEnabled,
    eligibleCount: eligible.length,
    groups,
    selectedTransactionCount,
    skippedCategorizedCount: Math.max(0, state.transactions.length - eligible.length),
    skippedByLimitCount: Math.max(0, grouped.length - groups.length),
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedCost: modelCost + webLookupEstimate,
    webLookupEstimate
  };
}

function aiEligibleTransactions(rows, scope) {
  const threshold = Number(state.profile.confidenceThreshold || 78);
  const sourceRows = scope === "filtered" ? rows : state.transactions;
  return sourceRows.filter((tx) => {
    if (!tx?.id || !tx.description) return false;
    if (scope === "uncategorized") return tx.category === "Uncategorized";
    if (scope === "filtered") return true;
    return tx.needsReview || tx.category === "Uncategorized" || Number(tx.confidence || 0) < threshold;
  });
}

function aiRequestTransaction(group) {
  const tx = group.representative;
  return {
    id: tx.id,
    description: tx.description,
    merchant: tx.merchant || "",
    vendor: transactionVendor(tx),
    amount: tx.amount,
    date: tx.date,
    matchCount: group.transactions.length
  };
}

function aiTransactionKey(tx) {
  const text = `${tx.description || ""} ${tx.merchant || ""}`.toLowerCase().replace(/\b\d{4,}\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  return `${text}|${Math.round(Number(tx.amount || 0) * 100)}`;
}

function aiBatchLimit(value = state.filters.aiLimit) {
  const numeric = Math.round(Number(value || AI_DEFAULT_BATCH_LIMIT));
  return Math.max(1, Math.min(AI_MAX_BATCH_LIMIT, numeric || AI_DEFAULT_BATCH_LIMIT));
}

function estimateOpenAiCost(inputTokens, outputTokens) {
  return (Math.max(0, inputTokens) / 1000000) * AI_INPUT_PRICE_PER_1M + (Math.max(0, outputTokens) / 1000000) * AI_OUTPUT_PRICE_PER_1M;
}

function formatUsd(value) {
  if (Number(value || 0) < 0.01) return `$${Number(value || 0).toFixed(4)}`;
  return `$${Number(value || 0).toFixed(2)}`;
}

function plural(count, singular, pluralLabel = `${singular}s`) {
  return `${Number(count || 0).toLocaleString()} ${Number(count || 0) === 1 ? singular : pluralLabel}`;
}

function aiAnalysisSummaryText(summary, actualCost) {
  return [
    `AI analysis complete: ${plural(summary.searchedCount, "record")} searched`,
    `${plural(summary.uniqueRequestCount, "AI request")} sent`,
    `${plural(summary.matchedRecordCount, "record")} matched to AI results`,
    `${plural(summary.categoryUpdatedCount, "category", "categories")} updated`,
    `${plural(summary.vendorUpdatedCount, "vendor")} updated`,
    `${plural(summary.merchantUpdatedCount, "merchant name")} updated`,
    `${plural(summary.descriptionUpdatedCount, "description")} updated`,
    `${plural(summary.reviewStatusUpdatedCount, "review status", "review statuses")} changed`,
    `cost ${actualCost}.`
  ].join("; ");
}

function rerunRulesSummaryText(summary) {
  return [
    `Rules rerun: ${plural(summary.searchedCount, "transaction")} checked`,
    `${plural(summary.changedCount, "transaction")} changed`,
    `${plural(summary.categoryUpdatedCount, "category", "categories")} updated`,
    `${plural(summary.vendorUpdatedCount, "vendor")} updated`,
    `${plural(summary.merchantUpdatedCount, "merchant name")} updated`,
    `${plural(summary.reviewStatusUpdatedCount, "review status", "review statuses")} changed`,
    `${plural(summary.flagUpdatedCount, "flag set")} changed.`
  ].join("; ");
}

function rerunRulesForTransactions() {
  const plan = buildAiAnalysisPlan(filteredTransactions());
  const rows = aiEligibleTransactions(filteredTransactions(), plan.scope);
  if (!rows.length) return showStatus("No transactions match the selected rule rerun scope.");
  const confirmation = [
    "Re Run Rules?",
    "",
    `Transactions selected: ${rows.length}`,
    "This uses saved rules, merchant mappings, vendor cleanup, and built-in keyword rules without AI.",
    "Existing matching fields in the selected transactions may be updated.",
    "",
    "Continue?"
  ].join("\n");
  if (!window.confirm(confirmation)) return;
  const summary = {
    searchedCount: rows.length,
    changedCount: 0,
    categoryUpdatedCount: 0,
    vendorUpdatedCount: 0,
    merchantUpdatedCount: 0,
    reviewStatusUpdatedCount: 0,
    flagUpdatedCount: 0
  };
  rows.forEach((tx) => {
    const before = ruleRerunSnapshot(tx);
    applyCategorization(tx, state);
    const after = ruleRerunSnapshot(tx);
    if (after.category !== before.category) summary.categoryUpdatedCount += 1;
    if (after.vendor !== before.vendor) summary.vendorUpdatedCount += 1;
    if (after.merchant !== before.merchant) summary.merchantUpdatedCount += 1;
    if (after.needsReview !== before.needsReview) summary.reviewStatusUpdatedCount += 1;
    if (after.flags !== before.flags) summary.flagUpdatedCount += 1;
    if (JSON.stringify(after) !== JSON.stringify(before)) summary.changedCount += 1;
  });
  renderAll();
  showStatus(rerunRulesSummaryText(summary));
}

function ruleRerunSnapshot(tx) {
  return {
    category: tx.category || "",
    vendor: tx.vendor || "",
    merchant: tx.merchant || "",
    confidence: Number(tx.confidence || 0),
    source: tx.source || "",
    reason: tx.reason || "",
    type: tx.type || "",
    needsReview: Boolean(tx.needsReview),
    flags: (tx.flags || []).slice().sort().join("|")
  };
}

async function runAiAnalyzeTransactions(root) {
  if (aiAnalysisRunning) return;
  if (!currentUser) return showStatus("Sign in before running AI transaction analysis.");
  const vendorRuleUpdates = applyVendorRulesToTransactions(state.transactions, state);
  const plan = buildAiAnalysisPlan(filteredTransactions());
  if (!plan.groups.length) return showStatus("No transactions match the selected AI analysis scope.");
  const confirmation = [
    "Analyze Transactions?",
    "",
    `Transactions selected: ${plan.selectedTransactionCount}`,
    `Already categorized skipped: ${plan.skippedCategorizedCount}`,
    `Unique AI requests after grouping: ${plan.groups.length}`,
    `Deferred by batch limit: ${plan.skippedByLimitCount}`,
    `Estimated input tokens: ${plan.estimatedInputTokens.toLocaleString()}`,
    `Estimated output tokens: ${plan.estimatedOutputTokens.toLocaleString()}`,
    `Estimated total cost: ${formatUsd(plan.estimatedCost)}`,
    `Web lookup fallback: ${plan.webLookupEnabled ? `Enabled, worst-case ${formatUsd(plan.webLookupEstimate)}` : "Disabled"}`,
    "",
    "Continue?"
  ].join("\n");
  if (!window.confirm(confirmation)) return;
  aiAnalysisRunning = true;
  aiAnalysisStatus = {
    startedAt: Date.now(),
    message: "AI transaction analysis is running",
    detail: `${plan.groups.length} unique transaction patterns are being sent to ${AI_ANALYSIS_MODEL}. Keep this tab open.`
  };
  setAiAnalysisLastResult("running", "AI analysis started", `${plan.groups.length} unique transaction patterns are being sent. This can take up to two minutes.`);
  aiAnalysisStatusTimer = window.setInterval(() => {
    const target = document.getElementById("aiAnalysisStatus");
    if (target) target.outerHTML = aiAnalysisStatusHtml();
  }, 1000);
  renderTransactions();
  showStatus(`Running AI analysis for ${plan.groups.length} unique transaction patterns... Keep this tab open.`);
  let finalStatusMessage = "";
  let uiRestored = false;
  try {
    setAiAnalysisStatus("Authorizing AI analysis", "Getting your Firebase session token before sending transactions.");
    const token = await currentUser.getIdToken();
    setAiAnalysisStatus("Waiting for AI categorization", `${plan.groups.length} unique transaction patterns are processing on the server.`);
    const response = await fetch(financialApiUrl("/financial/categorize"), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        requireAi: true,
        webLookupEnabled: plan.webLookupEnabled,
        transactions: plan.groups.map((group) => aiRequestTransaction(group)),
        categories: state.categories.map((cat) => cat.name)
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "AI analysis failed.");
    setAiAnalysisStatus("Applying AI results", "Updating matching transactions in this workspace.");
    const groupsById = new Map(plan.groups.map((group) => [group.representative.id, group]));
    const summary = {
      searchedCount: plan.selectedTransactionCount,
      uniqueRequestCount: plan.groups.length,
      matchedRecordCount: 0,
      categoryUpdatedCount: 0,
      vendorUpdatedCount: vendorRuleUpdates,
      merchantUpdatedCount: 0,
      descriptionUpdatedCount: 0,
      reviewStatusUpdatedCount: 0
    };
    (body.results || []).forEach((result) => {
      const group = groupsById.get(result.id);
      if (!group) return;
      group.transactions.forEach((tx) => {
        const before = {
          category: tx.category || "",
          vendor: tx.vendor || "",
          merchant: tx.merchant || "",
          description: tx.description || "",
          needsReview: Boolean(tx.needsReview)
        };
        applyAiAnalysisToTransaction(tx, result);
        summary.matchedRecordCount += 1;
        if ((tx.category || "") !== before.category) summary.categoryUpdatedCount += 1;
        if ((tx.vendor || "") !== before.vendor) summary.vendorUpdatedCount += 1;
        if ((tx.merchant || "") !== before.merchant) summary.merchantUpdatedCount += 1;
        if ((tx.description || "") !== before.description) summary.descriptionUpdatedCount += 1;
        if (Boolean(tx.needsReview) !== before.needsReview) summary.reviewStatusUpdatedCount += 1;
      });
    });
    const actualCost = body.cost?.totalCost ? formatUsd(body.cost.totalCost) : formatUsd(plan.estimatedCost);
    clearAiAnalysisStatus();
    finalStatusMessage = `${aiAnalysisSummaryText(summary, actualCost)} Model: ${body.model || AI_ANALYSIS_MODEL}.`;
    setAiAnalysisLastResult("success", "AI analysis complete", finalStatusMessage);
    renderAll();
    uiRestored = true;
  } catch (error) {
    finalStatusMessage = `AI analysis failed: ${error.message}`;
    setAiAnalysisLastResult("error", "AI analysis failed", error.message || "The analyzer stopped before returning results.");
  } finally {
    clearAiAnalysisStatus();
    if (!uiRestored) renderTransactions();
    const button = document.getElementById("aiAnalyzeButton") || root.querySelector("#aiAnalyzeButton");
    if (button) button.disabled = !buildAiAnalysisPlan(filteredTransactions()).groups.length;
    if (finalStatusMessage) showStatus(finalStatusMessage);
  }
}

function applyAiAnalysisToTransaction(tx, result) {
  const threshold = Number(state.profile.confidenceThreshold || 78);
  const confidence = Math.max(0, Math.min(100, Number(result.confidence || 0)));
  const category = state.categories.some((cat) => cat.name === result.category) ? result.category : "Uncategorized";
  tx.vendor = sanitize(result.vendor || result.merchant || tx.vendor || tx.merchant);
  tx.merchant = sanitize(result.displayName || result.merchant || tx.vendor || tx.merchant);
  tx.aiDisplayName = sanitize(result.displayName || tx.merchant);
  tx.category = category;
  tx.confidence = confidence;
  tx.reason = sanitize(result.reason || "AI analyzed vendor, description, and price.");
  tx.source = result.source === "ai_web" ? "AI web" : "AI";
  tx.type = typeForCategory(tx.category, tx.amount);
  tx.needsReview = confidence < threshold || category === "Uncategorized";
  tx.flags = (tx.flags || []).filter((flag) => !["low_confidence", "uncategorized"].includes(flag));
  if (tx.needsReview) tx.flags.push(category === "Uncategorized" ? "uncategorized" : "low_confidence");
  tx.aiSourceUrls = Array.isArray(result.sourceUrls) ? result.sourceUrls.slice(0, 3).map((url) => sanitize(url)).filter(Boolean) : [];
  tx.flags = Array.from(new Set(tx.flags || []));
}

function transactionVendor(tx) {
  const detected = detectVendorFromDescription(tx.description);
  const current = sanitize(tx.vendor || "");
  const defaultVendor = sanitize(tx.merchant || normalizeMerchant(tx.description));
  if (detected && (!current || current === defaultVendor)) return detected;
  return sanitize(current || detected || defaultVendor);
}

function filtersHtml() {
  const cats = categoryOptions(state.filters.category || "");
  const accounts = [`<option value="">All accounts</option>`, ...state.accounts.map((a) => `<option value="${a.id}" ${state.filters.account === a.id ? "selected" : ""}>${escapeHtml(a.name)}</option>`)].join("");
  const activeFilterCount = ["search", "start", "end", "month", "account", "category", "merchant", "vendor", "type", "flow"].filter((key) => Boolean(state.filters[key])).length + (state.filters.hideCredits ? 1 : 0);
  return `
    <div class="filters-card">
      <div class="filters-header">
        <div>
          <span class="eyebrow">Filters</span>
          <strong>Refine the ledger</strong>
        </div>
        <span class="chip">${activeFilterCount || "No"} active ${activeFilterCount === 1 ? "filter" : "filters"}</span>
      </div>
      <div class="filters">
        <div class="field search-field"><label for="filterSearch">Search</label><input id="filterSearch" value="${escapeAttr(state.filters.search || "")}" placeholder="Merchant, vendor, or description"></div>
        <div class="field"><label for="filterStart">Date range start</label><input id="filterStart" type="date" value="${escapeAttr(state.filters.start || "")}"></div>
        <div class="field"><label for="filterEnd">Date range end</label><input id="filterEnd" type="date" value="${escapeAttr(state.filters.end || "")}"></div>
        <div class="field"><label for="filterMonth">Month</label><select id="filterMonth"><option value="">All months</option>${monthOptions().map((m) => `<option value="${m}" ${state.filters.month === m ? "selected" : ""}>${m}</option>`).join("")}</select></div>
        <div class="field"><label for="filterAccount">Account</label><select id="filterAccount">${accounts}</select></div>
        <div class="field"><label for="filterCategory">Category</label><select id="filterCategory"><option value="">All categories</option>${cats}</select></div>
        <div class="field"><label for="filterMerchant">Merchant</label><input id="filterMerchant" value="${escapeAttr(state.filters.merchant || "")}" placeholder="Merchant"></div>
        <div class="field"><label for="filterVendor">Vendor</label><input id="filterVendor" value="${escapeAttr(state.filters.vendor || "")}" placeholder="Vendor"></div>
        <div class="field"><label for="filterType">Type</label><select id="filterType"><option value="">Any</option>${["income", "expense", "transfer", "uncategorized", "review"].map((t) => `<option value="${t}" ${state.filters.type === t ? "selected" : ""}>${label(t)}</option>`).join("")}</select></div>
        <div class="field"><label for="filterFlow">Flow</label><select id="filterFlow"><option value="">Any flow</option>${["external_income", "external_expense", "internal", "credit_card_payment", "unmatched", "ambiguous", "review"].map((t) => `<option value="${t}" ${state.filters.flow === t ? "selected" : ""}>${escapeHtml(label(t.replace(/_/g, " ")))}</option>`).join("")}</select></div>
        <label class="field checkbox-field"><span>Hide Credits from Transactions</span><input id="filterHideCredits" type="checkbox" ${state.filters.hideCredits ? "checked" : ""}></label>
      </div>
    </div>
  `;
}

function bindFilters() {
  ["Search", "Start", "End", "Month", "Account", "Category", "Merchant", "Vendor", "Type", "Flow"].forEach((name) => {
    const el = document.getElementById(`filter${name}`);
    if (!el) return;
    el.addEventListener("input", () => {
      state.filters[name.toLowerCase()] = el.value;
      renderTransactions();
    });
  });
  const hideCredits = document.getElementById("filterHideCredits");
  if (hideCredits) {
    hideCredits.addEventListener("change", () => {
      state.filters.hideCredits = hideCredits.checked;
      renderTransactions();
    });
  }
}

function transactionTable(rows) {
  return `<div class="table-wrap transaction-table-wrap" tabindex="0" aria-label="Scrollable transaction table"><table class="transaction-table"><thead><tr><th>Date</th><th>Merchant, vendor & description</th><th>Account</th><th>Amount</th><th>Category</th><th>Flow</th><th>Match</th><th>Recurring</th><th>Type</th><th>Notes</th></tr></thead><tbody>${rows.map(transactionRow).join("")}</tbody></table></div>`;
}

function transactionRow(tx) {
  const confidence = Math.max(0, Math.min(100, Number(tx.confidence || 0)));
  const type = tx.type || typeForCategory(tx.category, tx.amount);
  const initial = escapeHtml((tx.merchant || tx.description || "?").trim().charAt(0).toUpperCase() || "?");
  const vendor = transactionVendor(tx);
  const vendorInput = shouldShowVendor(tx.merchant, vendor) ? `<input class="vendor-input" data-field="vendor" aria-label="Detected vendor" value="${escapeAttr(vendor)}" placeholder="Vendor">` : "";
  const source = tx.source || "Imported";
  const reviewTag = tx.needsReview ? `<span class="tag warn">Needs review</span>` : "";
  const flagTags = (tx.flags || []).slice(0, 3).map((flag) => `<span class="tag subtle">${escapeHtml(flag.replace(/_/g, " "))}</span>`).join("");
  const splitTag = splitStatusTag(tx);
  const recurringOptions = ["none", "suggested", "confirmed", "rejected"].map((status) => `<option value="${status}" ${tx.recurringStatus === status ? "selected" : ""}>${label(status)}</option>`).join("");
  const typeOptions = ["expense", "income", "transfer"].map((option) => `<option value="${option}" ${type === option ? "selected" : ""}>${label(option)}</option>`).join("");
  return `<tr data-id="${escapeAttr(tx.id)}" class="tx-row ${tx.needsReview ? "needs-review" : ""}">
    <td class="date-cell"><input class="date-input" data-field="date" aria-label="Transaction date" type="date" value="${escapeAttr(tx.date)}"></td>
    <td class="tx-description-cell">
      <div class="merchant-control">
        <span class="merchant-avatar" aria-hidden="true">${initial}</span>
        <div class="merchant-copy">
          <input data-field="merchant" aria-label="Normalized merchant" value="${escapeAttr(tx.merchant)}" placeholder="Merchant display name">
          ${vendorInput}
          <p>${escapeHtml(tx.description)}</p>
        </div>
      </div>
      <div class="tx-tag-row">${reviewTag}${splitTag}${flagTags}</div>
    </td>
    <td><span class="account-pill">${escapeHtml(accountName(tx.accountId))}</span></td>
    <td class="amount-cell ${tx.amount >= 0 ? "positive" : "negative"}"><span>${money(tx.amount)}</span><small>${tx.amount >= 0 ? "Money in" : "Money out"}</small></td>
    <td><select class="category-select" data-field="category" aria-label="Transaction category">${categoryOptions(tx.category)}</select></td>
    <td>${flowStatusHtml(tx)}</td>
    <td class="confidence-cell"><div class="confidence-meter" aria-label="${confidence} percent confidence"><span style="width:${confidence}%"></span></div><div class="confidence-meta"><strong>${confidence}%</strong><small>${escapeHtml(source)}</small></div></td>
    <td><select class="recurring-select" data-field="recurringStatus" aria-label="Recurring status">${recurringOptions}</select></td>
    <td><select class="type-select type-${escapeAttr(type)}" data-field="type" aria-label="Transaction type">${typeOptions}</select></td>
    <td><input class="note-input" data-field="notes" aria-label="Transaction notes" value="${escapeAttr(tx.notes || "")}" placeholder="Add note"></td>
  </tr>
  <tr data-id="${escapeAttr(tx.id)}" class="tx-action-row ${tx.needsReview ? "needs-review" : ""}">
    <td class="table-action-cell" colspan="10"><div class="row-action-buttons"><button class="mini-btn save-row-btn" data-action="save-row" type="button">Save</button><button class="mini-btn" data-action="apply-rule" type="button">Apply Rule</button><button class="mini-btn" data-action="split" type="button">Split</button><button class="mini-btn" data-action="clear-split" type="button" ${tx.splits?.length ? "" : "disabled"}>Clear Split</button><button class="mini-btn" data-action="mark-internal" type="button">Internal</button><button class="mini-btn" data-action="mark-external" type="button">External</button><button class="mini-btn" data-action="auto-flow" type="button">Auto Flow</button></div></td>
  </tr>`;
}

function shouldShowVendor(merchant, vendor) {
  return Boolean(vendor) && normalizedRuleText(merchant) !== normalizedRuleText(vendor);
}

function splitStatusTag(tx) {
  if (!tx.splits?.length) return "";
  const total = money(splitTotal(tx));
  const difference = splitDifference(tx);
  if (tx.splitStatus === "needs_split_review") return `<span class="tag warn">Split review ${total}, off ${money(difference)}</span>`;
  const labelText = tx.splitStatus === "itemized" ? "Itemized" : "Split";
  return `<span class="tag good">${labelText} ${total}</span>`;
}

function flowStatusHtml(tx) {
  const flowLabel = label(String(tx.flowType || "uncategorized").replace(/_/g, " "));
  const status = tx.transferStatus ? ` · ${label(tx.transferStatus.replace(/_/g, " "))}` : "";
  const peer = tx.counterpartyAccountId ? `<small>${escapeHtml(tx.transferDirection === "out" ? "To" : "From")} ${escapeHtml(accountName(tx.counterpartyAccountId))}</small>` : "";
  const tone = tx.reportingType === "internal" ? "good" : tx.reportingType === "review" ? "warn" : tx.reportingType === "expense" ? "danger" : "good";
  return `<div class="flow-status"><span class="tag ${tone}">${escapeHtml(flowLabel)}${escapeHtml(status)}</span>${peer}<small>${escapeHtml(tx.flowReason || "")}</small></div>`;
}

function transactionInsightsHtml(rows) {
  const expenses = rows.filter(isReportableExpense).reduce((sum, tx) => sum + reportableExpenseAmount(tx), 0);
  const income = rows.filter(isReportableIncome).reduce((sum, tx) => sum + Math.max(0, tx.amount), 0);
  const transfers = rows.filter(isInternalFlow).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const expenseCount = rows.filter(isReportableExpense).length;
  const reviewCount = rows.filter((tx) => tx.needsReview || tx.category === "Uncategorized").length;
  const net = income - expenses;
  const averageExpense = expenseCount ? expenses / expenseCount : 0;
  const maxFlow = Math.max(income, expenses, 1);
  const incomeWidth = Math.max(5, (income / maxFlow) * 100);
  const expenseWidth = Math.max(5, (expenses / maxFlow) * 100);
  const expenseShare = rows.length ? Math.round((expenseCount / rows.length) * 100) : 0;
  const topCategories = topSpendingCategories(rows, 5);
  return `
    <div class="transaction-insights" aria-label="Filtered transaction insights">
      <article class="insight-card hero-insight ${net >= 0 ? "good" : "danger"}">
        <span>Filtered net cash flow</span>
        <strong>${money(net)}</strong>
        <p>Income ${money(income)} versus spending ${money(expenses)}</p>
        <div class="cashflow-mini-chart" aria-hidden="true">
          <span class="cashflow-bar income" style="width:${incomeWidth}%"></span>
          <span class="cashflow-bar expense" style="width:${expenseWidth}%"></span>
        </div>
      </article>
      <article class="insight-card">
        <span>Spending mix</span>
        <div class="donut-stat" style="--expense-share:${expenseShare}%"><strong>${expenseShare}%</strong></div>
        <p>${expenseCount} expenses · average ${money(averageExpense)}</p>
      </article>
      <article class="insight-card">
        <span>Needs attention</span>
        <strong>${reviewCount}</strong>
        <p>${reviewCount ? "Review uncategorized or low-confidence activity." : "All filtered rows are currently categorized."}</p>
        <span class="tag ${reviewCount ? "warn" : "good"}">${reviewCount ? "Review queue" : "Clean ledger"}</span>
      </article>
      <article class="insight-card category-snapshot">
        <span>Top categories</span>
        ${topCategoryMiniList(topCategories)}
        <p class="muted">Internal movement in this view totals ${money(transfers)}.</p>
      </article>
    </div>
  `;
}

function topSpendingCategories(rows, limit = 5) {
  return Object.entries(categoryTotalsForTransactions(rows)).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function topCategoryMiniList(entries) {
  if (!entries.length) return `<div class="empty-state compact">No spending categories in this filtered view.</div>`;
  const max = Math.max(...entries.map((entry) => entry[1]), 1);
  return `<div class="mini-category-list">${entries.map(([name, value]) => `<div class="mini-category-row"><div><span>${escapeHtml(name)}</span><strong>${money(value)}</strong></div><em><i style="width:${Math.max(7, (value / max) * 100)}%"></i></em></div>`).join("")}</div>`;
}

function bindTransactionTable(root) {
  root.querySelectorAll("[data-action='save-row']").forEach((button) => button.addEventListener("click", () => {
    const tr = transactionDataRowForAction(button);
    const { tx, previousCategory, previousVendor } = saveTransactionRow(tr);
    if (!tx) return;
    let statusMessage = "";
    if (previousCategory !== tx.category && tx.merchant && window.confirm("Apply this category to future transactions from this merchant?")) {
      const updatedCount = createReviewRuleAndApplyToMatches(tx);
      statusMessage = updatedCount > 1 ? `Rule created and ${updatedCount} matching transactions were categorized.` : "Rule created for future matching transactions.";
    }
    if (previousVendor !== tx.vendor && tx.vendor && window.confirm("Apply this vendor to matching transaction descriptions before AI analysis?")) {
      const updatedCount = createVendorRuleAndApplyToMatches(tx);
      statusMessage = updatedCount > 1 ? `Vendor rule created and ${updatedCount} matching transactions were updated.` : "Vendor rule created for future matching transactions.";
    }
    renderAll();
    if (statusMessage) showStatus(statusMessage);
  }));
  root.querySelectorAll("[data-action='apply-rule']").forEach((button) => button.addEventListener("click", () => {
    const tr = transactionDataRowForAction(button);
    const { tx } = saveTransactionRow(tr);
    if (!tx) return;
    const updatedCount = createReviewRuleAndApplyToMatches(tx);
    renderAll();
    if (updatedCount > 1) showStatus(`Rule created and ${updatedCount} matching transactions were categorized.`);
    else showStatus("Rule created for future matching transactions.");
  }));
  root.querySelectorAll("[data-action='mark-internal']").forEach((button) => button.addEventListener("click", () => {
    const tx = transactionForAction(button);
    if (!tx) return;
    const counterparty = promptForCounterpartyAccount(tx);
    tx.flowSource = "user";
    tx.flowType = counterparty && (accountById(counterparty)?.type === "credit" || accountById(counterparty)?.flowRole === "credit_card") ? "credit_card_payment" : "internal_transfer";
    markSingleSidedInternal(tx, counterparty, counterparty ? `Manually marked as internal transfer with ${accountName(counterparty)}.` : "Manually marked as internal account movement.");
    tx.confidence = Math.max(90, Number(tx.confidence || 0));
    tx.source = "User flow";
    renderAll();
    showStatus("Transaction marked as internal money movement.");
  }));
  root.querySelectorAll("[data-action='mark-external']").forEach((button) => button.addEventListener("click", () => {
    const tx = transactionForAction(button);
    if (!tx) return;
    markExternalFlow(tx);
    renderAll();
    showStatus("Transaction marked as external income or spending.");
  }));
  root.querySelectorAll("[data-action='auto-flow']").forEach((button) => button.addEventListener("click", () => {
    const tx = transactionForAction(button);
    if (!tx) return;
    tx.flowSource = "auto";
    tx.flowType = deriveTransactionFlowType(tx);
    tx.flowReason = flowReasonFor(tx);
    clearTransferLink(tx);
    renderAll();
    showStatus("Transaction returned to automatic flow detection.");
  }));
  root.querySelectorAll("[data-action='split']").forEach((button) => button.addEventListener("click", () => {
    const tx = transactionForAction(button);
    if (!tx) return;
    editTransactionSplits(tx);
  }));
  root.querySelectorAll("[data-action='clear-split']").forEach((button) => button.addEventListener("click", () => {
    const tx = transactionForAction(button);
    if (!tx?.splits?.length || !window.confirm("Clear split/itemized lines and use the parent transaction category again?")) return;
    clearTransactionSplits(tx);
    renderAll();
    showStatus("Split lines cleared.");
  }));
}

function transactionDataRowForAction(button) {
  const row = button.closest("tr");
  return row?.classList.contains("tx-action-row") ? row.previousElementSibling : row;
}

function transactionForAction(button) {
  const row = transactionDataRowForAction(button);
  return state.transactions.find((item) => item.id === row?.dataset.id);
}

function saveTransactionRow(tr) {
  const tx = state.transactions.find((item) => item.id === tr?.dataset.id);
  if (!tx) return { tx: null, previousCategory: "", previousVendor: "" };
  const previousCategory = tx.category;
  const previousVendor = transactionVendor(tx);
  const selectedType = tr.querySelector("[data-field='type']")?.value || "";
  const hasVendorInput = Boolean(tr.querySelector("[data-field='vendor']"));
  tr.querySelectorAll("[data-field]").forEach((input) => { tx[input.dataset.field] = sanitize(input.value); });
  tx.vendor = hasVendorInput ? transactionVendor(tx) : sanitize(tx.merchant || "");
  if (tx.category === "Income" || isTransferCategory(tx.category)) tx.type = typeForCategory(tx.category, tx.amount);
  if (selectedType === "income" || selectedType === "expense") tx.importDirection = "";
  normalizeTransactionAmountSign(tx);
  if (previousCategory !== tx.category && tx.flowSource !== "user") {
    tx.flowType = deriveTransactionFlowType(tx);
    tx.flowReason = flowReasonFor(tx);
  }
  tx.needsReview = false;
  tx.flags = (tx.flags || []).filter((flag) => flag !== "low_confidence" && flag !== "uncategorized");
  tx.source = tx.source === "AI" ? tx.source : "User";
  tx.confidence = 100;
  return { tx, previousCategory, previousVendor };
}

function editTransactionSplits(tx) {
  if (!isReportableExpense(tx)) {
    showStatus("Only external expense transactions can be split.");
    return;
  }
  const existing = (tx.splits || []).length ? tx.splits : [{ amount: reportableExpenseAmount(tx), category: tx.category || "Uncategorized", description: tx.merchant || tx.description || "Split line" }];
  const exampleCategories = state.categories.map((cat) => cat.name).slice(0, 18).join(", ");
  const initialValue = existing.map((split) => `${round(Math.abs(split.amount))}, ${split.category || "Uncategorized"}, ${split.description || ""}`).join("\n");
  const input = window.prompt([
    `Split ${tx.merchant || tx.description} ${money(reportableExpenseAmount(tx))}`,
    "Enter one line per category as: amount, category, description",
    "Example: 50, Groceries, food",
    `Available categories include: ${exampleCategories}`,
    "Leave blank to cancel."
  ].join("\n\n"), initialValue);
  if (!input) return;
  const lines = parseSplitLines(input, tx);
  if (!lines.length) return showStatus("No valid split lines were entered.");
  const total = round(lines.reduce((sum, split) => sum + Math.abs(split.amount), 0));
  const expected = reportableExpenseAmount(tx);
  if (Math.abs(total - expected) > SPLIT_TOLERANCE) {
    showStatus(`Split total ${money(total)} must equal transaction amount ${money(expected)}. Difference: ${money(round(expected - total))}.`);
    return;
  }
  tx.splits = lines;
  tx.itemizationSource = "manual";
  tx.itemizationMatchConfidence = 100;
  tx.source = "User split";
  tx.confidence = 100;
  tx.needsReview = false;
  normalizeTransactionSplitState(tx);
  renderAll();
  showStatus(`Transaction split into ${lines.length} category allocations.`);
}

function parseSplitLines(input, tx) {
  return parseCSV(input).map((row) => {
    const amount = round(Math.abs(parseMoney(row[0])));
    const category = sanitize(row[1] || "Uncategorized");
    const description = sanitize(row.slice(2).join(", ") || category || tx.merchant || tx.description);
    if (!amount) return null;
    return normalizeSplitLine({ amount, category, description, merchant: tx.merchant, source: "manual", confidence: 100 }, tx);
  }).filter(Boolean);
}

function clearTransactionSplits(tx) {
  tx.splits = [];
  tx.splitTotal = 0;
  tx.splitStatus = "none";
  tx.itemizationSource = "";
  tx.itemizationMatchConfidence = 0;
  tx.flags = (tx.flags || []).filter((flag) => flag !== "split_review");
}

function markExternalFlow(tx) {
  tx.flowSource = "user";
  tx.flowType = tx.category === "Income" || tx.amount > 0 && tx.type === "income" ? "external_income" : "external_expense";
  tx.reportingType = tx.flowType === "external_income" ? "income" : "expense";
  tx.transferGroupId = "";
  tx.transferPeerTransactionId = "";
  tx.counterpartyAccountId = "";
  tx.transferDirection = "";
  tx.transferStatus = "";
  tx.flowConfidence = 100;
  tx.flowReason = tx.flowType === "external_income" ? "Manually confirmed as outside income." : "Manually confirmed as outside spending.";
  tx.needsReview = false;
  tx.flags = cleanFlowFlags(tx.flags || []);
  tx.source = "User flow";
}

function promptForCounterpartyAccount(tx) {
  const options = state.accounts.filter((account) => account.id !== tx.accountId);
  if (!options.length) return "";
  const listing = options.map((account, index) => `${index + 1}. ${account.name} (${label((account.flowRole || account.type || "account").replace(/_/g, " "))})`).join("\n");
  const value = window.prompt(`Counterparty account for this internal movement (optional):\n${listing}\n\nEnter number or leave blank:`, "");
  const index = Math.round(Number(value || 0)) - 1;
  return options[index]?.id || "";
}

function renderReview() {
  const tab = document.getElementById("reviewTab");
  const queue = reviewQueue();
  tab.innerHTML = `
    <section class="panel">
      <h3>Manual review queue</h3>
      <p class="status-line">Low-confidence categories, uncategorized items, possible transfers, possible duplicates, new recurring expenses, and unusually high amounts appear here.</p>
      ${reviewReasonFiltersHtml()}
      <div class="bulk-actions"><select id="bulkCategory"><option value="">Bulk category</option>${categoryOptions("")}</select><button id="bulkCategorize" class="btn btn-secondary" type="button">Apply to Selected</button></div>
      <div style="margin-top:1rem">${queue.length ? queue.map(reviewCard).join("") : `<div class="empty-state">No transactions currently require review.</div>`}</div>
    </section>
  `;
  bindReviewActions(tab);
}

function reviewCard(tx) {
  const reviewReasons = reviewReasonsForTransaction(tx);
  const reasonSet = new Set(reviewReasons);
  const reasonTags = reviewReasons.map((reason) => `<span class="tag subtle">${escapeHtml(reviewReasonLabel(reason))}</span>`).join(" ");
  const flagTags = (tx.flags || []).filter((flag) => !reasonSet.has(flag)).map((flag) => `<span class="tag warn">${escapeHtml(flag.replace(/_/g, " "))}</span>`).join(" ");
  return `<article class="review-card panel" data-id="${tx.id}">
    <input type="checkbox" class="review-select" aria-label="Select transaction">
    <div class="review-details"><strong>${escapeHtml(tx.merchant || tx.description)}</strong><p>${escapeHtml(tx.date)} · ${escapeHtml(accountName(tx.accountId))} · <span class="amount-cell ${tx.amount >= 0 ? "positive" : "negative"}">${money(tx.amount)}</span></p><p>${escapeHtml(tx.description)}</p><p><span class="tag subtle">Vendor: ${escapeHtml(transactionVendor(tx))}</span> ${splitStatusTag(tx)}</p><p>${flowStatusHtml(tx)}</p>${splitReviewHtml(tx)}<p>${reasonTags} ${flagTags}</p></div>
    <div class="review-actions"><select data-review-category>${categoryOptions(tx.category)}</select><label><input data-apply-rule type="checkbox"> Apply rule</label><button class="mini-btn" data-review="confirm" type="button">Confirm</button><button class="mini-btn" data-review="split" type="button">Split</button><button class="mini-btn" data-review="clear-split" type="button" ${tx.splits?.length ? "" : "disabled"}>Clear Split</button><button class="mini-btn" data-review="internal" type="button">Confirm Internal</button><button class="mini-btn" data-review="skip" type="button">Skip</button></div>
  </article>`;
}

function reviewReasonFiltersHtml() {
  const selected = reviewReasonFilterSet();
  const counts = reviewReasonCounts();
  const buttons = REVIEW_REASON_DEFINITIONS.map((reason) => {
    const count = counts.get(reason.key) || 0;
    const active = selected.has(reason.key);
    return `<button class="review-reason-filter ${active ? "active" : ""}" data-review-reason="${escapeAttr(reason.key)}" type="button" aria-pressed="${active}">${escapeHtml(reason.label)} <span>(${count})</span></button>`;
  }).join("");
  return `<div class="review-reason-toolbar" aria-label="Review queue reason filters"><button class="review-reason-filter ${selected.size ? "" : "active"}" data-review-reason="all" type="button" aria-pressed="${selected.size ? "false" : "true"}">All <span>(${reviewQueue(false).length})</span></button>${buttons}</div>`;
}

function bindReviewReasonFilters(root) {
  root.querySelectorAll("[data-review-reason]").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.reviewReason;
    const selected = reviewReasonFilterSet();
    if (key === "all") selected.clear();
    else if (selected.has(key)) selected.delete(key);
    else selected.add(key);
    state.filters.reviewReasons = Array.from(selected);
    renderReview();
  }));
}

function splitReviewHtml(tx) {
  if (!tx.splits?.length) return "";
  const rows = tx.splits.slice(0, 8).map((split) => `<li>${escapeHtml(split.category)} · ${money(split.amount)} · ${escapeHtml(split.description)}</li>`).join("");
  const extra = tx.splits.length > 8 ? `<li>${tx.splits.length - 8} more split lines</li>` : "";
  return `<div class="split-summary"><strong>Split total ${money(splitTotal(tx))}</strong><small>Transaction amount ${money(reportableExpenseAmount(tx))}; difference ${money(splitDifference(tx))}.</small><ul>${rows}${extra}</ul></div>`;
}

function bindReviewActions(root) {
  bindReviewReasonFilters(root);
  root.querySelectorAll("[data-review='confirm']").forEach((button) => button.addEventListener("click", () => {
    const card = button.closest("article");
    const tx = state.transactions.find((item) => item.id === card.dataset.id);
    tx.category = card.querySelector("[data-review-category]").value;
    tx.type = typeForCategory(tx.category, tx.amount);
    if (!isTransferCategory(tx.category)) markExternalFlow(tx);
    tx.needsReview = false;
    tx.confidence = 100;
    tx.source = "User";
    tx.flags = [];
    resolveRecurringReview(tx, "confirmed");
    if (card.querySelector("[data-apply-rule]").checked) {
      const updatedCount = createReviewRuleAndApplyToMatches(tx);
      if (updatedCount > 1) showStatus(`Rule created and ${updatedCount} matching transactions were categorized.`);
      else showStatus("Rule created for future matching transactions.");
    }
    renderAll();
  }));
  root.querySelectorAll("[data-review='internal']").forEach((button) => button.addEventListener("click", () => {
    const tx = state.transactions.find((item) => item.id === button.closest("article").dataset.id);
    if (!tx) return;
    const counterparty = promptForCounterpartyAccount(tx);
    tx.flowSource = "user";
    tx.flowType = counterparty && (accountById(counterparty)?.type === "credit" || accountById(counterparty)?.flowRole === "credit_card") ? "credit_card_payment" : "internal_transfer";
    markSingleSidedInternal(tx, counterparty, counterparty ? `Manually confirmed internal movement with ${accountName(counterparty)}.` : "Manually confirmed internal account movement.");
    tx.category = tx.category === "Uncategorized" ? TRANSFER_CATEGORY : tx.category;
    tx.type = "transfer";
    tx.source = "User flow";
    tx.confidence = 100;
    resolveRecurringReview(tx, "confirmed");
    renderAll();
    showStatus("Internal money movement confirmed.");
  }));
  root.querySelectorAll("[data-review='split']").forEach((button) => button.addEventListener("click", () => {
    const tx = state.transactions.find((item) => item.id === button.closest("article")?.dataset.id);
    if (tx) editTransactionSplits(tx);
  }));
  root.querySelectorAll("[data-review='clear-split']").forEach((button) => button.addEventListener("click", () => {
    const tx = state.transactions.find((item) => item.id === button.closest("article")?.dataset.id);
    if (!tx?.splits?.length || !window.confirm("Clear split/itemized lines and use the parent transaction category again?")) return;
    clearTransactionSplits(tx);
    renderAll();
    showStatus("Split lines cleared.");
  }));
  root.querySelectorAll("[data-review='skip']").forEach((button) => button.addEventListener("click", () => {
    const tx = state.transactions.find((item) => item.id === button.closest("article").dataset.id);
    tx.needsReview = false;
    tx.flags = [];
    resolveRecurringReview(tx, "rejected");
    tx.notes = `${tx.notes || ""} Skipped during review.`.trim();
    renderAll();
  }));
  document.getElementById("bulkCategorize").addEventListener("click", () => {
    const category = document.getElementById("bulkCategory").value;
    if (!category) return;
    root.querySelectorAll(".review-select:checked").forEach((checkbox) => {
      const tx = state.transactions.find((item) => item.id === checkbox.closest("article").dataset.id);
      tx.category = category;
      tx.type = typeForCategory(category, tx.amount);
      if (!isTransferCategory(category)) markExternalFlow(tx);
      tx.needsReview = false;
      tx.confidence = 100;
      tx.source = "Bulk review";
      tx.flags = [];
      resolveRecurringReview(tx, "confirmed");
    });
    renderAll();
  });
}

function resolveRecurringReview(tx, status) {
  const recurring = state.recurring.find((item) => item.merchant === tx.merchant && item.status === "suggested");
  if (!recurring) return;
  recurring.status = status;
  state.transactions.filter((item) => item.merchant === recurring.merchant).forEach((item) => { item.recurringStatus = status === "confirmed" ? "confirmed" : "rejected"; });
}

function createReviewRuleAndApplyToMatches(sourceTx) {
  const match = categoryRuleMatchText(sourceTx);
  if (!match) return 0;
  const rule = { id: uniqueId("rule"), type: "merchant", match, category: sourceTx.category, createdAt: new Date().toISOString() };
  const hasRule = state.rules.some((item) => item.type === rule.type && item.match.toLowerCase() === rule.match.toLowerCase() && item.category === rule.category);
  if (!hasRule) state.rules.push(rule);
  return applyCategoryRuleToTransactions(rule, state.transactions);
}

function categoryRuleMatchText(tx) {
  return paypalVendorToken(tx.description) || stableDescriptionRuleMatch(tx.description) || sanitize(tx.merchant || tx.vendor || tx.description);
}

function stableDescriptionRuleMatch(description) {
  const text = sanitize(description).replace(/\s+/g, " ").trim();
  if (!text) return "";
  const known = text.match(/\b(AIRBNB\s+PAYMENTS|AIRBNB|PAYPAL\s+\*[A-Z0-9&.'-]+|VENMO|ZELLE)\b/i);
  if (known) return sanitize(known[1].replace(/^PAYPAL\s+\*/i, ""));
  const words = text.split(" ");
  const kept = [];
  for (const word of words) {
    const clean = word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
    if (!clean) continue;
    if ((/[0-9*#]/.test(word) || /^[A-Z]{2,}[-*][A-Z0-9]/i.test(word)) && kept.length) break;
    kept.push(clean);
    if (kept.length >= 3) break;
  }
  const match = kept.join(" ");
  return match && match.length >= 5 && normalizedRuleText(match) !== normalizedRuleText(text) ? sanitize(match) : "";
}

function applyCategoryRuleToTransactions(rule, transactions) {
  if (!rule?.category) return 0;
  const matches = transactions.filter((tx) => categoryRuleMatches(rule, tx));
  matches.forEach((tx) => {
    tx.category = rule.category;
    tx.type = typeForCategory(rule.category, tx.amount);
    tx.needsReview = false;
    tx.confidence = 100;
    tx.source = "User rule";
    tx.reason = "Matched a user-created categorization rule.";
    tx.flags = (tx.flags || []).filter((flag) => !["low_confidence", "uncategorized"].includes(flag));
  });
  return matches.length;
}

function categoryRuleMatches(rule, tx) {
  const match = normalizedRuleText(rule.match);
  if (!match || rule.type === "vendor") return false;
  const description = normalizedRuleText(tx.description);
  const merchant = normalizedRuleText(tx.merchant);
  const vendor = normalizedRuleText(tx.vendor);
  if (rule.type === "merchant") return normalizedRuleText(`${tx.merchant || ""} ${tx.vendor || ""} ${tx.description || ""}`).includes(match);
  return description.includes(match) || merchant.includes(match) || vendor.includes(match);
}

function createVendorRuleAndApplyToMatches(sourceTx) {
  const match = vendorRuleMatch(sourceTx);
  if (!match || !sourceTx.vendor) return 0;
  const rule = { id: uniqueId("rule"), type: "vendor", match, vendor: sourceTx.vendor, createdAt: new Date().toISOString() };
  const hasRule = state.rules.some((item) => item.type === rule.type && item.match.toLowerCase() === rule.match.toLowerCase() && String(item.vendor || "").toLowerCase() === rule.vendor.toLowerCase());
  if (!hasRule) state.rules.push(rule);
  return applyVendorRulesToTransactions(state.transactions, state);
}

function vendorRuleMatch(tx) {
  return paypalVendorToken(tx.description) || sanitize(tx.description || tx.merchant || tx.vendor);
}

function applyVendorRulesToTransactions(transactions, sourceState) {
  let updatedCount = 0;
  transactions.forEach((tx) => {
    const before = tx.vendor || "";
    applyVendorRules(tx, sourceState);
    if ((tx.vendor || "") !== before) updatedCount += 1;
  });
  return updatedCount;
}

function applyVendorRules(tx, sourceState) {
  const userRule = sourceState.rules.find((rule) => rule.type === "vendor" && vendorRuleMatches(rule, tx));
  if (userRule?.vendor) {
    tx.vendor = sanitize(userRule.vendor);
    return;
  }
  const detected = detectVendorFromDescription(tx.description);
  const defaultVendor = sanitize(tx.merchant || normalizeMerchant(tx.description));
  if (detected && (!tx.vendor || tx.vendor === defaultVendor)) tx.vendor = detected;
}

function vendorRuleMatches(rule, tx) {
  const match = normalizedRuleText(rule.match);
  if (!match) return false;
  const paypalToken = normalizedRuleText(paypalVendorToken(tx.description));
  if (paypalToken && paypalToken === match) return true;
  return normalizedRuleText(`${tx.description || ""} ${tx.merchant || ""} ${tx.vendor || ""}`).includes(match);
}

function detectVendorFromDescription(description) {
  const token = paypalVendorToken(description);
  if (token) return formatVendorToken(token);
  if (/\bAIRBNB\s+PAYMENTS\b/i.test(description)) return "Airbnb";
  return "";
}

function paypalVendorToken(description) {
  const match = String(description || "").match(/\bPAYPAL\s+\*([A-Z0-9][A-Z0-9&.'-]{1,})/i);
  return sanitize(match?.[1] || "");
}

function formatVendorToken(value) {
  const compact = sanitize(value).replace(/(LIMITED|LIMIT|LLC|INC|CORP)$/i, "").trim();
  if (/^[A-Z]{2,6}LABS$/i.test(compact)) return compact.replace(/LABS$/i, "Labs");
  return compact.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizedRuleText(value) {
  return sanitize(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function renderReports() {
  const tab = document.getElementById("reportsTab");
  const summary = monthlySummary(state.selectedMonth);
  const selectedCategory = reportCategory();
  tab.innerHTML = `
    <div class="report-grid">
      <section class="chart-card report-card-wide"><h3>Money flow</h3><p class="status-line">Credit-card purchases count on purchase dates. Later card payments are internal movement and do not shift category spending into the payment month.</p>${moneyFlowReport(summary)}</section>
      <section class="chart-card report-card-wide"><h3>Category drilldown</h3><p class="status-line">Pick any category level, such as Side Businesses or Cuyle's Customs, to include transactions assigned to that category and every nested child category.</p><div class="field"><label for="reportCategory">Category or vendor bucket</label><select id="reportCategory"><option value="">Choose category</option>${categoryIdOptions(selectedCategory?.id || "")}</select></div>${selectedCategory ? categoryDrilldown(selectedCategory) : `<div class="empty-state compact">Create nested categories, assign transactions, then select a category here to see monthly and overall totals.</div>`}</section>
      <section class="chart-card"><h3>Spending by category</h3>${categoryBars(summary.byCategory)}</section>
      <section class="chart-card"><h3>Monthly spending totals</h3>${monthlyBars("spending")}</section>
      <section class="chart-card"><h3>Income versus expenses</h3>${incomeExpenseBars()}</section>
      <section class="chart-card"><h3>Category trends</h3>${trendList("category")}</section>
      <section class="chart-card"><h3>Merchant trends</h3>${trendList("merchant")}</section>
      <section class="chart-card"><h3>Recurring versus discretionary</h3>${recurringDiscretionary()}</section>
      <section class="chart-card"><h3>Average monthly spending</h3><strong>${money(averageMonthlySpending(3))}</strong><p class="muted">Three-month average: ${money(averageMonthlySpending(3))}. Six-month average: ${money(averageMonthlySpending(6))}.</p></section>
      <section class="chart-card"><h3>Largest month-over-month increases</h3>${monthIncreaseList()}</section>
    </div>
  `;
  document.getElementById("reportCategory")?.addEventListener("change", (event) => {
    selectedCategoryReportId = event.target.value;
    renderReports();
  });
  tab.querySelectorAll("[data-cat-report]").forEach((button) => button.addEventListener("click", () => {
    selectedCategoryReportId = button.dataset.catReport;
    renderReports();
  }));
}

function renderIncome() {
  const s = state.incomeSettings;
  const actual = monthlySummary(state.selectedMonth).actualIncome;
  const overtime = overtimeIncome();
  const total = Number(s.expectedMonthlyIncome || 0) + overtime + Number(s.additionalExpectedIncome || 0);
  const tab = document.getElementById("incomeTab");
  tab.innerHTML = `
    <div class="income-grid">
      ${summaryCard("Actual imported income", actual, "good")}
      ${summaryCard("Expected base income", Number(s.expectedMonthlyIncome || 0), "good")}
      ${summaryCard("Potential overtime income", overtime, "warn", "Scenario only, not received.")}
      ${summaryCard("Total projected income", total, "warn")}
    </div>
    <section class="panel" style="margin-top:1rem"><h3>Income settings and overtime scenarios</h3>
      <div class="settings-grid">
        ${incomeField("hourlyRate", "Regular hourly rate", "number")}
        ${incomeField("normalWeeklyHours", "Normal weekly hours", "number")}
        <div class="field"><label for="income-payFrequency">Pay frequency</label><select id="income-payFrequency"><option ${s.payFrequency === "weekly" ? "selected" : ""}>weekly</option><option ${s.payFrequency === "biweekly" ? "selected" : ""}>biweekly</option><option ${s.payFrequency === "semimonthly" ? "selected" : ""}>semimonthly</option><option ${s.payFrequency === "monthly" ? "selected" : ""}>monthly</option></select></div>
        ${incomeField("typicalNetPaycheck", "Typical net paycheck", "number")}
        ${incomeField("expectedMonthlyIncome", "Expected monthly income", "number")}
        ${incomeField("overtimeHours", "Potential overtime hours", "number")}
        ${incomeField("overtimeMultiplier", "Overtime multiplier", "number", "0.1")}
        ${incomeField("additionalExpectedIncome", "Additional expected income", "number")}
        <div class="field"><label for="income-scenario">Scenario</label><select id="income-scenario">${state.overtimeScenarios.map((scenario) => `<option value="${scenario.id}" ${s.scenario === scenario.id ? "selected" : ""}>${escapeHtml(scenario.name)}</option>`).join("")}</select></div>
      </div>
      <div class="form-actions" style="margin-top:1rem"><button id="saveIncome" class="btn btn-primary" type="button">Save Income Settings</button></div>
    </section>
  `;
  document.getElementById("saveIncome").addEventListener("click", () => {
    Object.keys(s).forEach((key) => {
      const el = document.getElementById(`income-${key}`);
      if (!el) return;
      s[key] = el.type === "number" ? Number(el.value || 0) : el.value;
    });
    const scenario = state.overtimeScenarios.find((item) => item.id === s.scenario);
    if (scenario) {
      s.overtimeHours = scenario.hours;
      s.overtimeMultiplier = scenario.multiplier;
    }
    renderAll();
  });
}

function incomeField(key, labelText, type, step = "1") {
  return `<div class="field"><label for="income-${key}">${labelText}</label><input id="income-${key}" type="${type}" step="${step}" value="${escapeAttr(state.incomeSettings[key])}"></div>`;
}

function renderRecurring() {
  const tab = document.getElementById("recurringTab");
  tab.innerHTML = `<section class="panel"><h3>Recurring expenses</h3><p class="status-line">Repeated charges are suggestions until confirmed. Repeated transactions are not automatically assumed to be subscriptions.</p><div class="recurring-grid">${state.recurring.length ? state.recurring.map(recurringCard).join("") : `<div class="empty-state">Not enough repeated charges to identify recurring expenses yet.</div>`}</div></section>`;
  tab.querySelectorAll("[data-recurring]").forEach((button) => button.addEventListener("click", () => {
    const recurring = state.recurring.find((item) => item.id === button.closest("article").dataset.id);
    updateRecurringStatus(recurring, button.dataset.recurring);
    renderRecurring();
    saveState();
  }));
  tab.querySelectorAll("[data-recurring-transactions]").forEach((button) => button.addEventListener("click", () => {
    const id = button.closest("article")?.dataset.id;
    if (!id) return;
    if (recurringTransactionExpandedIds.has(id)) recurringTransactionExpandedIds.delete(id);
    else recurringTransactionExpandedIds.add(id);
    renderRecurring();
  }));
}

function updateRecurringStatus(recurring, status) {
  if (!recurring) return;
  recurring.status = status;
  const transactionStatus = status === "confirmed" ? "confirmed" : "rejected";
  state.transactions.filter((tx) => tx.merchant === recurring.merchant).forEach((tx) => { tx.recurringStatus = transactionStatus; });
}

function moneyFlowReport(summary) {
  const pairs = internalFlowPairs(state.selectedMonth);
  return `
    <div class="summary-grid compact-summary">
      ${summaryCard("Outside income", summary.actualIncome, "good")}
      ${summaryCard("Outside spending", summary.spending, "danger")}
      ${summaryCard("Net external flow", summary.netCashFlow, summary.netCashFlow >= 0 ? "good" : "danger")}
      ${summaryCard("Internal transfer volume", summary.internalTransferVolume, "warn")}
      ${summaryCard("Transfer review", String(summary.unmatchedTransfers.count), "warn", "Count")}
    </div>
    <div class="table-wrap compact-table" style="margin-top:1rem"><table><thead><tr><th>Account flow</th><th>Out</th><th>In</th><th>Transactions</th></tr></thead><tbody>${pairs.length ? pairs.map((item) => `<tr><td>${escapeHtml(item.label)}</td><td class="negative">${money(item.out)}</td><td class="positive">${money(item.in)}</td><td>${item.count}</td></tr>`).join("") : `<tr><td colspan="4">No matched internal account movement this month.</td></tr>`}</tbody></table></div>
  `;
}

function internalFlowPairs(month) {
  const rows = state.transactions.filter((tx) => tx.date?.startsWith(month) && isInternalFlow(tx));
  const pairs = new Map();
  rows.forEach((tx) => {
    const from = tx.transferDirection === "out" ? accountName(tx.accountId) : accountName(tx.counterpartyAccountId);
    const to = tx.transferDirection === "out" ? accountName(tx.counterpartyAccountId) : accountName(tx.accountId);
    const labelText = `${from || "Unknown"} -> ${to || "Unknown"}`;
    if (!pairs.has(labelText)) pairs.set(labelText, { label: labelText, out: 0, in: 0, count: 0 });
    const pair = pairs.get(labelText);
    if (tx.amount < 0) pair.out += Math.abs(tx.amount);
    else pair.in += tx.amount;
    pair.count += 1;
  });
  return Array.from(pairs.values()).map((item) => ({ ...item, out: round(item.out), in: round(item.in) })).sort((a, b) => (b.out + b.in) - (a.out + a.in));
}

function recurringCard(item) {
  const flags = item.flags?.length ? `<div class="recurring-flags">${item.flags.map((flag) => `<span class="tag warn">${escapeHtml(flag)}</span>`).join(" ")}</div>` : "";
  const isExpanded = recurringTransactionExpandedIds.has(item.id);
  const transactions = isExpanded ? recurringTransactionsHtml(item) : "";
  return `<article class="recurring-card" data-id="${escapeAttr(item.id)}"><div class="recurring-card-heading"><div><strong>${escapeHtml(item.merchant)}</strong><p>${escapeHtml(item.description || item.category || "Recurring expense")}</p></div><span class="tag ${item.status === "confirmed" ? "good" : item.status === "rejected" ? "danger" : "warn"}">${escapeHtml(label(item.status || "suggested"))}</span></div><dl class="recurring-summary"><div><dt>Total</dt><dd>${money(item.expectedAmount)}</dd></div><div><dt>Last Date</dt><dd>${escapeHtml(item.lastPaymentDate)}</dd></div><div><dt>Number of Payments</dt><dd>${Number(item.paymentCount || 0)}</dd></div><div><dt>Total Paid YTD</dt><dd>${money(item.totalPaidYtd)}</dd></div></dl>${flags}<div class="form-actions" style="margin-top:.8rem"><button class="mini-btn" data-recurring="confirmed" type="button">Confirm</button><button class="mini-btn danger" data-recurring="rejected" type="button">Reject</button><button class="mini-btn" data-recurring-transactions type="button" aria-expanded="${isExpanded}">${isExpanded ? "Hide Transactions" : "Show Transactions"}</button></div>${transactions}</article>`;
}

function recurringTransactionsHtml(item) {
  const payments = recurringPayments(item);
  if (!payments.length) return `<div class="empty-state compact recurring-transactions">No matching payments found.</div>`;
  const total = round(payments.reduce((sum, tx) => sum + Math.abs(tx.amount), 0));
  return `<div class="recurring-transactions"><div class="recurring-transactions-heading"><strong>Payments</strong><span>${payments.length} payments · ${money(total)} total</span></div><div class="table-wrap compact-table"><table><thead><tr><th>Date</th><th>Payment</th><th>Total</th></tr></thead><tbody>${payments.map((tx) => `<tr><td>${escapeHtml(tx.date)}</td><td>${escapeHtml(tx.description || tx.merchant)}</td><td>${money(Math.abs(tx.amount))}</td></tr>`).join("")}</tbody></table></div></div>`;
}

function recurringPayments(item) {
  return state.transactions
    .filter((tx) => tx.merchant === item.merchant && isReportableExpense(tx))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function renderRules() {
  const tab = document.getElementById("rulesTab");
  if (!tab) return;
  const categoryRules = state.rules.filter((rule) => rule.type !== "vendor");
  const vendorRules = state.rules.filter((rule) => rule.type === "vendor");
  tab.innerHTML = `
    <section class="panel rules-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Automation</p>
          <h3>Categorization Rules</h3>
          <p class="status-line">Edit saved matching criteria, rerun rules across existing transactions, or delete rules that are too broad.</p>
        </div>
        <button id="rerunAllRules" class="btn btn-secondary" type="button" ${categoryRules.length ? "" : "disabled"}>Rerun All Category Rules</button>
      </div>
      ${categoryRules.length ? rulesTable(categoryRules) : `<div class="empty-state compact">No category rules yet. Use Apply Rule from a transaction or review card to create one.</div>`}
    </section>
    <section class="panel rules-panel" style="margin-top:1rem">
      <h3>Vendor Cleanup Rules</h3>
      <p class="status-line">Vendor rules clean up noisy descriptions before categorization and AI analysis.</p>
      ${vendorRules.length ? vendorRulesTable(vendorRules) : `<div class="empty-state compact">No vendor cleanup rules yet.</div>`}
    </section>
  `;
  bindRuleControls(tab);
}

function rulesTable(rules) {
  const sortedRules = sortedRulesForTable(rules, "category");
  return `<div class="table-wrap rules-table-wrap" tabindex="0" aria-label="Scrollable categorization rules table"><table class="rules-table"><thead><tr>${ruleSortHeader("category", "type", "Match Field")}${ruleSortHeader("category", "match", "Criteria")}${ruleSortHeader("category", "category", "Category")}${ruleSortHeader("category", "matches", "Matches")}${ruleSortHeader("category", "createdAt", "Created")}<th>Actions</th></tr></thead><tbody>${sortedRules.map((rule) => `<tr data-rule-id="${escapeAttr(rule.id)}"><td><select data-rule-field="type"><option value="merchant" ${rule.type === "merchant" ? "selected" : ""}>Merchant or vendor</option><option value="description" ${rule.type === "description" ? "selected" : ""}>Description</option></select></td><td><input data-rule-field="match" value="${escapeAttr(rule.match)}" aria-label="Rule match criteria"></td><td><select data-rule-field="category">${categoryOptions(rule.category || "")}</select></td><td>${ruleMatchCount(rule)}</td><td>${escapeHtml((rule.createdAt || "").slice(0, 10) || "Unknown")}</td><td class="table-action-cell"><button class="mini-btn" data-rule-action="save" type="button">Save</button><button class="mini-btn" data-rule-action="rerun" type="button">Rerun</button><button class="mini-btn danger" data-rule-action="delete" type="button">Delete</button></td></tr>`).join("")}</tbody></table></div>`;
}

function vendorRulesTable(rules) {
  const sortedRules = sortedRulesForTable(rules, "vendor");
  return `<div class="table-wrap rules-table-wrap" tabindex="0" aria-label="Scrollable vendor rules table"><table class="rules-table"><thead><tr>${ruleSortHeader("vendor", "match", "Criteria")}${ruleSortHeader("vendor", "vendor", "Vendor")}${ruleSortHeader("vendor", "matches", "Matches")}${ruleSortHeader("vendor", "createdAt", "Created")}<th>Actions</th></tr></thead><tbody>${sortedRules.map((rule) => `<tr data-rule-id="${escapeAttr(rule.id)}"><td><input data-rule-field="match" value="${escapeAttr(rule.match)}" aria-label="Vendor rule match criteria"></td><td><input data-rule-field="vendor" value="${escapeAttr(rule.vendor || "")}" aria-label="Vendor name"></td><td>${vendorRuleMatchCount(rule)}</td><td>${escapeHtml((rule.createdAt || "").slice(0, 10) || "Unknown")}</td><td class="table-action-cell"><button class="mini-btn" data-rule-action="save" type="button">Save</button><button class="mini-btn" data-rule-action="rerun" type="button">Rerun</button><button class="mini-btn danger" data-rule-action="delete" type="button">Delete</button></td></tr>`).join("")}</tbody></table></div>`;
}

function ruleSortHeader(table, key, label) {
  const sort = rulesSortState[table];
  const active = sort.key === key;
  const directionLabel = active ? sort.direction === "asc" ? "ascending" : "descending" : "none";
  const indicator = active ? sort.direction === "asc" ? "^" : "v" : "-";
  return `<th aria-sort="${directionLabel}"><button class="table-sort-button" data-rule-sort-table="${table}" data-rule-sort-key="${key}" type="button">${escapeHtml(label)} <span aria-hidden="true">${indicator}</span></button></th>`;
}

function sortedRulesForTable(rules, table) {
  const sort = rulesSortState[table];
  if (!sort.key) return rules;
  const direction = sort.direction === "desc" ? -1 : 1;
  return rules.slice().sort((a, b) => compareRuleSortValues(ruleSortValue(a, sort.key, table), ruleSortValue(b, sort.key, table)) * direction);
}

function ruleSortValue(rule, key, table) {
  if (key === "matches") return table === "vendor" ? vendorRuleMatchCount(rule) : ruleMatchCount(rule);
  if (key === "type") return rule.type === "description" ? "Description" : "Merchant or vendor";
  return rule[key] || "";
}

function compareRuleSortValues(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).toLowerCase().localeCompare(String(b).toLowerCase(), undefined, { numeric: true, sensitivity: "base" });
}

function updateRuleFromRow(row) {
  const rule = state.rules.find((item) => item.id === row?.dataset.ruleId);
  if (!rule) return null;
  row.querySelectorAll("[data-rule-field]").forEach((input) => { rule[input.dataset.ruleField] = sanitize(input.value); });
  return rule;
}

function bindRuleControls(root) {
  root.querySelector("#rerunAllRules")?.addEventListener("click", () => {
    let updated = 0;
    state.rules.filter((rule) => rule.type !== "vendor").forEach((rule) => { updated += applyCategoryRuleToTransactions(rule, state.transactions); });
    renderAll();
    showStatus(`Category rules rerun. ${updated} transaction matches updated.`);
  });
  root.querySelectorAll("[data-rule-action]").forEach((button) => button.addEventListener("click", () => {
    const row = button.closest("[data-rule-id]");
    const rule = state.rules.find((item) => item.id === row?.dataset.ruleId);
    if (!rule) return;
    if (button.dataset.ruleAction === "delete") {
      if (!window.confirm("Delete this saved rule? Existing transaction categories will not be reverted.")) return;
      state.rules = state.rules.filter((item) => item.id !== rule.id);
      renderAll();
      showStatus("Rule deleted.");
      return;
    }
    updateRuleFromRow(row);
    const updated = rule.type === "vendor" ? applyVendorRulesToTransactions(state.transactions, state) : button.dataset.ruleAction === "rerun" ? applyCategoryRuleToTransactions(rule, state.transactions) : 0;
    renderAll();
    showStatus(button.dataset.ruleAction === "rerun" ? `Rule rerun. ${updated} transaction matches updated.` : "Rule saved.");
  }));
  root.querySelectorAll("[data-rule-sort-key]").forEach((button) => button.addEventListener("click", () => {
    root.querySelectorAll("[data-rule-id]").forEach(updateRuleFromRow);
    const sort = rulesSortState[button.dataset.ruleSortTable];
    if (!sort) return;
    if (sort.key === button.dataset.ruleSortKey) {
      sort.direction = sort.direction === "asc" ? "desc" : "asc";
    } else {
      sort.key = button.dataset.ruleSortKey;
      sort.direction = "asc";
    }
    renderRules();
  }));
}

function ruleMatchCount(rule) {
  return state.transactions.filter((tx) => categoryRuleMatches(rule, tx)).length;
}

function vendorRuleMatchCount(rule) {
  return state.transactions.filter((tx) => vendorRuleMatches(rule, tx)).length;
}

function renderCategories() {
  const tab = document.getElementById("categoriesTab");
  const parentOptions = parentCategoryOptions("");
  seedExpandedCategories();
  tab.innerHTML = `
    <div class="split-panel">
      <section class="panel"><h3>Categories</h3><p class="status-line">Categories are grouped like folders and can be nested multiple levels deep, such as Side Businesses → Cuyle's Customs → Apparel Expense.</p>${categoryTreeControls()}${categoryTreeView()}</section>
      <aside class="panel"><h3>Create or merge category</h3><div class="field"><label for="newCategoryParent">Parent category</label><select id="newCategoryParent"><option value="">Top-level category</option>${parentOptions}</select></div><div class="field"><label for="newCategory">New category or subcategory</label><input id="newCategory" placeholder="Example: Sports and Activities"></div><button id="addCategory" class="btn btn-primary" type="button">Create Category</button><hr style="margin:1rem 0;border:0;border-top:1px solid var(--financial-line)"><div class="field"><label for="mergeFrom">Merge from</label><select id="mergeFrom">${categoryOptions("")}</select></div><div class="field"><label for="mergeTo">Merge to</label><select id="mergeTo">${categoryOptions("")}</select></div><button id="mergeCategory" class="btn btn-secondary" type="button">Merge Categories</button></aside>
    </div>
  `;
  document.getElementById("categoryFilter")?.addEventListener("input", (event) => {
    const caret = event.target.selectionStart || event.target.value.length;
    categoryFilterTerm = event.target.value;
    renderCategories();
    requestAnimationFrame(() => {
      const next = document.getElementById("categoryFilter");
      next?.focus();
      next?.setSelectionRange(caret, caret);
    });
  });
  document.getElementById("categorySort")?.addEventListener("change", (event) => {
    categorySortMode = event.target.value;
    renderCategories();
  });
  tab.querySelectorAll(".category-tree-branch").forEach((branch) => branch.addEventListener("toggle", () => {
    if (branch.open) categoryExpandedIds.add(branch.dataset.categoryId);
    else categoryExpandedIds.delete(branch.dataset.categoryId);
  }));
  tab.querySelectorAll("[data-cat-report]").forEach((button) => button.addEventListener("click", () => {
    selectedCategoryReportId = button.dataset.catReport;
    categoryExpandedIds.add(selectedCategoryReportId);
    renderCategories();
  }));
  tab.querySelectorAll(".compact-category-row input, .compact-category-row select, .compact-category-row button").forEach((control) => {
    control.addEventListener("click", (event) => event.stopPropagation());
    control.addEventListener("keydown", (event) => event.stopPropagation());
  });
  tab.querySelectorAll("[data-cat-save]").forEach((button) => button.addEventListener("click", () => {
    const node = button.closest("[data-category-id]");
    const category = state.categories.find((item) => item.id === node.dataset.categoryId);
    if (!category) return;
    const snapshot = transactionSnapshot();
    const previousName = category.name;
    const previousBaseName = categoryBaseName(category);
    const parentId = node.querySelector("[data-cat-parent]")?.value || "";
    const parent = state.categories.find((item) => item.id === parentId);
    const nextBaseName = sanitize(node.querySelector("[data-cat-name]").value);
    const nextName = categoryPathName(parent, nextBaseName);
    if (!nextName) return;
    if (state.categories.some((cat) => cat.id !== category.id && cat.name.toLowerCase() === nextName.toLowerCase())) return showStatus("That category already exists.");
    if (category.system && previousBaseName.toLowerCase() !== nextBaseName.toLowerCase()) rememberRenamedDefaultCategory(previousName, previousBaseName);
    state.transactions.filter((tx) => tx.category === previousName).forEach((tx) => { tx.category = nextName; });
    category.name = nextName;
    category.parentId = parentId || "";
    updateChildCategoryNames(category);
    renderAndSaveCategories(snapshot);
  }));
  tab.querySelectorAll("[data-cat-delete]").forEach((button) => button.addEventListener("click", () => {
    const node = button.closest("[data-category-id]");
    const category = state.categories.find((item) => item.id === node.dataset.categoryId);
    if (!category) return;
    if (childCategories(category.id).length) return showStatus("Move or delete nested categories before deleting this parent category.");
    if (!window.confirm(`Delete ${category.name}? Transactions will become Uncategorized.`)) return;
    const snapshot = transactionSnapshot();
    state.transactions.filter((tx) => tx.category === category.name).forEach((tx) => { tx.category = "Uncategorized"; tx.needsReview = true; });
    if (category.system) {
      state.profile.deletedDefaultCategories = Array.from(new Set([...(state.profile.deletedDefaultCategories || []), category.name]));
      state.profile.deletedDefaultCategoryIds = Array.from(new Set([...(state.profile.deletedDefaultCategoryIds || []), category.id]));
    }
    pendingCategoryDeletes.add(category.id);
    state.categories = state.categories.filter((item) => item.id !== category.id);
    categoryExpandedIds.delete(category.id);
    renderAndSaveCategories(snapshot);
  }));
  tab.querySelectorAll("[data-cat-add-child]").forEach((button) => button.addEventListener("click", () => {
    const parentId = button.closest("[data-category-id]")?.dataset.categoryId;
    const parent = state.categories.find((cat) => cat.id === parentId);
    if (!parent) return;
    const baseName = sanitize(window.prompt(`Add child under ${categoryBaseName(parent)}:`, "") || "");
    const name = categoryPathName(parent, baseName);
    if (!name) return;
    if (state.categories.some((cat) => cat.name.toLowerCase() === name.toLowerCase())) return showStatus("That category already exists.");
    const newCategory = { id: uniqueId("cat"), name, parentId, system: false };
    state.categories.push(newCategory);
    selectedCategoryReportId = newCategory.id;
    categoryExpandedIds.add(parentId);
    renderAndSaveCategories();
  }));
  document.getElementById("addCategory").addEventListener("click", () => {
    const parentId = document.getElementById("newCategoryParent").value;
    const parent = state.categories.find((cat) => cat.id === parentId);
    const baseName = sanitize(document.getElementById("newCategory").value);
    const name = categoryPathName(parent, baseName);
    if (!name || state.categories.some((cat) => cat.name.toLowerCase() === name.toLowerCase())) return;
    const newCategory = { id: uniqueId("cat"), name, parentId: parentId || "", system: false };
    state.categories.push(newCategory);
    selectedCategoryReportId = newCategory.id;
    if (parentId) categoryExpandedIds.add(parentId);
    renderAndSaveCategories();
  });
  document.getElementById("mergeCategory").addEventListener("click", () => {
    const from = document.getElementById("mergeFrom").value;
    const to = document.getElementById("mergeTo").value;
    if (!from || !to || from === to) return;
    const snapshot = transactionSnapshot();
    state.transactions.filter((tx) => tx.category === from).forEach((tx) => { tx.category = to; });
    state.categories.filter((cat) => cat.name === from && !cat.system).forEach((cat) => pendingCategoryDeletes.add(cat.id));
    state.categories = state.categories.filter((cat) => cat.name !== from || cat.system);
    renderAndSaveCategories(snapshot);
  });
}

function seedExpandedCategories() {
  if (categoryExpansionInitialized) return;
  repairCategoryParents();
  state.categories.forEach((category) => {
    if (state.categories.some((item) => item.parentId === category.id)) categoryExpandedIds.add(category.id);
  });
  categoryExpansionInitialized = true;
}

function resetCategoryExpansion() {
  categoryExpandedIds.clear();
  categoryExpansionInitialized = false;
  selectedCategoryReportId = "";
}

function categoryTreeControls() {
  return `<div class="category-toolbar"><div class="field"><label for="categoryFilter">Filter categories</label><input id="categoryFilter" value="${escapeAttr(categoryFilterTerm)}" placeholder="Search category, parent, or vendor bucket"></div><div class="field"><label for="categorySort">Sort categories</label><select id="categorySort"><option value="name-asc" ${categorySortMode === "name-asc" ? "selected" : ""}>Name A–Z</option><option value="name-desc" ${categorySortMode === "name-desc" ? "selected" : ""}>Name Z–A</option><option value="total-desc" ${categorySortMode === "total-desc" ? "selected" : ""}>Highest total</option><option value="count-desc" ${categorySortMode === "count-desc" ? "selected" : ""}>Most transactions</option></select></div></div>`;
}

function categoryTreeView() {
  const parents = groupedCategories().filter(categoryVisible);
  if (!parents.length) return `<div class="empty-state">No categories match the current filter.</div>`;
  return `<div class="category-tree" aria-label="Category hierarchy">${parents.map((category) => categoryTreeBranch(category, 0)).join("")}</div>`;
}

function categoryTreeBranch(category, depth = 0) {
  const children = childCategories(category.id).filter(categoryVisible);
  if (!children.length) return categoryTreeLeaf(category, depth);
  const isOpen = categoryExpandedIds.has(category.id) || Boolean(categoryFilterTerm);
  const drilldown = category.id === selectedCategoryReportId ? categoryDrilldown(category) : "";
  return `<details class="category-tree-branch depth-${Math.min(depth, 5)}" data-category-id="${escapeAttr(category.id)}" ${isOpen ? "open" : ""}><summary class="category-tree-summary compact-category-row"><span class="tree-icon" aria-hidden="true"></span>${categoryInlineControls(category, children.length)}</summary>${drilldown}<div class="category-tree-children">${children.map((child) => categoryTreeBranch(child, depth + 1)).join("")}</div></details>`;
}

function categoryTreeLeaf(category, depth = 0) {
  const parent = parentCategory(category);
  const drilldown = category.id === selectedCategoryReportId ? categoryDrilldown(category) : "";
  return `<div class="category-tree-leaf ${parent ? "is-child" : "is-parent"} depth-${Math.min(depth, 5)}" data-category-id="${escapeAttr(category.id)}"><div class="category-tree-summary compact-category-row"><span class="tree-file" aria-hidden="true"></span>${categoryInlineControls(category, 0)}</div>${drilldown}</div>`;
}

function categoryInlineControls(category, childCount = 0) {
  const parent = parentCategory(category);
  const meta = childCount ? `${childCount} ${childCount === 1 ? "child" : "children"}` : parent ? "" : category.system ? "Default" : "Top level";
  const metaHtml = `<span class="tree-count"${meta ? "" : " aria-hidden='true'"}>${escapeHtml(meta)}</span>`;
  return `<input class="category-inline-input" data-cat-name aria-label="Category" value="${escapeAttr(categoryBaseName(category))}" title="${escapeAttr(category.name)}"><select class="category-parent-select" data-cat-parent aria-label="Parent category"><option value="">Top-level category</option>${parentCategoryOptions(category.parentId || "", category.id)}</select>${metaHtml}<button class="mini-btn" data-cat-save type="button">Save</button><button class="mini-btn" data-cat-report="${escapeAttr(category.id)}" type="button">Totals</button><button class="mini-btn" data-cat-add-child type="button">+ Add Child</button><button class="mini-btn danger" data-cat-delete type="button">Delete</button>`;
}

function createProfile() {
  const name = window.prompt("Financial profile name:", state.profile.name || "Household Profile");
  if (!name) return;
  state.profile.name = sanitize(name);
  showApp("user");
}

async function deleteProfileData() {
  if (!window.confirm("Permanently delete imported transactions and this shared household financial profile for every member? This cannot be undone.")) return;
  if (!window.confirm("Confirm permanent deletion of Fennington Financial shared workspace data.")) return;
  if (mode === "user" && currentUser && db) {
    const profileRef = sharedProfileRef();
    for (const name of profileCollectionNames) {
      const snap = await getDocs(collection(profileRef, name));
      await Promise.all(snap.docs.map((item) => deleteDoc(item.ref)));
    }
    await deleteDoc(doc(profileRef, "settings", "income"));
    await deleteDoc(profileRef);
  }
  state = emptyState();
  resetCategoryExpansion();
  renderAll();
  showStatus("Financial profile data deleted.");
}

function makeTransaction(row, id) {
  const description = sanitize(row.description);
  const merchant = sanitize(row.merchant || normalizeMerchant(description));
  const tx = {
    id,
    date: normalizeDate(row.date),
    description,
    merchant,
    vendor: sanitize(row.vendor || detectVendorFromDescription(description) || merchant),
    accountId: row.accountId,
    amount: round(Number(row.amount || 0)),
    category: "Uncategorized",
    type: Number(row.amount || 0) >= 0 ? "income" : "expense",
    confidence: 0,
    source: "Uncategorized review queue",
    reason: "No matching rule found.",
    recurringStatus: "none",
    notes: "",
    needsReview: true,
    flags: [],
    importDirection: row.importDirection || "",
    importId: row.importId || "manual",
    flowType: "uncategorized",
    reportingType: "review",
    transferGroupId: "",
    transferPeerTransactionId: "",
    counterpartyAccountId: "",
    transferDirection: "",
    transferStatus: "",
    flowConfidence: 0,
    flowReason: "Flow classification is pending review.",
    flowSource: "auto",
    splits: [],
    splitStatus: "none",
    splitTotal: 0,
    itemizationSource: "",
    itemizationMatchConfidence: 0
  };
  return tx;
}

function applyCategorization(tx, sourceState) {
  const threshold = Number(sourceState.profile.confidenceThreshold || 78);
  applyVendorRules(tx, sourceState);
  tx.flags = (tx.flags || []).filter((flag) => !["low_confidence", "uncategorized", "possible_transfer", "unusually_high_amount"].includes(flag));
  const haystack = `${tx.description} ${tx.merchant} ${tx.vendor || ""}`;
  const userRule = sourceState.rules.find((rule) => categoryRuleMatches(rule, tx));
  if (userRule) return setCategory(tx, userRule.category, 100, "User rule", "Matched a user-created categorization rule.");
  const mapping = sourceState.merchantMappings.find((item) => item.merchant.toLowerCase() === tx.merchant.toLowerCase());
  if (mapping) return setCategory(tx, mapping.category, 96, "Confirmed merchant mapping", "Matched a previously confirmed merchant mapping.");
  const builtIn = BUILT_IN_RULES.find((rule) => rule.match.test(haystack));
  if (builtIn) {
    if (builtIn.merchant) tx.merchant = builtIn.merchant;
    setCategory(tx, builtIn.category, builtIn.confidence, "Built-in merchant keyword", "Matched built-in merchant keyword rules.", builtIn.type);
  }
  if (tx.amount > 0 && /credit card payment|payment thank you|online payment received|refund|reimbursement/i.test(haystack)) {
    setCategory(tx, ACCOUNT_CREDIT_CATEGORY, Math.max(82, tx.confidence || 0), "Built-in merchant keyword", "Positive credits are tracked separately from income and spending.", "transfer");
  }
  if (Math.abs(tx.amount) > 1000 && tx.type === "expense") tx.flags.push("unusually_high_amount");
  if (isTransferCategory(tx.category) || tx.type === "transfer") tx.flags.push("possible_transfer");
  if (tx.confidence < threshold || tx.category === "Uncategorized") {
    tx.needsReview = true;
    tx.flags.push(tx.category === "Uncategorized" ? "uncategorized" : "low_confidence");
  }
  tx.flags = Array.from(new Set(tx.flags));
}

function setCategory(tx, category, confidence, source, reason, type) {
  tx.category = category;
  tx.confidence = confidence;
  tx.source = source;
  tx.reason = reason;
  tx.type = type || typeForCategory(category, tx.amount);
  tx.needsReview = false;
}

function typeForCategory(category, amount = 0) {
  if (category === "Income") return "income";
  if (category === TRANSFER_CATEGORY || category === ACCOUNT_CREDIT_CATEGORY) return "transfer";
  return Number(amount || 0) >= 0 ? "income" : "expense";
}

function isTransferCategory(category) {
  return category === TRANSFER_CATEGORY || category === ACCOUNT_CREDIT_CATEGORY;
}

function isAccountCredit(tx) {
  return tx.category === ACCOUNT_CREDIT_CATEGORY || (tx.amount > 0 && state.accounts.find((account) => account.id === tx.accountId)?.type === "credit");
}

async function categorizeWithServer(imported) {
  if (!currentUser || mode !== "user") return;
  applyVendorRulesToTransactions(imported, state);
  const candidates = imported.filter((tx) => tx.needsReview).slice(0, 20).map((tx) => ({ id: tx.id, description: tx.description, merchant: tx.merchant, vendor: transactionVendor(tx), amount: tx.amount }));
  if (!candidates.length) return;
  try {
    const token = await currentUser.getIdToken();
    const response = await fetch(financialApiUrl("/financial/categorize"), { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ transactions: candidates, categories: state.categories.map((cat) => cat.name) }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "AI categorization failed.");
    (body.results || []).forEach((result) => {
      const tx = state.transactions.find((item) => item.id === result.id);
      if (!tx || Number(result.confidence || 0) < tx.confidence) return;
      tx.vendor = sanitize(result.vendor || tx.vendor || tx.merchant);
      tx.merchant = sanitize(result.merchant || tx.merchant);
      tx.category = state.categories.some((cat) => cat.name === result.category) ? result.category : "Uncategorized";
      tx.confidence = Math.max(0, Math.min(100, Number(result.confidence || 0)));
      tx.reason = sanitize(result.reason || "AI categorization based on transaction description only.");
      tx.source = "AI";
      tx.type = typeForCategory(tx.category, tx.amount);
      tx.needsReview = tx.confidence < Number(state.profile.confidenceThreshold || 78) || tx.category === "Uncategorized";
    });
    renderAll();
  } catch (error) {
    showStatus(`Server categorization skipped: ${error.message}`);
  }
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"' && quoted && next === '"') { cell += '"'; i += 1; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function autoMap(headers) {
  const find = (...patterns) => headers.find((header) => patterns.some((pattern) => pattern.test(header))) || "";
  return { date: find(/date/i, /posted/i), description: find(/description/i, /merchant/i, /name/i, /memo/i), amount: find(/^amount$/i, /transaction amount/i), debit: find(/debit/i, /withdrawal/i, /charge/i), credit: find(/credit/i, /deposit/i), account: find(/account/i), type: find(/type/i), balance: find(/balance/i) };
}

function buildImportPreview(options = {}) {
  if (options.captureControls !== false) captureMapping();
  const rows = pendingImport.rows.map((row) => normalizeImportRow(row)).filter((row) => row.date && row.description && Number.isFinite(row.amount));
  const dates = rows.map((row) => row.date).sort();
  const accountNames = Array.from(new Set(rows.map((row) => row.accountName)));
  return { rows, count: rows.length, range: dates.length ? `${dates[0]} to ${dates[dates.length - 1]}` : "Not detected", debits: rows.filter((row) => row.amount < 0).reduce((sum, row) => sum + Math.abs(row.amount), 0), credits: rows.filter((row) => row.amount > 0).reduce((sum, row) => sum + row.amount, 0), duplicates: rows.filter((row) => isDuplicate(row, state.transactions)).length, accountName: accountNames.length > 1 ? `${accountNames.length} accounts: ${accountNames.join(", ")}` : accountNames[0] || pendingImport.accountName || "Imported Account" };
}

function normalizeImportRow(row) {
  const map = pendingImport.mapping;
  let amount = 0;
  let importDirection = "";
  const hasSplitAmountColumns = Boolean(map.debit || map.credit);
  const creditAmount = map.credit ? parseMoney(row[map.credit]) : 0;
  const debitAmount = map.debit ? parseMoney(row[map.debit]) : 0;
  if (hasSplitAmountColumns) amount = Math.abs(creditAmount) - Math.abs(debitAmount);
  else amount = parseMoney(row[map.amount]);
  if (Math.abs(creditAmount) > 0) importDirection = "credit";
  else if (Math.abs(debitAmount) > 0) importDirection = "debit";
  if (!hasSplitAmountColumns && pendingImport.expensesPositive && amount > 0 && !/credit|deposit|income|payroll/i.test(row[map.type] || row[map.description] || "")) amount = -amount;
  return { date: normalizeDate(row[map.date]), description: sanitize(row[map.description]), merchant: normalizeMerchant(row[map.description]), amount: round(amount), importDirection, accountName: sanitize(row[map.account] || row.__sourceAccountName || pendingImport.accountName), sourceFileName: row.__sourceFileName || pendingImport.fileName };
}

function inferAccountName(file) {
  const relativePath = sanitize(file.webkitRelativePath || "");
  const parts = relativePath.split(/[\\/]/).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2].replace(/[-_]+/g, " ");
  return file.name.replace(/\.csv$/i, "").replace(/[-_]+/g, " ");
}

function flagDuplicates(imported, existing) {
  imported.forEach((tx) => {
    const duplicate = existing.find((old) => duplicateKey(old) === duplicateKey(tx)) || imported.find((other) => other !== tx && duplicateKey(other) === duplicateKey(tx));
    if (duplicate) {
      tx.flags.push("possible_duplicate");
      tx.duplicateOf = duplicate.id;
      tx.needsReview = true;
    }
  });
}

function isDuplicate(row, existing) {
  return existing.some((tx) => tx.date === row.date && round(tx.amount) === round(row.amount) && tx.description.toLowerCase() === row.description.toLowerCase());
}

function duplicateKey(tx) {
  return `${tx.accountId}|${tx.date}|${round(tx.amount)}|${tx.description.toLowerCase()}`;
}

function monthlySummary(month) {
  const txs = state.transactions.filter((tx) => transactionReportingMonth(tx) === month);
  const transferDatedTxs = state.transactions.filter((tx) => tx.date?.startsWith(month));
  const actualIncome = round(txs.filter(isReportableIncome).reduce((sum, tx) => sum + tx.amount, 0));
  const spending = round(txs.filter(isReportableExpense).reduce((sum, tx) => sum + reportableExpenseAmount(tx), 0));
  const internalTransfersIn = round(transferDatedTxs.filter((tx) => isInternalFlow(tx) && tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0));
  const internalTransfersOut = round(transferDatedTxs.filter((tx) => isInternalFlow(tx) && tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0));
  const internalTransferVolume = round(Math.max(internalTransfersIn, internalTransfersOut));
  const creditCardPayments = round(transferDatedTxs.filter((tx) => tx.flowType === "credit_card_payment" && tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0));
  const unmatchedRows = transferDatedTxs.filter((tx) => tx.transferStatus === "unmatched" || tx.transferStatus === "ambiguous");
  const unmatchedTransfers = { count: unmatchedRows.length, total: round(unmatchedRows.reduce((sum, tx) => sum + Math.abs(tx.amount), 0)) };
  const recurring = txs.filter((tx) => tx.recurringStatus === "confirmed" || state.recurring.some((item) => item.merchant === tx.merchant && item.status !== "rejected")).reduce((sum, tx) => isReportableExpense(tx) ? sum + reportableExpenseAmount(tx) : sum, 0);
  const byCategory = categoryTotalsForTransactions(txs);
  const splitReviewCount = txs.filter((tx) => tx.splitStatus === "needs_split_review").length;
  const netCashFlow = round(actualIncome - spending);
  return { actualIncome, spending, payments: creditCardPayments, netSpending: spending, netCashFlow, remaining: netCashFlow, internalTransfersIn, internalTransfersOut, internalTransferVolume, creditCardPayments, unmatchedTransfers, recurring: round(recurring), reviewCount: txs.filter((tx) => tx.needsReview).length, splitReviewCount, byCategory };
}

function summaryCard(title, value, tone, note = "") {
  const display = typeof value === "number" && title.includes("Transactions") ? String(value) : typeof value === "number" ? money(value) : escapeHtml(value);
  return `<article class="summary-card ${tone || ""}"><span>${escapeHtml(title)}</span><strong>${display}</strong>${note ? `<small class="muted">${escapeHtml(note)}</small>` : ""}</article>`;
}

function categoryBars(data) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `<div class="empty-state">No spending data for this period.</div>`;
  const max = Math.max(...entries.map((entry) => entry[1]));
  return entries.map(([name, value]) => `<div class="bar-row"><div class="bar-label"><span>${escapeHtml(name)}</span><span>${money(value)}</span></div><div class="bar-track"><span class="bar-fill" style="width:${Math.max(4, (value / max) * 100)}%"></span></div></div>`).join("");
}

function quickStatus(summary) {
  return `<p><span class="tag good">Outside income</span> ${money(summary.actualIncome)}</p><p><span class="tag danger">Outside spending</span> ${money(summary.spending)}</p><p><span class="tag warn">Internal movement</span> ${money(summary.internalTransferVolume)} ignored for income and spending.</p><p><span class="tag warn">Split categories</span> Reconciled split/itemized purchases feed category totals.</p><p><span class="tag warn">Card timing</span> Purchases count on purchase dates; later card payments stay internal.</p><p><span class="tag warn">Review</span> ${summary.reviewCount} transactions need attention; ${summary.splitReviewCount} split/itemized items need reconciliation.</p>`;
}

function filteredTransactions() {
  return state.transactions.filter((tx) => {
    const f = state.filters;
    const splitText = (tx.splits || []).map((split) => `${split.description} ${split.category} ${split.merchant}`).join(" ");
    const haystack = `${tx.description} ${tx.merchant} ${tx.vendor || ""} ${splitText}`.toLowerCase();
    if (f.search && !haystack.includes(f.search.toLowerCase())) return false;
    if (f.start && tx.date < f.start) return false;
    if (f.end && tx.date > f.end) return false;
    if (f.month && !tx.date.startsWith(f.month)) return false;
    if (f.account && tx.accountId !== f.account) return false;
    if (f.category && !categoryMatchesTransaction(tx, f.category)) return false;
    if (f.merchant && !tx.merchant.toLowerCase().includes(f.merchant.toLowerCase())) return false;
    if (f.vendor && !transactionVendor(tx).toLowerCase().includes(f.vendor.toLowerCase())) return false;
    if (f.hideCredits && isAccountCredit(tx)) return false;
    if (f.type === "review" && !tx.needsReview) return false;
    if (f.type === "uncategorized" && tx.category !== "Uncategorized") return false;
    if (["income", "expense", "transfer"].includes(f.type) && tx.type !== f.type) return false;
    if (f.flow === "internal" && !isInternalFlow(tx)) return false;
    if (f.flow === "review" && tx.reportingType !== "review") return false;
    if (f.flow === "unmatched" && tx.transferStatus !== "unmatched") return false;
    if (f.flow === "ambiguous" && tx.transferStatus !== "ambiguous") return false;
    if (["external_income", "external_expense", "credit_card_payment"].includes(f.flow) && tx.flowType !== f.flow) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));
}

function reviewQueue(applyReasonFilters = true) {
  const recurringMerchants = new Set(state.recurring.filter((item) => item.status === "suggested").map((item) => item.merchant));
  const selectedReasons = applyReasonFilters ? reviewReasonFilterSet() : new Set();
  return state.transactions.filter((tx) => {
    if (!(tx.needsReview || tx.reportingType === "review" || tx.splitStatus === "needs_split_review" || tx.category === "Uncategorized" || tx.flags?.length || recurringMerchants.has(tx.merchant))) return false;
    if (!selectedReasons.size) return true;
    const reasons = reviewReasonsForTransaction(tx, recurringMerchants);
    return reasons.some((reason) => selectedReasons.has(reason));
  }).sort((a, b) => b.date.localeCompare(a.date));
}

function reviewReasonFilterSet() {
  return new Set(Array.isArray(state.filters.reviewReasons) ? state.filters.reviewReasons : []);
}

function reviewReasonCounts() {
  const counts = new Map(REVIEW_REASON_DEFINITIONS.map((reason) => [reason.key, 0]));
  const recurringMerchants = new Set(state.recurring.filter((item) => item.status === "suggested").map((item) => item.merchant));
  reviewQueue(false).forEach((tx) => {
    reviewReasonsForTransaction(tx, recurringMerchants).forEach((reason) => counts.set(reason, (counts.get(reason) || 0) + 1));
  });
  return counts;
}

function reviewReasonsForTransaction(tx, recurringMerchants = null) {
  const reasons = [];
  const flags = new Set(tx.flags || []);
  if (tx.category === "Uncategorized" || flags.has("uncategorized")) reasons.push("uncategorized");
  if (flags.has("low_confidence") || (tx.needsReview && tx.category !== "Uncategorized" && Number(tx.confidence || 0) < Number(state.profile.confidenceThreshold || 78))) reasons.push("low_confidence");
  if (flags.has("possible_transfer") || tx.transferStatus === "unmatched" || tx.transferStatus === "ambiguous") reasons.push("possible_transfer");
  if (flags.has("possible_duplicate")) reasons.push("possible_duplicate");
  if ((recurringMerchants || new Set(state.recurring.filter((item) => item.status === "suggested").map((item) => item.merchant))).has(tx.merchant)) reasons.push("recurring");
  if (flags.has("unusually_high_amount")) reasons.push("unusually_high_amount");
  if (tx.splitStatus === "needs_split_review" || flags.has("split_review")) reasons.push("split_review");
  if (tx.reportingType === "review") reasons.push("flow_review");
  if (!reasons.length && (tx.needsReview || flags.size)) reasons.push("other");
  return Array.from(new Set(reasons));
}

function reviewReasonLabel(key) {
  return REVIEW_REASON_DEFINITIONS.find((reason) => reason.key === key)?.label || label(String(key).replace(/_/g, " "));
}

function detectRecurring(transactions) {
  const groups = new Map();
  transactions.filter((tx) => isReportableExpense(tx) && Math.abs(tx.amount) > 0).forEach((tx) => {
    const key = tx.merchant.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tx);
  });
  return Array.from(groups.values()).map(recurringFromMerchantGroup).filter(Boolean).sort((a, b) => b.confidence - a.confidence);
}

function recurringFromMerchantGroup(items) {
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
  const monthlyBuckets = Array.from(sorted.reduce((map, tx) => {
    const month = tx.date.slice(0, 7);
    if (!map.has(month)) map.set(month, { month, total: 0, payments: [], lastDate: tx.date });
    const bucket = map.get(month);
    bucket.total = round(bucket.total + Math.abs(tx.amount));
    bucket.payments.push(tx);
    if (tx.date > bucket.lastDate) bucket.lastDate = tx.date;
    return map;
  }, new Map()).values()).sort((a, b) => a.month.localeCompare(b.month));
  if (monthlyBuckets.length < 3 || !hasMonthlyCadence(monthlyBuckets)) return null;

  const totals = monthlyBuckets.map((bucket) => bucket.total);
  const fit = recurringAmountFit(totals);
  if (!fit) return null;

  const lastBucket = monthlyBuckets[monthlyBuckets.length - 1];
  const lastPayment = lastBucket.payments.slice().sort((a, b) => a.date.localeCompare(b.date)).pop();
  const currentYear = String(new Date().getFullYear());
  const ytdPayments = sorted.filter((tx) => tx.date.startsWith(currentYear));
  const paymentCount = monthlyBuckets.reduce((sum, bucket) => sum + bucket.payments.length, 0);
  const flags = [...fit.flags];
  const nextDate = new Date(`${lastBucket.lastDate}T00:00:00Z`);
  nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
  const expectedNextDate = nextDate.toISOString().slice(0, 10);
  if (monthsBetween(lastBucket.month, monthKey(new Date())) > 1) flags.push("missing expected charge");

  return {
    id: slug(`${lastPayment.merchant}-monthly`),
    merchant: lastPayment.merchant,
    description: lastPayment.description || lastPayment.merchant,
    expectedAmount: round(fit.expectedAmount),
    averageAmount: round(totals.reduce((a, b) => a + b, 0) / totals.length),
    frequency: "monthly",
    expectedNextDate,
    lastPaymentDate: lastBucket.lastDate,
    paymentCount,
    totalPaidYtd: round(ytdPayments.reduce((sum, tx) => sum + Math.abs(tx.amount), 0)),
    confidence: Math.min(98, Math.round(66 + monthlyBuckets.length * 6 + fit.consistencyScore)),
    category: lastPayment.category,
    status: "suggested",
    flags
  };
}

function recurringAmountFit(totals) {
  const clusters = clusterAmounts(totals);
  const latestTotal = totals[totals.length - 1];
  const latestCluster = clusters.find((cluster) => amountsClose(cluster.average, latestTotal));
  const primaryCluster = clusters.slice().sort((a, b) => b.values.length - a.values.length)[0];
  if (primaryCluster && primaryCluster.values.length === totals.length) {
    return { expectedAmount: latestTotal, consistencyScore: 18, flags: [] };
  }
  if (primaryCluster && primaryCluster.values.length >= Math.max(3, Math.ceil(totals.length * 0.75)) && amountsClose(primaryCluster.average, latestTotal)) {
    return { expectedAmount: primaryCluster.average, consistencyScore: 12, flags: [] };
  }
  const previousStable = clusters
    .filter((cluster) => cluster !== latestCluster && cluster.values.length >= 2)
    .sort((a, b) => b.lastIndex - a.lastIndex)[0];
  if (previousStable && latestCluster && latestCluster.lastIndex === totals.length - 1 && latestCluster.average > previousStable.average) {
    const increase = round(latestCluster.average - previousStable.average);
    const isSmallIncrease = increase <= Math.max(5, previousStable.average * 0.2);
    const oldThenNew = previousStable.lastIndex < latestCluster.firstIndex || latestCluster.values.length >= 2;
    if (isSmallIncrease && oldThenNew) {
      return { expectedAmount: latestCluster.average, consistencyScore: 10, flags: [`price increase ${money(previousStable.average)} → ${money(latestCluster.average)}`] };
    }
  }
  return null;
}

function clusterAmounts(amounts) {
  return amounts.reduce((clusters, amount, index) => {
    const cluster = clusters.find((item) => amountsClose(item.average, amount));
    if (cluster) {
      cluster.values.push(amount);
      cluster.average = cluster.values.reduce((a, b) => a + b, 0) / cluster.values.length;
      cluster.firstIndex = Math.min(cluster.firstIndex, index);
      cluster.lastIndex = Math.max(cluster.lastIndex, index);
    } else clusters.push({ average: amount, values: [amount], firstIndex: index, lastIndex: index });
    return clusters;
  }, []);
}

function amountsClose(a, b) {
  return Math.abs(a - b) <= Math.max(1, Math.min(a, b) * 0.02);
}

function hasMonthlyCadence(monthlyBuckets) {
  const gaps = monthlyBuckets.slice(1).map((bucket, index) => monthsBetween(monthlyBuckets[index].month, bucket.month));
  if (!gaps.length) return false;
  const onSchedule = gaps.filter((gap) => gap >= 1 && gap <= 2).length;
  return onSchedule / gaps.length >= 0.8 && Math.max(...gaps) <= 2;
}

function monthlyBars(kind) {
  const months = monthOptions();
  if (months.length < 2) return `<div class="empty-state">Not enough historical data to calculate a useful trend.</div>`;
  const data = Object.fromEntries(months.map((m) => [m, monthlySummary(m)[kind]]));
  return categoryBars(data);
}

function incomeExpenseBars() {
  const months = monthOptions();
  if (months.length < 2) return `<div class="empty-state">Not enough historical data yet.</div>`;
  return months.map((m) => { const s = monthlySummary(m); return `<p><strong>${m}</strong> Outside income ${money(s.actualIncome)} · Outside spending ${money(s.spending)} · Internal movement ${money(s.internalTransferVolume)} · Net ${money(s.netCashFlow)}</p>`; }).join("");
}

function trendList(type) {
  if (monthOptions().length < 2) return `<div class="empty-state">Not enough historical data to calculate trends.</div>`;
  const current = state.transactions.filter((tx) => transactionReportingMonth(tx) === state.selectedMonth && isReportableExpense(tx));
  const previousMonth = addMonth(state.selectedMonth, -1);
  const previous = state.transactions.filter((tx) => transactionReportingMonth(tx) === previousMonth && isReportableExpense(tx));
  const sumBy = (rows) => rows.reduce((acc, tx) => { const key = type === "category" ? tx.category : tx.merchant; acc[key] = (acc[key] || 0) + reportableExpenseAmount(tx); return acc; }, {});
  const now = sumBy(current);
  const prev = sumBy(previous);
  const changes = Object.keys(now).map((key) => [key, now[key] - (prev[key] || 0)]).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return changes.length ? changes.map(([key, value]) => `<p><strong>${escapeHtml(key)}</strong>: ${value >= 0 ? "+" : ""}${money(value)}</p>`).join("") : `<div class="empty-state">No comparable trend movement yet.</div>`;
}

function recurringDiscretionary() {
  const summary = monthlySummary(state.selectedMonth);
  return `<p>Recurring: <strong>${money(summary.recurring)}</strong></p><p>Discretionary and other spending: <strong>${money(Math.max(0, summary.spending - summary.recurring))}</strong></p>`;
}

function averageMonthlySpending(limit) {
  const months = monthOptions().slice(-limit);
  if (!months.length) return 0;
  return months.reduce((sum, month) => sum + monthlySummary(month).spending, 0) / months.length;
}

function monthIncreaseList() {
  const months = monthOptions();
  if (months.length < 2) return `<div class="empty-state">Not enough month-over-month history yet.</div>`;
  const increases = months.slice(1).map((month, index) => [month, monthlySummary(month).spending - monthlySummary(months[index]).spending]).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return increases.map(([month, value]) => `<p><strong>${month}</strong>: ${value >= 0 ? "+" : ""}${money(value)}</p>`).join("");
}

function projectedIncome() {
  return Number(state.incomeSettings.expectedMonthlyIncome || 0) + overtimeIncome() + Number(state.incomeSettings.additionalExpectedIncome || 0);
}

function overtimeIncome() {
  const s = state.incomeSettings;
  return round(Number(s.hourlyRate || 0) * Number(s.overtimeHours || 0) * Number(s.overtimeMultiplier || 1));
}

function categoryOptions(selected) {
  return categoryOptionRows().map(({ category, depth }) => `<option value="${escapeAttr(category.name)}" ${category.name === selected ? "selected" : ""}>${escapeHtml(`${categoryIndent(depth)}${categoryBaseName(category)}`)}</option>`).join("");
}

function categoryIdOptions(selected, excludeId = "") {
  return categoryOptionRows(excludeId).map(({ category, depth }) => `<option value="${escapeAttr(category.id)}" ${category.id === selected ? "selected" : ""}>${escapeHtml(`${categoryIndent(depth)}${categoryBaseName(category)}`)}</option>`).join("");
}

function parentCategoryOptions(selected, excludeId = "") {
  return categoryIdOptions(selected, excludeId);
}

function categoryOptionRows(excludeId = "") {
  const excluded = new Set([excludeId, ...categoryDescendantIds(excludeId)]);
  const walk = (parents, depth = 0) => parents.flatMap((category) => {
    if (excluded.has(category.id)) return [];
    return [{ category, depth }, ...walk(childCategories(category.id), depth + 1)];
  });
  return walk(groupedCategories());
}

function categoryIndent(depth) {
  return depth ? `${"— ".repeat(depth)}` : "";
}

function defaultCategories() {
  const categories = DEFAULT_CATEGORIES.map((name) => ({ id: uniqueId("cat"), name, parentId: "", system: true }));
  DEFAULT_SUBCATEGORIES.forEach((item) => {
    const parent = categories.find((cat) => cat.name === item.parent);
    if (parent) categories.push({ id: uniqueId("cat"), name: subcategoryName(parent.name, item.name), parentId: parent.id, system: true });
  });
  return categories;
}

function uniqueCategoriesById(categories) {
  const byId = new Map();
  categories.forEach((category) => {
    if (!category?.id) return;
    const existing = byId.get(category.id);
    if (!existing || (category.parentId && !existing.parentId)) byId.set(category.id, category);
  });
  return Array.from(byId.values());
}

function groupedCategories() {
  repairCategoryParents();
  return state.categories.filter((cat) => !cat.parentId).sort(categorySort);
}

function childCategories(parentId) {
  return state.categories.filter((cat) => cat.parentId === parentId).sort(categorySort);
}

function categoryTreeList() {
  const walk = (parents) => parents.flatMap((parent) => [parent, ...walk(childCategories(parent.id))]);
  return walk(groupedCategories());
}

function parentCategory(category) {
  return category?.parentId ? state.categories.find((cat) => cat.id === category.parentId) : null;
}

function categoryBaseName(category) {
  const parent = parentCategory(category);
  if (!parent) return category.name;
  const prefix = `${parent.name}: `;
  return category.name.startsWith(prefix) ? category.name.slice(prefix.length) : category.name.split(":").pop().trim();
}

function subcategoryName(parentName, name) {
  const base = sanitize(name).replace(/^.+:\s*/, "");
  return `${sanitize(parentName)}: ${base}`;
}

function categoryPathName(parent, baseName) {
  return parent ? subcategoryName(parent.name, baseName) : sanitize(baseName);
}

function categoryVisible(category) {
  const term = categoryFilterTerm.trim().toLowerCase();
  if (!term) return true;
  return categoryMatches(category, term) || categoryAncestorMatches(category, term) || categoryDescendantIds(category.id).some((id) => categoryMatches(state.categories.find((cat) => cat.id === id), term));
}

function categoryMatches(category, term) {
  if (!category) return false;
  return `${category.name} ${categoryBaseName(category)} ${categoryBreadcrumb(category)}`.toLowerCase().includes(term);
}

function categoryAncestorMatches(category, term) {
  let parent = parentCategory(category);
  while (parent) {
    if (categoryMatches(parent, term)) return true;
    parent = parentCategory(parent);
  }
  return false;
}

function categoryAggregate(category) {
  const names = new Set(categoryAndDescendantNames(category));
  const allocations = reportingAllocationsForTransactions(state.transactions).filter((allocation) => names.has(allocation.category));
  const transactionIds = new Set(allocations.map((allocation) => allocation.parentTransactionId));
  return { count: transactionIds.size, total: round(allocations.reduce((sum, allocation) => sum + allocation.amount, 0)) };
}

function categorySort(a, b) {
  if (a.name === "Uncategorized") return 1;
  if (b.name === "Uncategorized") return -1;
  if (categorySortMode === "name-desc") return categoryBaseName(b).localeCompare(categoryBaseName(a));
  if (categorySortMode === "total-desc") return categoryAggregate(b).total - categoryAggregate(a).total || categoryBaseName(a).localeCompare(categoryBaseName(b));
  if (categorySortMode === "count-desc") return categoryAggregate(b).count - categoryAggregate(a).count || categoryBaseName(a).localeCompare(categoryBaseName(b));
  return categoryBaseName(a).localeCompare(categoryBaseName(b));
}

function repairCategoryParents() {
  state.categories.forEach((category) => {
    if (category.parentId === category.id || (category.parentId && !state.categories.some((parent) => parent.id === category.parentId))) category.parentId = "";
  });
}

function updateChildCategoryNames(parentCategoryItem) {
  childCategories(parentCategoryItem.id).forEach((child) => {
    const previousName = child.name;
    child.name = subcategoryName(parentCategoryItem.name, categoryBaseName(child));
    state.transactions.filter((tx) => tx.category === previousName).forEach((tx) => { tx.category = child.name; });
    updateChildCategoryNames(child);
  });
}

function categoryDescendantIds(categoryId) {
  if (!categoryId) return [];
  const direct = state.categories.filter((cat) => cat.parentId === categoryId);
  return direct.flatMap((cat) => [cat.id, ...categoryDescendantIds(cat.id)]);
}

function categoryAndDescendantNames(category) {
  if (!category) return [];
  const ids = new Set([category.id, ...categoryDescendantIds(category.id)]);
  return state.categories.filter((cat) => ids.has(cat.id)).map((cat) => cat.name);
}

function reportCategory() {
  if (selectedCategoryReportId) return state.categories.find((cat) => cat.id === selectedCategoryReportId) || null;
  return null;
}

function categoryBreadcrumb(category) {
  const path = [];
  let current = category;
  while (current) {
    path.unshift(categoryBaseName(current));
    current = parentCategory(current);
  }
  return path.join(" → ");
}

function categoryDrilldown(category) {
  const names = new Set(categoryAndDescendantNames(category));
  const allocations = reportingAllocationsForTransactions(state.transactions).filter((allocation) => names.has(allocation.category));
  const transactionIds = new Set(allocations.map((allocation) => allocation.parentTransactionId));
  const total = round(allocations.reduce((sum, allocation) => sum + allocation.amount, 0));
  const months = monthOptions();
  const monthly = months.map((month) => ({ month, total: round(allocations.filter((allocation) => allocation.month === month).reduce((sum, allocation) => sum + allocation.amount, 0)) })).filter((item) => item.total > 0);
  const childTotals = childCategories(category.id).map((child) => {
    const childNames = new Set(categoryAndDescendantNames(child));
    return { child, total: round(allocations.filter((allocation) => childNames.has(allocation.category)).reduce((sum, allocation) => sum + allocation.amount, 0)) };
  }).filter((item) => item.total > 0).sort((a, b) => b.total - a.total);
  return `<div class="category-drilldown"><div class="summary-grid compact-summary">${summaryCard("Selected category", categoryBreadcrumb(category), "")} ${summaryCard("Overall total", total, "danger")} ${summaryCard("Transactions", transactionIds.size, "warn", "Count")}</div>${childTotals.length ? `<h4>Nested totals</h4><div class="mini-category-list">${childTotals.map(({ child, total: childTotal }) => `<button class="mini-category-row drilldown-row" data-cat-report="${escapeAttr(child.id)}" type="button"><div><span>${escapeHtml(categoryBaseName(child))}</span><strong>${money(childTotal)}</strong></div><em><i style="width:${Math.max(7, total ? (childTotal / total) * 100 : 0)}%"></i></em></button>`).join("")}</div>` : ""}<h4>Monthly totals</h4>${monthly.length ? `<div class="table-wrap compact-table"><table><thead><tr><th>Month</th><th>Total</th></tr></thead><tbody>${monthly.map((item) => `<tr><td>${escapeHtml(item.month)}</td><td>${money(item.total)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state compact">No transactions assigned to this category or its nested categories yet.</div>`}</div>`;
}

function monthOptions() {
  const months = Array.from(new Set(state.transactions.map((tx) => tx.date?.slice(0, 7)).filter(Boolean))).sort();
  return months.length ? months : [state.selectedMonth || monthKey(new Date())];
}

function latestMonth(transactions) {
  return Array.from(new Set(transactions.map((tx) => tx.date?.slice(0, 7)).filter(Boolean))).sort().pop() || "";
}

function accountName(id) {
  return state.accounts.find((account) => account.id === id)?.name || "Unknown account";
}

function normalizeMerchant(description) {
  return sanitize(description).replace(/^SQ \*/i, "").replace(/\b\d{4,}\b/g, "").replace(/[#*]\w+/g, "").replace(/\s+/g, " ").trim().toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()).slice(0, 80) || "Unknown Merchant";
}

function normalizeDate(value) {
  const raw = sanitize(value);
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  }
  return new Date().toISOString().slice(0, 10);
}

function parseMoney(value) {
  const cleaned = String(value || "").replace(/[$,()]/g, "").trim();
  const n = Number(cleaned);
  return String(value || "").includes("(") ? -Math.abs(n) : Number.isFinite(n) ? n : 0;
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function sanitize(value) {
  return String(value ?? "").replace(/[<>]/g, "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 600);
}

function escapeHtml(value) {
  return sanitize(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function slug(value) {
  return sanitize(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

function uniqueId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function monthKey(date) {
  return date.toISOString().slice(0, 7);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function addMonth(month, offset) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

function daysBetween(a, b) {
  return Math.abs((new Date(b) - new Date(a)) / 86400000);
}

function monthsBetween(a, b) {
  const start = new Date(`${a}-01T00:00:00Z`);
  const end = new Date(`${b}-01T00:00:00Z`);
  return Math.abs((end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth());
}

function label(value) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stripId(value) {
  const copy = { ...value };
  delete copy.id;
  return copy;
}

function showStatus(message) {
  const target = document.getElementById("importStatus") || els.profileSummary;
  target.textContent = message;
}
