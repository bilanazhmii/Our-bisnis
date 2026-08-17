const $=id=>document.getElementById(id);
const KEY="kopiTutugDataV2";
const today=()=>new Date().toISOString().slice(0,10);
const rupiah=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n)||0);
const uniqueId=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Supabase Configuration
let supabase = null;
let useSupabase = false;
let currentUser = null;
let userRole = 'user'; // 'user', 'admin', 'super_admin'

// Load Supabase configuration from window object (set by config.js or inline)
function initSupabase() {
  // Check if Supabase is available
  if (typeof window.supabase === 'undefined') {
    console.log('Supabase SDK not loaded, using local storage only');
    return;
  }

  if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    try {
      supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      useSupabase = true;
      console.log('Supabase initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Supabase:', error);
    }
  } else {
    console.log('Supabase credentials not found, using local storage only');
    console.log('To enable Supabase sync, copy config.example.js to config.js and add your credentials');
  }
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

// Supabase Sync Functions
async function syncToSupabase() {
  if (!useSupabase || !supabase) return;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Sync products
    const { error: productsError } = await supabase
      .from('products')
      .upsert(db.products.map(p => ({
        id: p.id,
        name: p.name,
        cost: p.cost,
        price: p.price,
        stock: p.stock,
        user_id: user.id
      })), { onConflict: 'id' });

    if (productsError) console.error('Error syncing products:', productsError);

    // Sync sales
    const { error: salesError } = await supabase
      .from('sales')
      .upsert(db.sales.map(s => ({
        id: s.id,
        date: s.date,
        product_id: s.productId,
        product: s.product,
        price: s.price,
        qty: s.qty,
        cost: s.cost,
        total: s.total,
        profit: s.profit,
        user_id: user.id
      })), { onConflict: 'id' });

    if (salesError) console.error('Error syncing sales:', salesError);

    console.log('Data synced to Supabase');
  } catch (error) {
    console.error('Sync error:', error);
  }
}

async function syncFromSupabase() {
  if (!useSupabase || !supabase) return false;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Fetch user role
    await fetchUserRole(user.id);

    // Fetch products
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', user.id);

    if (productsError) throw productsError;

    // Fetch sales
    const { data: sales, error: salesError } = await supabase
      .from('sales')
      .select('*')
      .eq('user_id', user.id);

    if (salesError) throw salesError;

    // Update local database
    if (products && products.length > 0) {
      db.products = products.map(p => ({
        id: p.id,
        name: p.name,
        cost: p.cost,
        price: p.price,
        stock: p.stock
      }));
    }

    if (sales && sales.length > 0) {
      db.sales = sales.map(s => ({
        id: s.id,
        date: s.date,
        productId: s.product_id,
        product: s.product,
        price: s.price,
        qty: s.qty,
        cost: s.cost,
        total: s.total,
        profit: s.profit
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

// Role Management Functions
async function fetchUserRole(userId) {
  if (!useSupabase || !supabase) return;

  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching user role:', error);
      userRole = 'user';
      return;
    }

    userRole = data.role || 'user';
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
  if (!useSupabase || !supabase || !isAdmin()) return;

  try {
    const { data: users, error } = await supabase
      .from('user_roles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

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
  if (!useSupabase || !supabase || !isSuperAdmin()) {
    toast('Hanya super admin yang bisa mengubah role');
    return;
  }

  try {
    const { error } = await supabase
      .from('user_roles')
      .update({ role: newRole })
      .eq('id', userId);

    if (error) throw error;

    toast('Role berhasil diubah');
    loadUsers();
  } catch (error) {
    console.error('Error changing user role:', error);
    toast('Gagal mengubah role');
  }
}

async function deleteUser(userId) {
  if (!confirm('Hapus user ini? Data user akan dihapus permanen.')) return;

  if (!useSupabase || !supabase || !isSuperAdmin()) {
    toast('Hanya super admin yang bisa menghapus user');
    return;
  }

  try {
    // Delete from user_roles
    const { error: roleError } = await supabase
      .from('user_roles')
      .delete()
      .eq('id', userId);

    if (roleError) throw roleError;

    // Note: Deleting from auth.users requires service role key
    // This should be done via edge function or server-side
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
 initSupabase(); // Initialize Supabase

 // PIN Login handlers
 if($("pinInput")) $("pinInput").addEventListener("keydown",e=>{if(e.key==="Enter")login()});
 if($("loginBtn")) $("loginBtn").onclick=login;

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
 if($("pinTab")) $("pinTab").onclick=()=>showLoginTab("pin");
 if($("emailTab")) $("emailTab").onclick=()=>showLoginTab("email");
 if($("emailLoginBtn")) $("emailLoginBtn").onclick=handleEmailLogin;
 if($("registerBtn")) $("registerBtn").onclick=handleEmailRegister;
 if($("resendVerificationBtn")) $("resendVerificationBtn").onclick=handleResendVerification;

 // Admin dashboard functionality (only if elements exist)
 if($("userSearch")) $("userSearch").oninput=loadUsers;
 if($("refreshUsersBtn")) $("refreshUsersBtn").onclick=loadUsers;
}

function showLoginTab(tab) {
  if(!$("pinTab") || !$("emailTab") || !$("pinLogin") || !$("emailLogin")) return;

  if (tab === "pin") {
    $("pinTab").classList.add("active");
    $("emailTab").classList.remove("active");
    $("pinLogin").classList.remove("hidden");
    $("emailLogin").classList.add("hidden");
  } else {
    $("emailTab").classList.add("active");
    $("pinTab").classList.remove("active");
    $("emailLogin").classList.remove("hidden");
    $("pinLogin").classList.add("hidden");
  }
  // Hide resend verification button when switching tabs
  if($("resendVerificationBtn")) $("resendVerificationBtn").classList.add("hidden");
}

async async function handleEmailLogin() {
  if(!$("emailInput") || !$("passwordInput") || !$("loginMsg")) return;

  const email = $("emailInput").value.trim();
  const password = $("passwordInput").value;

  if (!email || !password) {
    $("loginMsg").textContent = "Email dan password wajib diisi.";
    return;
  }

  if (!useSupabase || !supabase) {
    $("loginMsg").textContent = "Supabase tidak dikonfigurasi. Gunakan login PIN.";
    return;
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) throw error;

    // Check email verification
    if (!data.user.email_confirmed_at) {
      $("loginMsg").textContent = "Email belum diverifikasi. Silakan cek email Anda untuk link verifikasi.";
      if($("resendVerificationBtn")) $("resendVerificationBtn").classList.remove("hidden");
      return;
    }

    // Set current user
    currentUser = data.user;
    sessionStorage.setItem("adminLogin","1");
    sessionStorage.setItem("supabaseUser", JSON.stringify(data.user));

    // Fetch user role
    await fetchUserRole(data.user.id);

    showApp();

    // Sync data from Supabase after successful login
    const synced = await syncFromSupabase();
    if (synced) {
      renderAll();
      toast("Data berhasil disinkronisasi dari cloud!");
    } else {
      toast("Login berhasil, tapi gagal sinkronisasi data.");
    }

  } catch (error) {
    $("loginMsg").textContent = "Login gagal: " + error.message;
  }
}

async function handleEmailRegister() {
  if(!$("emailInput") || !$("passwordInput") || !$("loginMsg")) return;

  const email = $("emailInput").value.trim();
  const password = $("passwordInput").value;

  if (!email || !password) {
    $("loginMsg").textContent = "Email dan password wajib diisi.";
    return;
  }

  if (password.length < 6) {
    $("loginMsg").textContent = "Password minimal 6 karakter.";
    return;
  }

  if (!useSupabase || !supabase) {
    $("loginMsg").textContent = "Supabase tidak dikonfigurasi. Gunakan login PIN.";
    return;
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password
    });

    if (error) throw error;

    // Check if email confirmation is required
    if (data.user && !data.session) {
      toast("Registrasi berhasil! Silakan cek email untuk verifikasi sebelum login.");
      if($("resendVerificationBtn")) $("resendVerificationBtn").classList.remove("hidden");
    } else if (data.user && data.session) {
      // Auto login if email confirmation is disabled (not recommended)
      sessionStorage.setItem("adminLogin","1");
      sessionStorage.setItem("supabaseUser", JSON.stringify(data.user));
      showApp();
      toast("Registrasi berhasil! Anda sudah login.");
    }

  } catch (error) {
    $("loginMsg").textContent = "Registrasi gagal: " + error.message;
  }
}

async function handleResendVerification() {
  if(!$("emailInput") || !$("loginMsg") || !$("resendVerificationBtn")) return;

  const email = $("emailInput").value.trim();

  if (!email) {
    $("loginMsg").textContent = "Masukkan email terlebih dahulu.";
    return;
  }

  if (!useSupabase || !supabase) {
    $("loginMsg").textContent = "Supabase tidak dikonfigurasi.";
    return;
  }

  try {
    // Show loading state
    const originalText = $("resendVerificationBtn").textContent;
    $("resendVerificationBtn").textContent = "Mengirim...";
    $("resendVerificationBtn").disabled = true;

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email
    });

    // Reset button state
    $("resendVerificationBtn").textContent = originalText;
    $("resendVerificationBtn").disabled = false;

    if (error) throw error;

    toast("Email verifikasi berhasil dikirim ulang! Silakan cek inbox email Anda.");
    $("loginMsg").textContent = "";

  } catch (error) {
    $("loginMsg").textContent = "Gagal mengirim email verifikasi: " + error.message;
    $("resendVerificationBtn").textContent = "📧 Kirim Ulang Verifikasi Email";
    $("resendVerificationBtn").disabled = false;
  }
}
function login(){
  if(!$("pinInput")) return;

  const pin = $("pinInput").value;

  // Check if using Supabase authentication
  if (useSupabase && supabase) {
    // For now, we'll support both PIN and email/password
    // If it looks like an email, use Supabase auth
    if (pin.includes('@')) {
      showLoginTab("email");
      if($("emailInput")) $("emailInput").value = pin;
      return;
    }
  }

  // Fallback to PIN authentication
  if(pin===db.pin){
    sessionStorage.setItem("adminLogin","1");
    showApp();
    // If Supabase is available, sync data after login
    if (useSupabase) {
      syncFromSupabase().then(() => renderAll());
    }
  } else {
    if($("loginMsg")) $("loginMsg").textContent="PIN salah.";
  }

  // Hide resend verification button on PIN login
  if($("resendVerificationBtn")) $("resendVerificationBtn").classList.add("hidden");
}

async function handleSupabaseLogout() {
  if (useSupabase && supabase) {
    await supabase.auth.signOut();
    sessionStorage.removeItem("supabaseUser");
  }
  sessionStorage.removeItem("adminLogin");
  currentUser = null;
  userRole = 'user';
  location.reload();
}
function showApp(){
  if($("loginScreen")) $("loginScreen").classList.add("hidden");
  if($("app")) $("app").classList.remove("hidden");

  // Show/hide admin elements based on role
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

  // Hide resend verification button when app is shown
  if($("resendVerificationBtn")) $("resendVerificationBtn").classList.add("hidden");

  renderAll();
}
function showPage(id){
  // Check admin access for admin page
  if (id === 'admin' && !isAdmin()) {
    toast('Akses ditolak. Halaman ini khusus admin.');
    return;
  }

  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  if($(id)) $(id).classList.remove("hidden");
  document.querySelectorAll(".nav-btn[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===id));
  if($("sideNav")) $("sideNav").classList.remove("open");

  // Load admin data if accessing admin page
  if (id === 'admin') {
    loadUsers();
  }

  renderAll();
}
function renderAll(){renderProducts();fillProductSelect();renderSales();renderDashboard();renderReport()}
function addProduct(){
 if(!$("pName") || !$("pCost") || !$("pPrice") || !$("pStock")) return;

 const name=$("pName").value.trim(),cost=+$("pCost").value||0,price=+$("pPrice").value||0,stock=+$("pStock").value||0;
 if(!name)return toast("Nama barang wajib diisi.");
 db.products.push({id:uniqueId(),name,cost,price,stock});save();$("pName").value="";$("pCost").value="";$("pPrice").value="";$("pStock").value="";renderAll();toast("Barang ditambahkan.")
}
function renderProducts(){
 if($("productsTable")) {
  $("productsTable").innerHTML=db.products.map((p,i)=>`<tr><td>${esc(p.name)}</td><td>${rupiah(p.cost)}</td><td>${rupiah(p.price)}</td><td>${p.stock}</td><td><button class="mini del" onclick="deleteProduct(${i})">Hapus</button></td></tr>`).join("")||`<tr><td colspan="5">Belum ada barang.</td></tr>`;
 }
}
function deleteProduct(i){if(confirm("Hapus barang ini?")){db.products.splice(i,1);save();renderAll()}}
function fillProductSelect(){
 if($("saleProduct")) {
  $("saleProduct").innerHTML=`<option value="">-- pilih barang --</option>`+db.products.map(p=>`<option value="${p.id}">${esc(p.name)} (stok ${p.stock})</option>`).join("");
 }
}
function syncSalePrice(){
 if($("saleProduct")) {
  const p=db.products.find(x=>x.id===$("saleProduct").value);
  if($("salePrice")) $("salePrice").value=p?p.price:"";
  if($("stockInfo")) $("stockInfo").textContent=p?`Stok: ${p.stock}`:"";
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
 if(!p)return toast("Pilih barang."); if(qty<1)return toast("Jumlah minimal 1."); if(p.stock<qty)return toast("Stok tidak cukup.");
 const newId=uniqueId();
 db.sales.push({id:newId,date,productId:p.id,product:p.name,price,qty,cost:p.cost,total:price*qty,profit:(price-p.cost)*qty});
 p.stock-=qty;save();$("saleProduct").value="";$("salePrice").value="";$("saleQty").value=1;if($("stockInfo")) $("stockInfo").textContent="";calcSaleTotal();renderAll();toast("Penjualan berhasil disimpan.")
 printReceipt(newId);
}
function renderSales(){
 if(!$("saleSearch") || !$("salesTable")) return;

 const q=$("saleSearch").value.toLowerCase();
 const rows=db.sales.filter(s=>s.product.toLowerCase().includes(q)).slice().reverse();
 $("salesTable").innerHTML=rows.map((s,i)=>`<tr><td>${i+1}</td><td>${s.date}</td><td>${esc(s.product)}</td><td>${rupiah(s.price)}</td><td>${s.qty}</td><td>${rupiah(s.total)}</td><td><button class="mini" onclick="printReceipt('${s.id}')">🧾</button> <button class="mini del" onclick="deleteSale('${s.id}')">Hapus</button></td></tr>`).join("")||`<tr><td colspan="7">Belum ada transaksi.</td></tr>`;
}
function deleteSale(id){const s=db.sales.find(x=>x.id===id);if(!s||!confirm("Hapus transaksi dan kembalikan stok?"))return;const p=db.products.find(x=>x.id===s.productId);if(p)p.stock+=s.qty;db.sales=db.sales.filter(x=>x.id!==id);save();renderAll()}
function daySales(date){return db.sales.filter(s=>s.date===date)}
function renderDashboard(){
 if(!$("dashDate") || !$("sTransactions") || !$("sItems") || !$("sRevenue") || !$("sProfit") || !$("weeklyChart") || !$("topProducts")) return;

 const date=$("dashDate").value||today(),a=daySales(date),items=a.reduce((n,s)=>n+s.qty,0),rev=a.reduce((n,s)=>n+s.total,0),profit=a.reduce((n,s)=>n+s.profit,0);
 $("sTransactions").textContent=a.length;$("sItems").textContent=items;$("sRevenue").textContent=rupiah(rev);$("sProfit").textContent=rupiah(profit);
 const days=[...Array(7)].map((_,i)=>{let d=new Date(date+"T00:00:00");d.setDate(d.getDate()-6+i);return d.toISOString().slice(0,10)});
 const vals=days.map(d=>daySales(d).reduce((n,s)=>n+s.total,0)),max=Math.max(...vals,1);
 $("weeklyChart").innerHTML=days.map((d,i)=>`<div class="bar-wrap"><span>${rupiah(vals[i]).replace("Rp ","")}</span><div class="bar" style="height:${Math.max(2,vals[i]/max*160)}px"></div><div class="bar-label">${d.slice(5)}</div></div>`).join("");
 const counts={};a.forEach(s=>counts[s.product]=(counts[s.product]||0)+s.qty);
 $("topProducts").innerHTML=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,7).map(x=>`<div class="list-row"><span>${esc(x[0])}</span><b>${x[1]} pcs</b></div>`).join("")||"<p>Belum ada penjualan.</p>";
}
function filteredReport(){
 if(!$("reportFrom") || !$("reportTo")) return db.sales;
 const f=$("reportFrom").value,t=$("reportTo").value;return db.sales.filter(s=>(!f||s.date>=f)&&(!t||s.date<=t));
}
function renderReport(){
 if(!$("rTransactions") || !$("rItems") || !$("rRevenue") || !$("rProfit") || !$("reportTable")) return;

 const a=filteredReport(),rev=a.reduce((n,s)=>n+s.total,0),profit=a.reduce((n,s)=>n+s.profit,0);
 $("rTransactions").textContent=a.length;$("rItems").textContent=a.reduce((n,s)=>n+s.qty,0);$("rRevenue").textContent=rupiah(rev);$("rProfit").textContent=rupiah(profit);
 $("reportTable").innerHTML=a.map(s=>`<tr><td>${s.date}</td><td>${esc(s.product)}</td><td>${rupiah(s.price)}</td><td>${s.qty}</td><td>${rupiah(s.total)}</td><td>${rupiah(s.profit)}</td></tr>`).join("")||`<tr><td colspan="6">Tidak ada data.</td></tr>`;
}
function exportCSV(){
 const a=filteredReport();let csv="Tanggal,Barang,Harga,Jumlah,Total,Laba\n"+a.map(s=>[s.date,`"${s.product.replaceAll('"','""')}"`,s.price,s.qty,s.total,s.profit].join(",")).join("\n");
 download(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}),"laporan-penjualan.csv")
}
function printReport(){
 if(!$("printArea") || !$("reportFrom") || !$("reportTo")) return;

 const a=filteredReport();$("printArea").innerHTML=`<h1>Laporan Penjualan</h1><p>Periode: ${$("reportFrom").value||"-"} s/d ${$("reportTo").value||"-"}</p><table><thead><tr><th>Tanggal</th><th>Barang</th><th>Harga</th><th>Jumlah</th><th>Total</th><th>Laba</th></tr></thead><tbody>${a.map(s=>`<tr><td>${s.date}</td><td>${esc(s.product)}</td><td>${rupiah(s.price)}</td><td>${s.qty}</td><td>${rupiah(s.total)}</td><td>${rupiah(s.profit)}</td></tr>`).join("")}</tbody></table><p><b>Total omzet: ${rupiah(a.reduce((n,s)=>n+s.total,0))}</b></p>`;window.print();
}
function printReceipt(id){
 if(!$("printArea")) return;

 const s=db.sales.find(x=>x.id===id);if(!s)return;
 $("printArea").innerHTML=`<h1>Struk Penjualan</h1><p>Kopi Tutug<br>${s.date}</p><hr><p>${esc(s.product)}<br>${s.qty} × ${rupiah(s.price)}</p><h2>Total ${rupiah(s.total)}</h2><p>Terima kasih.</p>`;window.print();
}
function backup(){download(new Blob([JSON.stringify(db,null,2)],{type:"application/json"}),`backup-penjualan-${today()}.json`)}
function restore(){
 const f=$("restoreFile").files[0];if(!f)return toast("Pilih file backup JSON.");
 const r=new FileReader();r.onload=()=>{try{const x=JSON.parse(r.result);if(!x.products||!x.sales)throw 0;if(!confirm("Restore akan mengganti data saat ini. Lanjut?"))return;db=x;save();renderAll();toast("Restore berhasil.")}catch(e){toast("File backup tidak valid.")}};r.readAsText(f)
}
function changePin(){
 if(!$("oldPin") || !$("newPin") || !$("pinMsg")) return;

 if($("oldPin").value!==db.pin)return $("pinMsg").textContent="PIN lama salah.";if($("newPin").value.length<4)return $("pinMsg").textContent="PIN baru minimal 4 angka.";db.pin=$("newPin").value;save();$("pinMsg").textContent="PIN berhasil diubah.";
}
function clearData(){if(confirm("Hapus SEMUA produk dan transaksi?")){db.products=[];db.sales=[];save();renderAll();toast("Semua data dihapus.")}}
function download(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(console.error));
boot();