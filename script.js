const $=id=>document.getElementById(id);
const KEY="kopiTutugDataV2";
const today=()=>new Date().toISOString().slice(0,10);
const rupiah=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n)||0);
const uniqueId=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Supabase Configuration
let supabase = null;
let useSupabase = false;

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
function toast(t){$("toast").textContent=t;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2200)}
function logged(){return sessionStorage.getItem("adminLogin")==="1"}
function boot(){
 initSupabase(); // Initialize Supabase
 $("pinInput").addEventListener("keydown",e=>{if(e.key==="Enter")login()});
 $("loginBtn").onclick=login;
 if(logged()) showApp();
 $("logoutBtn").onclick=handleSupabaseLogout;
 $("menuBtn").onclick=()=>$("sideNav").classList.toggle("open");
 document.querySelectorAll(".nav-btn[data-page]").forEach(b=>b.onclick=()=>showPage(b.dataset.page));
 $("dashDate").value=today(); $("saleDate").value=today(); $("reportFrom").value=today(); $("reportTo").value=today();
 $("saleProduct").onchange=syncSalePrice; $("salePrice").oninput=calcSaleTotal; $("saleQty").oninput=calcSaleTotal;
 $("addSaleBtn").onclick=addSale; $("saleSearch").oninput=renderSales;
 $("addProductBtn").onclick=addProduct; $("reportBtn").onclick=renderReport;
 $("exportCsvBtn").onclick=exportCSV; $("printReportBtn").onclick=printReport;
 $("backupBtn").onclick=backup; $("restoreBtn").onclick=restore;
 $("changePinBtn").onclick=changePin; $("clearBtn").onclick=clearData; $("dashDate").onchange=renderDashboard;

 // Login tabs functionality
 $("pinTab").onclick=()=>showLoginTab("pin");
 $("emailTab").onclick=()=>showLoginTab("email");
 $("emailLoginBtn").onclick=handleEmailLogin;
 $("registerBtn").onclick=handleEmailRegister;
}

function showLoginTab(tab) {
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
}

async function handleEmailLogin() {
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

    sessionStorage.setItem("adminLogin","1");
    sessionStorage.setItem("supabaseUser", JSON.stringify(data.user));
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

    toast("Registrasi berhasil! Silakan cek email untuk konfirmasi.");

  } catch (error) {
    $("loginMsg").textContent = "Registrasi gagal: " + error.message;
  }
}
function login(){
  const pin = $("pinInput").value;

  // Check if using Supabase authentication
  if (useSupabase && supabase) {
    // For now, we'll support both PIN and email/password
    // If it looks like an email, use Supabase auth
    if (pin.includes('@')) {
      showLoginTab("email");
      $("emailInput").value = pin;
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
    $("loginMsg").textContent="PIN salah.";
  }
}

async function handleSupabaseLogout() {
  if (useSupabase && supabase) {
    await supabase.auth.signOut();
    sessionStorage.removeItem("supabaseUser");
  }
  sessionStorage.removeItem("adminLogin");
  location.reload();
}
function showApp(){$("loginScreen").classList.add("hidden");$("app").classList.remove("hidden");renderAll()}
function showPage(id){document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));$(id).classList.remove("hidden");document.querySelectorAll(".nav-btn[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===id));$("sideNav").classList.remove("open");renderAll()}
function renderAll(){renderProducts();fillProductSelect();renderSales();renderDashboard();renderReport()}
function addProduct(){
 const name=$("pName").value.trim(),cost=+$("pCost").value||0,price=+$("pPrice").value||0,stock=+$("pStock").value||0;
 if(!name)return toast("Nama barang wajib diisi.");
 db.products.push({id:uniqueId(),name,cost,price,stock});save();$("pName").value="";$("pCost").value="";$("pPrice").value="";$("pStock").value="";renderAll();toast("Barang ditambahkan.")
}
function renderProducts(){
 $("productsTable").innerHTML=db.products.map((p,i)=>`<tr><td>${esc(p.name)}</td><td>${rupiah(p.cost)}</td><td>${rupiah(p.price)}</td><td>${p.stock}</td><td><button class="mini del" onclick="deleteProduct(${i})">Hapus</button></td></tr>`).join("")||`<tr><td colspan="5">Belum ada barang.</td></tr>`
}
function deleteProduct(i){if(confirm("Hapus barang ini?")){db.products.splice(i,1);save();renderAll()}}
function fillProductSelect(){
 $("saleProduct").innerHTML=`<option value="">-- pilih barang --</option>`+db.products.map(p=>`<option value="${p.id}">${esc(p.name)} (stok ${p.stock})</option>`).join("");
}
function syncSalePrice(){const p=db.products.find(x=>x.id===$("saleProduct").value);$("salePrice").value=p?p.price:"";$("stockInfo").textContent=p?`Stok: ${p.stock}`:"";calcSaleTotal()}
function calcSaleTotal(){$("saleTotal").textContent=rupiah((+$("salePrice").value||0)*(+$("saleQty").value||0))}
function addSale(){
 const p=db.products.find(x=>x.id===$("saleProduct").value),price=+$("salePrice").value||0,qty=+$("saleQty").value||0,date=$("saleDate").value||today();
 if(!p)return toast("Pilih barang."); if(qty<1)return toast("Jumlah minimal 1."); if(p.stock<qty)return toast("Stok tidak cukup.");
 const newId=uniqueId();
 db.sales.push({id:newId,date,productId:p.id,product:p.name,price,qty,cost:p.cost,total:price*qty,profit:(price-p.cost)*qty});
 p.stock-=qty;save();$("saleProduct").value="";$("salePrice").value="";$("saleQty").value=1;$("stockInfo").textContent="";calcSaleTotal();renderAll();toast("Penjualan berhasil disimpan.")
 printReceipt(newId);
}
function renderSales(){
 const q=$("saleSearch").value.toLowerCase();
 const rows=db.sales.filter(s=>s.product.toLowerCase().includes(q)).slice().reverse();
 $("salesTable").innerHTML=rows.map((s,i)=>`<tr><td>${i+1}</td><td>${s.date}</td><td>${esc(s.product)}</td><td>${rupiah(s.price)}</td><td>${s.qty}</td><td>${rupiah(s.total)}</td><td><button class="mini" onclick="printReceipt('${s.id}')">🧾</button> <button class="mini del" onclick="deleteSale('${s.id}')">Hapus</button></td></tr>`).join("")||`<tr><td colspan="7">Belum ada transaksi.</td></tr>`
}
function deleteSale(id){const s=db.sales.find(x=>x.id===id);if(!s||!confirm("Hapus transaksi dan kembalikan stok?"))return;const p=db.products.find(x=>x.id===s.productId);if(p)p.stock+=s.qty;db.sales=db.sales.filter(x=>x.id!==id);save();renderAll()}
function daySales(date){return db.sales.filter(s=>s.date===date)}
function renderDashboard(){
 const date=$("dashDate").value||today(),a=daySales(date),items=a.reduce((n,s)=>n+s.qty,0),rev=a.reduce((n,s)=>n+s.total,0),profit=a.reduce((n,s)=>n+s.profit,0);
 $("sTransactions").textContent=a.length;$("sItems").textContent=items;$("sRevenue").textContent=rupiah(rev);$("sProfit").textContent=rupiah(profit);
 const days=[...Array(7)].map((_,i)=>{let d=new Date(date+"T00:00:00");d.setDate(d.getDate()-6+i);return d.toISOString().slice(0,10)});
 const vals=days.map(d=>daySales(d).reduce((n,s)=>n+s.total,0)),max=Math.max(...vals,1);
 $("weeklyChart").innerHTML=days.map((d,i)=>`<div class="bar-wrap"><span>${rupiah(vals[i]).replace("Rp ","")}</span><div class="bar" style="height:${Math.max(2,vals[i]/max*160)}px"></div><div class="bar-label">${d.slice(5)}</div></div>`).join("");
 const counts={};a.forEach(s=>counts[s.product]=(counts[s.product]||0)+s.qty);
 $("topProducts").innerHTML=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,7).map(x=>`<div class="list-row"><span>${esc(x[0])}</span><b>${x[1]} pcs</b></div>`).join("")||"<p>Belum ada penjualan.</p>"
}
function filteredReport(){const f=$("reportFrom").value,t=$("reportTo").value;return db.sales.filter(s=>(!f||s.date>=f)&&(!t||s.date<=t))}
function renderReport(){
 const a=filteredReport(),rev=a.reduce((n,s)=>n+s.total,0),profit=a.reduce((n,s)=>n+s.profit,0);
 $("rTransactions").textContent=a.length;$("rItems").textContent=a.reduce((n,s)=>n+s.qty,0);$("rRevenue").textContent=rupiah(rev);$("rProfit").textContent=rupiah(profit);
 $("reportTable").innerHTML=a.map(s=>`<tr><td>${s.date}</td><td>${esc(s.product)}</td><td>${rupiah(s.price)}</td><td>${s.qty}</td><td>${rupiah(s.total)}</td><td>${rupiah(s.profit)}</td></tr>`).join("")||`<tr><td colspan="6">Tidak ada data.</td></tr>`
}
function exportCSV(){
 const a=filteredReport();let csv="Tanggal,Barang,Harga,Jumlah,Total,Laba\n"+a.map(s=>[s.date,`"${s.product.replaceAll('"','""')}"`,s.price,s.qty,s.total,s.profit].join(",")).join("\n");
 download(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}),"laporan-penjualan.csv")
}
function printReport(){
 const a=filteredReport();$("printArea").innerHTML=`<h1>Laporan Penjualan</h1><p>Periode: ${$("reportFrom").value||"-"} s/d ${$("reportTo").value||"-"}</p><table><thead><tr><th>Tanggal</th><th>Barang</th><th>Harga</th><th>Jumlah</th><th>Total</th><th>Laba</th></tr></thead><tbody>${a.map(s=>`<tr><td>${s.date}</td><td>${esc(s.product)}</td><td>${rupiah(s.price)}</td><td>${s.qty}</td><td>${rupiah(s.total)}</td><td>${rupiah(s.profit)}</td></tr>`).join("")}</tbody></table><p><b>Total omzet: ${rupiah(a.reduce((n,s)=>n+s.total,0))}</b></p>`;window.print()
}
function printReceipt(id){
 const s=db.sales.find(x=>x.id===id);if(!s)return;
 $("printArea").innerHTML=`<h1>Struk Penjualan</h1><p>Kopi Tutug<br>${s.date}</p><hr><p>${esc(s.product)}<br>${s.qty} × ${rupiah(s.price)}</p><h2>Total ${rupiah(s.total)}</h2><p>Terima kasih.</p>`;window.print()
}
function backup(){download(new Blob([JSON.stringify(db,null,2)],{type:"application/json"}),`backup-penjualan-${today()}.json`)}
function restore(){
 const f=$("restoreFile").files[0];if(!f)return toast("Pilih file backup JSON.");
 const r=new FileReader();r.onload=()=>{try{const x=JSON.parse(r.result);if(!x.products||!x.sales)throw 0;if(!confirm("Restore akan mengganti data saat ini. Lanjut?"))return;db=x;save();renderAll();toast("Restore berhasil.")}catch(e){toast("File backup tidak valid.")}};r.readAsText(f)
}
function changePin(){if($("oldPin").value!==db.pin)return $("pinMsg").textContent="PIN lama salah.";if($("newPin").value.length<4)return $("pinMsg").textContent="PIN baru minimal 4 angka.";db.pin=$("newPin").value;save();$("pinMsg").textContent="PIN berhasil diubah."}
function clearData(){if(confirm("Hapus SEMUA produk dan transaksi?")){db.products=[];db.sales=[];save();renderAll();toast("Semua data dihapus.")}}
function download(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(console.error));
boot();