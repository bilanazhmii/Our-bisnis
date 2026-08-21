const $ = function(id) { return document.getElementById(id); };
const KEY = "kopiTutugDataV2";
const BRAND = { name: "El Matcha × el kopi", tagline: "Matcha, kopi, dan cerita baik" };
const PENDING_DELETES_KEY = KEY + "PendingDeletes";
const today = function() {
  var d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};
function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")); }
function numberValue(value, fallback) {
  var n = Number(value);
  return Number.isFinite(n) ? n : (fallback || 0);
}
function integerValue(value, fallback) {
  var n = Math.floor(numberValue(value, fallback));
  return n >= 0 ? n : 0;
}
const rupiah = function(n) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(Number(n) || 0);
};
const uniqueId = function() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2);
};

var MSG = {
  errorGeneric: "Terjadi kesalahan. Coba lagi.",
  errorNetwork: "Gagal menghubungi server. Periksa koneksi internet.",
  errorAuthServer: "Server Supabase mengalami kesalahan. Periksa konfigurasi Auth, SMTP, dan Auth Logs.",
  errorEmailDelivery: "Akun mungkin sudah dibuat, tetapi email verifikasi gagal dikirim. Periksa SMTP Supabase, lalu gunakan Kirim Ulang Verifikasi Email.",
  errorInvalidLogin: "Email atau password salah.",
  errorEmailNotConfirmed: "Email belum diverifikasi. Cek email Anda, atau gunakan Kirim Ulang Verifikasi Email.",
  errorAlreadyRegistered: "Email sudah terdaftar. Jika belum diverifikasi, klik Kirim Ulang Verifikasi Email. Jika sudah diverifikasi, isi email dan password di halaman Login.",
  errorRateLimit: "Terlalu banyak percobaan. Tunggu beberapa menit sebelum mencoba lagi.",
  errorWeakPassword: "Password terlalu lemah. Minimal 6 karakter.",
  errorSupabaseNotConfigured: "Supabase belum dikonfigurasi. Periksa environment variables di Vercel.",
  errorRequiredFields: "Email dan password wajib diisi.",
  errorRequiredRegisterFields: "Email, password, dan konfirmasi password wajib diisi.",
  errorPasswordMinLength: "Password minimal 6 karakter.",
  errorPasswordMismatch: "Konfirmasi password tidak cocok.",
  errorPinRequired: "PIN wajib diisi.",
  errorPinInvalid: "PIN salah.",
  successLogin: "Login berhasil.",
  successRegister: "Pendaftaran berhasil. Email verifikasi telah dikirim; periksa Inbox atau Spam, verifikasi email, lalu login.",
  successRegisterAutoLogin: "Registrasi berhasil! Anda sudah login.",
  successSync: "Data berhasil disinkronisasi dari cloud.",
  successSyncPartial: "Login berhasil, tetapi sinkronisasi data gagal.",
  successResendVerification: "Email verifikasi berhasil dikirim ulang. Cek inbox email Anda."
};

var supabaseUrl = "";
var supabaseKey = "";
var useSupabase = false;
var currentUser = null;
var userRole = "user";
var cachedUsers = [];
var registerInProgress = false;
var registerCooldownUntil = 0;
var verificationNotice = "";

function readVerificationNotice() {
  var params = new URLSearchParams(window.location.hash.slice(1));
  if (params.get("type") === "signup" && params.get("access_token")) {
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    return "Email berhasil diverifikasi. Silakan login menggunakan email dan password Anda.";
  }
  return "";
}

verificationNotice = readVerificationNotice();
var syncQueue = Promise.resolve();
var pendingDeletes = { products: [], sales: [], cashEntries: [], receivables: [], receivablePayments: [], changeReturns: [] };

try {
  pendingDeletes = JSON.parse(localStorage.getItem(PENDING_DELETES_KEY) || '{"products":[],"sales":[],"cashEntries":[],"receivables":[],"receivablePayments":[],"changeReturns":[]}');
} catch (error) {
  localStorage.removeItem(PENDING_DELETES_KEY);
}

if (!pendingDeletes || typeof pendingDeletes !== "object") pendingDeletes = { products: [], sales: [], cashEntries: [], receivables: [], receivablePayments: [], changeReturns: [] };
if (!Array.isArray(pendingDeletes.products)) pendingDeletes.products = [];
if (!Array.isArray(pendingDeletes.sales)) pendingDeletes.sales = [];
if (!Array.isArray(pendingDeletes.cashEntries)) pendingDeletes.cashEntries = [];
if (!Array.isArray(pendingDeletes.receivables)) pendingDeletes.receivables = [];
if (!Array.isArray(pendingDeletes.receivablePayments)) pendingDeletes.receivablePayments = [];
if (!Array.isArray(pendingDeletes.changeReturns)) pendingDeletes.changeReturns = [];

function hasValidSupabaseConfig(config) {
  return !!(
    config &&
    config.SUPABASE_URL &&
    config.SUPABASE_ANON_KEY &&
    config.SUPABASE_URL.indexOf("supabase.co") !== -1 &&
    config.SUPABASE_ANON_KEY.indexOf("your-anon-key") === -1
  );
}

async function fetchSupabaseConfig() {
  try {
    var res = await fetch("/api/config");
    if (res.ok) {
      var apiConfig = await res.json();
      if (hasValidSupabaseConfig(apiConfig)) {
        return apiConfig;
      }
    }
  } catch (error) {
    console.warn("Unable to load Supabase config from /api/config:", error);
  }

  if (typeof window !== "undefined" && hasValidSupabaseConfig(window)) {
    return {
      SUPABASE_URL: window.SUPABASE_URL,
      SUPABASE_ANON_KEY: window.SUPABASE_ANON_KEY
    };
  }

  return { SUPABASE_URL: "", SUPABASE_ANON_KEY: "" };
}

function loadOptionalLocalConfig() {
  return new Promise(function(resolve) {
    if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
      resolve();
      return;
    }

    var script = document.createElement("script");
    script.src = "config.js";
    script.onload = resolve;
    script.onerror = resolve;
    document.head.appendChild(script);
  });
}

async function initSupabase() {
  var config = await fetchSupabaseConfig();
  // Vercel provides config through /api/config. Only try the local, ignored
  // config.js fallback when that endpoint is unavailable (for static local use).
  if (!hasValidSupabaseConfig(config)) {
    await loadOptionalLocalConfig();
    config = await fetchSupabaseConfig();
  }
  if (hasValidSupabaseConfig(config)) {
    supabaseUrl = config.SUPABASE_URL.replace(/\/$/, "");
    supabaseKey = config.SUPABASE_ANON_KEY;
    useSupabase = true;
    console.log("Supabase initialized");
    return;
  }
  console.log("Supabase not configured, using local storage mode");
}

function extractErrorPayload(source) {
  if (!source) return null;

  if (typeof source === "string") {
    try {
      return JSON.parse(source);
    } catch (error) {
      return { message: source };
    }
  }

  if (source.details && typeof source.details === "object") {
    return source.details;
  }

  if (source.message && typeof source.message === "string") {
    try {
      var parsed = JSON.parse(source.message);
      if (parsed && typeof parsed === "object") return parsed;
    } catch (error) {
      return { message: source.message };
    }
  }

  if (typeof source === "object") return source;
  return null;
}

function parseSupabaseError(source) {
  var payload = extractErrorPayload(source);
  if (!payload) return source && source.status >= 500 ? MSG.errorAuthServer : MSG.errorGeneric;

  var combined = [
    payload.msg,
    payload.message,
    payload.error_description,
    payload.error,
    payload.hint,
    payload.code,
    payload.error_code
  ].filter(Boolean).join(" ").toLowerCase();

  if (source && source.status === 429 || combined.indexOf("rate limit") !== -1 || payload.error_code === "over_request_rate_limit") return MSG.errorRateLimit;
  if (combined.indexOf("email not confirmed") !== -1 || combined.indexOf("not confirmed") !== -1 || payload.error_code === "email_not_confirmed") return MSG.errorEmailNotConfirmed;
  if (combined.indexOf("already registered") !== -1 || combined.indexOf("user already registered") !== -1 || combined.indexOf("email_exists") !== -1 || payload.error_code === "user_already_exists" || payload.error_code === "email_exists") return MSG.errorAlreadyRegistered;
  if (combined.indexOf("error sending confirmation email") !== -1 || combined.indexOf("sending confirmation email") !== -1 || combined.indexOf("smtp") !== -1 || combined.indexOf("email delivery") !== -1) return MSG.errorEmailDelivery;
  if (combined.indexOf("invalid login") !== -1 || combined.indexOf("invalid credentials") !== -1 || combined.indexOf("invalid_grant") !== -1 || payload.error_code === "invalid_credentials") return MSG.errorInvalidLogin;
  if (combined.indexOf("weak password") !== -1 || combined.indexOf("password should") !== -1 || (combined.indexOf("password") !== -1 && (combined.indexOf("minimum") !== -1 || combined.indexOf("mínimo") !== -1 || combined.indexOf("character") !== -1 || combined.indexOf("caracter") !== -1)) || payload.error_code === "weak_password") return MSG.errorWeakPassword;
  if (combined.indexOf("request failed") !== -1 || combined.indexOf("network") !== -1) return MSG.errorNetwork;

  if (source && source.status >= 500) {
    console.error("Supabase Auth/database error:", source.details || source);
    return MSG.errorAuthServer;
  }

  return MSG.errorGeneric;
}

function parseResponseBody(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    return { message: text };
  }
}

async function supabaseFetch(path, options) {
  if (!options) options = {};

  var headers = Object.assign({
    apikey: supabaseKey,
    Authorization: "Bearer " + supabaseKey,
    "Content-Type": "application/json"
  }, options.headers || {});

  if (options.accessToken) {
    headers.Authorization = "Bearer " + options.accessToken;
  }

  var res = await fetch(supabaseUrl + path, {
    method: options.method || "GET",
    headers: headers,
    body: options.body || undefined
  });

  var text = await res.text();
  var data = parseResponseBody(text);

  if (!res.ok) {
    var authError = new Error(parseSupabaseError(data));
    authError.details = data;
    authError.status = res.status;
    throw authError;
  }

  return data;
}

async function supabaseSignUp(email, password) {
  return supabaseFetch("/auth/v1/signup", {
    method: "POST",
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password: password
    })
  });
}

async function supabaseSignIn(email, password) {
  return supabaseFetch("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password: password
    })
  });
}

async function supabaseGetUser() {
  var accessToken = sessionStorage.getItem('supabaseAccessToken');
  if (!accessToken) return null;
  try {
    var res = await fetch(supabaseUrl + '/auth/v1/user', {
      headers: {
        'apikey': supabaseKey,
        'Authorization': 'Bearer ' + accessToken
      }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function supabaseSignOut() {
  var accessToken = sessionStorage.getItem("supabaseAccessToken");
  if (!accessToken) return;

  try {
    await supabaseFetch("/auth/v1/logout", {
      method: "POST",
      accessToken: accessToken
    });
  } catch (error) {
    console.warn("Supabase logout failed:", error);
  }
}

async function supabaseResendVerification(email) {
  return supabaseFetch("/auth/v1/resend", {
    method: "POST",
    body: JSON.stringify({
      type: "signup",
      email: email.trim().toLowerCase()
    })
  });
}

async function supabaseSelect(table, accessToken, query) {
  return supabaseFetch("/rest/v1/" + table + "?select=*" + (query ? "&" + query : ""), {
    accessToken: accessToken
  });
}

async function supabaseUpsert(table, data, accessToken) {
  return supabaseFetch("/rest/v1/" + table + "?on_conflict=id", {
    method: "POST",
    accessToken: accessToken,
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(data)
  });
}

async function supabaseDelete(table, id, accessToken) {
  return supabaseFetch("/rest/v1/" + table + "?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    accessToken: accessToken
  });
}

async function supabaseUpdate(table, id, data, accessToken) {
  return supabaseFetch("/rest/v1/" + table + "?id=eq." + id, {
    method: "PATCH",
    accessToken: accessToken,
    body: JSON.stringify(data)
  });
}

var db = JSON.parse(localStorage.getItem(KEY) || "null");
if (!db) {
  var oldSales = JSON.parse(localStorage.getItem("dataPenjualan") || "[]");
  var products = [];
  oldSales.forEach(function(s) {
    if (!products.some(function(p) { return p.name === s.barang; })) {
      products.push({ id: uniqueId(), name: s.barang, category: "Umum", unit: "pcs", cost: 0, price: Number(s.harga) || 0, stock: 0, minStock: 0, active: true, note: "" });
    }
  });
  db = {
    pin: "1234",
    products: products,
    sales: oldSales.map(function(s, legacyIndex) {
      var p = products.find(function(p) { return p.name === s.barang; });
      var price = Number(s.harga) || 0, qty = Number(s.jumlah) || 0;
      return {
        id: uniqueId(),
        date: s.tanggal,
        billNo: fallbackBillNo(s.tanggal, s.id || (s.tanggal + "-" + legacyIndex)),
        productId: p ? p.id : null,
        product: s.barang,
        price: price,
        qty: qty,
        cost: 0,
        total: Number(s.total) || price * qty,
        profit: price * qty,
        paymentMethod: "cash",
        paidAmount: Number(s.total) || price * qty,
        changeAmount: 0,
        customer: "",
        dueDate: "",
        note: "",
        orderReceived: false
      };
    }),
    cashEntries: [],
    receivables: [],
    receivablePayments: []
  };
  localStorage.setItem(KEY, JSON.stringify(db));
}

if (!db || typeof db !== "object") db = { pin: "1234", products: [], sales: [] };
if (!db.pin) db.pin = "1234";
if (!Array.isArray(db.products)) db.products = [];
if (!Array.isArray(db.sales)) db.sales = [];
if (!Array.isArray(db.cashEntries)) db.cashEntries = [];
if (!Array.isArray(db.receivables)) db.receivables = [];
if (!Array.isArray(db.receivablePayments)) db.receivablePayments = [];
if (!Array.isArray(db.changeReturns)) db.changeReturns = [];
db.products = db.products.filter(function(p) { return p && p.id && String(p.name || "").trim(); }).map(function(p) {
    return { id: String(p.id), name: String(p.name).trim(), category: String(p.category || "Umum").trim(), unit: String(p.unit || "pcs").trim(), cost: numberValue(p.cost), price: numberValue(p.price), stock: integerValue(p.stock), minStock: integerValue(p.minStock), active: p.active !== false, note: String(p.note || "") };
});
db.sales = db.sales.filter(function(s) { return s && s.id && validDate(s.date) && String(s.product || "").trim(); }).map(function(s) {
  var price = numberValue(s.price), qty = integerValue(s.qty), cost = numberValue(s.cost), total = price * qty, discount = Math.min(total, numberValue(s.discount)), netTotal = total - discount;
  return { id: String(s.id), date: s.date, billNo: String(s.billNo || fallbackBillNo(s.date, s.id)), productId: s.productId || null, product: String(s.product), price: price, qty: qty, cost: cost, total: netTotal, discount: discount, profit: (price - cost) * qty - discount, paymentMethod: String(s.paymentMethod || "cash"), paidAmount: Math.max(0, Math.min(netTotal, numberValue(s.paidAmount, s.paymentMethod === "credit" ? 0 : netTotal))), tenderedAmount: Math.max(0, numberValue(s.tenderedAmount, s.paidAmount)), changeAmount: Math.max(0, numberValue(s.changeAmount)), changeRecipient: String(s.changeRecipient || s.customer || ""), orderReceived: s.orderReceived === true, customer: String(s.customer || ""), dueDate: validDate(s.dueDate) ? s.dueDate : "", note: String(s.note || ""), receivableId: s.receivableId || null, createdAt: s.createdAt || null };
});
db.cashEntries = db.cashEntries.filter(function(e) { return e && e.id && validDate(e.date); }).map(function(e) { return { id: String(e.id), date: e.date, type: e.type === "out" ? "out" : "in", category: String(e.category || "Lainnya"), amount: Math.max(0, numberValue(e.amount)), party: String(e.party || ""), reference: String(e.reference || ""), note: String(e.note || ""), source: String(e.source || "manual"), sourceId: e.sourceId || null, createdAt: e.createdAt || null }; });
db.receivables = db.receivables.filter(function(r) { return r && r.id && validDate(r.date) && String(r.customer || "").trim(); }).map(function(r) { return { id: String(r.id), saleId: r.saleId || null, billNo: String(r.billNo || fallbackBillNo(r.date, r.saleId || r.id)), date: r.date, customer: String(r.customer).trim(), dueDate: validDate(r.dueDate) ? r.dueDate : "", total: Math.max(0, numberValue(r.total)), note: String(r.note || ""), createdAt: r.createdAt || null }; });
db.receivablePayments = db.receivablePayments.filter(function(p) { return p && p.id && p.receivableId && validDate(p.date); }).map(function(p) { return { id: String(p.id), receivableId: String(p.receivableId), date: p.date, amount: Math.max(0, numberValue(p.amount)), method: String(p.method || "cash"), note: String(p.note || ""), createdAt: p.createdAt || null }; });
db.changeReturns = db.changeReturns.filter(function(r) { return r && r.id && r.saleId && validDate(r.date); }).map(function(r) { return { id: String(r.id), saleId: String(r.saleId), billNo: String(r.billNo || fallbackBillNo(r.date, r.saleId || r.id)), date: r.date, recipient: String(r.recipient || ""), amount: Math.max(0, numberValue(r.amount)), note: String(r.note || ""), createdAt: r.createdAt || null }; });

function prepareUserData(userId) {
  var previous = null;
  try { previous = JSON.parse(sessionStorage.getItem("supabaseUser") || "null"); } catch (error) { previous = null; }
  if (previous && previous.id && previous.id !== userId) {
    db = { pin: "1234", products: [], sales: [], cashEntries: [], receivables: [], receivablePayments: [], changeReturns: [] };
    saveLocal();
  }
}

function saveLocal() {
  localStorage.setItem(KEY, JSON.stringify(db));
}

function save() {
  saveLocal();
  syncQueue = syncQueue.catch(function() { return false; }).then(syncToSupabase);
}

function savePendingDeletes() {
  localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(pendingDeletes));
}

function queueRemoteDelete(table, id) {
  if (!id) return;
  var list = pendingDeletes[table];
  if (!Array.isArray(list)) return;
  var userId = currentUser && currentUser.id ? currentUser.id : null;
  if (!list.some(function(item) { return item.id === id && item.userId === userId; })) {
    list.push({ id: id, userId: userId });
    savePendingDeletes();
  }
}

async function syncToSupabase() {
  if (!useSupabase) return;
  var accessToken = sessionStorage.getItem('supabaseAccessToken');
  if (!accessToken) return;
  if (!currentUser || !currentUser.id) return;

  try {
    var userId = currentUser.id;
    var tables = ["products", "sales", "cashEntries", "receivables", "receivablePayments", "changeReturns"];
    var remoteTables = { cashEntries: "cash_entries", receivables: "receivables", receivablePayments: "receivable_payments", changeReturns: "change_returns" };
    var deletedIds = {};
    for (var di = 0; di < tables.length; di++) {
      var localTable = tables[di];
      deletedIds[localTable] = pendingDeletes[localTable].filter(function(item) { return item.userId === userId; }).map(function(item) { return item.id; });
      var deleteItems = pendingDeletes[localTable].filter(function(item) { return item.userId === userId; });
      var remoteTable = remoteTables[localTable] || localTable;
      await Promise.all(deleteItems.map(function(item) { return supabaseDelete(remoteTable, item.id, accessToken); }));
      pendingDeletes[localTable] = pendingDeletes[localTable].filter(function(item) { return item.userId !== userId; });
    }
    savePendingDeletes();
    var activeProducts = db.products.filter(function(p) { return deletedIds.products.indexOf(p.id) === -1; });
    var activeSales = db.sales.filter(function(s) { return deletedIds.sales.indexOf(s.id) === -1; });
    var activeCashEntries = db.cashEntries.filter(function(e) { return deletedIds.cashEntries.indexOf(e.id) === -1; });
    var activeReceivables = db.receivables.filter(function(r) { return deletedIds.receivables.indexOf(r.id) === -1; });
    var activeReceivablePayments = db.receivablePayments.filter(function(p) { return deletedIds.receivablePayments.indexOf(p.id) === -1; });
    var activeChangeReturns = db.changeReturns.filter(function(r) { return deletedIds.changeReturns.indexOf(r.id) === -1; });
    if (activeProducts.length > 0) {
      await supabaseUpsert('products', activeProducts.map(function(p) {
        return { id: p.id, name: p.name, category: p.category || "Umum", unit: p.unit || "pcs", cost: p.cost, price: p.price, stock: p.stock, min_stock: p.minStock || 0, active: p.active !== false, note: p.note || "", user_id: userId };
      }), accessToken);
    }
    if (activeSales.length > 0) {
      await supabaseUpsert('sales', activeSales.map(function(s) {
        return {
          id: s.id, date: s.date, bill_no: s.billNo || fallbackBillNo(s.date, s.id), product_id: s.productId || ("legacy-" + s.id), product: s.product,
          price: s.price, qty: s.qty, cost: s.cost, total: s.total, profit: s.profit, discount: s.discount || 0,
          payment_method: s.paymentMethod || "cash", paid_amount: s.paidAmount || 0, tendered_amount: s.tenderedAmount == null ? (s.paidAmount || 0) : s.tenderedAmount, change_amount: s.changeAmount || 0,
          customer: s.customer || "", change_recipient: s.changeRecipient || s.customer || "", order_received: s.orderReceived === true, due_date: s.dueDate || null, note: s.note || "", receivable_id: s.receivableId || null, user_id: userId
        };
      }), accessToken);
    }
    if (activeCashEntries.length > 0) await supabaseUpsert('cash_entries', activeCashEntries.map(function(e) { return { id: e.id, date: e.date, type: e.type, category: e.category, amount: e.amount, party: e.party, reference: e.reference, note: e.note, source: e.source, source_id: e.sourceId, user_id: userId }; }), accessToken);
    if (activeReceivables.length > 0) await supabaseUpsert('receivables', activeReceivables.map(function(r) { return { id: r.id, sale_id: r.saleId, bill_no: r.billNo || fallbackBillNo(r.date, r.saleId || r.id), date: r.date, customer: r.customer, due_date: r.dueDate || null, total: r.total, note: r.note, user_id: userId }; }), accessToken);
    if (activeReceivablePayments.length > 0) await supabaseUpsert('receivable_payments', activeReceivablePayments.map(function(p) { return { id: p.id, receivable_id: p.receivableId, date: p.date, amount: p.amount, method: p.method, note: p.note, user_id: userId }; }), accessToken);
    if (activeChangeReturns.length > 0) await supabaseUpsert('change_returns', activeChangeReturns.map(function(r) { return { id: r.id, sale_id: r.saleId, bill_no: r.billNo, date: r.date, recipient: r.recipient, amount: r.amount, note: r.note, user_id: userId }; }), accessToken);
  } catch (error) {
    console.error('Sync error:', error);
  }
}

async function syncFromSupabase() {
  if (!useSupabase) return false;
  var accessToken = sessionStorage.getItem('supabaseAccessToken');
  if (!accessToken || !currentUser || !currentUser.id) return false;

  try {
    await fetchUserRole(currentUser.id);

    var userFilter = 'user_id=eq.' + encodeURIComponent(currentUser.id);
    var products = await supabaseSelect('products', accessToken, userFilter);
    var sales = await supabaseSelect('sales', accessToken, userFilter);
    var cashEntries = await supabaseSelect('cash_entries', accessToken, userFilter);
    var receivables = await supabaseSelect('receivables', accessToken, userFilter);
    var receivablePayments = await supabaseSelect('receivable_payments', accessToken, userFilter);
    var changeReturns = await supabaseSelect('change_returns', accessToken, userFilter);

    var userDeletedProducts = pendingDeletes.products.filter(function(item) { return item.userId === currentUser.id; }).map(function(item) { return item.id; });
    var userDeletedSales = pendingDeletes.sales.filter(function(item) { return item.userId === currentUser.id; }).map(function(item) { return item.id; });
    var userDeletedCash = pendingDeletes.cashEntries.filter(function(item) { return item.userId === currentUser.id; }).map(function(item) { return item.id; });
    var userDeletedReceivables = pendingDeletes.receivables.filter(function(item) { return item.userId === currentUser.id; }).map(function(item) { return item.id; });
    var userDeletedPayments = pendingDeletes.receivablePayments.filter(function(item) { return item.userId === currentUser.id; }).map(function(item) { return item.id; });
    var userDeletedChangeReturns = pendingDeletes.changeReturns.filter(function(item) { return item.userId === currentUser.id; }).map(function(item) { return item.id; });
    if (Array.isArray(products)) db.products = products.filter(function(p) { return userDeletedProducts.indexOf(p.id) === -1; }).map(function(p) { return { id: p.id, name: String(p.name || ""), category: String(p.category || "Umum"), unit: String(p.unit || "pcs"), cost: numberValue(p.cost), price: numberValue(p.price), stock: integerValue(p.stock), minStock: integerValue(p.min_stock), active: p.active !== false, note: String(p.note || "") }; });
    if (Array.isArray(sales)) db.sales = sales.filter(function(s) { return userDeletedSales.indexOf(s.id) === -1; }).map(function(s) { var price = numberValue(s.price), qty = integerValue(s.qty), cost = numberValue(s.cost), discount = Math.min(price * qty, numberValue(s.discount)), netTotal = price * qty - discount; return { id: s.id, date: validDate(s.date) ? s.date : today(), billNo: String(s.bill_no || fallbackBillNo(s.date, s.id)), productId: s.product_id, product: String(s.product || ""), price: price, qty: qty, cost: cost, total: netTotal, discount: discount, profit: (price - cost) * qty - discount, paymentMethod: String(s.payment_method || "cash"), paidAmount: Math.max(0, Math.min(netTotal, numberValue(s.paid_amount, s.payment_method === "credit" ? 0 : netTotal))), tenderedAmount: Math.max(0, numberValue(s.tendered_amount, s.paid_amount)), changeAmount: Math.max(0, numberValue(s.change_amount)), customer: String(s.customer || ""), changeRecipient: String(s.change_recipient || s.customer || ""), orderReceived: s.order_received === true, dueDate: validDate(s.due_date) ? s.due_date : "", note: String(s.note || ""), receivableId: s.receivable_id || null, createdAt: s.created_at || null }; });
    if (Array.isArray(cashEntries)) db.cashEntries = cashEntries.filter(function(e) { return userDeletedCash.indexOf(e.id) === -1; }).map(function(e) { return { id: e.id, date: validDate(e.date) ? e.date : today(), type: e.type === "out" ? "out" : "in", category: String(e.category || "Lainnya"), amount: Math.max(0, numberValue(e.amount)), party: String(e.party || ""), reference: String(e.reference || ""), note: String(e.note || ""), source: String(e.source || "manual"), sourceId: e.source_id || null, createdAt: e.created_at || null }; });
    if (Array.isArray(receivables)) db.receivables = receivables.filter(function(r) { return userDeletedReceivables.indexOf(r.id) === -1; }).map(function(r) { return { id: r.id, saleId: r.sale_id || null, billNo: String(r.bill_no || fallbackBillNo(r.date, r.sale_id || r.id)), date: validDate(r.date) ? r.date : today(), customer: String(r.customer || ""), dueDate: validDate(r.due_date) ? r.due_date : "", total: Math.max(0, numberValue(r.total)), note: String(r.note || ""), createdAt: r.created_at || null }; });
    if (Array.isArray(receivablePayments)) db.receivablePayments = receivablePayments.filter(function(p) { return userDeletedPayments.indexOf(p.id) === -1; }).map(function(p) { return { id: p.id, receivableId: p.receivable_id, date: validDate(p.date) ? p.date : today(), amount: Math.max(0, numberValue(p.amount)), method: String(p.method || "cash"), note: String(p.note || ""), createdAt: p.created_at || null }; });
    if (Array.isArray(changeReturns)) db.changeReturns = changeReturns.filter(function(r) { return userDeletedChangeReturns.indexOf(r.id) === -1; }).map(function(r) { return { id: r.id, saleId: r.sale_id, billNo: String(r.bill_no || fallbackBillNo(r.date, r.sale_id || r.id)), date: validDate(r.date) ? r.date : today(), recipient: String(r.recipient || ""), amount: Math.max(0, numberValue(r.amount)), note: String(r.note || ""), createdAt: r.created_at || null }; });
    saveLocal();
    console.log('Data synced from Supabase');
    return true;
  } catch (error) {
    console.error('Sync from Supabase error:', error);
    return false;
  }
}

async function fetchUserRole(userId) {
  if (!useSupabase) return;
  var accessToken = sessionStorage.getItem("supabaseAccessToken");
  if (!accessToken) return;

  try {
    var data = await supabaseFetch("/rest/v1/user_roles?user_id=eq." + userId + "&select=role", {
      accessToken: accessToken
    });
    userRole = (data[0] && data[0].role) || 'user';
    console.log('User role:', userRole);
  } catch (error) {
    console.error('Error fetching user role:', error);
    userRole = 'user';
  }
}

function isAdmin() {
  return userRole === 'admin' || userRole === 'super_admin';
}

function isSuperAdmin() {
  return userRole === 'super_admin';
}

async function loadUsers() {
  if (!useSupabase || !isAdmin()) return;
  var accessToken = sessionStorage.getItem('supabaseAccessToken');
  if (!accessToken) return;

  try {
    cachedUsers = await supabaseSelect('user_roles', accessToken) || [];
    renderUsersTable(cachedUsers);
    updateUserStats(cachedUsers);
  } catch (error) {
    console.error('Error loading users:', error);
    toast('Gagal memuat daftar user');
  }
}

function renderUsersTable(users) {
  if (!$("usersTable") || !$("userSearch")) return;

  var search = $("userSearch").value.toLowerCase();
  var filtered = users.filter(function(u) { return (u.email || '').toLowerCase().indexOf(search) !== -1; });

  $("usersTable").innerHTML = filtered.map(function(u) {
    return '<tr>' +
      '<td>' + esc(u.email) + '</td>' +
      '<td><select onchange="changeUserRole(\'' + u.id + '\', this.value)" ' + (!isSuperAdmin() && u.role === 'super_admin' ? 'disabled' : '') + '>' +
        '<option value="user" ' + (u.role === 'user' ? 'selected' : '') + '>User</option>' +
        '<option value="admin" ' + (u.role === 'admin' ? 'selected' : '') + '>Admin</option>' +
        '<option value="super_admin" ' + (u.role === 'super_admin' ? 'selected' : '') + ' ' + (!isSuperAdmin() ? 'disabled' : '') + '>Super Admin</option>' +
      '</select></td>' +
      '<td>' + new Date(u.created_at).toLocaleDateString('id-ID') + '</td>' +
      '<td>' + (isSuperAdmin() ? '<button class="mini del" onclick="deleteUser(\'' + u.id + '\')">Hapus</button>' : '') + '</td>' +
    '</tr>';
  }).join('') || '<tr><td colspan="4">Tidak ada user.</td></tr>';
}

function updateUserStats(users) {
  if ($("totalUsers")) $("totalUsers").textContent = users.length;
  if ($("totalAdmins")) $("totalAdmins").textContent = users.filter(function(u) { return u.role === 'admin' || u.role === 'super_admin'; }).length;
  if ($("totalRegularUsers")) $("totalRegularUsers").textContent = users.filter(function(u) { return u.role === 'user'; }).length;
}

async function changeUserRole(userId, newRole) {
  if (!useSupabase || !isSuperAdmin()) {
    toast('Hanya super admin yang bisa mengubah role');
    return;
  }
  var accessToken = sessionStorage.getItem('supabaseAccessToken');
  if (!accessToken) return;

  try {
    await supabaseUpdate('user_roles', userId, { role: newRole }, accessToken);
    toast('Role pengguna berhasil diubah');
    loadUsers();
  } catch (error) {
    console.error('Error changing user role:', error);
    toast('Gagal mengubah role pengguna');
  }
}

async function deleteUser(userId) {
  if (!confirm('Hapus pengguna ini?')) return;
  if (!useSupabase || !isSuperAdmin()) {
    toast('Hanya super admin yang bisa menghapus pengguna');
    return;
  }
  var accessToken = sessionStorage.getItem('supabaseAccessToken');
  if (!accessToken) return;

  try {
    await supabaseDelete('user_roles', userId, accessToken);
    toast('Role pengguna dihapus. Hapus akun dari dashboard Supabase.');
    loadUsers();
  } catch (error) {
    console.error('Error deleting user:', error);
    toast('Gagal menghapus pengguna');
  }
}

function toast(t) {
  if (!$("toast")) return;
  $("toast").textContent = t;
  $("toast").classList.add("show");
  setTimeout(function() { $("toast").classList.remove("show"); }, 2200);
}

function showLoginMessage(message, isSuccess) {
  if (!$("loginMsg")) return;
  $("loginMsg").textContent = message;
  $("loginMsg").classList.toggle("success", !!isSuccess);
  toast(message);
}

function logged() {
  return sessionStorage.getItem("adminLogin") === "1";
}

function updateLoginMode() {
  var localForm = $("localLoginForm");
  var loginTabs = document.querySelector(".login-tabs");
  var loginForm = $("loginForm");
  var registerForm = $("registerForm");
  if (!localForm || !loginTabs || !loginForm || !registerForm) return;

  if (useSupabase) {
    localForm.classList.add("hidden");
    loginTabs.classList.remove("hidden");
    loginForm.classList.remove("hidden");
  } else {
    localForm.classList.remove("hidden");
    loginTabs.classList.add("hidden");
    loginForm.classList.add("hidden");
    registerForm.classList.add("hidden");
    if ($("resendVerificationBtn")) $("resendVerificationBtn").classList.add("hidden");
  }
}

async function restoreSession() {
  if (useSupabase) {
    var accessToken = sessionStorage.getItem('supabaseAccessToken');
    if (!accessToken || !logged()) return false;

    var user = await supabaseGetUser();
    if (!user) {
      sessionStorage.removeItem("adminLogin");
      sessionStorage.removeItem("supabaseAccessToken");
      sessionStorage.removeItem("supabaseUser");
      return false;
    }

    prepareUserData(user.id);
    currentUser = user;
    sessionStorage.setItem("supabaseUser", JSON.stringify(user));
    await fetchUserRole(user.id);
    var synced = await syncFromSupabase();
    showApp();
    if (!synced) toast("Mode cloud belum tersinkron. Data lokal tetap tersedia.");
    renderAll();
    return true;
  }

  if (logged()) {
    showApp();
    return true;
  }

  return false;
}

function boot() {
  initSupabase().then(function() {
    updateLoginMode();
    if (verificationNotice && $("loginMsg")) {
      showLoginMessage(verificationNotice, true);
    }
    return restoreSession();
  }).catch(function(error) {
    console.error('Boot error:', error);
    updateLoginMode();
  });

  // Main app handlers
  if ($("logoutBtn")) $("logoutBtn").onclick = handleSupabaseLogout;
  if ($("menuBtn")) $("menuBtn").onclick = function() { $("sideNav").classList.toggle("open"); };

  // Navigation handlers
  var navBtns = document.querySelectorAll(".nav-btn[data-page]");
  for (var i = 0; i < navBtns.length; i++) {
    navBtns[i].onclick = (function(btn) { return function() { showPage(btn.dataset.page); }; })(navBtns[i]);
  }

  // Date inputs
  if ($("dashDate")) $("dashDate").value = today();
  if ($("saleDate")) $("saleDate").value = today();
  if ($("cashDate")) $("cashDate").value = today();
  if ($("reportFrom")) $("reportFrom").value = today();
  if ($("reportTo")) $("reportTo").value = today();

  // Sales handlers
  if ($("saleProduct")) $("saleProduct").onchange = syncSalePrice;
  if ($("salePrice")) $("salePrice").oninput = calcSaleTotal;
  if ($("saleQty")) $("saleQty").oninput = calcSaleTotal;
  if ($("salePaid")) $("salePaid").oninput = calcSaleTotal;
  if ($("salePaymentMethod")) $("salePaymentMethod").onchange = calcSaleTotal;
  if ($("addSaleBtn")) $("addSaleBtn").onclick = addSale;
  if ($("saleSearch")) $("saleSearch").oninput = renderSales;
  if ($("changeSearch")) $("changeSearch").oninput = renderPendingChanges;

  // Product handlers
  if ($("addProductBtn")) $("addProductBtn").onclick = addProduct;
  if ($("productSearch")) $("productSearch").oninput = renderProducts;

  // Cash and receivables handlers
  if ($("addCashBtn")) $("addCashBtn").onclick = addCashEntry;
  if ($("cashSearch")) $("cashSearch").oninput = renderCash;
  if ($("receivableSearch")) $("receivableSearch").oninput = renderReceivables;

  // Report handlers
  if ($("reportBtn")) $("reportBtn").onclick = renderReport;
  if ($("exportCsvBtn")) $("exportCsvBtn").onclick = exportCSV;
  if ($("printReportBtn")) $("printReportBtn").onclick = printReport;

  // Backup handlers
  if ($("backupBtn")) $("backupBtn").onclick = backup;
  if ($("restoreBtn")) $("restoreBtn").onclick = restore;

  // Settings handlers
  if ($("changePinBtn")) $("changePinBtn").onclick = changePin;
  if ($("clearBtn")) $("clearBtn").onclick = clearData;
  if ($("dashDate")) $("dashDate").onchange = renderDashboard;

  // Login tabs
  if ($("loginTab")) $("loginTab").onclick = function() { showLoginTab("login"); };
  if ($("registerTab")) $("registerTab").onclick = function() { showLoginTab("register"); };
  if ($("emailLoginBtn")) $("emailLoginBtn").onclick = handleEmailLogin;
  if ($("registerBtn")) $("registerBtn").onclick = handleEmailRegister;
  if ($("resendVerificationBtn")) $("resendVerificationBtn").onclick = handleResendVerification;
  if ($("pinLoginBtn")) $("pinLoginBtn").onclick = handlePinLogin;
  if ($("pinInput")) $("pinInput").addEventListener("keydown", function(e) {
    if (e.key === "Enter") handlePinLogin();
  });

  // Admin dashboard
  if ($("userSearch")) $("userSearch").oninput = function() { renderUsersTable(cachedUsers); };
  if ($("refreshUsersBtn")) $("refreshUsersBtn").onclick = loadUsers;
}

function showLoginTab(tab) {
  if (!$("loginTab") || !$("registerTab") || !$("loginForm") || !$("registerForm")) return;

  if (tab === "login") {
    $("loginTab").classList.add("active");
    $("registerTab").classList.remove("active");
    $("loginForm").classList.remove("hidden");
    $("registerForm").classList.add("hidden");
  } else {
    $("registerTab").classList.add("active");
    $("loginTab").classList.remove("active");
    $("registerForm").classList.remove("hidden");
    $("loginForm").classList.add("hidden");
  }
  if ($("resendVerificationBtn")) $("resendVerificationBtn").classList.add("hidden");
}

function handlePinLogin() {
  if (!$("pinInput") || !$("loginMsg")) return;

  var pin = $("pinInput").value.trim();
  if (!pin) {
    $("loginMsg").textContent = MSG.errorPinRequired;
    toast(MSG.errorPinRequired);
    return;
  }

  if (pin !== db.pin) {
    $("loginMsg").textContent = MSG.errorPinInvalid;
    toast(MSG.errorPinInvalid);
    return;
  }

  sessionStorage.setItem("adminLogin", "1");
  $("loginMsg").textContent = "";
  showApp();
  toast(MSG.successLogin);
}

async function handleEmailLogin() {
  if (!$("emailInput") || !$("passwordInput") || !$("loginMsg")) return;

  var email = $("emailInput").value.trim();
  var password = $("passwordInput").value;

  if (!email || !password) {
    $("loginMsg").textContent = MSG.errorRequiredFields;
    toast(MSG.errorRequiredFields);
    return;
  }

  if (!useSupabase) {
    $("loginMsg").textContent = MSG.errorSupabaseNotConfigured;
    toast(MSG.errorSupabaseNotConfigured);
    return;
  }

  try {
    var data = await supabaseSignIn(email, password);

    if (!data.access_token || !data.user) {
      $("loginMsg").textContent = MSG.errorGeneric;
      toast(MSG.errorGeneric);
      return;
    }

    if (!data.user.email_confirmed_at) {
      $("loginMsg").textContent = MSG.errorEmailNotConfirmed;
      toast(MSG.errorEmailNotConfirmed);
      if ($("resendVerificationBtn")) $("resendVerificationBtn").classList.remove("hidden");
      return;
    }

    prepareUserData(data.user.id);
    currentUser = data.user;
    sessionStorage.setItem("adminLogin", "1");
    sessionStorage.setItem("supabaseUser", JSON.stringify(data.user));
    sessionStorage.setItem("supabaseAccessToken", data.access_token);

    await fetchUserRole(data.user.id);

    var synced = await syncFromSupabase();
    showApp();
    if (synced) {
      renderAll();
      toast(MSG.successSync);
    } else {
      toast(MSG.successSyncPartial);
    }
  } catch (error) {
    var msg = parseSupabaseError(error);
    if (msg === MSG.errorEmailNotConfirmed || msg === MSG.errorAlreadyRegistered) {
      if ($("resendVerificationBtn")) $("resendVerificationBtn").classList.remove("hidden");
    }
    $("loginMsg").textContent = msg;
    toast(msg);
  }
}

async function handleEmailRegister() {
  if (!$("registerEmailInput") || !$("registerPasswordInput") || !$("registerConfirmPasswordInput") || !$("loginMsg")) return;

  var email = $("registerEmailInput").value.trim();
  var password = $("registerPasswordInput").value;
  var confirmPassword = $("registerConfirmPasswordInput").value;

  if (!email || !password || !confirmPassword) {
    $("loginMsg").textContent = MSG.errorRequiredRegisterFields;
    toast(MSG.errorRequiredRegisterFields);
    return;
  }

  if (password.length < 6) {
    $("loginMsg").textContent = MSG.errorPasswordMinLength;
    toast(MSG.errorPasswordMinLength);
    return;
  }

  if (password !== confirmPassword) {
    $("loginMsg").textContent = MSG.errorPasswordMismatch;
    toast(MSG.errorPasswordMismatch);
    return;
  }

  if (!useSupabase) {
    $("loginMsg").textContent = MSG.errorSupabaseNotConfigured;
    toast(MSG.errorSupabaseNotConfigured);
    return;
  }

  if (registerInProgress) return;
  if (Date.now() < registerCooldownUntil) {
    showLoginMessage(MSG.errorRateLimit, false);
    return;
  }

  var registerButton = $("registerBtn");
  registerInProgress = true;
  if (registerButton) {
    registerButton.disabled = true;
    registerButton.textContent = "Mendaftarkan...";
  }
  try {
    var data = await supabaseSignUp(email, password);

    if (data && data.user && data.session) {
      currentUser = data.user;
      sessionStorage.setItem("adminLogin", "1");
      sessionStorage.setItem("supabaseUser", JSON.stringify(data.user));
      sessionStorage.setItem("supabaseAccessToken", data.session.access_token || data.access_token);
      await fetchUserRole(data.user.id);
      showApp();
      await syncFromSupabase();
      renderAll();
      toast(MSG.successRegisterAutoLogin);
      return;
    }

    showLoginTab("login");
    if ($("emailInput")) $("emailInput").value = email;
    if ($("resendVerificationBtn")) $("resendVerificationBtn").classList.remove("hidden");
    showLoginMessage(MSG.successRegister, true);
  } catch (error) {
    if (error && error.status === 429) registerCooldownUntil = Date.now() + 60000;
    var msg = parseSupabaseError(error);
    if (msg === MSG.errorAlreadyRegistered || msg === MSG.errorEmailDelivery || msg === MSG.errorEmailNotConfirmed) {
      showLoginTab("login");
      if ($("emailInput")) $("emailInput").value = email;
      if ($("resendVerificationBtn")) $("resendVerificationBtn").classList.remove("hidden");
      showLoginMessage(msg, false);
    } else {
      showLoginMessage(msg, false);
    }
  } finally {
    registerInProgress = false;
    if (registerButton) {
      registerButton.disabled = false;
      registerButton.textContent = "Daftar";
    }
  }
}

async function handleResendVerification() {
  if (!$("emailInput") || !$("loginMsg") || !$("resendVerificationBtn")) return;

  var email = $("emailInput").value.trim();

  if (!email) {
    $("loginMsg").textContent = "Masukkan email terlebih dahulu.";
    return;
  }

  if (!useSupabase) {
    $("loginMsg").textContent = "Supabase belum dikonfigurasi.";
    return;
  }

  try {
    var originalText = $("resendVerificationBtn").textContent;
    $("resendVerificationBtn").textContent = "Mengirim...";
    $("resendVerificationBtn").disabled = true;

    await supabaseResendVerification(email);

    $("resendVerificationBtn").textContent = originalText;
    $("resendVerificationBtn").disabled = false;

    showLoginMessage(MSG.successResendVerification, true);
  } catch (error) {
    showLoginMessage("Gagal mengirim email verifikasi: " + parseSupabaseError(error), false);
    $("resendVerificationBtn").textContent = "Kirim Ulang Verifikasi Email";
    $("resendVerificationBtn").disabled = false;
  }
}

async function handleSupabaseLogout() {
  if (useSupabase) {
    await supabaseSignOut();
    sessionStorage.removeItem("supabaseUser");
    sessionStorage.removeItem("supabaseAccessToken");
  }
  sessionStorage.removeItem("adminLogin");
  currentUser = null;
  userRole = 'user';
  location.reload();
}

function showApp() {
  if ($("loginScreen")) $("loginScreen").classList.add("hidden");
  if ($("app")) $("app").classList.remove("hidden");

  var adminElements = document.querySelectorAll('.admin-only');
  for (var i = 0; i < adminElements.length; i++) {
    if (isAdmin()) {
      adminElements[i].classList.remove('hidden');
      adminElements[i].classList.add('visible');
    } else {
      adminElements[i].classList.add('hidden');
      adminElements[i].classList.remove('visible');
    }
  }

  if ($("resendVerificationBtn")) $("resendVerificationBtn").classList.add("hidden");
  renderAll();
  calcSaleTotal();
}

function showPage(id) {
  if (id === 'admin' && !isAdmin()) {
    toast('Akses ditolak. Halaman ini khusus admin.');
    return;
  }

  var pages = document.querySelectorAll(".page");
  for (var i = 0; i < pages.length; i++) pages[i].classList.add("hidden");
  if ($(id)) $(id).classList.remove("hidden");

  var btns = document.querySelectorAll(".nav-btn[data-page]");
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("active", btns[i].dataset.page === id);
  if ($("sideNav")) $("sideNav").classList.remove("open");

  if (id === 'admin') {
    loadUsers();
  }

  renderAll();
}

function paymentLabel(method) { return { cash: "Tunai", transfer: "Transfer", qris: "QRIS", debit: "Debit", credit: "Piutang" }[method] || "Tunai"; }
function fallbackBillNo(date, id) { return "INV-" + String(date || today()).replace(/-/g, "") + "-" + String(id || "").slice(-6).toUpperCase(); }
function createBillNo(date) {
  var base = "INV-" + String(date || today()).replace(/-/g, "") + "-", n = 1, candidate = "";
  do { candidate = base + String(n).padStart(3, "0"); n += 1; } while (db.sales.some(function(s) { return s.billNo === candidate; }));
  return candidate;
}
function saleBalance(s) { var r = s && s.receivableId ? db.receivables.find(function(item) { return item.id === s.receivableId; }) : null; return r ? getReceivableBalance(r) : Math.max(0, numberValue(s && s.total) - Math.min(numberValue(s && s.total), numberValue(s && s.paidAmount))); }
function salePaymentDisplay(s) { var label = paymentLabel(s.paymentMethod); return saleBalance(s) > 0 ? label + " + Piutang" : label; }
function saleInitialMethod(s) { return s.paymentMethod === "credit" && numberValue(s.paidAmount) > 0 ? "cash" : (s.paymentMethod || "cash"); }
function getReceivablePayments(receivableId) { return db.receivablePayments.filter(function(p) { return p.receivableId === receivableId; }); }
function getReceivablePaid(receivableId) { return getReceivablePayments(receivableId).reduce(function(total, p) { return total + p.amount; }, 0); }
function getReceivableBalance(r) { return Math.max(0, r.total - getReceivablePaid(r.id)); }
function getReceivableStatus(r) { var balance = getReceivableBalance(r); if (balance <= 0) return "Lunas"; if (r.dueDate && r.dueDate < today()) return "Jatuh tempo"; return "Belum jatuh tempo"; }
function getChangeReturns(saleId) { return db.changeReturns.filter(function(item) { return item.saleId === saleId; }); }
function getChangeReturned(saleId) { return getChangeReturns(saleId).reduce(function(total, item) { return total + item.amount; }, 0); }
function getChangeBalance(sale) { return Math.max(0, numberValue(sale && sale.changeAmount) - getChangeReturned(sale && sale.id)); }
function pendingChangeSales() { return db.sales.filter(function(s) { return numberValue(s.changeAmount) > 0 && getChangeBalance(s) > 0; }); }
function changeStatus(sale) { var balance = getChangeBalance(sale), returned = getChangeReturned(sale && sale.id); return balance <= 0 ? "Sudah dikembalikan" : returned > 0 ? "Sebagian dikembalikan" : "Belum dikembalikan"; }
function addChangeReturn(saleId) {
  var sale = db.sales.find(function(item) { return item.id === saleId; });
  if (!sale) return;
  var balance = getChangeBalance(sale), billNo = sale.billNo || fallbackBillNo(sale.date, sale.id);
  if (balance <= 0) return toast("Kembalian untuk " + billNo + " sudah lengkap.");
  var amount = numberValue(prompt("Nominal kembalian untuk " + billNo + " (sisa " + rupiah(balance) + "):", balance));
  if (!Number.isFinite(amount) || amount <= 0 || amount > balance) return toast("Nominal kembalian harus lebih dari nol dan tidak melebihi sisa.");
  var recipient = prompt("Nama penerima kembalian:", sale.changeRecipient || sale.customer || "") || sale.changeRecipient || sale.customer || "Pelanggan";
  var note = prompt("Catatan pengembalian (opsional):", "") || "", date = today(), returnId = uniqueId(), createdAt = new Date().toISOString();
  db.changeReturns.push({ id: returnId, saleId: sale.id, billNo: billNo, date: date, recipient: recipient, amount: amount, note: note, createdAt: createdAt });
  db.cashEntries.push({ id: uniqueId(), date: date, type: "out", category: "Kembalian pelanggan", amount: amount, party: recipient, reference: billNo, note: note || "Pengembalian kembalian", source: "changeReturn", sourceId: returnId, createdAt: createdAt });
  save(); renderAll(); toast(amount === balance ? "Kembalian " + billNo + " sudah dikembalikan." : "Pengembalian sebagian berhasil dicatat.");
}
function allCashEntries() {
  var entries = db.cashEntries.slice();
  db.sales.forEach(function(s) {
    if (!entries.some(function(e) { return e.source === "sale" && e.sourceId === s.id; })) {
      var received = Math.max(0, numberValue(s.paidAmount, s.paymentMethod === "credit" ? 0 : s.total));
      if (received > 0) entries.push({ id: "legacy-sale-" + s.id, date: s.date, type: "in", category: "Penjualan", amount: received, party: s.customer || "Pelanggan", reference: s.id, note: "Kas dari penjualan lama", source: "legacy-sale", sourceId: s.id });
    }
  });
  db.receivablePayments.forEach(function(p) {
    if (!entries.some(function(e) { return e.source === "receivablePayment" && e.sourceId === p.id; })) entries.push({ id: "legacy-payment-" + p.id, date: p.date, type: "in", category: "Pelunasan piutang", amount: p.amount, party: "Debitur", reference: p.receivableId, note: p.note || "Pelunasan piutang lama", source: "legacy-payment", sourceId: p.id });
  });
  return entries;
}
function cashSummary(from, to) {
  var entries = allCashEntries().filter(function(e) { return (!from || e.date >= from) && (!to || e.date <= to); });
  var cashIn = entries.filter(function(e) { return e.type === "in"; }).reduce(function(n, e) { return n + e.amount; }, 0);
  var cashOut = entries.filter(function(e) { return e.type === "out"; }).reduce(function(n, e) { return n + e.amount; }, 0);
  return { entries: entries, cashIn: cashIn, cashOut: cashOut, net: cashIn - cashOut };
}
function outstandingReceivables(asOf) { return db.receivables.filter(function(r) { return (!asOf || r.date <= asOf) && getReceivableBalance(r) > 0; }); }
function renderAll() { renderProducts(); fillProductSelect(); renderSales(); renderPendingChanges(); renderCash(); renderReceivables(); renderDashboard(); renderReport(); }

function addProduct() {
  if (!$('pName') || !$('pCost') || !$('pPrice') || !$('pStock')) return;
  var name = $('pName').value.trim(), category = $('pCategory') ? $('pCategory').value.trim() : "Umum", unit = $('pUnit') ? $('pUnit').value.trim() : "pcs";
  var cost = numberValue($('pCost').value), price = numberValue($('pPrice').value), stock = integerValue($('pStock').value), minStock = integerValue($('pMinStock') ? $('pMinStock').value : 0), note = $('pNote') ? $('pNote').value.trim() : "";
  if (!name) return toast("Nama menu wajib diisi.");
  if (cost < 0 || price < 0 || stock < 0 || minStock < 0) return toast("Harga dan stok tidak boleh negatif.");
  db.products.push({ id: uniqueId(), name: name, category: category || "Umum", unit: unit || "pcs", cost: cost, price: price, stock: stock, minStock: minStock, active: true, note: note });
  save();
  ['pName','pCategory','pCost','pPrice','pStock','pMinStock','pNote'].forEach(function(id) { if ($(id)) $(id).value = ""; });
  if ($('pUnit')) $('pUnit').value = "pcs";
  renderAll();
  toast("Menu berhasil ditambahkan.");
}

function renderProducts() {
  if ($("productsTable")) {
    var q = ($("productSearch") ? $("productSearch").value : "").toLowerCase();
    var rows = db.products.filter(function(p) { return (p.name + " " + (p.category || "") + " " + (p.note || "")).toLowerCase().indexOf(q) !== -1; });
    $("productsTable").innerHTML = rows.map(function(p) {
      var originalIndex = db.products.indexOf(p), low = p.stock <= (p.minStock || 0);
      return '<tr><td><b>' + esc(p.name) + '</b><small>' + esc(p.unit || "pcs") + (p.note ? ' · ' + esc(p.note) : '') + '</small></td><td>' + esc(p.category || "Umum") + '</td><td>' + rupiah(p.cost) + '</td><td>' + rupiah(p.price) + '</td><td>' + p.stock + '</td><td class="' + (low ? 'warning' : '') + '">' + (low ? 'Stok menipis' : 'Aman') + '</td><td><button class="mini del" onclick="deleteProduct(' + originalIndex + ')">Hapus</button></td></tr>';
    }).join('') || '<tr><td colspan="7">Belum ada menu.</td></tr>';
  }
}

function deleteProduct(i) {
  if (confirm("Hapus barang ini?")) {
    queueRemoteDelete("products", db.products[i].id);
    db.products.splice(i, 1);
    save();
    renderAll();
  }
}

function fillProductSelect() {
  if ($("saleProduct")) {
    $("saleProduct").innerHTML = '<option value="">-- pilih barang --</option>' + db.products.map(function(p) {
      return p.active === false ? '' : '<option value="' + p.id + '">' + esc(p.name) + ' · ' + esc(p.category || "Umum") + ' (stok ' + p.stock + ' ' + esc(p.unit || "pcs") + ')</option>';
    }).join("");
  }
}

function syncSalePrice() {
  if ($("saleProduct")) {
    var p = db.products.find(function(x) { return x.id === $("saleProduct").value; });
    if ($("salePrice")) $("salePrice").value = p ? p.price : "";
    if ($("stockInfo")) $("stockInfo").textContent = p ? "Stok: " + p.stock : "";
    calcSaleTotal();
  }
}

function calculateSalePayment(total, method, rawPaid) {
  total = Math.max(0, numberValue(total));
  method = method || "cash";
  rawPaid = String(rawPaid == null ? "" : rawPaid).trim();
  var tendered = rawPaid === "" ? (method === "credit" ? 0 : total) : Math.max(0, numberValue(rawPaid));
  var paid = Math.min(total, tendered);
  var balance = Math.max(0, total - paid);
  var change = (method === "cash" || method === "credit") ? Math.max(0, tendered - total) : 0;
  return { total: total, method: method, rawPaid: rawPaid, tendered: tendered, paid: paid, balance: balance, change: change, needsReceivable: balance > 0 };
}

function calcSaleTotal() {
  if (!$('saleTotal') || !$('salePrice') || !$('saleQty')) return;
  var total = Math.max(0, numberValue($('salePrice').value) * integerValue($('saleQty').value));
  var method = $('salePaymentMethod') ? $('salePaymentMethod').value : "cash";
  var rawPaid = $('salePaid') ? $('salePaid').value : "";
  var payment = calculateSalePayment(total, method, rawPaid);
  $('saleTotal').textContent = rupiah(payment.total);
  if ($('changeInfo')) {
    var message = "Lunas";
    if (payment.change > 0) message = "Kembalian: " + rupiah(payment.change);
    else if (payment.balance > 0) message = "Uang kurang " + rupiah(payment.balance) + " — otomatis menjadi piutang";
    else if (method === "credit") message = "Lunas — tidak ada piutang";
    else if (payment.rawPaid === "") message = "Uang diterima kosong = lunas";
    else if (method !== "cash" && payment.tendered > payment.total) message = "Pembayaran melebihi total; periksa nominal atau metode.";
    $('changeInfo').textContent = message;
    $('changeInfo').className = "preview-status " + (payment.balance > 0 ? "warning" : (payment.change > 0 ? "positive" : ""));
  }
  if ($('salePaymentMethod')) {
    var needsDebtDetails = method === "credit" || payment.balance > 0;
    if ($('saleCustomer')) $('saleCustomer').placeholder = needsDebtDetails ? "Wajib diisi jika kurang bayar" : "Opsional";
    if ($('saleDueDate')) $('saleDueDate').disabled = !needsDebtDetails;
    if ($('qrisPaymentPanel')) $('qrisPaymentPanel').classList.toggle('hidden', method !== 'qris');
  }
}

function addSale() {
  if (!$('saleProduct') || !$('salePrice') || !$('saleQty') || !$('saleDate')) return;
  var p = db.products.find(function(x) { return x.id === $('saleProduct').value; });
  var price = numberValue($('salePrice').value), qty = integerValue($('saleQty').value), date = $('saleDate').value || today();
  var selectedMethod = $('salePaymentMethod') ? $('salePaymentMethod').value : "cash";
  var rawPaid = $('salePaid') ? $('salePaid').value.trim() : "";
  var total = price * qty, customer = $('saleCustomer') ? $('saleCustomer').value.trim() : "", changeRecipient = $('changeRecipient') ? $('changeRecipient').value.trim() : "", dueDate = $('saleDueDate') ? $('saleDueDate').value : "", note = $('saleNote') ? $('saleNote').value.trim() : "";
  var payment = calculateSalePayment(total, selectedMethod, rawPaid), paidInput = payment.tendered;
  if (!p) return toast("Pilih menu.");
  if (!validDate(date)) return toast("Tanggal transaksi tidak valid.");
  if (price < 0 || paidInput < 0) return toast("Nominal tidak boleh negatif.");
  if (qty < 1) return toast("Jumlah minimal 1.");
  if (p.stock < qty) return toast("Stok tidak mencukupi.");
  if (payment.tendered > payment.total && selectedMethod !== "cash" && selectedMethod !== "credit") return toast("Uang diterima melebihi total hanya dapat diberi kembalian pada metode tunai.");
  var paid = payment.paid, balance = payment.balance, method = selectedMethod === "credit" && balance <= 0 ? "cash" : selectedMethod;
  var needsReceivable = payment.needsReceivable;
  if (needsReceivable && !customer) return toast("Uang kurang. Nama debitur wajib diisi agar piutang tersimpan.");
  if (needsReceivable && dueDate && !validDate(dueDate)) return toast("Jatuh tempo tidak valid.");
  var change = (method === "cash" || method === "credit") ? Math.max(0, paidInput - total) : 0, newId = uniqueId(), billNo = createBillNo(date), receivableId = null, createdAt = new Date().toISOString();
  var sale = { id: newId, date: date, billNo: billNo, createdAt: createdAt, productId: p.id, product: p.name, price: price, qty: qty, cost: p.cost, total: total, discount: 0, profit: (price - p.cost) * qty, paymentMethod: method, paidAmount: paid, tenderedAmount: paidInput, changeAmount: change, changeRecipient: changeRecipient || customer, orderReceived: false, customer: customer, dueDate: dueDate, note: note, receivableId: null };
  db.sales.push(sale);
  p.stock -= qty;
  if (paid > 0) db.cashEntries.push({ id: uniqueId(), date: date, type: "in", category: "Penjualan", amount: paid, party: customer || "Pelanggan", reference: billNo, note: note, source: "sale", sourceId: newId, createdAt: createdAt });
  if (needsReceivable) {
    receivableId = uniqueId();
    sale.receivableId = receivableId;
    db.receivables.push({ id: receivableId, saleId: newId, billNo: billNo, date: date, customer: customer, dueDate: dueDate, total: total, note: note, createdAt: createdAt });
    if (paid > 0) { var openingPaymentId = uniqueId(); db.receivablePayments.push({ id: openingPaymentId, receivableId: receivableId, date: date, amount: paid, method: method === "credit" ? "cash" : method, note: "Pembayaran awal saat penjualan", createdAt: createdAt }); }
  }
  save();
  $('saleProduct').value = ""; $('salePrice').value = ""; $('saleQty').value = 1; if ($('salePaid')) $('salePaid').value = ""; if ($('saleCustomer')) $('saleCustomer').value = ""; if ($('changeRecipient')) $('changeRecipient').value = ""; if ($('saleDueDate')) { $('saleDueDate').value = ""; $('saleDueDate').disabled = true; } if ($('saleNote')) $('saleNote').value = ""; if ($('stockInfo')) $('stockInfo').textContent = "";
  calcSaleTotal(); renderAll(); toast(needsReceivable ? "Penjualan tersimpan. Kekurangan otomatis menjadi piutang " + billNo + "." : "Penjualan berhasil disimpan."); printReceipt(newId);
}

function renderPendingChanges() {
  if (!$('pendingChangesTable')) return;
  var q = ($('changeSearch') ? $('changeSearch').value : '').toLowerCase().trim();
  var rows = db.sales.filter(function(s) { return numberValue(s.changeAmount) > 0 && (!q || [s.billNo, s.date, s.customer, s.changeRecipient, changeStatus(s)].join(' ').toLowerCase().indexOf(q) !== -1); }).sort(function(a, b) { return b.date.localeCompare(a.date); });
  var total = rows.reduce(function(n, s) { return n + getChangeBalance(s); }, 0), partial = rows.filter(function(s) { return getChangeReturned(s.id) > 0; }).length;
  if ($('pendingChangeTotal')) $('pendingChangeTotal').textContent = rupiah(total);
  if ($('pendingChangeCount')) $('pendingChangeCount').textContent = rows.length;
  if ($('partialChangeCount')) $('partialChangeCount').textContent = partial;
  $('pendingChangesTable').innerHTML = rows.map(function(s) { var returned = getChangeReturned(s.id), balance = getChangeBalance(s), status = changeStatus(s); return '<tr><td><b>' + esc(s.billNo || fallbackBillNo(s.date, s.id)) + '</b><small>' + esc(s.date) + '</small></td><td><b>' + esc(s.changeRecipient || s.customer || 'Pelanggan') + '</b><small>' + esc(s.customer || '') + '</small></td><td>' + rupiah(s.changeAmount) + '</td><td>' + rupiah(returned) + '</td><td><b>' + rupiah(balance) + '</b></td><td class="' + (status === 'Sebagian dikembalikan' ? 'warning' : 'negative') + '">' + status + '</td><td><button class="mini" onclick="addChangeReturn(\'' + s.id + '\')">Kembalikan</button> <button class="mini" onclick="printReceipt(\'' + s.id + '\')">Struk</button></td></tr>'; }).join('') || '<tr><td colspan="7" class="empty-state">Tidak ada kembalian yang masih harus diberikan.</td></tr>';
}

function renderSales() {
  if (!$("saleSearch") || !$("salesTable")) return;
  var q = $("saleSearch").value.toLowerCase().trim(), groups = {};
  db.sales.filter(function(s) {
    var haystack = [s.billNo, s.date, s.product, s.customer, s.note, s.orderReceived ? "sudah diterima" : "belum diterima"].join(" ").toLowerCase();
    return !q || haystack.indexOf(q) !== -1;
  }).forEach(function(s) { if (!groups[s.date]) groups[s.date] = []; groups[s.date].push(s); });
  var dates = Object.keys(groups).sort().reverse(), html = "";
  dates.forEach(function(date) {
    var group = groups[date].slice().reverse(), label = date;
    try { label = new Date(date + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }); } catch (error) {}
    html += '<tr class="date-group-row"><td colspan="8"><div class="date-group-heading"><b>' + esc(label) + '</b><span>' + group.length + ' transaksi</span></div></td></tr>';
    html += group.map(function(s) {
      var balance = saleBalance(s), paymentMeta = '<div class="payment-cell"><b>' + esc(salePaymentDisplay(s)) + '</b><small>Dibayar ' + rupiah(s.paidAmount || 0) + '</small>' + (s.changeAmount ? '<small>Kembalian ' + rupiah(s.changeAmount) + '</small><small class="' + (getChangeBalance(s) > 0 ? 'warning' : 'positive') + '">' + (getChangeBalance(s) > 0 ? 'Sisa kembalian ' + rupiah(getChangeBalance(s)) : 'Kembalian lengkap') + '</small>' : '') + (balance > 0 ? '<small class="warning">Sisa ' + rupiah(balance) + '</small>' : '') + '</div>';
      var received = s.orderReceived === true;
      return '<tr><td><b>' + esc(s.billNo || fallbackBillNo(s.date, s.id)) + '</b></td><td><b>' + esc(s.product) + '</b><small>' + rupiah(s.price) + ' / item</small></td><td>' + s.qty + '</td><td><b>' + rupiah(s.total) + '</b></td><td>' + paymentMeta + '</td><td>' + esc(s.customer || '-') + '</td><td><label class="delivery-check"><input type="checkbox" ' + (received ? 'checked' : '') + ' onchange="toggleOrderReceived(\'' + s.id + '\', this.checked)" aria-label="Tandai status penerimaan pesanan"><span class="delivery-status ' + (received ? 'positive' : 'warning') + '">' + (received ? 'Sudah diterima' : 'Belum diterima') + '</span></label></td><td><div class="row-actions"><button class="mini" onclick="printReceipt(\'' + s.id + '\')">Struk</button><button class="mini del" onclick="deleteSale(\'' + s.id + '\')">Hapus</button></div></td></tr>';
    }).join("");
  });
  $("salesTable").innerHTML = html || '<tr><td colspan="8" class="empty-state">Belum ada transaksi.</td></tr>';
}

function toggleOrderReceived(id, checked) {
  var sale = db.sales.find(function(item) { return item.id === id; });
  if (!sale) return;
  sale.orderReceived = checked === true;
  save();
  renderAll();
  toast(sale.orderReceived ? "Pesanan ditandai sudah diterima pelanggan." : "Pesanan ditandai belum diterima pelanggan.");
}

function deleteSale(id) {
  var s = db.sales.find(function(x) { return x.id === id; });
  if (!s || !confirm("Hapus transaksi dan kembalikan stok?")) return;
  var p = db.products.find(function(x) { return x.id === s.productId; });
  if (p) p.stock += s.qty;
  queueRemoteDelete("sales", s.id);
  db.cashEntries.filter(function(e) { return e.source === "sale" && e.sourceId === s.id; }).forEach(function(e) { queueRemoteDelete("cashEntries", e.id); });
  db.cashEntries = db.cashEntries.filter(function(e) { return !(e.source === "sale" && e.sourceId === s.id); });
  var relatedChangeReturns = db.changeReturns.filter(function(item) { return item.saleId === s.id; });
  relatedChangeReturns.forEach(function(item) { queueRemoteDelete("changeReturns", item.id); });
  db.cashEntries.filter(function(e) { return e.source === "changeReturn" && relatedChangeReturns.some(function(item) { return item.id === e.sourceId; }); }).forEach(function(e) { queueRemoteDelete("cashEntries", e.id); });
  db.cashEntries = db.cashEntries.filter(function(e) { return !(e.source === "changeReturn" && relatedChangeReturns.some(function(item) { return item.id === e.sourceId; })); });
  db.changeReturns = db.changeReturns.filter(function(item) { return item.saleId !== s.id; });
  if (s.receivableId) {
    var relatedPayments = db.receivablePayments.filter(function(payment) { return payment.receivableId === s.receivableId; });
    relatedPayments.forEach(function(payment) { queueRemoteDelete("receivablePayments", payment.id); });
    db.cashEntries.filter(function(e) { return e.source === "receivablePayment" && relatedPayments.some(function(payment) { return payment.id === e.sourceId; }); }).forEach(function(e) { queueRemoteDelete("cashEntries", e.id); });
    db.cashEntries = db.cashEntries.filter(function(e) { return !(e.source === "receivablePayment" && relatedPayments.some(function(payment) { return payment.id === e.sourceId; })); });
    queueRemoteDelete("receivables", s.receivableId);
    db.receivablePayments = db.receivablePayments.filter(function(payment) { return payment.receivableId !== s.receivableId; });
    db.receivables = db.receivables.filter(function(r) { return r.id !== s.receivableId; });
  }
  db.sales = db.sales.filter(function(x) { return x.id !== id; });
  save(); renderAll(); toast("Transaksi dihapus dan stok dikembalikan.");
}

function addCashEntry() {
  if (!$("cashDate") || !$("cashAmount")) return;
  var date = $("cashDate").value || today(), type = $("cashType") ? $("cashType").value : "in", category = $("cashCategory") ? $("cashCategory").value.trim() : "Lainnya", amount = numberValue($("cashAmount").value), party = $("cashParty") ? $("cashParty").value.trim() : "", reference = $("cashReference") ? $("cashReference").value.trim() : "", note = $("cashNote") ? $("cashNote").value.trim() : "";
  if (!validDate(date)) return toast("Tanggal kas tidak valid.");
  if (amount <= 0) return toast("Nominal kas harus lebih besar dari nol.");
  var entry = { id: uniqueId(), date: date, type: type === "out" ? "out" : "in", category: category || "Lainnya", amount: amount, party: party, reference: reference, note: note, source: "manual", sourceId: null, createdAt: new Date().toISOString() };
  db.cashEntries.push(entry); save();
  ["cashCategory","cashAmount","cashParty","cashReference","cashNote"].forEach(function(id) { if ($(id)) $(id).value = ""; });
  renderAll(); toast("Catatan kas berhasil disimpan.");
}
function deleteCashEntry(id) { var entry = db.cashEntries.find(function(e) { return e.id === id; }); if (!entry || entry.source !== "manual") return toast("Kas dari penjualan/piutang dihapus dari transaksi sumbernya."); if (!confirm("Hapus catatan kas ini?")) return; queueRemoteDelete("cashEntries", id); db.cashEntries = db.cashEntries.filter(function(e) { return e.id !== id; }); save(); renderAll(); }
function renderCash() {
  if (!$("cashTable")) return;
  var q = ($("cashSearch") ? $("cashSearch").value : "").toLowerCase(), summary = cashSummary("", ""), rows = summary.entries.filter(function(e) { return (e.category + " " + e.party + " " + e.note + " " + e.reference).toLowerCase().indexOf(q) !== -1; }).sort(function(a, b) { return (b.date + b.id).localeCompare(a.date + a.id); });
  if ($("cashInTotal")) $("cashInTotal").textContent = rupiah(summary.cashIn);
  if ($("cashOutTotal")) $("cashOutTotal").textContent = rupiah(summary.cashOut);
  if ($("cashNetTotal")) $("cashNetTotal").textContent = rupiah(summary.net);
  $("cashTable").innerHTML = rows.map(function(e) { return '<tr><td>' + e.date + '</td><td class="' + (e.type === "in" ? 'positive' : 'negative') + '">' + (e.type === "in" ? 'Masuk' : 'Keluar') + '</td><td>' + esc(e.category) + '</td><td>' + esc(e.party || '-') + '</td><td>' + rupiah(e.amount) + '</td><td>' + esc(e.note || e.reference || '-') + '</td><td>' + (e.source === "manual" ? '<button class="mini del" onclick="deleteCashEntry(\'' + e.id + '\')">Hapus</button>' : '<small>Otomatis</small>') + '</td></tr>'; }).join('') || '<tr><td colspan="7">Belum ada catatan kas.</td></tr>';
}
function addReceivablePayment(id) {
  var r = db.receivables.find(function(item) { return item.id === id; }); if (!r) return;
  var balance = getReceivableBalance(r), billNo = r.billNo || fallbackBillNo(r.date, r.saleId || r.id), amount = numberValue(prompt("Pembayaran untuk " + billNo + " — " + r.customer + " (sisa " + rupiah(balance) + "):", balance));
  if (!Number.isFinite(amount) || amount <= 0 || amount > balance) return toast("Pembayaran harus lebih dari nol dan tidak melebihi sisa piutang.");
  var method = prompt("Metode pembayaran: cash / transfer / qris / debit", "cash") || "cash"; method = ["cash","transfer","qris","debit"].indexOf(method.toLowerCase()) === -1 ? "cash" : method.toLowerCase();
  var note = prompt("Catatan pembayaran (opsional):", "") || "", paymentId = uniqueId(), paymentDate = today();
  db.receivablePayments.push({ id: paymentId, receivableId: id, date: paymentDate, amount: amount, method: method, note: note, createdAt: new Date().toISOString() });
  db.cashEntries.push({ id: uniqueId(), date: paymentDate, type: "in", category: "Pelunasan piutang", amount: amount, party: r.customer, reference: billNo, note: note, source: "receivablePayment", sourceId: paymentId, createdAt: new Date().toISOString() });
  save(); renderAll(); toast(amount === balance ? "Piutang " + billNo + " sudah lunas." : "Pembayaran piutang berhasil dicatat.");
}
function renderReceivables() {
  if (!$("receivablesTable")) return;
  var q = ($("receivableSearch") ? $("receivableSearch").value : "").toLowerCase(), rows = db.receivables.filter(function(r) { return (r.customer + " " + r.note + " " + getReceivableStatus(r)).toLowerCase().indexOf(q) !== -1; }).sort(function(a, b) { return (getReceivableStatus(a) === "Jatuh tempo" ? 0 : 1) - (getReceivableStatus(b) === "Jatuh tempo" ? 0 : 1) || b.date.localeCompare(a.date); });
  var total = outstandingReceivables().reduce(function(n, r) { return n + getReceivableBalance(r); }, 0), overdue = outstandingReceivables().filter(function(r) { return getReceivableStatus(r) === "Jatuh tempo"; }).reduce(function(n, r) { return n + getReceivableBalance(r); }, 0), people = {};
  outstandingReceivables().forEach(function(r) { people[r.customer.toLowerCase()] = true; });
  if ($("receivableTotal")) $("receivableTotal").textContent = rupiah(total);
  if ($("receivableOverdue")) $("receivableOverdue").textContent = rupiah(overdue);
  if ($("receivablePeople")) $("receivablePeople").textContent = Object.keys(people).length;
  $("receivablesTable").innerHTML = rows.map(function(r) { var paid = getReceivablePaid(r.id), balance = getReceivableBalance(r), status = getReceivableStatus(r), statusClass = status === "Lunas" ? "positive" : status === "Jatuh tempo" ? "negative" : "warning"; return '<tr><td><b>' + esc(r.billNo || fallbackBillNo(r.date, r.saleId || r.id)) + '</b><small>' + esc(r.saleId || r.id) + '</small></td><td>' + esc(r.date) + '</td><td><b>' + esc(r.customer) + '</b><small>' + esc(r.note || '') + '</small></td><td>' + rupiah(r.total) + '</td><td>' + rupiah(paid) + '</td><td><b>' + rupiah(balance) + '</b></td><td>' + esc(r.dueDate || '-') + '</td><td class="' + statusClass + '">' + esc(status) + '</td><td>' + (balance > 0 ? '<button class="mini" onclick="addReceivablePayment(\'' + r.id + '\')">Bayar</button>' : '') + ' <button class="mini" onclick="printReceivable(\'' + r.id + '\')">Detail</button></td></tr>'; }).join('') || '<tr><td colspan="9">Belum ada piutang.</td></tr>';
}
function printReceivable(id) { var r = db.receivables.find(function(item) { return item.id === id; }); if (!r) return; var payments = getReceivablePayments(id), billNo = r.billNo || fallbackBillNo(r.date, r.saleId || r.id); $("printArea").innerHTML = '<article class="receipt"><h1>' + esc(BRAND.name) + '</h1><h2>Rincian Piutang</h2><p><b>No. Bill: ' + esc(billNo) + '</b></p><p>Debitur: ' + esc(r.customer) + '</p><p>Tanggal: ' + esc(r.date) + ' · Jatuh tempo: ' + esc(r.dueDate || '-') + '</p><table><thead><tr><th>Tanggal</th><th>Nominal</th><th>Metode</th><th>Catatan</th></tr></thead><tbody>' + payments.map(function(p) { return '<tr><td>' + p.date + '</td><td>' + rupiah(p.amount) + '</td><td>' + paymentLabel(p.method) + '</td><td>' + esc(p.note || '-') + '</td></tr>'; }).join('') + '</tbody></table><p>Total tagihan: ' + rupiah(r.total) + ' · Dibayar: ' + rupiah(getReceivablePaid(r.id)) + ' · Sisa: <b>' + rupiah(getReceivableBalance(r)) + '</b></p><p>Status: ' + esc(getReceivableStatus(r)) + '</p></article>'; window.print(); }

function daySales(date) { return db.sales.filter(function(s) { return s.date === date; }); }

function renderDashboard() {
  if (!$("dashDate") || !$("sTransactions") || !$("sItems") || !$("sRevenue") || !$("sProfit") || !$("weeklyChart") || !$("topProducts")) return;

  var date = $("dashDate").value || today();
  var a = daySales(date);
  var items = a.reduce(function(n, s) { return n + s.qty; }, 0);
  var rev = a.reduce(function(n, s) { return n + s.total; }, 0);
  var profit = a.reduce(function(n, s) { return n + s.profit; }, 0);

  $("sTransactions").textContent = a.length;
  $("sItems").textContent = items;
  $("sRevenue").textContent = rupiah(rev);
  $("sProfit").textContent = rupiah(profit);
  var dailyCash = cashSummary(date, date);
  if ($("sCashNet")) $("sCashNet").textContent = rupiah(dailyCash.net);
  if ($("sReceivable")) $("sReceivable").textContent = rupiah(outstandingReceivables(date).reduce(function(n, r) { return n + getReceivableBalance(r); }, 0));

  var days = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() - i);
    days.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"));
  }
  var vals = days.map(function(d) { return daySales(d).reduce(function(n, s) { return n + s.total; }, 0); });
  var max = Math.max.apply(null, vals.concat([1]));

  $("weeklyChart").innerHTML = days.map(function(d, i) {
    return '<div class="bar-wrap"><span>' + rupiah(vals[i]).replace("Rp ", "") + '</span><div class="bar" style="height:' + Math.max(2, vals[i] / max * 160) + 'px"></div><div class="bar-label">' + d.slice(5) + '</div></div>';
  }).join("");

  var counts = {};
  a.forEach(function(s) { counts[s.product] = (counts[s.product] || 0) + s.qty; });
  $("topProducts").innerHTML = Object.keys(counts).sort(function(a, b) { return counts[b] - counts[a]; }).slice(0, 7).map(function(x) {
    return '<div class="list-row"><span>' + esc(x) + '</span><b>' + counts[x] + ' pcs</b></div>';
  }).join('') || '<p>Belum ada penjualan.</p>';
}

function filteredReport() {
  if (!$("reportFrom") || !$("reportTo")) return db.sales;
  var f = $("reportFrom").value, t = $("reportTo").value;
  return db.sales.filter(function(s) { return (!f || s.date >= f) && (!t || s.date <= t); });
}

function renderReport() {
  if (!$("rTransactions") || !$("rItems") || !$("rRevenue") || !$("rProfit") || !$("reportTable")) return;
  var a = filteredReport();
  $("rTransactions").textContent = a.length;
  $("rItems").textContent = a.reduce(function(n, s) { return n + s.qty; }, 0);
  $("rRevenue").textContent = rupiah(a.reduce(function(n, s) { return n + s.total; }, 0));
  $("rProfit").textContent = rupiah(a.reduce(function(n, s) { return n + s.profit; }, 0));
  var from = $("reportFrom").value, to = $("reportTo").value, cs = cashSummary(from, to), formed = db.receivables.filter(function(r) { return (!from || r.date >= from) && (!to || r.date <= to); }).reduce(function(n, r) { return n + r.total; }, 0);
  if ($("rCashIn")) $("rCashIn").textContent = rupiah(cs.cashIn);
  if ($("rCashOut")) $("rCashOut").textContent = rupiah(cs.cashOut);
  if ($("rCashNet")) $("rCashNet").textContent = rupiah(cs.net);
  if ($("rReceivable")) $("rReceivable").textContent = rupiah(formed);
  $("reportTable").innerHTML = a.map(function(s) {
    var balance = saleBalance(s);
    return '<tr><td><b>' + esc(s.billNo || fallbackBillNo(s.date, s.id)) + '</b></td><td>' + esc(s.date) + '</td><td>' + esc(s.product) + '</td><td>' + rupiah(s.price) + '</td><td>' + s.qty + '</td><td>' + rupiah(s.total) + '</td><td>' + rupiah(s.profit) + '</td><td>' + salePaymentDisplay(s) + ' · ' + rupiah(s.paidAmount || 0) + '</td><td>' + rupiah(balance) + '</td><td>' + esc(s.customer || '-') + '</td><td>' + esc(s.note || '-') + '</td></tr>';
  }).join('') || '<tr><td colspan="11">Tidak ada data.</td></tr>';
}

function exportCSV() {
  var a = filteredReport();
  var csv = "No. Bill,Tanggal,Barang,Harga,Jumlah,Total,Laba,Metode Pembayaran,Dibayar,Sisa,Pelanggan,Catatan\n" + a.map(function(s) {
    return ['"' + String(s.billNo || fallbackBillNo(s.date, s.id)).replace(/"/g, '""') + '"', s.date, '"' + String(s.product || "").replace(/"/g, '""') + '"', s.price, s.qty, s.total, s.profit, '"' + String(salePaymentDisplay(s)).replace(/"/g, '""') + '"', s.paidAmount || 0, saleBalance(s), '"' + String(s.customer || "").replace(/"/g, '""') + '"', '"' + String(s.note || "").replace(/"/g, '""') + '"'].join(",");
  }).join("\n");
  download(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }), "laporan-penjualan.csv");
}

function printReport() {
  if (!$("printArea") || !$("reportFrom") || !$("reportTo")) return;
  var a = filteredReport();
  var cs = cashSummary($("reportFrom").value, $("reportTo").value);
  $("printArea").innerHTML = '<div class="print-header"><h1>' + esc(BRAND.name) + '</h1><p>Laporan Penjualan & Kas</p></div><p>Periode: ' + esc($("reportFrom").value || "-") + ' s/d ' + esc($("reportTo").value || "-") + '</p><table><thead><tr><th>No. Bill</th><th>Tanggal</th><th>Barang</th><th>Total</th><th>Laba</th><th>Bayar</th><th>Sisa</th></tr></thead><tbody>' + a.map(function(s) {
    return '<tr><td>' + esc(s.billNo || fallbackBillNo(s.date, s.id)) + '</td><td>' + esc(s.date) + '</td><td>' + esc(s.product) + '</td><td>' + rupiah(s.total) + '</td><td>' + rupiah(s.profit) + '</td><td>' + salePaymentDisplay(s) + ' · ' + rupiah(s.paidAmount || 0) + '</td><td>' + rupiah(saleBalance(s)) + '</td></tr>';
  }).join("") + '</tbody></table><p><b>Total omzet: ' + rupiah(a.reduce(function(n, s) { return n + s.total; }, 0)) + '</b></p><p><b>Kas masuk: ' + rupiah(cs.cashIn) + ' · Kas keluar: ' + rupiah(cs.cashOut) + ' · Kas bersih: ' + rupiah(cs.net) + '</b></p>';
  window.print();
}

function printReceipt(id) {
  if (!$('printArea')) return;
  var s = db.sales.find(function(x) { return x.id === id; });
  if (!s) return;
  var receiptNo = s.billNo || fallbackBillNo(s.date, s.id), balance = saleBalance(s), time = s.createdAt ? esc(new Date(s.createdAt).toLocaleString("id-ID")) : esc(s.date);
  var tendered = Math.max(0, numberValue(s.tenderedAmount, s.paidAmount)), paid = Math.max(0, numberValue(s.paidAmount)), change = Math.max(0, numberValue(s.changeAmount)), returnedChange = getChangeReturned(s.id), remainingChange = getChangeBalance(s);
  $('printArea').innerHTML = '<article class="receipt"><header class="receipt-head"><div class="receipt-logo">✦</div><h1>' + esc(BRAND.name) + '</h1><p>' + esc(BRAND.tagline) + '</p></header><div class="receipt-meta"><span>No. Bill<br><b>' + esc(receiptNo) + '</b></span><span>Tanggal<br><b>' + esc(time) + '</b></span></div><table class="receipt-items"><thead><tr><th>Item</th><th>Qty</th><th>Harga</th><th>Subtotal</th></tr></thead><tbody><tr><td>' + esc(s.product) + '</td><td>' + integerValue(s.qty) + '</td><td>' + rupiah(s.price) + '</td><td>' + rupiah(s.total) + '</td></tr></tbody></table><div class="receipt-total"><span>Total transaksi</span><strong>' + rupiah(s.total) + '</strong></div><div class="receipt-payment"><p><span>Metode pembayaran</span><b>' + esc(salePaymentDisplay(s)) + '</b></p><p><span>Uang diterima</span><b>' + rupiah(tendered) + '</b></p><p><span>Jumlah dibayar</span><b>' + rupiah(paid) + '</b></p><p><span>Total kembalian</span><b>' + rupiah(change) + '</b></p><p><span>Sudah diberikan</span><b>' + rupiah(returnedChange) + '</b></p><p><span>Sisa kembalian</span><b>' + rupiah(remainingChange) + '</b></p>' + (balance > 0 ? '<p class="receipt-debt"><span>Sisa piutang</span><b>' + rupiah(balance) + '</b></p><p><span>Jatuh tempo</span><b>' + esc(s.dueDate || '-') + '</b></p>' : '') + '</div>' + (s.customer ? '<p>Pelanggan/Debitur: <b>' + esc(s.customer) + '</b></p>' : '') + (s.note ? '<p>Catatan: ' + esc(s.note) + '</p>' : '') + '<footer>Terima kasih sudah berkunjung.<br>Semoga harimu selalu hangat.</footer></article>';
  window.print();
}

function backup() {
  download(new Blob([JSON.stringify(db, null, 2)], { type: "application/json" }), "backup-penjualan-" + today() + ".json");
}

function restore() {
  var f = $("restoreFile").files[0];
  if (!f) return toast("Pilih file backup JSON.");
  var r = new FileReader();
  r.onload = function() {
    try {
      var x = JSON.parse(r.result);
      if (!x || !Array.isArray(x.products) || !Array.isArray(x.sales)) throw 0;
      var restoredProducts = x.products.map(function(p) {
        if (!p || !p.id || !String(p.name || "").trim()) throw 0;
        return { id: String(p.id), name: String(p.name).trim(), category: String(p.category || "Umum"), unit: String(p.unit || "pcs"), cost: numberValue(p.cost), price: numberValue(p.price), stock: integerValue(p.stock), minStock: integerValue(p.minStock), active: p.active !== false, note: String(p.note || "") };
      });
      var restoredSales = x.sales.map(function(s) {
        if (!s || !s.id || !validDate(s.date) || !String(s.product || "").trim()) throw 0;
        var price = numberValue(s.price), qty = integerValue(s.qty), cost = numberValue(s.cost), total = price * qty, discount = Math.min(total, numberValue(s.discount)), netTotal = total - discount;
        if (price < 0 || qty < 1 || cost < 0) throw 0;
        return { id: String(s.id), date: s.date, billNo: String(s.billNo || fallbackBillNo(s.date, s.id)), productId: s.productId || null, product: String(s.product), price: price, qty: qty, cost: cost, total: netTotal, discount: discount, profit: (price - cost) * qty - discount, paymentMethod: String(s.paymentMethod || "cash"), paidAmount: Math.max(0, Math.min(netTotal, numberValue(s.paidAmount, s.paymentMethod === "credit" ? 0 : netTotal))), tenderedAmount: Math.max(0, numberValue(s.tenderedAmount, s.paidAmount)), changeAmount: Math.max(0, numberValue(s.changeAmount)), changeRecipient: String(s.changeRecipient || s.customer || ""), orderReceived: s.orderReceived === true, customer: String(s.customer || ""), dueDate: validDate(s.dueDate) ? s.dueDate : "", note: String(s.note || ""), receivableId: s.receivableId || null, createdAt: s.createdAt || null };
      });
      var restoredCash = (Array.isArray(x.cashEntries) ? x.cashEntries : []).filter(function(e) { return e && e.id && validDate(e.date) && numberValue(e.amount) > 0; }).map(function(e) { return { id: String(e.id), date: e.date, type: e.type === "out" ? "out" : "in", category: String(e.category || "Lainnya"), amount: numberValue(e.amount), party: String(e.party || ""), reference: String(e.reference || ""), note: String(e.note || ""), source: String(e.source || "manual"), sourceId: e.sourceId || null, createdAt: e.createdAt || null }; });
      var restoredReceivables = (Array.isArray(x.receivables) ? x.receivables : []).filter(function(r) { return r && r.id && validDate(r.date) && String(r.customer || "").trim() && numberValue(r.total) >= 0; }).map(function(r) { return { id: String(r.id), saleId: r.saleId || null, billNo: String(r.billNo || fallbackBillNo(r.date, r.saleId || r.id)), date: r.date, customer: String(r.customer).trim(), dueDate: validDate(r.dueDate) ? r.dueDate : "", total: numberValue(r.total), note: String(r.note || ""), createdAt: r.createdAt || null }; });
      var restoredPayments = (Array.isArray(x.receivablePayments) ? x.receivablePayments : []).filter(function(p) { return p && p.id && p.receivableId && validDate(p.date) && numberValue(p.amount) > 0; }).map(function(p) { return { id: String(p.id), receivableId: String(p.receivableId), date: p.date, amount: numberValue(p.amount), method: String(p.method || "cash"), note: String(p.note || ""), createdAt: p.createdAt || null }; });
      var restoredChangeReturns = (Array.isArray(x.changeReturns) ? x.changeReturns : []).filter(function(item) { return item && item.id && item.saleId && validDate(item.date) && numberValue(item.amount) > 0; }).map(function(item) { return { id: String(item.id), saleId: String(item.saleId), billNo: String(item.billNo || fallbackBillNo(item.date, item.saleId || item.id)), date: item.date, recipient: String(item.recipient || ""), amount: numberValue(item.amount), note: String(item.note || ""), createdAt: item.createdAt || null }; });
      if (!confirm("Restore akan mengganti data saat ini. Lanjut?")) return;
      db.products.forEach(function(product) {
        if (!x.products.some(function(restoredProduct) { return restoredProduct.id === product.id; })) queueRemoteDelete("products", product.id);
      });
      db.sales.forEach(function(sale) {
        if (!x.sales.some(function(restoredSale) { return restoredSale.id === sale.id; })) queueRemoteDelete("sales", sale.id);
      });
      db.cashEntries.forEach(function(entry) { if (!restoredCash.some(function(item) { return item.id === entry.id; })) queueRemoteDelete("cashEntries", entry.id); });
      db.receivables.forEach(function(item) { if (!restoredReceivables.some(function(restored) { return restored.id === item.id; })) queueRemoteDelete("receivables", item.id); });
      db.receivablePayments.forEach(function(item) { if (!restoredPayments.some(function(restored) { return restored.id === item.id; })) queueRemoteDelete("receivablePayments", item.id); });
      db.changeReturns.forEach(function(item) { if (!restoredChangeReturns.some(function(restored) { return restored.id === item.id; })) queueRemoteDelete("changeReturns", item.id); });
      db = { pin: String(x.pin || db.pin || "1234"), products: restoredProducts, sales: restoredSales, cashEntries: restoredCash, receivables: restoredReceivables, receivablePayments: restoredPayments, changeReturns: restoredChangeReturns };
      save();
      renderAll();
      toast("Restore berhasil.");
    } catch (e) {
      toast("File backup tidak valid.");
    }
  };
  r.readAsText(f);
}

function changePin() {
  if (!$("oldPin") || !$("newPin") || !$("pinMsg")) return;
  if ($("oldPin").value !== db.pin) return $("pinMsg").textContent = "PIN lama salah.";
  if ($("newPin").value.length < 4) return $("pinMsg").textContent = "PIN baru minimal 4 angka.";
  db.pin = $("newPin").value;
  save();
  $("pinMsg").textContent = "PIN berhasil diubah.";
}

function clearData() {
  if (confirm("Hapus SEMUA produk dan transaksi?")) {
    db.sales.forEach(function(sale) { queueRemoteDelete("sales", sale.id); });
    db.products.forEach(function(product) { queueRemoteDelete("products", product.id); });
    db.cashEntries.forEach(function(entry) { queueRemoteDelete("cashEntries", entry.id); });
    db.receivables.forEach(function(item) { queueRemoteDelete("receivables", item.id); });
    db.receivablePayments.forEach(function(item) { queueRemoteDelete("receivablePayments", item.id); });
    db.changeReturns.forEach(function(item) { queueRemoteDelete("changeReturns", item.id); });
    db.products = [];
    db.sales = [];
    db.cashEntries = [];
    db.receivables = [];
    db.receivablePayments = [];
    db.changeReturns = [];
    save();
    renderAll();
    toast("Semua data dihapus.");
  }
}

function download(blob, name) {
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(function() { URL.revokeObjectURL(a.href); }, 1000);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function() {
    navigator.serviceWorker.register("./service-worker.js")
      .then(function(registration) { return registration.update(); })
      .catch(function(error) { console.warn("Service worker registration failed:", error); });
  });
}
boot();
