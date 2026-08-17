const $ = function(id) { return document.getElementById(id); };
const KEY = "kopiTutugDataV2";
const PENDING_DELETES_KEY = KEY + "PendingDeletes";
const today = function() { return new Date().toISOString().slice(0, 10); };
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
  errorAuthServer: "Pendaftaran gagal di server Supabase. Periksa trigger database dan Auth Logs Supabase.",
  errorInvalidLogin: "Email atau password salah.",
  errorEmailNotConfirmed: "Email belum diverifikasi. Cek email Anda untuk tautan verifikasi.",
  errorAlreadyRegistered: "Email sudah terdaftar. Silakan login.",
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
var pendingDeletes = { products: [], sales: [] };

try {
  pendingDeletes = JSON.parse(localStorage.getItem(PENDING_DELETES_KEY) || '{"products":[],"sales":[]}');
} catch (error) {
  localStorage.removeItem(PENDING_DELETES_KEY);
}

if (!pendingDeletes || typeof pendingDeletes !== "object") pendingDeletes = { products: [], sales: [] };
if (!Array.isArray(pendingDeletes.products)) pendingDeletes.products = [];
if (!Array.isArray(pendingDeletes.sales)) pendingDeletes.sales = [];

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
  if (source && source.status === 429) return MSG.errorRateLimit;
  if (source && source.status >= 500) return MSG.errorAuthServer;
  var payload = extractErrorPayload(source);
  if (!payload) return MSG.errorGeneric;

  var combined = [
    payload.msg,
    payload.message,
    payload.error_description,
    payload.error,
    payload.hint,
    payload.code
  ].filter(Boolean).join(" ").toLowerCase();

  if (
    combined.indexOf("invalid login") !== -1 ||
    combined.indexOf("invalid credentials") !== -1 ||
    combined.indexOf("invalid_grant") !== -1 ||
    payload.error_code === "invalid_credentials"
  ) {
    return MSG.errorInvalidLogin;
  }

  if (
    combined.indexOf("email not confirmed") !== -1 ||
    combined.indexOf("not confirmed") !== -1 ||
    payload.error_code === "email_not_confirmed"
  ) {
    return MSG.errorEmailNotConfirmed;
  }

  if (
    combined.indexOf("already registered") !== -1 ||
    combined.indexOf("user already registered") !== -1 ||
    payload.error_code === "user_already_exists"
  ) {
    return MSG.errorAlreadyRegistered;
  }

  if (combined.indexOf("rate limit") !== -1 || payload.error_code === "over_request_rate_limit") {
    return MSG.errorRateLimit;
  }

  if (
    combined.indexOf("weak password") !== -1 ||
    combined.indexOf("password should") !== -1 ||
    (combined.indexOf("password") !== -1 && (combined.indexOf("minimum") !== -1 || combined.indexOf("mínimo") !== -1 || combined.indexOf("character") !== -1 || combined.indexOf("caracter") !== -1)) ||
    payload.error_code === "weak_password"
  ) {
    return MSG.errorWeakPassword;
  }

  if (combined.indexOf("request failed") !== -1 || combined.indexOf("network") !== -1) {
    return MSG.errorNetwork;
  }

  // Do not display raw provider messages. Supabase may return them in a
  // different language, while the application interface is Indonesian.
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
      products.push({ id: uniqueId(), name: s.barang, cost: 0, price: Number(s.harga) || 0, stock: 0 });
    }
  });
  db = {
    pin: "1234",
    products: products,
    sales: oldSales.map(function(s) {
      var p = products.find(function(p) { return p.name === s.barang; });
      var price = Number(s.harga) || 0, qty = Number(s.jumlah) || 0;
      return {
        id: uniqueId(),
        date: s.tanggal,
        productId: p ? p.id : null,
        product: s.barang,
        price: price,
        qty: qty,
        cost: 0,
        total: Number(s.total) || price * qty,
        profit: price * qty
      };
    })
  };
  localStorage.setItem(KEY, JSON.stringify(db));
}

if (!db.pin) db.pin = "1234";

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
  var list = table === "products" ? pendingDeletes.products : pendingDeletes.sales;
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
    var salesToDelete = pendingDeletes.sales.filter(function(item) { return item.userId === userId; });
    var productsToDelete = pendingDeletes.products.filter(function(item) { return item.userId === userId; });
    await Promise.all(salesToDelete.map(function(item) { return supabaseDelete('sales', item.id, accessToken); }));
    await Promise.all(productsToDelete.map(function(item) { return supabaseDelete('products', item.id, accessToken); }));
    pendingDeletes.sales = pendingDeletes.sales.filter(function(item) { return item.userId !== userId; });
    pendingDeletes.products = pendingDeletes.products.filter(function(item) { return item.userId !== userId; });
    savePendingDeletes();
    if (db.products.length > 0) {
      await supabaseUpsert('products', db.products.map(function(p) {
        return { id: p.id, name: p.name, cost: p.cost, price: p.price, stock: p.stock, user_id: userId };
      }), accessToken);
    }
    if (db.sales.length > 0) {
      await supabaseUpsert('sales', db.sales.map(function(s) {
        return {
          id: s.id, date: s.date, product_id: s.productId || ("legacy-" + s.id), product: s.product,
          price: s.price, qty: s.qty, cost: s.cost, total: s.total, profit: s.profit, user_id: userId
        };
      }), accessToken);
    }
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

    if (Array.isArray(products)) {
      db.products = products.map(function(p) {
        return { id: p.id, name: p.name, cost: p.cost, price: p.price, stock: p.stock };
      });
    }
    if (Array.isArray(sales)) {
      db.sales = sales.map(function(s) {
        return {
          id: s.id, date: s.date, productId: s.product_id, product: s.product,
          price: s.price, qty: s.qty, cost: s.cost, total: s.total, profit: s.profit
        };
      });
    }
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

    currentUser = user;
    sessionStorage.setItem("supabaseUser", JSON.stringify(user));
    await fetchUserRole(user.id);
    showApp();
    await syncFromSupabase();
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
  if ($("reportFrom")) $("reportFrom").value = today();
  if ($("reportTo")) $("reportTo").value = today();

  // Sales handlers
  if ($("saleProduct")) $("saleProduct").onchange = syncSalePrice;
  if ($("salePrice")) $("salePrice").oninput = calcSaleTotal;
  if ($("saleQty")) $("saleQty").oninput = calcSaleTotal;
  if ($("addSaleBtn")) $("addSaleBtn").onclick = addSale;
  if ($("saleSearch")) $("saleSearch").oninput = renderSales;

  // Product handlers
  if ($("addProductBtn")) $("addProductBtn").onclick = addProduct;

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

    currentUser = data.user;
    sessionStorage.setItem("adminLogin", "1");
    sessionStorage.setItem("supabaseUser", JSON.stringify(data.user));
    sessionStorage.setItem("supabaseAccessToken", data.access_token);

    await fetchUserRole(data.user.id);
    showApp();

    var synced = await syncFromSupabase();
    if (synced) {
      renderAll();
      toast(MSG.successSync);
    } else {
      toast(MSG.successSyncPartial);
    }
  } catch (error) {
    var msg = parseSupabaseError(error);
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
    showLoginMessage(msg, false);
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

function renderAll() { renderProducts(); fillProductSelect(); renderSales(); renderDashboard(); renderReport(); }

function addProduct() {
  if (!$("pName") || !$("pCost") || !$("pPrice") || !$("pStock")) return;
  var name = $("pName").value.trim(), cost = +$("pCost").value || 0, price = +$("pPrice").value || 0, stock = +$("pStock").value || 0;
  if (!name) return toast("Nama barang wajib diisi.");
  db.products.push({ id: uniqueId(), name: name, cost: cost, price: price, stock: stock });
  save();
  $("pName").value = ""; $("pCost").value = ""; $("pPrice").value = ""; $("pStock").value = "";
  renderAll();
  toast("Barang berhasil ditambahkan.");
}

function renderProducts() {
  if ($("productsTable")) {
    $("productsTable").innerHTML = db.products.map(function(p, i) {
      return '<tr><td>' + esc(p.name) + '</td><td>' + rupiah(p.cost) + '</td><td>' + rupiah(p.price) + '</td><td>' + p.stock + '</td><td><button class="mini del" onclick="deleteProduct(' + i + ')">Hapus</button></td></tr>';
    }).join('') || '<tr><td colspan="5">Belum ada barang.</td></tr>';
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
      return '<option value="' + p.id + '">' + esc(p.name) + ' (stok ' + p.stock + ')</option>';
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

function calcSaleTotal() {
  if ($("saleTotal") && $("salePrice") && $("saleQty")) {
    $("saleTotal").textContent = rupiah((+$("salePrice").value || 0) * (+$("saleQty").value || 0));
  }
}

function addSale() {
  if (!$("saleProduct") || !$("salePrice") || !$("saleQty") || !$("saleDate")) return;
  var p = db.products.find(function(x) { return x.id === $("saleProduct").value; });
  var price = +$("salePrice").value || 0, qty = +$("saleQty").value || 0, date = $("saleDate").value || today();
  if (!p) return toast("Pilih barang.");
  if (qty < 1) return toast("Jumlah minimal 1.");
  if (p.stock < qty) return toast("Stok tidak mencukupi.");
  var newId = uniqueId();
  db.sales.push({ id: newId, date: date, productId: p.id, product: p.name, price: price, qty: qty, cost: p.cost, total: price * qty, profit: (price - p.cost) * qty });
  p.stock -= qty;
  save();
  $("saleProduct").value = ""; $("salePrice").value = ""; $("saleQty").value = 1;
  if ($("stockInfo")) $("stockInfo").textContent = "";
  calcSaleTotal();
  renderAll();
  toast("Penjualan berhasil disimpan.");
  printReceipt(newId);
}

function renderSales() {
  if (!$("saleSearch") || !$("salesTable")) return;
  var q = $("saleSearch").value.toLowerCase();
  var rows = db.sales.filter(function(s) { return s.product.toLowerCase().indexOf(q) !== -1; }).slice().reverse();
  $("salesTable").innerHTML = rows.map(function(s, i) {
    return '<tr><td>' + (i + 1) + '</td><td>' + s.date + '</td><td>' + esc(s.product) + '</td><td>' + rupiah(s.price) + '</td><td>' + s.qty + '</td><td>' + rupiah(s.total) + '</td><td><button class="mini" onclick="printReceipt(\'' + s.id + '\')">Struk</button> <button class="mini del" onclick="deleteSale(\'' + s.id + '\')">Hapus</button></td></tr>';
  }).join('') || '<tr><td colspan="7">Belum ada transaksi.</td></tr>';
}

function deleteSale(id) {
  var s = db.sales.find(function(x) { return x.id === id; });
  if (!s || !confirm("Hapus transaksi dan kembalikan stok?")) return;
  var p = db.products.find(function(x) { return x.id === s.productId; });
  if (p) p.stock += s.qty;
  queueRemoteDelete("sales", s.id);
  db.sales = db.sales.filter(function(x) { return x.id !== id; });
  save();
  renderAll();
}

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

  var days = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
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
  $("reportTable").innerHTML = a.map(function(s) {
    return '<tr><td>' + s.date + '</td><td>' + esc(s.product) + '</td><td>' + rupiah(s.price) + '</td><td>' + s.qty + '</td><td>' + rupiah(s.total) + '</td><td>' + rupiah(s.profit) + '</td></tr>';
  }).join('') || '<tr><td colspan="6">Tidak ada data.</td></tr>';
}

function exportCSV() {
  var a = filteredReport();
  var csv = "Tanggal,Barang,Harga,Jumlah,Total,Laba\n" + a.map(function(s) {
    return [s.date, '"' + s.product.replace(/"/g, '""') + '"', s.price, s.qty, s.total, s.profit].join(",");
  }).join("\n");
  download(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }), "laporan-penjualan.csv");
}

function printReport() {
  if (!$("printArea") || !$("reportFrom") || !$("reportTo")) return;
  var a = filteredReport();
  $("printArea").innerHTML = '<h1>Laporan Penjualan</h1><p>Periode: ' + ($("reportFrom").value || "-") + ' s/d ' + ($("reportTo").value || "-") + '</p><table><thead><tr><th>Tanggal</th><th>Barang</th><th>Harga</th><th>Jumlah</th><th>Total</th><th>Laba</th></tr></thead><tbody>' + a.map(function(s) {
    return '<tr><td>' + s.date + '</td><td>' + esc(s.product) + '</td><td>' + rupiah(s.price) + '</td><td>' + s.qty + '</td><td>' + rupiah(s.total) + '</td><td>' + rupiah(s.profit) + '</td></tr>';
  }).join("") + '</tbody></table><p><b>Total omzet: ' + rupiah(a.reduce(function(n, s) { return n + s.total; }, 0)) + '</b></p>';
  window.print();
}

function printReceipt(id) {
  if (!$("printArea")) return;
  var s = db.sales.find(function(x) { return x.id === id; });
  if (!s) return;
  $("printArea").innerHTML = '<h1>Struk Penjualan</h1><p>Kopi Tutug<br>' + s.date + '</p><hr><p>' + esc(s.product) + '<br>' + s.qty + ' x ' + rupiah(s.price) + '</p><h2>Total ' + rupiah(s.total) + '</h2><p>Terima kasih.</p>';
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
      if (!x.products || !x.sales) throw 0;
      if (!confirm("Restore akan mengganti data saat ini. Lanjut?")) return;
      db.products.forEach(function(product) {
        if (!x.products.some(function(restoredProduct) { return restoredProduct.id === product.id; })) queueRemoteDelete("products", product.id);
      });
      db.sales.forEach(function(sale) {
        if (!x.sales.some(function(restoredSale) { return restoredSale.id === sale.id; })) queueRemoteDelete("sales", sale.id);
      });
      db = x;
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
    db.products = [];
    db.sales = [];
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
