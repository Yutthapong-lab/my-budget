// --- main.js ---
import { db } from "./firebase-config.js";
import { 
    collection, addDoc, deleteDoc, updateDoc, doc, query, orderBy, onSnapshot, getDocs, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

let allRecords = [];
let filteredRecords = [];
let currentPage = 1;
let editingId = null;
let selectedCategories = [];
const recordsCol = collection(db, "records"); 
let masterCategories = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadMasterData();
    const dateInput = document.getElementById('date');
    if(dateInput) dateInput.valueAsDate = new Date();
    
    subscribeToFirestore();
    setupEventListeners();

    startClock();
    fetchWeather();
    setupExportPDF();
});

// --- Widgets ---
function startClock() {
    const updateTime = () => {
        const now = new Date();
        const timeEl = document.getElementById('clock-display');
        const dateEl = document.getElementById('date-display');
        // เพิ่มไอคอนหน้าเวลา
        if(timeEl) timeEl.innerHTML = `<i class="fa-regular fa-clock"></i> ${now.toLocaleTimeString('th-TH', { hour12: false })}`;
        if(dateEl) dateEl.innerText = now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
    };
    updateTime(); setInterval(updateTime, 1000);
}

function fetchWeather() {
    const updateUI = (temp, desc, locName) => {
        document.getElementById('temp-val').innerText = temp;
        const icon = (desc === 0) ? "☀️" : (desc <= 3) ? "⛅" : (desc >= 95) ? "⛈️" : "🌧️"; 
        document.querySelector('.weather-icon').innerText = icon;
        document.getElementById('location-name').innerText = locName;
    }
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
            try {
                const { latitude: lat, longitude: lon } = pos.coords;
                const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
                const data = await res.json();
                if(data.current_weather) updateUI(data.current_weather.temperature, data.current_weather.weathercode, "ตำแหน่งปัจจุบัน");
            } catch(e) { console.error(e); }
        }, () => updateUI("--", 0, "ไม่พบตำแหน่ง"));
    }
}

function setupExportPDF() {
    const btn = document.getElementById('btn-export-pdf');
    if(!btn) return;
    
    btn.addEventListener('click', () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // 1. ตั้งค่าฟอนต์ภาษาไทย
        doc.setFont('Sarabun'); 
        
        // Header
        doc.setFontSize(18); 
        doc.text("My Budget Report", 14, 22);
        
        doc.setFontSize(10); 
        doc.text(`Exported: ${new Date().toLocaleString('th-TH')}`, 14, 28);

        // Columns
        const tableColumn = ["Date", "Item", "Income", "Expense", "Category", "Method"];
        const tableRows = filteredRecords.map(r => [
            r.date, 
            r.item, 
            r.income > 0 ? r.income.toFixed(2) : "-", 
            r.expense > 0 ? r.expense.toFixed(2) : "-",
            Array.isArray(r.category) ? r.category.join(", ") : r.category,
            r.method
        ]);

        // 2. สร้างตารางพร้อมระบุฟอนต์ไทยใน Style
        doc.autoTable({ 
            head: [tableColumn], 
            body: tableRows, 
            startY: 35,
            styles: { 
                font: 'Sarabun', 
                fontStyle: 'normal' 
            },
            headStyles: { 
                fillColor: [99, 102, 241],
                font: 'Sarabun'
            }
        });

        // 3. สร้างชื่อไฟล์ตามรูปแบบ my-budget_ddmmyyy_hhmmss
        const d = new Date();
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear() + 543;
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        const s = String(d.getSeconds()).padStart(2, '0');

        const fileName = `my-budget_${day}${month}${year}_${h}${m}${s}.pdf`;
        doc.save(fileName);
    });
}

// --- Main Logic ---
function getColorForCategory(name) {
    const palettes = [{ bg: "#eef2ff", text: "#4338ca" }, { bg: "#f0fdf4", text: "#15803d" }, { bg: "#fff7ed", text: "#c2410c" }, { bg: "#fdf2f8", text: "#be185d" }];
    return palettes[name.charCodeAt(0) % palettes.length];
}

function subscribeToFirestore() {
    const q = query(recordsCol, orderBy("date", "desc"), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        allRecords = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        applyFilters(); 
    });
}

async function saveRecord(rec) {
    try {
        if (editingId) { await updateDoc(doc(db, "records", editingId), rec); editingId = null; resetSubmitButton(); }
        else { rec.createdAt = serverTimestamp(); await addDoc(recordsCol, rec); }
    } catch (err) { alert(err.message); }
}

window.deleteRecord = async function(id) {
    if(confirm("ลบรายการนี้?")) await deleteDoc(doc(db, "records", id));
}

window.editRecord = function(id) {
    const rec = allRecords.find(r => r.id === id);
    if (!rec) return;
    document.getElementById("date").value = rec.date;
    document.getElementById("item").value = rec.item;
    selectedCategories = Array.isArray(rec.category) ? rec.category : [rec.category];
    renderCategoryChips();
    document.getElementById("method").value = rec.method;
    const incInp = document.getElementById("income");
    const expInp = document.getElementById("expense");
    incInp.value = rec.income || ""; expInp.value = rec.expense || "";
    incInp.disabled = false; expInp.disabled = false;
    toggleInputState(incInp, expInp); toggleInputState(expInp, incInp);
    document.getElementById("note").value = rec.note || "";
    editingId = id;
    const btn = document.querySelector("#entry-form button[type='submit']");
    btn.innerHTML = '<i class="fa-solid fa-check"></i> บันทึกการแก้ไข'; btn.classList.add("edit-mode");
}

function resetSubmitButton() {
    const btn = document.querySelector("#entry-form button[type='submit']");
    btn.innerHTML = '<i class="fa-solid fa-save"></i> บันทึกข้อมูล'; btn.classList.remove("edit-mode");
}

async function loadMasterData() {
    const fill = (el, items) => { el.innerHTML = '<option value="">ทั้งหมด</option>'; if(el.id==="method") el.innerHTML='<option value="">เลือก...</option>'; items.forEach(i=>el.innerHTML+=`<option value="${i}">${i}</option>`); };
    try {
        const cSnap = await getDocs(collection(db, "categories"));
        masterCategories = []; cSnap.forEach(d=>masterCategories.push(d.data().name)); masterCategories.sort();
        const mSnap = await getDocs(collection(db, "methods"));
        let methods = []; mSnap.forEach(d=>methods.push(d.data().name)); methods.sort();
        
        fill(document.getElementById("filter-category"), masterCategories);
        fill(document.getElementById("method"), methods);
        fill(document.getElementById("filter-method"), methods);
        renderCategoryChips();
    } catch(e){ console.error(e); }
}

function renderCategoryChips() {
    const c = document.getElementById("category-container"); c.innerHTML = "";
    masterCategories.forEach(cat => {
        const btn = document.createElement("div"); btn.className = "cat-chip-btn"; 
        btn.innerHTML = cat;
        if (selectedCategories.includes(cat)) { btn.classList.add("active"); btn.innerHTML = `<i class="fa-solid fa-check"></i> ${cat}`; }
        btn.onclick = () => { selectedCategories.includes(cat) ? selectedCategories=selectedCategories.filter(x=>x!==cat) : selectedCategories.push(cat); renderCategoryChips(); };
        c.appendChild(btn);
    });
}

window.changePage = function(delta) { currentPage += delta; renderList(); }

function applyFilters() {
    const fMonth = document.getElementById("filter-month")?.value;
    const fCat = document.getElementById("filter-category")?.value;
    const fMethod = document.getElementById("filter-method")?.value;
    const fText = document.getElementById("filter-text")?.value.toLowerCase().trim();

    filteredRecords = allRecords.filter(r => {
        const mMonth = fMonth ? r.date?.startsWith(fMonth) : true;
        const mCat = fCat ? (Array.isArray(r.category) ? r.category.includes(fCat) : r.category===fCat) : true;
        const mMethod = fMethod ? r.method === fMethod : true;
        const mText = fText ? JSON.stringify(r).toLowerCase().includes(fText) : true;
        return mMonth && mCat && mMethod && mText;
    });
    currentPage = 1; renderList(); updateSummary();
}

function renderList() {
    const container = document.getElementById("table-body");
    container.innerHTML = "";
    const pageSize = parseInt(document.getElementById("page-size")?.value || 5);
    const totalPages = Math.ceil(filteredRecords.length / pageSize) || 1;
    if (currentPage < 1) currentPage = 1; if (currentPage > totalPages) currentPage = totalPages;

    const displayItems = filteredRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    if(displayItems.length === 0) {
        container.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:40px; color:#94a3b8;"><i class="fa-solid fa-inbox" style="font-size:24px; margin-bottom:8px;"></i><br>- ไม่พบข้อมูล -</td></tr>`;
        return;
    }

    displayItems.forEach(r => {
        let timeStr = r.createdAt ? new Date(r.createdAt.seconds*1000).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}) : "";
        const cats = Array.isArray(r.category) ? r.category : [r.category];
        const catHtml = cats.map(c => {
            const col = getColorForCategory(c);
            return `<span class="tag-badge" style="background:${col.bg}; color:${col.text};"><i class="fa-solid fa-tag" style="font-size:10px;"></i> ${c}</span>`;
        }).join("");
        const incVal = r.income > 0 ? `+${formatNumber(r.income)}` : "-";
        const expVal = r.expense > 0 ? `-${formatNumber(r.expense)}` : "-";

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>
                <div style="font-weight:600;">${r.date}</div>
                <div style="font-size:12px; color:#94a3b8;">${timeStr}</div>
            </td>
            <td>
                <div>${r.item}</div>
                <div style="font-size:12px; color:#94a3b8;">${r.note || ''}</div>
            </td>
            <td style="text-align:right; color:#16a34a; font-weight:700;">${incVal}</td>
            <td style="text-align:right; color:#dc2626; font-weight:700;">${expVal}</td>
            <td style="text-align:center;">${catHtml}</td>
            <td style="text-align:center;">
               <span class="method-pill"><i class="fa-solid fa-credit-card" style="font-size:10px; color:#64748b;"></i> ${r.method}</span>
            </td>
            <td style="text-align:center;">
               <div style="display:flex; gap:6px; justify-content:center;">
                   <button style="background:#fff7ed; color:#ea580c; border:1px solid #ffedd5; padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer;" onclick="window.editRecord('${r.id}')" title="แก้ไข"><i class="fa-solid fa-pen"></i></button>
                   <button style="background:#fef2f2; color:#b91c1c; border:1px solid #fee2e2; padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer;" onclick="window.deleteRecord('${r.id}')" title="ลบ"><i class="fa-solid fa-trash"></i></button>
               </div>
            </td>
        `;
        container.appendChild(tr);
    });
    
    document.getElementById("pagination-controls").innerHTML = `
        <button onclick="window.changePage(-1)" ${currentPage <= 1 ? 'disabled' : ''} style="padding:4px 10px; cursor:pointer; background:#fff; border:1px solid #e2e8f0; border-radius:4px;"><i class="fa-solid fa-chevron-left"></i></button>
        <span style="font-size:13px; color:#64748b; align-self:center;">${currentPage} / ${totalPages}</span>
        <button onclick="window.changePage(1)" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:4px 10px; cursor:pointer; background:#fff; border:1px solid #e2e8f0; border-radius:4px;"><i class="fa-solid fa-chevron-right"></i></button>`;
}

function updateSummary() {
    const inc = filteredRecords.reduce((s,r)=>s+(parseFloat(r.income)||0),0);
    const exp = filteredRecords.reduce((s,r)=>s+(parseFloat(r.expense)||0),0);
    document.getElementById("sum-income").innerText = formatNumber(inc);
    document.getElementById("sum-expense").innerText = formatNumber(exp);
    const net = inc - exp;
    const netEl = document.getElementById("sum-net");
    netEl.innerText = formatNumber(net);
    netEl.style.color = net >= 0 ? '#2563eb' : '#b91c1c';
}

function formatNumber(n) { return Number(n).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}); }
function toggleInputState(active, passive) {
    if (active.value && parseFloat(active.value)>0) { passive.value=""; passive.disabled=true; } else { passive.disabled=false; }
}
function setupEventListeners() {
    const form = document.getElementById("entry-form");
    const inc = document.getElementById("income"), exp = document.getElementById("expense");
    if(form) {
        inc.addEventListener("input", ()=>toggleInputState(inc, exp));
        exp.addEventListener("input", ()=>toggleInputState(exp, inc));
        form.addEventListener("submit", (e)=>{
            e.preventDefault();
            if(selectedCategories.length===0){ alert("เลือกหมวดหมู่ก่อนครับ"); return; }
            saveRecord({
                date: document.getElementById("date").value, item: document.getElementById("item").value,
                category: selectedCategories, method: document.getElementById("method").value,
                income: parseFloat(inc.value)||0, expense: parseFloat(exp.value)||0, note: document.getElementById("note").value
            });
            form.reset(); selectedCategories=[]; renderCategoryChips(); 
            document.getElementById("date").valueAsDate=new Date(); inc.disabled=false; exp.disabled=false;
        });
        form.addEventListener("reset", ()=>{ 
            editingId=null; resetSubmitButton(); 
            setTimeout(()=>{ inc.disabled=false; exp.disabled=false; selectedCategories=[]; renderCategoryChips(); document.getElementById("date").valueAsDate=new Date(); },0); 
        });
    }
    const ft = document.getElementById("filter-text");
    if(ft) ft.addEventListener("input", applyFilters);
    document.querySelectorAll(".dropdown-filter").forEach(e=>e.addEventListener("change", applyFilters));
    document.getElementById("clear-filter")?.addEventListener("click", ()=>{
        document.getElementById("filter-month").value=""; document.getElementById("filter-category").value="";
        document.getElementById("filter-method").value=""; if(ft) ft.value=""; applyFilters();
    });
    document.getElementById("page-size")?.addEventListener("change", ()=>{ currentPage=1; renderList(); });
}
