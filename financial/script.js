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
const els = {
  featureGrid: document.getElementById("featureGrid"),
  signInButton: document.getElementById("signInButton"),
  signOutButton: document.getElementById("signOutButton"),
  gateSignInButton: document.getElementById("gateSignInButton"),
  gateDemoButton: document.getElementById("gateDemoButton"),
  analyzeButton: document.getElementById("analyzeButton"),
  demoButton: document.getElementById("demoButton"),
  authStatus: document.getElementById("authStatus"),
  setupWarning: document.getElementById("setupWarning"),
  authGate: document.getElementById("authGate"),
  app: document.getElementById("financialApp"),
  modeLabel: document.getElementById("modeLabel"),
  profileSummary: document.getElementById("profileSummary"),
  createProfileButton: document.getElementById("createProfileButton"),
  deleteProfileButton: document.getElementById("deleteProfileButton")
};
const isAppPage = Boolean(els.app && els.authGate);

let auth = null;
let db = null;
let currentUser = null;
let mode = "signed-out";
let pendingImport = null;
let saveTimer = null;
let state = emptyState();

renderFeatures();
setupMobileMenu();
setupTabs();
if (isAppPage) setupAuth();
bindStaticActions();

function emptyState() {
  return {
    profile: { id: "default", name: "Household Profile", confidenceThreshold: 78, createdAt: new Date().toISOString() },
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

function demoState() {
  const s = emptyState();
  s.profile = { ...s.profile, name: "Fictional Demo Household", demo: true, confidenceThreshold: 82 };
  s.accounts = [
    { id: "checking-main", name: "Demo Primary Checking", type: "checking", institution: "Fennington Demo Bank", userId: "demo" },
    { id: "checking-side", name: "Demo Household Checking", type: "checking", institution: "Fennington Demo Bank", userId: "demo" },
    { id: "credit-card", name: "Demo Rewards Credit Card", type: "credit", institution: "Fennington Demo Credit", userId: "demo" }
  ];
  const seed = [
    ["2026-02-02", "PAYROLL DIRECT DEP", "Employer Payroll", 2920, "checking-main"],
    ["2026-02-05", "SUNRISE APARTMENTS RENT", "Sunrise Apartments", -1625, "checking-main"],
    ["2026-02-06", "CITY ELECTRIC BILL", "City Electric", -151.22, "checking-main"],
    ["2026-02-08", "KROGER #441", "Kroger", -143.8, "credit-card"],
    ["2026-02-10", "SQ *JOES PIZZA 4135551234", "Joe's Pizza", -42.6, "credit-card"],
    ["2026-02-12", "SHELL OIL 8841", "Shell", -58.14, "credit-card"],
    ["2026-02-15", "NETFLIX.COM", "Netflix", -18.99, "credit-card"],
    ["2026-02-17", "PAYMENT THANK YOU", "Credit Card Payment", -700, "checking-main"],
    ["2026-02-17", "ONLINE PAYMENT RECEIVED", "Credit Card Payment", 700, "credit-card"],
    ["2026-03-01", "PAYROLL DIRECT DEP", "Employer Payroll", 2920, "checking-main"],
    ["2026-03-05", "SUNRISE APARTMENTS RENT", "Sunrise Apartments", -1625, "checking-main"],
    ["2026-03-06", "CITY ELECTRIC BILL", "City Electric", -167.85, "checking-main"],
    ["2026-03-09", "ALDI 3201", "Aldi", -118.43, "credit-card"],
    ["2026-03-11", "UNKNOWN POS 9931", "Unknown POS", -214.88, "credit-card"],
    ["2026-03-13", "BP FUEL 5482", "BP", -62.12, "credit-card"],
    ["2026-03-15", "NETFLIX.COM", "Netflix", -18.99, "credit-card"],
    ["2026-03-20", "OVERTIME PAYROLL", "Employer Payroll", 420, "checking-main"],
    ["2026-04-01", "PAYROLL DIRECT DEP", "Employer Payroll", 2920, "checking-main"],
    ["2026-04-05", "SUNRISE APARTMENTS RENT", "Sunrise Apartments", -1625, "checking-main"],
    ["2026-04-07", "CITY ELECTRIC BILL", "City Electric", -139.1, "checking-main"],
    ["2026-04-08", "WALMART SUPERCENTER", "Walmart", -232.74, "credit-card"],
    ["2026-04-10", "JOES PIZZA", "Joe's Pizza", -39.25, "credit-card"],
    ["2026-04-13", "CHEVRON 2210", "Chevron", -55.92, "credit-card"],
    ["2026-04-15", "NETFLIX.COM", "Netflix", -21.99, "credit-card"],
    ["2026-04-22", "TRANSFER TO SAVINGS", "Savings Transfer", -300, "checking-main"],
    ["2026-05-01", "PAYROLL DIRECT DEP", "Employer Payroll", 2920, "checking-main"],
    ["2026-05-05", "SUNRISE APARTMENTS RENT", "Sunrise Apartments", -1625, "checking-main"],
    ["2026-05-06", "CITY ELECTRIC BILL", "City Electric", -149.44, "checking-main"],
    ["2026-05-09", "TRADER JOES", "Trader Joe's", -156.32, "credit-card"],
    ["2026-05-12", "AMAZON MKTPLACE", "Amazon", -286.2, "credit-card"],
    ["2026-05-14", "SHELL OIL 8841", "Shell", -61.44, "credit-card"],
    ["2026-05-15", "NETFLIX.COM", "Netflix", -21.99, "credit-card"],
    ["2026-06-01", "PAYROLL DIRECT DEP", "Employer Payroll", 2920, "checking-main"],
    ["2026-06-05", "SUNRISE APARTMENTS RENT", "Sunrise Apartments", -1625, "checking-main"],
    ["2026-06-06", "CITY ELECTRIC BILL", "City Electric", -171.5, "checking-main"],
    ["2026-06-08", "KROGER #441", "Kroger", -171.2, "credit-card"],
    ["2026-06-11", "SQ *JOES PIZZA", "Joe's Pizza", -48.18, "credit-card"],
    ["2026-06-15", "NETFLIX.COM", "Netflix", -21.99, "credit-card"],
    ["2026-06-19", "OVERTIME PAYROLL", "Employer Payroll", 510, "checking-main"],
    ["2026-07-01", "PAYROLL DIRECT DEP", "Employer Payroll", 2920, "checking-main"],
    ["2026-07-05", "SUNRISE APARTMENTS RENT", "Sunrise Apartments", -1625, "checking-main"],
    ["2026-07-06", "CITY ELECTRIC BILL", "City Electric", -186.7, "checking-main"],
    ["2026-07-08", "ALDI 3201", "Aldi", -126.9, "credit-card"],
    ["2026-07-10", "MYSTERY WEB CHARGE", "Mystery Web Charge", -89.99, "credit-card"],
    ["2026-07-12", "SHELL OIL 8841", "Shell", -64.77, "credit-card"],
    ["2026-07-15", "NETFLIX.COM", "Netflix", -21.99, "credit-card"],
    ["2026-07-18", "PAYMENT THANK YOU", "Credit Card Payment", -900, "checking-main"],
    ["2026-07-18", "ONLINE PAYMENT RECEIVED", "Credit Card Payment", 900, "credit-card"]
  ];
  s.transactions = seed.map((row, index) => makeTransaction({ date: row[0], description: row[1], merchant: row[2], amount: row[3], accountId: row[4], importId: "demo-import" }, `demo-${index}`));
  s.transactions.forEach((tx) => applyCategorization(tx, s));
  s.transactions.filter((tx) => /UNKNOWN|MYSTERY|TRANSFER|PAYMENT/i.test(tx.description)).forEach((tx) => {
    tx.needsReview = true;
    tx.flags = Array.from(new Set([...(tx.flags || []), /TRANSFER|PAYMENT/i.test(tx.description) ? "possible_transfer" : "low_confidence"]));
  });
  s.selectedMonth = "2026-07";
  s.recurring = detectRecurring(s.transactions);
  return s;
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
    els.authStatus.textContent = "Demo available";
    els.signInButton.disabled = true;
    els.gateSignInButton.disabled = true;
    if (shouldOpenDemo()) enterDemo();
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
    else if (shouldOpenDemo()) enterDemo();
    else showGate();
  });
}

function bindStaticActions() {
  if (!isAppPage) {
    els.signInButton?.addEventListener("click", () => navigateToApp());
    els.analyzeButton?.addEventListener("click", () => navigateToApp());
    els.demoButton?.addEventListener("click", () => navigateToApp(true));
    return;
  }
  els.demoButton?.addEventListener("click", enterDemo);
  els.gateDemoButton?.addEventListener("click", enterDemo);
  els.analyzeButton?.addEventListener("click", () => {
    if (currentUser) showApp("user");
    scrollToApp();
  });
  els.createProfileButton?.addEventListener("click", createProfile);
  els.deleteProfileButton?.addEventListener("click", deleteProfileData);
}

function navigateToApp(openDemo = false) {
  window.location.href = openDemo ? "app.html?demo=1" : "app.html";
}

function shouldOpenDemo() {
  return new URLSearchParams(window.location.search).get("demo") === "1";
}

function showGate() {
  mode = "signed-out";
  els.authGate.hidden = false;
  els.app.hidden = true;
}

function showApp(nextMode) {
  mode = nextMode;
  els.authGate.hidden = true;
  els.app.hidden = false;
  els.modeLabel.textContent = mode === "demo" ? "Demo mode: fictional data" : "Authenticated profile";
  els.profileSummary.textContent = mode === "demo" ? "All data shown here is fictional demo data." : `${state.profile.name || "Financial Profile"} for ${currentUser?.email || "signed-in user"}.`;
  renderAll();
}

function enterDemo() {
  state = demoState();
  showApp("demo");
  scrollToApp();
}

function scrollToApp() {
  document.getElementById("app")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadUserState() {
  state = emptyState();
  const profileRef = doc(db, "users", currentUser.uid, "financialProfiles", "default");
  const profileSnap = await getDoc(profileRef);
  if (profileSnap.exists()) state.profile = { id: "default", ...profileSnap.data() };
  else await setDoc(profileRef, { ...state.profile, userId: currentUser.uid, updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true });
  const names = ["accounts", "imports", "mappings", "categories", "transactions", "merchantMappings", "rules", "recurring", "overtimeScenarios", "monthlySummaries"];
  await Promise.all(names.map(async (name) => {
    const snap = await getDocs(collection(profileRef, name));
    if (!snap.empty) state[name] = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
  }));
  const incomeSnap = await getDoc(doc(profileRef, "settings", "income"));
  if (incomeSnap.exists()) state.incomeSettings = { ...state.incomeSettings, ...incomeSnap.data() };
  if (!state.categories.length) state.categories = defaultCategories();
  state.selectedMonth = latestMonth(state.transactions) || monthKey(new Date());
  showApp("user");
}

async function saveState() {
  if (mode !== "user" || !currentUser || !db) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const profileRef = doc(db, "users", currentUser.uid, "financialProfiles", "default");
    await setDoc(doc(db, "users", currentUser.uid), { email: currentUser.email || "", updatedAt: serverTimestamp() }, { merge: true });
    await setDoc(profileRef, { ...stripId(state.profile), userId: currentUser.uid, updatedAt: serverTimestamp() }, { merge: true });
    await setDoc(doc(profileRef, "settings", "income"), { ...state.incomeSettings, userId: currentUser.uid, updatedAt: serverTimestamp() }, { merge: true });
    const batch = writeBatch(db);
    ["accounts", "imports", "mappings", "categories", "transactions", "merchantMappings", "rules", "recurring", "overtimeScenarios", "monthlySummaries"].forEach((name) => {
      state[name].forEach((item) => batch.set(doc(profileRef, name, item.id), { ...item, userId: currentUser.uid, updatedAt: serverTimestamp() }, { merge: true }));
    });
    await batch.commit();
  }, 450);
}

function renderAll() {
  ensureDefaultCategories();
  normalizeCreditCardPaymentSigns();
  const previousRecurring = new Map(state.recurring.map((item) => [item.id, item]));
  state.recurring = detectRecurring(state.transactions).map((item) => ({ ...item, status: previousRecurring.get(item.id)?.status || item.status }));
  renderDashboard();
  renderImport();
  renderTransactions();
  renderReview();
  renderReports();
  renderIncome();
  renderRecurring();
  renderCategories();
  saveState();
}

function ensureDefaultCategories() {
  DEFAULT_CATEGORIES.forEach((name) => {
    if (!state.categories.some((cat) => cat.name.toLowerCase() === name.toLowerCase())) {
      state.categories.push({ id: slug(name), name, system: true });
    }
  });
  DEFAULT_SUBCATEGORIES.forEach((item) => {
    const parent = state.categories.find((cat) => cat.name.toLowerCase() === item.parent.toLowerCase() && !cat.parentId);
    if (!parent) return;
    const name = subcategoryName(parent.name, item.name);
    const category = state.categories.find((cat) => cat.name.toLowerCase() === name.toLowerCase());
    if (category) category.parentId = category.parentId || parent.id;
    else state.categories.push({ id: slug(name), name, parentId: parent.id, system: true });
  });
}

function normalizeCreditCardPaymentSigns() {
  const creditAccounts = new Set(state.accounts.filter((account) => account.type === "credit").map((account) => account.id));
  state.transactions.forEach((tx) => {
    const looksLikePayment = tx.category === "Transfers" || tx.type === "transfer" || /payment|autopay|thank you|payment received|online payment/i.test(`${tx.description} ${tx.merchant}`);
    if (creditAccounts.has(tx.accountId) && looksLikePayment) {
      if (tx.amount < 0) tx.amount = Math.abs(tx.amount);
      setCategory(tx, ACCOUNT_CREDIT_CATEGORY, Math.max(90, tx.confidence || 0), tx.source || "Payment sign normalization", "Credit-card payments are tracked as positive credits.", "transfer");
    }
  });
}

function renderDashboard() {
  const tab = document.getElementById("dashboardTab");
  const months = monthOptions();
  const summary = monthlySummary(state.selectedMonth);
  tab.innerHTML = `
    <div class="toolbar">
      <div class="field"><label for="dashboardMonth">Dashboard month</label><select id="dashboardMonth">${months.map((m) => `<option value="${m}" ${m === state.selectedMonth ? "selected" : ""}>${m}</option>`).join("")}</select></div>
      ${mode === "demo" ? `<p class="status-line"><span class="tag warn">Fictional demo data</span> This dashboard is not connected to a real financial profile.</p>` : ""}
    </div>
    <div class="summary-grid">
      ${summaryCard("Actual income received this month", summary.actualIncome, "good")}
      ${summaryCard("Total spending this month", summary.spending, "danger")}
      ${summaryCard("Payments and credits this month", summary.payments, "good")}
      ${summaryCard("Net spending after payments", summary.netSpending, summary.netSpending <= 0 ? "good" : "danger")}
      ${summaryCard("Remaining income", summary.remaining, summary.remaining >= 0 ? "good" : "danger")}
      ${summaryCard("Projected income including potential overtime", projectedIncome(), "warn", "Potential overtime is not received income.")}
      ${summaryCard("Recurring monthly expenses", summary.recurring, "danger")}
      ${summaryCard("Transactions requiring review", summary.reviewCount, "warn", "Count")}
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

function renderImport() {
  const tab = document.getElementById("importTab");
  const headers = pendingImport?.headers || [];
  tab.innerHTML = `
    <div class="split-panel">
      <section class="panel">
        <h3>Upload transaction CSV files</h3>
        <p class="status-line">Supported files: <code>.csv</code> or text CSV exports up to 5 MB. Extra columns are ignored unless mapped.</p>
        <div class="field"><label for="csvFile">CSV file or files</label><input id="csvFile" type="file" accept=".csv,text/csv" multiple></div>
        <div class="field"><label for="csvFolder">CSV folder, including subfolders</label><input id="csvFolder" type="file" accept=".csv,text/csv" webkitdirectory multiple></div>
        <div id="importStatus" class="status-line">No file selected.</div>
        ${pendingImport ? mappingForm(headers) : ""}
      </section>
      <aside class="panel">
        <h3>Import preview</h3>
        <div id="importPreview">${pendingImport ? importPreviewHtml() : `<div class="empty-state">Upload a CSV to preview detected transactions, date range, totals, duplicates, and account selection.</div>`}</div>
      </aside>
    </div>
  `;
      document.getElementById("csvFile").addEventListener("change", handleFile);
      document.getElementById("csvFolder").addEventListener("change", handleFile);
  if (pendingImport) {
    document.getElementById("previewImportButton").addEventListener("click", updateImportPreview);
    document.getElementById("importTransactionsButton").addEventListener("click", importTransactions);
    document.getElementById("saveMappingButton").addEventListener("click", saveMappingTemplate);
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
  renderImport();
}

function updateImportPreview() {
  captureMapping();
  document.getElementById("importPreview").innerHTML = importPreviewHtml();
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
      account = { id: uniqueId("acct"), name: row.accountName, institution: pendingImport.institution, type: /card|credit|citi|visa|mastercard|amex|discover|capital one|chase/i.test(row.accountName) ? "credit" : "checking" };
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
  categorizeWithServer(imported);
  state.selectedMonth = latestMonth(state.transactions) || state.selectedMonth;
  renderAll();
  showStatus(`${imported.length} transactions imported. Low-confidence and possible duplicate items were added to the review queue.`);
}

function saveMappingTemplate() {
  captureMapping();
  const name = pendingImport.institution || window.prompt("Mapping template name:", pendingImport.fileName.replace(/\.csv$/i, ""));
  if (!name) return;
  state.mappings.push({ id: uniqueId("map"), name: sanitize(name), mapping: { ...pendingImport.mapping }, expensesPositive: Boolean(pendingImport.expensesPositive), createdAt: new Date().toISOString() });
  saveState();
  showStatus("Mapping template saved.");
}

function renderTransactions() {
  const tab = document.getElementById("transactionsTab");
  const rows = filteredTransactions();
  tab.innerHTML = `
    <section class="panel">
      <h3>Transaction table</h3>
      ${filtersHtml()}
      <div class="status-line">Showing ${rows.length} of ${state.transactions.length} transactions.</div>
      ${rows.length ? transactionTable(rows) : `<div class="empty-state">No transactions match the current filters.</div>`}
    </section>
  `;
  bindFilters();
  bindTransactionTable(tab);
}

function filtersHtml() {
  const cats = categoryOptions(state.filters.category || "");
  const accounts = [`<option value="">All accounts</option>`, ...state.accounts.map((a) => `<option value="${a.id}" ${state.filters.account === a.id ? "selected" : ""}>${escapeHtml(a.name)}</option>`)].join("");
  return `
    <div class="filters">
      <div class="field"><label for="filterSearch">Search</label><input id="filterSearch" value="${escapeAttr(state.filters.search || "")}" placeholder="Merchant or description"></div>
      <div class="field"><label for="filterStart">Date range start</label><input id="filterStart" type="date" value="${escapeAttr(state.filters.start || "")}"></div>
      <div class="field"><label for="filterEnd">Date range end</label><input id="filterEnd" type="date" value="${escapeAttr(state.filters.end || "")}"></div>
      <div class="field"><label for="filterMonth">Month</label><select id="filterMonth"><option value="">All months</option>${monthOptions().map((m) => `<option value="${m}" ${state.filters.month === m ? "selected" : ""}>${m}</option>`).join("")}</select></div>
      <div class="field"><label for="filterAccount">Account</label><select id="filterAccount">${accounts}</select></div>
      <div class="field"><label for="filterCategory">Category</label><select id="filterCategory"><option value="">All categories</option>${cats}</select></div>
      <div class="field"><label for="filterMerchant">Merchant</label><input id="filterMerchant" value="${escapeAttr(state.filters.merchant || "")}" placeholder="Merchant"></div>
      <div class="field"><label for="filterType">Type</label><select id="filterType"><option value="">Any</option>${["income", "expense", "transfer", "uncategorized", "review"].map((t) => `<option value="${t}" ${state.filters.type === t ? "selected" : ""}>${label(t)}</option>`).join("")}</select></div>
      <label class="field checkbox-field"><span>Hide Credits from Transactions</span><input id="filterHideCredits" type="checkbox" ${state.filters.hideCredits ? "checked" : ""}></label>
    </div>
  `;
}

function bindFilters() {
  ["Search", "Start", "End", "Month", "Account", "Category", "Merchant", "Type"].forEach((name) => {
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
  return `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Original description</th><th>Normalized merchant</th><th>Account</th><th>Amount</th><th>Category</th><th>Confidence</th><th>Source</th><th>Recurring</th><th>Notes</th><th>Action</th></tr></thead><tbody>${rows.map(transactionRow).join("")}</tbody></table></div>`;
}

function transactionRow(tx) {
  return `<tr data-id="${tx.id}">
    <td><input data-field="date" type="date" value="${escapeAttr(tx.date)}"></td>
    <td>${escapeHtml(tx.description)}${tx.needsReview ? ` <span class="tag warn">Needs Review</span>` : ""}</td>
    <td><input data-field="merchant" value="${escapeAttr(tx.merchant)}"></td>
    <td>${escapeHtml(accountName(tx.accountId))}</td>
    <td class="amount-cell ${tx.amount >= 0 ? "positive" : "negative"}">${money(tx.amount)}</td>
    <td><select data-field="category">${categoryOptions(tx.category)}</select></td>
    <td>${Number(tx.confidence || 0)}</td>
    <td>${escapeHtml(tx.source || "")}</td>
    <td><select data-field="recurringStatus"><option ${tx.recurringStatus === "none" ? "selected" : ""}>none</option><option ${tx.recurringStatus === "suggested" ? "selected" : ""}>suggested</option><option ${tx.recurringStatus === "confirmed" ? "selected" : ""}>confirmed</option><option ${tx.recurringStatus === "rejected" ? "selected" : ""}>rejected</option></select></td>
    <td><input data-field="notes" value="${escapeAttr(tx.notes || "")}"></td>
    <td><select data-field="type"><option value="expense" ${tx.type === "expense" ? "selected" : ""}>Expense</option><option value="income" ${tx.type === "income" ? "selected" : ""}>Income</option><option value="transfer" ${tx.type === "transfer" ? "selected" : ""}>Transfer</option></select><br><button class="mini-btn" data-action="save-row" type="button">Save</button></td>
  </tr>`;
}

function bindTransactionTable(root) {
  root.querySelectorAll("[data-action='save-row']").forEach((button) => button.addEventListener("click", () => {
    const tr = button.closest("tr");
    const tx = state.transactions.find((item) => item.id === tr.dataset.id);
    const previousCategory = tx.category;
    tr.querySelectorAll("[data-field]").forEach((input) => { tx[input.dataset.field] = sanitize(input.value); });
    if (tx.category === "Income" || isTransferCategory(tx.category)) tx.type = typeForCategory(tx.category, tx.amount);
    tx.needsReview = false;
    tx.flags = (tx.flags || []).filter((flag) => flag !== "low_confidence" && flag !== "uncategorized");
    tx.source = tx.source === "AI" ? tx.source : "User";
    tx.confidence = 100;
    if (previousCategory !== tx.category && tx.merchant && window.confirm("Apply this category to future transactions from this merchant?")) {
      state.rules.push({ id: uniqueId("rule"), type: "merchant", match: tx.merchant, category: tx.category, createdAt: new Date().toISOString() });
    }
    renderAll();
  }));
}

function renderReview() {
  const tab = document.getElementById("reviewTab");
  const queue = reviewQueue();
  tab.innerHTML = `
    <section class="panel">
      <h3>Manual review queue</h3>
      <p class="status-line">Low-confidence categories, uncategorized items, possible transfers, possible duplicates, new recurring expenses, and unusually high amounts appear here.</p>
      <div class="bulk-actions"><select id="bulkCategory"><option value="">Bulk category</option>${categoryOptions("")}</select><button id="bulkCategorize" class="btn btn-secondary" type="button">Apply to Selected</button></div>
      <div style="margin-top:1rem">${queue.length ? queue.map(reviewCard).join("") : `<div class="empty-state">No transactions currently require review.</div>`}</div>
    </section>
  `;
  bindReviewActions(tab);
}

function reviewCard(tx) {
  return `<article class="review-card panel" data-id="${tx.id}">
    <input type="checkbox" class="review-select" aria-label="Select transaction">
    <div><strong>${escapeHtml(tx.merchant || tx.description)}</strong><p>${escapeHtml(tx.date)} · ${escapeHtml(accountName(tx.accountId))} · <span class="amount-cell ${tx.amount >= 0 ? "positive" : "negative"}">${money(tx.amount)}</span></p><p>${escapeHtml(tx.description)}</p><p>${(tx.flags || []).map((flag) => `<span class="tag warn">${escapeHtml(flag.replace(/_/g, " "))}</span>`).join(" ")}</p><small class="muted">${escapeHtml(tx.reason || "Needs manual confirmation.")}</small></div>
    <div class="review-actions"><select data-review-category>${categoryOptions(tx.category)}</select><label><input data-apply-rule type="checkbox"> Apply rule</label><button class="mini-btn" data-review="confirm" type="button">Confirm</button><button class="mini-btn" data-review="skip" type="button">Skip</button></div>
  </article>`;
}

function bindReviewActions(root) {
  root.querySelectorAll("[data-review='confirm']").forEach((button) => button.addEventListener("click", () => {
    const card = button.closest("article");
    const tx = state.transactions.find((item) => item.id === card.dataset.id);
    tx.category = card.querySelector("[data-review-category]").value;
    tx.type = typeForCategory(tx.category, tx.amount);
    tx.needsReview = false;
    tx.confidence = 100;
    tx.source = "User";
    tx.flags = [];
    if (card.querySelector("[data-apply-rule]").checked && tx.merchant) state.rules.push({ id: uniqueId("rule"), type: "merchant", match: tx.merchant, category: tx.category, createdAt: new Date().toISOString() });
    renderAll();
  }));
  root.querySelectorAll("[data-review='skip']").forEach((button) => button.addEventListener("click", () => {
    const tx = state.transactions.find((item) => item.id === button.closest("article").dataset.id);
    tx.needsReview = false;
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
      tx.needsReview = false;
      tx.confidence = 100;
      tx.source = "Bulk review";
      tx.flags = [];
    });
    renderAll();
  });
}

function renderReports() {
  const tab = document.getElementById("reportsTab");
  const summary = monthlySummary(state.selectedMonth);
  tab.innerHTML = `
    <div class="report-grid">
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
    recurring.status = button.dataset.recurring;
    state.transactions.filter((tx) => tx.merchant === recurring.merchant).forEach((tx) => { tx.recurringStatus = recurring.status === "confirmed" ? "confirmed" : "rejected"; });
    renderAll();
  }));
}

function recurringCard(item) {
  return `<article class="recurring-card" data-id="${item.id}"><strong>${escapeHtml(item.merchant)}</strong><p>Expected amount: ${money(item.expectedAmount)} · Average: ${money(item.averageAmount)}</p><p>Frequency: ${escapeHtml(item.frequency)} · Next: ${escapeHtml(item.expectedNextDate)}</p><p>Last payment: ${escapeHtml(item.lastPaymentDate)} · Confidence: ${item.confidence}</p><p>Category: ${escapeHtml(item.category)}</p>${item.flags.map((flag) => `<span class="tag warn">${escapeHtml(flag)}</span>`).join(" ")}<div class="form-actions" style="margin-top:.8rem"><button class="mini-btn" data-recurring="confirmed" type="button">Confirm</button><button class="mini-btn danger" data-recurring="rejected" type="button">Reject</button></div></article>`;
}

function renderCategories() {
  const tab = document.getElementById("categoriesTab");
  const parentOptions = parentCategoryOptions("");
  tab.innerHTML = `
    <div class="split-panel">
      <section class="panel"><h3>Categories</h3><p class="status-line">Create top-level categories or nest subcategories under a parent such as Kids.</p><div class="category-grid">${categoryTreeList().map(categoryCard).join("")}</div></section>
      <aside class="panel"><h3>Create or merge category</h3><div class="field"><label for="newCategoryParent">Parent category</label><select id="newCategoryParent"><option value="">Top-level category</option>${parentOptions}</select></div><div class="field"><label for="newCategory">New category or subcategory</label><input id="newCategory" placeholder="Example: Sports and Activities"></div><button id="addCategory" class="btn btn-primary" type="button">Create Category</button><hr style="margin:1rem 0;border:0;border-top:1px solid var(--financial-line)"><div class="field"><label for="mergeFrom">Merge from</label><select id="mergeFrom">${categoryOptions("")}</select></div><div class="field"><label for="mergeTo">Merge to</label><select id="mergeTo">${categoryOptions("")}</select></div><button id="mergeCategory" class="btn btn-secondary" type="button">Merge Categories</button></aside>
    </div>
  `;
  tab.querySelectorAll("[data-cat-save]").forEach((button) => button.addEventListener("click", () => {
    const card = button.closest("article");
    const category = state.categories.find((item) => item.id === card.dataset.id);
    const previousName = category.name;
    const parentId = card.querySelector("select")?.value || "";
    const parent = state.categories.find((item) => item.id === parentId);
    const nextBaseName = sanitize(card.querySelector("input").value);
    const nextName = parent ? subcategoryName(parent.name, nextBaseName) : nextBaseName;
    if (!nextName) return;
    if (state.categories.some((cat) => cat.id !== category.id && cat.name.toLowerCase() === nextName.toLowerCase())) return showStatus("That category already exists.");
    state.transactions.filter((tx) => tx.category === previousName).forEach((tx) => { tx.category = nextName; });
    category.name = nextName;
    category.parentId = parentId || "";
    updateChildCategoryNames(category, previousName);
    renderAll();
  }));
  tab.querySelectorAll("[data-cat-delete]").forEach((button) => button.addEventListener("click", () => {
    const category = state.categories.find((item) => item.id === button.closest("article").dataset.id);
    if (category.system) return showStatus("Default categories can be renamed or merged but not deleted in this first draft.");
    if (!window.confirm(`Delete ${category.name}? Transactions will become Uncategorized.`)) return;
    state.transactions.filter((tx) => tx.category === category.name).forEach((tx) => { tx.category = "Uncategorized"; tx.needsReview = true; });
    state.categories = state.categories.filter((item) => item.id !== category.id);
    renderAll();
  }));
  document.getElementById("addCategory").addEventListener("click", () => {
    const parentId = document.getElementById("newCategoryParent").value;
    const parent = state.categories.find((cat) => cat.id === parentId);
    const baseName = sanitize(document.getElementById("newCategory").value);
    const name = parent ? subcategoryName(parent.name, baseName) : baseName;
    if (!name || state.categories.some((cat) => cat.name.toLowerCase() === name.toLowerCase())) return;
    state.categories.push({ id: uniqueId("cat"), name, parentId: parentId || "", system: false });
    renderAll();
  });
  document.getElementById("mergeCategory").addEventListener("click", () => {
    const from = document.getElementById("mergeFrom").value;
    const to = document.getElementById("mergeTo").value;
    if (!from || !to || from === to) return;
    state.transactions.filter((tx) => tx.category === from).forEach((tx) => { tx.category = to; });
    state.categories = state.categories.filter((cat) => cat.name !== from || cat.system);
    renderAll();
  });
}

function categoryCard(category) {
  const parent = parentCategory(category);
  const childCount = state.categories.filter((item) => item.parentId === category.id).length;
  return `<article class="category-card ${parent ? "subcategory-card" : ""}" data-id="${category.id}"><div class="category-card-heading"><span class="tag ${parent ? "" : "good"}">${parent ? "Subcategory" : category.system ? "Default category" : "Custom category"}</span>${parent ? `<small>${escapeHtml(parent.name)}</small>` : childCount ? `<small>${childCount} subcategories</small>` : ""}</div><div class="field"><label>Category name</label><input value="${escapeAttr(categoryBaseName(category))}"></div><div class="field"><label>Parent category</label><select ${childCount ? "disabled" : ""}><option value="">Top-level category</option>${parentCategoryOptions(category.parentId || "", category.id)}</select></div><div class="form-actions"><button class="mini-btn" data-cat-save type="button">Save</button><button class="mini-btn danger" data-cat-delete type="button">Delete</button></div></article>`;
}

function createProfile() {
  const name = window.prompt("Financial profile name:", state.profile.name || "Household Profile");
  if (!name) return;
  state.profile.name = sanitize(name);
  showApp(mode === "demo" ? "demo" : "user");
}

async function deleteProfileData() {
  if (!window.confirm("Permanently delete imported transactions and this financial profile from this browser/account? This cannot be undone.")) return;
  if (!window.confirm("Confirm permanent deletion of Fennington Financial data.")) return;
  if (mode === "user" && currentUser && db) {
    const profileRef = doc(db, "users", currentUser.uid, "financialProfiles", "default");
    const names = ["accounts", "imports", "mappings", "categories", "transactions", "merchantMappings", "rules", "recurring", "overtimeScenarios", "monthlySummaries"];
    for (const name of names) {
      const snap = await getDocs(collection(profileRef, name));
      await Promise.all(snap.docs.map((item) => deleteDoc(item.ref)));
    }
    await deleteDoc(doc(profileRef, "settings", "income"));
    await deleteDoc(profileRef);
  }
  state = emptyState();
  renderAll();
  showStatus("Financial profile data deleted.");
}

function makeTransaction(row, id) {
  const tx = {
    id,
    date: normalizeDate(row.date),
    description: sanitize(row.description),
    merchant: sanitize(row.merchant || normalizeMerchant(row.description)),
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
    importId: row.importId || "manual"
  };
  return tx;
}

function applyCategorization(tx, sourceState) {
  const threshold = Number(sourceState.profile.confidenceThreshold || 78);
  const haystack = `${tx.description} ${tx.merchant}`;
  const userRule = sourceState.rules.find((rule) => rule.type === "merchant" ? tx.merchant.toLowerCase().includes(String(rule.match).toLowerCase()) : tx.description.toLowerCase().includes(String(rule.match).toLowerCase()));
  if (userRule) return setCategory(tx, userRule.category, 100, "User rule", "Matched a user-created categorization rule.");
  const mapping = sourceState.merchantMappings.find((item) => item.merchant.toLowerCase() === tx.merchant.toLowerCase());
  if (mapping) return setCategory(tx, mapping.category, 96, "Confirmed merchant mapping", "Matched a previously confirmed merchant mapping.");
  const builtIn = BUILT_IN_RULES.find((rule) => rule.match.test(haystack));
  if (builtIn) setCategory(tx, builtIn.category, builtIn.confidence, "Built-in merchant keyword", "Matched built-in merchant keyword rules.", builtIn.type);
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
  if (category === "Transfers" || category === ACCOUNT_CREDIT_CATEGORY) return "transfer";
  return Number(amount || 0) >= 0 ? "income" : "expense";
}

function isTransferCategory(category) {
  return category === "Transfers" || category === ACCOUNT_CREDIT_CATEGORY;
}

function isAccountCredit(tx) {
  return tx.category === ACCOUNT_CREDIT_CATEGORY || (tx.amount > 0 && state.accounts.find((account) => account.id === tx.accountId)?.type === "credit");
}

async function categorizeWithServer(imported) {
  if (!currentUser || mode !== "user") return;
  const candidates = imported.filter((tx) => tx.needsReview).slice(0, 20).map((tx) => ({ id: tx.id, description: tx.description, amount: tx.amount }));
  if (!candidates.length) return;
  try {
    const token = await currentUser.getIdToken();
    const response = await fetch("/api/financial/categorize", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ transactions: candidates, categories: state.categories.map((cat) => cat.name) }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "AI categorization failed.");
    (body.results || []).forEach((result) => {
      const tx = state.transactions.find((item) => item.id === result.id);
      if (!tx || Number(result.confidence || 0) < tx.confidence) return;
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
  if (hasSplitAmountColumns) amount = Math.abs(parseMoney(row[map.credit])) - Math.abs(parseMoney(row[map.debit]));
  else amount = parseMoney(row[map.amount]);
  if (map.credit && Math.abs(parseMoney(row[map.credit])) > 0 && amount > 0) importDirection = "credit";
  if (map.debit && Math.abs(parseMoney(row[map.debit])) > 0 && amount < 0) importDirection = "debit";
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
  const txs = state.transactions.filter((tx) => tx.date?.startsWith(month));
  const actualIncome = txs.filter((tx) => tx.type === "income" && !isTransferCategory(tx.category)).reduce((sum, tx) => sum + tx.amount, 0);
  const spending = txs.filter((tx) => tx.type === "expense" && !isTransferCategory(tx.category)).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const payments = txs.filter((tx) => tx.amount > 0 && (tx.type === "transfer" || isTransferCategory(tx.category))).reduce((sum, tx) => sum + tx.amount, 0);
  const recurring = txs.filter((tx) => tx.recurringStatus === "confirmed" || state.recurring.some((item) => item.merchant === tx.merchant && item.status !== "rejected")).reduce((sum, tx) => tx.type === "expense" ? sum + Math.abs(tx.amount) : sum, 0);
  const byCategory = {};
  txs.filter((tx) => tx.type === "expense" && !isTransferCategory(tx.category)).forEach((tx) => { byCategory[tx.category] = (byCategory[tx.category] || 0) + Math.abs(tx.amount); });
  const netSpending = spending - payments;
  return { actualIncome, spending, payments, netSpending, remaining: actualIncome - netSpending, recurring, reviewCount: txs.filter((tx) => tx.needsReview).length, byCategory };
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
  return `<p><span class="tag good">Actual income</span> ${money(summary.actualIncome)}</p><p><span class="tag danger">Spending</span> ${money(summary.spending)}</p><p><span class="tag good">Payments</span> ${money(summary.payments)}</p><p><span class="tag warn">Potential overtime</span> ${money(overtimeIncome())} kept separate from received income.</p><p><span class="tag warn">Review</span> ${summary.reviewCount} transactions need attention.</p>`;
}

function filteredTransactions() {
  return state.transactions.filter((tx) => {
    const f = state.filters;
    const haystack = `${tx.description} ${tx.merchant}`.toLowerCase();
    if (f.search && !haystack.includes(f.search.toLowerCase())) return false;
    if (f.start && tx.date < f.start) return false;
    if (f.end && tx.date > f.end) return false;
    if (f.month && !tx.date.startsWith(f.month)) return false;
    if (f.account && tx.accountId !== f.account) return false;
    if (f.category && tx.category !== f.category) return false;
    if (f.merchant && !tx.merchant.toLowerCase().includes(f.merchant.toLowerCase())) return false;
    if (f.hideCredits && isAccountCredit(tx)) return false;
    if (f.type === "review" && !tx.needsReview) return false;
    if (f.type === "uncategorized" && tx.category !== "Uncategorized") return false;
    if (["income", "expense", "transfer"].includes(f.type) && tx.type !== f.type) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));
}

function reviewQueue() {
  const recurringMerchants = new Set(state.recurring.filter((item) => item.status === "suggested").map((item) => item.merchant));
  return state.transactions.filter((tx) => tx.needsReview || tx.category === "Uncategorized" || tx.flags?.length || recurringMerchants.has(tx.merchant)).sort((a, b) => b.date.localeCompare(a.date));
}

function detectRecurring(transactions) {
  const groups = new Map();
  transactions.filter((tx) => tx.type === "expense" && !isTransferCategory(tx.category)).forEach((tx) => {
    const key = tx.merchant.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tx);
  });
  return Array.from(groups.values()).filter((items) => items.length >= 3).map((items) => {
    const sorted = items.sort((a, b) => a.date.localeCompare(b.date));
    const amounts = sorted.map((tx) => Math.abs(tx.amount));
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const intervals = sorted.slice(1).map((tx, index) => daysBetween(sorted[index].date, tx.date));
    const interval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const frequency = interval < 10 ? "weekly" : interval < 20 ? "biweekly" : interval < 45 ? "monthly" : interval < 110 ? "quarterly" : "annual";
    const last = sorted[sorted.length - 1];
    const flags = [];
    if (amounts[amounts.length - 1] > avg * 1.15) flags.push("price increase");
    if (daysBetween(last.date, new Date().toISOString().slice(0, 10)) > interval * 1.7) flags.push("missing expected charge");
    return { id: slug(`${last.merchant}-${frequency}`), merchant: last.merchant, expectedAmount: round(amounts[amounts.length - 1]), averageAmount: round(avg), frequency, expectedNextDate: addDays(last.date, Math.round(interval)), lastPaymentDate: last.date, confidence: Math.min(96, Math.round(55 + sorted.length * 8)), category: last.category, status: "suggested", flags };
  }).sort((a, b) => b.confidence - a.confidence);
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
  return months.map((m) => { const s = monthlySummary(m); return `<p><strong>${m}</strong> Income ${money(s.actualIncome)} · Expenses ${money(s.spending)} · Payments ${money(s.payments)} · Remaining ${money(s.remaining)}</p>`; }).join("");
}

function trendList(type) {
  if (monthOptions().length < 2) return `<div class="empty-state">Not enough historical data to calculate trends.</div>`;
  const current = state.transactions.filter((tx) => tx.date.startsWith(state.selectedMonth) && tx.type === "expense");
  const previousMonth = addMonth(state.selectedMonth, -1);
  const previous = state.transactions.filter((tx) => tx.date.startsWith(previousMonth) && tx.type === "expense");
  const sumBy = (rows) => rows.reduce((acc, tx) => { const key = type === "category" ? tx.category : tx.merchant; acc[key] = (acc[key] || 0) + Math.abs(tx.amount); return acc; }, {});
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
  const groups = groupedCategories();
  return groups.map((cat) => {
    const children = state.categories.filter((item) => item.parentId === cat.id).sort(categorySort);
    const parentOption = `<option value="${escapeAttr(cat.name)}" ${cat.name === selected ? "selected" : ""}>${escapeHtml(cat.name)}</option>`;
    if (!children.length) return parentOption;
    return `<optgroup label="${escapeAttr(cat.name)}">${parentOption}${children.map((child) => `<option value="${escapeAttr(child.name)}" ${child.name === selected ? "selected" : ""}>${escapeHtml(categoryBaseName(child))}</option>`).join("")}</optgroup>`;
  }).join("");
}

function parentCategoryOptions(selected, excludeId = "") {
  return groupedCategories()
    .filter((cat) => cat.id !== excludeId)
    .map((cat) => `<option value="${escapeAttr(cat.id)}" ${cat.id === selected ? "selected" : ""}>${escapeHtml(cat.name)}</option>`)
    .join("");
}

function defaultCategories() {
  const categories = DEFAULT_CATEGORIES.map((name) => ({ id: slug(name), name, parentId: "", system: true }));
  DEFAULT_SUBCATEGORIES.forEach((item) => {
    const parent = categories.find((cat) => cat.name === item.parent);
    if (parent) categories.push({ id: slug(`${parent.name}-${item.name}`), name: subcategoryName(parent.name, item.name), parentId: parent.id, system: true });
  });
  return categories;
}

function groupedCategories() {
  repairCategoryParents();
  return state.categories.filter((cat) => !cat.parentId).sort(categorySort);
}

function categoryTreeList() {
  return groupedCategories().flatMap((parent) => [parent, ...state.categories.filter((cat) => cat.parentId === parent.id).sort(categorySort)]);
}

function parentCategory(category) {
  return category?.parentId ? state.categories.find((cat) => cat.id === category.parentId) : null;
}

function categoryBaseName(category) {
  const parent = parentCategory(category);
  if (!parent) return category.name;
  const prefix = `${parent.name}: `;
  return category.name.startsWith(prefix) ? category.name.slice(prefix.length) : category.name;
}

function subcategoryName(parentName, name) {
  const base = sanitize(name).replace(/^.+:\s*/, "");
  return `${sanitize(parentName)}: ${base}`;
}

function categorySort(a, b) {
  if (a.name === "Uncategorized") return 1;
  if (b.name === "Uncategorized") return -1;
  return a.name.localeCompare(b.name);
}

function repairCategoryParents() {
  state.categories.forEach((category) => {
    if (category.parentId && !state.categories.some((parent) => parent.id === category.parentId)) category.parentId = "";
  });
}

function updateChildCategoryNames(parentCategoryItem, previousParentName) {
  state.categories.filter((cat) => cat.parentId === parentCategoryItem.id).forEach((child) => {
    const previousName = child.name;
    const childBaseName = previousName.startsWith(`${previousParentName}: `) ? previousName.slice(previousParentName.length + 2) : categoryBaseName(child);
    child.name = subcategoryName(parentCategoryItem.name, childBaseName);
    state.transactions.filter((tx) => tx.category === previousName).forEach((tx) => { tx.category = child.name; });
  });
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
