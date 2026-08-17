const $=id=>document.getElementById(id);
const KEY="kopiTutugDataV2";
const today=()=>new Date().toISOString().slice(0,10);
const rupiah=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n)||0);
const uniqueId=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Supabase Configuration (REST API - no SDK needed)
let supabaseUrl = '';
let supabaseKey = '';
let useSupabase = false;
let currentUser = null;
let userRole = 'user';

// Fetch Supabase config from Vercel API endpoint
async function fetchSupabaseConfig() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('Failed to fetch config');
    const config = await res.json();
    return config;
  } catch (error) {
    console.error('Failed to fetch config from API:', error);
    return { SUPABASE_URL: '', SUPABASE_ANON_KEY: '' };
  }
}

// Initialize Supabase using REST API
async function initSupabase() {
  const config = await fetchSupabaseConfig();
  if (config.SUPABASE_URL && config.SUPABASE_ANON_KEY &&
      config.SUPABASE_URL.includes('supabase.co') &&
      !config.SUPABASE_ANON_KEY.includes('your-anon-key')) {
    supabaseUrl = config.SUPABASE_URL;
    supabaseKey = config.SUPABASE_ANON_KEY;
    useSupabase = true;
    console.log('Supabase initialized successfully');
  } else {
    console.log('Supabase credentials not configured, using local storage only');
  }
}

// Supabase REST API helper functions
async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error_description || 'API error');
  return data;
}

// Auth functions using Supabase REST API
async function supabaseSignUp(email, password) {
  return supabaseFetch('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

async function supabaseSignIn(email, password) {
  return supabaseFetch('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

async function supabaseGetUser() {
  const accessToken = sessionStorage.getItem('supabaseAccessToken');
  if (!accessToken) return null;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${accessToken}`
      }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function supabaseSignOut() {
  const accessToken = sessionStorage.getItem('supabaseAccessToken');
  if (accessToken) {
    await supabaseFetch('/auth/v1/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
  }
}

async function supabaseResendVerification(email) {
  return supabaseFetch('/auth/v1/resend', {
    method: 'POST',
    body: JSON.stringify({ type: 'signup', email })
  });
}

// Data operations
async function supabaseSelect(table, accessToken) {
  return supabaseFetch(`/rest/v1/${table}?select=*`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
}

async function supabaseUpsert(table, data, accessToken) {
  return supabaseFetch(`/rest/v1/${table}?on_conflict=id`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify(data)
  });
}

async function supabaseDelete(table, id, accessToken) {
  return supabaseFetch(`/rest/v1/${table}?id=eq.${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
}

async function supabaseUpdate(table, id, data, accessToken) {
  return supabaseFetch(`/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify(data)
  });
}

let db=JSON.parse(localStorage.getItem(KEY)||"null");
if(!db){
  const oldSales=JSON.parse(localStorage.getItem("dataPenjualan")||"[]");
  const products=[];
  oldSales.forEach(s=>{
    if(!products.some(p=>p.name===s.barang)){
      products.push({id:uniqueId(),name:s.barang,cost:0,price:Number(s.harga)||0,stock:0});
    }
  });
  db={pin:"1234",products,sales:oldSales.map(s=>{
    const p=products.find(p=>p.name===s.barang);
    const price=Number(s.harga)||0,qty=Number(s.jumlah)||0;
    return {id:uniqueId(),date:s.tanggal,productId:p?.id,product:s.barang,price,qty,cost:0,total:Number(s.total)||price*qty,profit:price*qty};
  })};
  localStorage.setItem(KEY,JSON.stringify(db));
}
function save(){localStorage.setItem(KEY,JSON.stringify(db)); syncToSupabase()}

// Sync data to Supabase
async function syncToSupabase() {
  if (!useSupabase) return;
  const accessToken = sessionStorage.getItem('supabaseAccessToken');
  if (!accessToken) return;

  try {
    if (db.products.length > 0) {
      await supabaseUpsert('products', db.products.map(p => ({
        id: p.id, name: p.name, cost: p.cost, price: p.price, stock: p.stock, user_id: currentUser?.id
      })), accessToken);
    }
    if (db.sales.length > 0) {
      await supabaseUpsert('sales', db.sales.map(s => ({
        id: s.id, date: s.date, product_id: s.productId, product: s.product,
        price: s.price, qty: s.qty, cost: s.cost, total: s.total, profit: s.profit, user_id: currentUser?.id
      })), accessToken);
    }
    console.log('Data synced to Supabase');
  } catch (error) {
    console.error('Sync error:', error);
  }
}

// Sync data from Supabase
async function syncFromSupabase() {
  if (!useSupabase) return false;
  const accessToken = sessionStorage.getItem('supabaseAccessToken');
  if (!accessToken) return false;

  try {
    const products = await supabaseSelect('products', accessToken);
    const sales = await supabaseSelect('sales', accessToken);

    if (products && products.length > 0) {
      db.products = products.map(p => ({
        id: p.id, name: p.name, cost: p.cost, price: p.price, stock: p.stock
      }));
    }
    if (sales && sales.length > 0) {
      db.sales = sales.map(s => ({
        id: s.id, date: s.date, productId: s.product_id, product: s.product,
        price: s.price, qty: s.qty, cost: s.cost, total: s.total, profit: s.profit
      }));
    }
    save();
    console.log('Data synced from Supabase');
    return true;
  } catch (error) {
    console.error('Sync from Supabase error:', error);
    return false;
  }
}

// Role Management
async function fetchUserRole(userId) {
  if (!useSupabase) return;
  const accessToken = sessionStorage.getItem('supabaseAccessToken');
  if (!accessToken) return;

  try {
    const data = await supabaseFetch(`/rest/v1/user_roles?user_id=eq.${userId}&select=role`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    userRole = data[0]?.role || 'user';
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
  const accessToken = sessionStorage.getItem('supabaseAccessToken');
  if (!accessToken) return;

  try {
    const users = await supabaseSelect('user_roles', accessToken);
    renderUsersTable(users || []);
    updateUserStats(users || []);
  } catch (error) {
    console.error('Error loading users:', error);
    toast('Gagal memuat daftar user');
  }
}

function renderUsersTable(users) {
  if(!$("usersTable") || !$("userSearch")) return;

  const search = $("userSearch").value.toLowerCase();
  const filtered = users.filter(u => u.email.toLowerCase().includes(search));

  $("usersTable").innerHTML = filtered.map(u => `
    <tr>
      <td>${esc(u.email)}</td>
      <td>
        <select onchange="changeUserRole('${u.id}', this.value)" ${!isSuperAdmin() && u.role === 'super_admin' ? 'disabled' : ''}>
          <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
          <option value="super_admin" ${u.role === 'super_admin' ? 'selected' : ''} ${!isSuperAdmin() ? 'disabled' : ''}>Super Admin</option>
        </select>
      </td>
      <td>${new Date(u.created_at).toLocaleDateString('id-ID')}</td>
      <td>
        ${isSuperAdmin() ? `<button class="mini del" onclick="deleteUser('${u.id}')">Hapus</button>` : ''}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="4">Tidak ada user.</td></tr>';
}

function updateUserStats(users) {
  if($("totalUsers")) $("totalUsers").textContent = users.length;
  if($("totalAdmins")) $("totalAdmins").textContent = users.filter(u => u.role === 'admin' || u.role === 'super_admin').length;
  if($("totalRegularUsers")) $("totalRegularUsers").textContent = users.filter(u => u.role === 'user').length;
}

async function changeUserRole(userId, newRole) {
  if (!useSupabase || !isSuperAdmin()) {
    toast('Hanya super admin yang bisa mengubah role');
    return;
  }
  const accessToken = sessionStorage.getItem('supabaseAccessToken');
  if (!accessToken) return;

  try {
    await supabaseUpdate('user_roles', userId, { role: newRole }, accessToken);
    toast('Role berhasil diubah');
    loadUsers();
  } catch (error) {
    console.error('Error changing user role:', error);
    toast('Gagal mengubah role');
  }
}

async function deleteUser(userId) {
  if (!confirm('Hapus user ini? Data user akan dihapus permanen.')) return;
  if (!useSupabase || !isSuperAdmin()) {
    toast('Hanya super admin yang bisa menghapus user');
    return;
  }
  const accessToken = sessionStorage.getItem('supabaseAccessToken');
  if (!accessToken) return;

  try {
    await supabaseDelete('user_roles', userId, accessToken);
    toast('User role dihapus. Hapus auth user melalui dashboard Supabase.');
    loadUsers();
  } catch (error) {
    console.error('Error deleting user:', error);
    toast('Gagal menghapus user');
  }
}
function toast(t){$("toast").textContent=t;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2200)}
function logged(){return sessionStorage.getItem("adminLogin")==="1"}
function boot(){
 initSupabase().then(() => {
   // Check for existing session
   if (useSupabase) {
     supabaseGetUser().then(user => {
       if (user) {
         currentUser = user;
         sessionStorage.setItem("adminLogin","1");
         sessionStorage.setItem("supabaseUser", JSON.stringify(user));
         fetchUserRole(user.id).then(() => showApp());
       }
     });
   }
 });

 // Check if already logged in
 if(logged()) showApp();

 // Main app handlers
 if($("logoutBtn")) $("logoutBtn").onclick=handleSupabaseLogout;
 if($("menuBtn")) $("menuBtn").onclick=()=>$("sideNav").classList.toggle("open");

 // Navigation handlers
 document.querySelectorAll(".nav-btn[data-page]").forEach(b=>b.onclick=()=>showPage(b.dataset.page));

 // Date inputs
 if($("dashDate")) $("dashDate").value=today();
 if($("saleDate")) $("saleDate").value=today();
 if($("reportFrom")) $("reportFrom").value=today();
 if($("reportTo")) $("reportTo").value=today();

 // Sales handlers
 if($("saleProduct")) $("saleProduct").onchange=syncSalePrice;
 if($("salePrice")) $("salePrice").oninput=calcSaleTotal;
 if($("saleQty")) $("saleQty").oninput=calcSaleTotal;
 if($("addSaleBtn")) $("addSaleBtn").onclick=addSale;
 if($("saleSearch")) $("saleSearch").oninput=renderSales;

 // Product handlers
 if($("addProductBtn")) $("addProductBtn").onclick=addProduct;

 // Report handlers
 if($("reportBtn")) $("reportBtn").onclick=renderReport;
 if($("exportCsvBtn")) $("exportCsvBtn").onclick=exportCSV;
 if($("printReportBtn")) $("printReportBtn").onclick=printReport;

 // Backup handlers
 if($("backupBtn")) $("backupBtn").onclick=backup;
 if($("restoreBtn")) $("restoreBtn").onclick=restore;

 // Settings handlers
 if($("changePinBtn")) $("changePinBtn").onclick=changePin;
 if($("clearBtn")) $("clearBtn").onclick=clearData;
 if($("dashDate")) $("dashDate").onchange=renderDashboard;

 // Login tabs functionality
 if($("loginTab")) $("loginTab").onclick=()=>showLoginTab("login");
 if($("registerTab")) $("registerTab").onclick=()=>showLoginTab("register");
 if($("emailLoginBtn")) $("emailLoginBtn").onclick=handleEmailLogin;
 if($("registerBtn")) $("registerBtn").onclick=handleEmailRegister;
 if($("resendVerificationBtn")) $("resendVerificationBtn").onclick=handleResendVerification;

 // Admin dashboard functionality
 if($("userSearch")) $("userSearch").oninput=loadUsers;
 if($("refreshUsersBtn")) $("refreshUsersBtn").onclick=loadUsers;
}

function showLoginTab(tab) {
  if(!$("loginTab") || !$("registerTab") || !$("loginForm") || !$("registerForm")) return;

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
  if($("resendVerificationBtn")) $("resendVerificationBtn").classList.add("hidden");
}

async function handleEmailLogin() {
  if(!$("emailInput") || !$("passwordInput") || !$("loginMsg")) return;

  const email = $("emailInput").value.trim();
  const password = $("passwordInput").value;

  if (!email || !password) {
    $("loginMsg").textContent = "⚠️ Email dan password wajib diisi.";
    toast("Email dan password wajib diisi");
    return;
  }

  if (!useSupabase) {
    $("loginMsg").textContent = "⚠️ Supabase belum dikonfigurasi. Periksa env vars di Vercel.";
    toast("Supabase belum dikonfigurasi");
    return;
  }

  try {
    const data = await supabaseSignIn(email, password);

    // Check email verification
    if (!data.user?.email_confirmed_at) {
      $("loginMsg").textContent = "⚠️ Email belum diverifikasi. Silakan cek email Anda para link verifikasi.";
      toast("Email belum diverifikasi. Cek email Anda.");
      if($("resendVerificationBtn")) $("resendVerificationBtn").classList.remove("hidden");
      return;
    }

    // Set current user
    currentUser = data.user;
    sessionStorage.setItem("adminLogin","1");
    sessionStorage.setItem("supabaseUser", JSON.stringify(data.user));
    sessionStorage.setItem("supabaseAccessToken", data.access_token);

    // Fetch user role
    await fetchUserRole(data.user.id);

    showApp();

    // Sync data from Supabase after successful login
    const synced = await syncFromSupabase();
    if (synced) {
      renderAll();
      toast("Data berhasil disinkronisasi dari cloud!");
    } else {
      toast("Login berhasil, pero gagal sinkronisasi data.");
    }

  } catch (error) {
    const msg = error.message?.includes('Invalid login credentials')
      ? "Email o password incorrecto."
      : error.message?.includes('Email not confirmed')
      ? "Email belum diverificado. Cek email."
      : error.message?.includes('rate limit')
      ? "Demasiados intentos. Espera un momento."
      : error.message || 'Error desconocido';
    $("loginMsg").textContent = "⚠️ " + msg;
    toast(msg);
  }
}

async function handleEmailRegister() {
  if(!$("registerEmailInput") || !$("registerPasswordInput") || !$("registerConfirmPasswordInput") || !$("loginMsg")) return;

  const email = $("registerEmailInput").value.trim();
  const password = $("registerPasswordInput").value;
  const confirmPassword = $("registerConfirmPasswordInput").value;

  if (!email || !password || !confirmPassword) {
    $("loginMsg").textContent = "⚠️ Email, password, y confirmación de password son obligatorios.";
    toast("Todos los campos son obligatorios");
    return;
  }

  if (password.length < 6) {
    $("loginMsg").textContent = "⚠️ Password mínimo 6 caracteres.";
    toast("Password mínimo 6 caracteres");
    return;
  }

  if (password !== confirmPassword) {
    $("loginMsg").textContent = "⚠️ La confirmación de password no coincide.";
    toast("La confirmación de password no coincide");
    return;
  }

  if (!useSupabase) {
    $("loginMsg").textContent = "⚠️ Supabase no está configurado. Revisa las env vars en Vercel.";
    toast("Supabase no está configurado");
    return;
  }

  try {
    const data = await supabaseSignUp(email, password);

    // Check if email confirmation is required
    if (data.user && !data.session) {
      toast("¡Registro exitoso! Revisa tu email para verificar antes de iniciar sesión.");
      if($("resendVerificationBtn")) $("resendVerificationBtn").classList.remove("hidden");
    } else if (data.user && data.session) {
      // Auto login if email confirmation is disabled
      sessionStorage.setItem("adminLogin","1");
      sessionStorage.setItem("supabaseUser", JSON.stringify(data.user));
      sessionStorage.setItem("supabaseAccessToken", data.access_token);
      showApp();
      toast("¡Registro exitoso! Ya has iniciado sesión.");
    }

  } catch (error) {
    const msg = error.message?.includes('already registered')
      ? "Email ya registrado. Inicia sesión."
      : error.message?.includes('rate limit')
      ? "Demasiados intentos. Espera un momento."
      : error.message || 'Error desconocido';
    $("loginMsg").textContent = "⚠️ " + msg;
    toast(msg);
  }
}

async function handleResendVerification() {
  if(!$("emailInput") || !$("loginMsg") || !$("resendVerificationBtn")) return;

  const email = $("emailInput").value.trim();

  if (!email) {
    $("loginMsg").textContent = "Ingresa tu email primero.";
    return;
  }

  if (!useSupabase) {
    $("loginMsg").textContent = "Supabase no está configurado.";
    return;
  }

  try {
    const originalText = $("resendVerificationBtn").textContent;
    $("resendVerificationBtn").textContent = "Enviando...";
    $("resendVerificationBtn").disabled = true;

    await supabaseResendVerification(email);

    $("resendVerificationBtn").textContent = originalText;
    $("resendVerificationBtn").disabled = false;

    toast("¡Email de verificación reenviado! Revisa tu bandeja de entrada.");
    $("loginMsg").textContent = "";

  } catch (error) {
    $("loginMsg").textContent = "Error al reenviar email de verificación: " + (error.message || 'Error desconocido');
    $("resendVerificationBtn").textContent = "📧 Reenviar Email de Verificación";
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
function showApp(){
  if($("loginScreen")) $("loginScreen").classList.add("hidden");
  if($("app")) $("app").classList.remove("hidden");

  const adminElements = document.querySelectorAll('.admin-only');
  adminElements.forEach(el => {
    if (isAdmin()) {
      el.classList.remove('hidden');
      el.classList.add('visible');
    } else {
      el.classList.add('hidden');
      el.classList.remove('visible');
    }
  });

  if($("resendVerificationBtn")) $("resendVerificationBtn").classList.add("hidden");

  renderAll();
}
function showPage(id){
  if (id === 'admin' && !isAdmin()) {
    toast('Acceso denegado. Esta página es solo para administradores.');
    return;
  }

  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  if($(id)) $(id).classList.remove("hidden");
  document.querySelectorAll(".nav-btn[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===id));
  if($("sideNav")) $("sideNav").classList.remove("open");

  if (id === 'admin') {
    loadUsers();
  }

  renderAll();
}
function renderAll(){renderProducts();fillProductSelect();renderSales();renderDashboard();renderReport()}
function addProduct(){
 if(!$("pName") || !$("pCost") || !$("pPrice") || !$("pStock")) return;

 const name=$("pName").value.trim(),cost=+$("pCost").value||0,price=+$("pPrice").value||0,stock=+$("pStock").value||0;
 if(!name)return toast("El nombre del producto es obligatorio.");
 db.products.push({id:uniqueId(),name,cost,price,stock});save();$("pName").value="";$("pCost").value="";$("pPrice").value="";$("pStock").value="";renderAll();toast("Producto agregado.")
}
function renderProducts(){
 if($("productsTable")) {
  $("productsTable").innerHTML=db.products.map((p,i)=>`<tr><td>${esc(p.name)}</td><td>${rupiah(p.cost)}</td><td>${rupiah(p.price)}</td><td>${p.stock}</td><td><button class="mini del" onclick="deleteProduct(${i})">Eliminar</button></td></tr>`).join("")||`<tr><td colspan="5">No hay productos.</td></tr>`;
 }
}
function deleteProduct(i){if(confirm("¿Eliminar este producto?")){db.products.splice(i,1);save();renderAll()}}
function fillProductSelect(){
 if($("saleProduct")) {
  $("saleProduct").innerHTML=`<option value="">-- seleccionar producto --</option>`+db.products.map(p=>`<option value="${p.id}">${esc(p.name)} (stock ${p.stock})</option>`).join("");
 }
}
function syncSalePrice(){
 if($("saleProduct")) {
  const p=db.products.find(x=>x.id===$("saleProduct").value);
  if($("salePrice")) $("salePrice").value=p?p.price:"";
  if($("stockInfo")) $("stockInfo").textContent=p?`Stock: ${p.stock}`:"";
  calcSaleTotal();
 }
}
function calcSaleTotal(){
 if($("saleTotal") && $("salePrice") && $("saleQty")) {
  $("saleTotal").textContent=rupiah((+$("salePrice").value||0)*(+$("saleQty").value||0));
 }
}
function addSale(){
 if(!$("saleProduct") || !$("salePrice") || !$("saleQty") || !$("saleDate")) return;

 const p=db.products.find(x=>x.id===$("saleProduct").value),price=+$("salePrice").value||0,qty=+$("saleQty").value||0,date=$("saleDate").value||today();
 if(!p)return toast("Selecciona un producto."); if(qty<1)return toast("Cantidad mínima 1."); if(p.stock<qty)return toast("Stock insuficiente.");
 const newId=uniqueId();
 db.sales.push({id:newId,date,productId:p.id,product:p.name,price,qty,cost:p.cost,total:price*qty,profit:(price-p.cost)*qty});
 p.stock-=qty;save();$("saleProduct").value="";$("salePrice").value="";$("saleQty").value=1;if($("stockInfo")) $("stockInfo").textContent="";calcSaleTotal();renderAll();toast("Venta guardada exitosamente.")
 printReceipt(newId);
}
function renderSales(){
 if(!$("saleSearch") || !$("salesTable")) return;

 const q=$("saleSearch").value.toLowerCase();
 const rows=db.sales.filter(s=>s.product.toLowerCase().includes(q)).slice().reverse();
 $("salesTable").innerHTML=rows.map((s,i)=>`<tr><td>${i+1}</td><td>${s.date}</td><td>${esc(s.product)}</td><td>${rupiah(s.price)}</td><td>${s.qty}</td><td>${rupiah(s.total)}</td><td><button class="mini" onclick="printReceipt('${s.id}')">🧾</button> <button class="mini del" onclick="deleteSale('${s.id}')">Eliminar</button></td></tr>`).join("")||`<tr><td colspan="7">No hay transacciones.</td></tr>`;
}
function deleteSale(id){const s=db.sales.find(x=>x.id===id);if(!s||!confirm("¿Eliminar transacción y devolver stock?"))return;const p=db.products.find(x=>x.id===s.productId);if(p)p.stock+=s.qty;db.sales=db.sales.filter(x=>x.id!==id);save();renderAll()}
function daySales(date){return db.sales.filter(s=>s.date===date)}
function renderDashboard(){
 if(!$("dashDate") || !$("sTransactions") || !$("sItems") || !$("sRevenue") || !$("sProfit") || !$("weeklyChart") || !$("topProducts")) return;

 const date=$("dashDate").value||today(),a=daySales(date),items=a.reduce((n,s)=>n+s.qty,0),rev=a.reduce((n,s)=>n+s.total,0),profit=a.reduce((n,s)=>n+s.profit,0);
 $("sTransactions").textContent=a.length;$("sItems").textContent=items;$("sRevenue").textContent=rupiah(rev);$("sProfit").textContent=rupiah(profit);
 const days=[...Array(7)].map((_,i)=>{let d=new Date(date+"T00:00:00");d.setDate(d.getDate()-6+i);return d.toISOString().slice(0,10)});
 const vals=days.map(d=>daySales(d).reduce((n,s)=>n+s.total,0)),max=Math.max(...vals,1);
 $("weeklyChart").innerHTML=days.map((d,i)=>`<div class="bar-wrap"><span>${rupiah(vals[i]).replace("Rp ","")}</span><div class="bar" style="height:${Math.max(2,vals[i]/max*160)}px"></div><div class="bar-label">${d.slice(5)}</div></div>`).join("");
 const counts={};a.forEach(s=>counts[s.product]=(counts[s.product]||0)+s.qty);
 $("topProducts").innerHTML=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,7).map(x=>`<div class="list-row"><span>${esc(x[0])}</span><b>${x[1]} pcs</b></div>`).join("")||"<p>No hay ventas.</p>";
}
function filteredReport(){
 if(!$("reportFrom") || !$("reportTo")) return db.sales;
 const f=$("reportFrom").value,t=$("reportTo").value;return db.sales.filter(s=>(!f||s.date>=f)&&(!t||s.date<=t));
}
function renderReport(){
 if(!$("rTransactions") || !$("rItems") || !$("rRevenue") || !$("rProfit") || !$("reportTable")) return;

 const a=filteredReport(),rev=a.reduce((n,s)=>n+s.total,0),profit=a.reduce((n,s)=>n+s.profit,0);
 $("rTransactions").textContent=a.length;$("rItems").textContent=a.reduce((n,s)=>n+s.qty,0);$("rRevenue").textContent=rupiah(rev);$("rProfit").textContent=rupiah(profit);
 $("reportTable").innerHTML=a.map(s=>`<tr><td>${s.date}</td><td>${esc(s.product)}</td><td>${rupiah(s.price)}</td><td>${s.qty}</td><td>${rupiah(s.total)}</td><td>${rupiah(s.profit)}</td></tr>`).join("")||`<tr><td colspan="6">No hay datos.</td></tr>`;
}
function exportCSV(){
 const a=filteredReport();let csv="Fecha,Producto,Precio,Cantidad,Total,Ganancia\n"+a.map(s=>[s.date,`"${s.product.replaceAll('"','""')}"`,s.price,s.qty,s.total,s.profit].join(",")).join("\n");
 download(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}),"reporte-ventas.csv")
}
function printReport(){
 if(!$("printArea") || !$("reportFrom") || !$("reportTo")) return;

 const a=filteredReport();$("printArea").innerHTML=`<h1>Reporte de Ventas</h1><p>Período: ${$("reportFrom").value||"-"} a ${$("reportTo").value||"-"}</p><table><thead><tr><th>Fecha</th><th>Producto</th><th>Precio</th><th>Cantidad</th><th>Total</th><th>Ganancia</th></tr></thead><tbody>${a.map(s=>`<tr><td>${s.date}</td><td>${esc(s.product)}</td><td>${rupiah(s.price)}</td><td>${s.qty}</td><td>${rupiah(s.total)}</td><td>${rupiah(s.profit)}</td></tr>`).join("")}</tbody></table><p><b>Total ingresos: ${rupiah(a.reduce((n,s)=>n+s.total,0))}</b></p>`;window.print();
}
function printReceipt(id){
 if(!$("printArea")) return;

 const s=db.sales.find(x=>x.id===id);if(!s)return;
 $("printArea").innerHTML=`<h1>Recibo de Venta</h1><p>Kopi Tutug<br>${s.date}</p><hr><p>${esc(s.product)}<br>${s.qty} × ${rupiah(s.price)}</p><h2>Total ${rupiah(s.total)}</h2><p>¡Gracias!</p>`;window.print();
}
function backup(){download(new Blob([JSON.stringify(db,null,2)],{type:"application/json"}),`backup-ventas-${today()}.json`)}
function restore(){
 const f=$("restoreFile").files[0];if(!f)return toast("Selecciona un archivo de respaldo JSON.");
 const r=new FileReader();r.onload=()=>{try{const x=JSON.parse(r.result);if(!x.products||!x.sales)throw 0;if(!confirm("Restaurar reemplazará los datos actuales. ¿Continuar?"))return;db=x;save();renderAll();toast("Restauración exitosa.")}catch(e){toast("Archivo de respaldo no válido.")}};r.readAsText(f)
}
function changePin(){
 if(!$("oldPin") || !$("newPin") || !$("pinMsg")) return;

 if($("oldPin").value!==db.pin)return $("pinMsg").textContent="PIN anterior incorrecto.";if($("newPin").value.length<4)return $("pinMsg").textContent="El nuevo PIN debe tener al menos 4 dígitos.";db.pin=$("newPin").value;save();$("pinMsg").textContent="PIN cambiado exitosamente.";
}
function clearData(){if(confirm("¿Eliminar TODOS los productos y transacciones?")){db.products=[];db.sales=[];save();renderAll();toast("Todos los datos eliminados.")}}
function download(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":String.fromCharCode(38)+"amp;","<":String.fromCharCode(60)+"lt;",">":String.fromCharCode(62)+"gt;",'"':String.fromCharCode(34)+"quot;","'":"&#039;"}[m]))}
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(console.error));
boot();