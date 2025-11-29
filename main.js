// --- main.js (Full Version) ---
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

// Global variable for master data
let masterCategories = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadMasterData();
    const dateInput = document.getElementById('date');
    if(dateInput) dateInput.valueAsDate = new Date();
    
    subscribeToFirestore();
    setupEventListeners();

    // 3. เริ่มทำงานนาฬิกา
    startClock();
    // 4. เริ่มดึงสภาพอากาศ
    fetchWeather();
    // 2. ตั้งค่าปุ่ม Export
    setupExportPDF();
});

// --- Feature 3 & 4: Clock & Weather Functions ---

function startClock() {
    const updateTime = () => {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('th-TH', { hour12: false });
        const dateStr = now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
        
        const timeEl = document.getElementById('clock-display');
        const dateEl = document.getElementById('date-display');
        
        if(timeEl) timeEl.innerText = timeStr;
        if(dateEl) dateEl.innerText = dateStr;
    };
    updateTime();
    setInterval(updateTime, 1000);
}

function fetchWeather() {
    // ใช้ Geolocation API หาพิกัด (ถ้า user ไม่อนุญาต ให้ใช้ default เป็น กรุงเทพ)
    const updateUI = (temp, desc, locName) => {
        document.getElementById('temp-val').innerText = temp;
        // OpenMeteo ให้ code มา ต้องแปลงเป็น icon เองแบบง่ายๆ
        const icon = getIconFromWMO(desc); 
        document.querySelector('.weather-icon').innerText = icon;
        document.getElementById('location-name').innerText = locName;
    }

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            try {
                // ยิงไปที่ Open-Meteo API (Free, No Key)
                const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
                const data = await res.json();
                
                if(data.current_weather) {
                    updateUI(data.current_weather.temperature, data.current_weather.weathercode, "ตำแหน่งปัจจุบัน");
                }
            } catch(e) { console.error("Weather Error", e); }
        }, () => {
            // Error หรือ ไม่อนุญาต -> Default BKK
            updateUI("--", 0, "ไม่พบตำแหน่ง");
        });
    }
}

function getIconFromWMO(code) {
    // WMO Weather interpretation codes (WW)
    if(code === 0) return "☀️"; // Clear
    if(code >= 1 && code <= 3) return "⛅"; // Partly cloudy
    if(code >= 45 && code <= 48) return "🌫️"; // Fog
    if(code >= 51 && code <= 67) return "🌧️"; // Drizzle / Rain
    if(code >= 80 && code <= 82) return "🌦️"; // Showers
    if(code >= 95) return "⛈️"; // Thunderstorm
    return "🌤️";
}

// --- Feature 2: PDF Export Function ---
function setupExportPDF() {
    const btn = document.getElementById('btn-export-pdf');
    if(!btn) return;

    btn.addEventListener('click', () => {
        // ใช้ jspdf จาก window object (โหลดผ่าน CDN ใน html)
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // เพิ่ม Font ภาษาไทย (ข้อจำกัด: jspdf ปกติไม่รองรับไทยดีนัก ต้องใช้ custom font Base64)
        // **หมายเหตุ:** ในการใช้งานจริงเพื่อให้แสดงผลภาษาไทยใน PDF ได้สมบูรณ์ 100% 
        // คุณต้อง addFileToVFS ด้วยไฟล์ .ttf ภาษาไทย (เช่น Sarabun-Regular.ttf) ที่แปลงเป็น Base64 
        // เนื่องจาก code นี้เป็น text-based ผมจะใช้ Standard Font และแจ้งเตือน user หรือใช้เทคนิค AutoTable
        
        // Header
        doc.setFontSize(18);
        doc.text("My Budget Report", 14, 22);
        doc.setFontSize(11);
        doc.text(`Exported on: ${new Date().toLocaleString('th-TH')}`, 14, 30);

        // เตรียมข้อมูลตาราง
        const tableColumn = ["Date", "Item", "Category", "Income", "Expense", "Method"];
        const tableRows = [];

        // ใช้ข้อมูลที่ Filter แล้ว (filteredRecords)
        filteredRecords.forEach(r => {
            const catStr = Array.isArray(r.category) ? r.category.join(", ") : r.category;
            const rowData = [
                r.date,
                r.item, // ภาษาไทยอาจจะเป็นสี่เหลี่ยมถ้าไม่มีการ embed font
                catStr,
                r.income > 0 ? r.income.toFixed(2) : "-",
                r.expense > 0 ? r.expense.toFixed(2) : "-",
                r.method
            ];
            tableRows.push(rowData);
        });

        // สร้างตารางด้วย autoTable
        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 40,
            styles: { font: "helvetica" }, // ถ้าจะเอาไทยต้องเปลี่ยน font ตรงนี้และ embed base64
            headStyles: { fillColor: [79, 70, 229] }, // สี Primary
        });

        doc.save("budget-report.pdf");
    });
}

// --- Original Logic (Updated Styling Helpers) ---

function getColorForCategory(name) {
    const palettes = [
        { bg: "#eef2ff", text: "#4338ca" },
        { bg: "#f0fdf4", text: "#15803d" },
        { bg: "#fff7ed", text: "#c2410c" },
        { bg: "#fdf2f8", text: "#be185d" },
        { bg: "#fffbeb", text: "#b45309" },
        { bg: "#f0f9ff", text: "#0369a1" }
    ];
    const index = name.charCodeAt(0) % palettes.length;
    return palettes[index];
}

function subscribeToFirestore() {
    const q = query(recordsCol, orderBy("date", "desc"), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        allRecords = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        applyFilters(); 
    }, (error) => { console.error(error); });
}

async function saveRecord(rec) {
    try {
        if (editingId) {
            await updateDoc(doc(db, "records", editingId), rec);
            editingId = null;
            resetSubmitButton();
        } else {
            rec.createdAt = serverTimestamp();
            await addDoc(recordsCol, rec);
        }
    } catch (err) { alert("Error: " + err.message); }
}

window.deleteRecord = async function(id) {
    if(!confirm("ต้องการลบรายการนี้ใช่หรือไม่?")) return;
    try { await deleteDoc(doc(db, "records", id)); } catch (err) { alert("Error"); }
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
    incInp.value = rec.income || "";
    expInp.value = rec.expense || "";
    
    // Reset disabled state first
    incInp.disabled = false;
    expInp.disabled = false;
    toggleInputState(incInp, expInp);
    toggleInputState(expInp, incInp);
    
    document.getElementById("note").value = rec.note || "";

    editingId = id;
    const submitBtn = document.querySelector("#entry-form button[type='submit']");
    submitBtn.innerHTML = 'บันทึกการแก้ไข'; 
    submitBtn.classList.add("edit-mode");
    
    document.querySelector('.form-card').scrollIntoView({ behavior: 'smooth' });
}

function resetSubmitButton() {
    const submitBtn = document.querySelector("#entry-form button[type='submit']");
    submitBtn.innerHTML = 'บันทึกข้อมูล';
    submitBtn.classList.remove("edit-mode");
}

async function loadMasterData() {
    const methodSelect = document.getElementById("method");
    const filterCat = document.getElementById("filter-category");
    const filterMethod = document.getElementById("filter-method");

    const fillSelect = (el, items) => {
        if(!el) return;
        el.innerHTML = '<option value="">ทั้งหมด</option>';
        if(el.id === "method") el.innerHTML = '<option value="">เลือก...</option>';
        items.forEach(i => el.innerHTML += `<option value="${i}">${i}</option>`);
    };

    try {
        const catSnap = await getDocs(collection(db, "categories"));
        masterCategories = []; 
        catSnap.forEach(d => masterCategories.push(d.data().name)); 
        masterCategories.sort();

        const methSnap = await getDocs(collection(db, "methods"));
        let methods = []; 
        methSnap.forEach(d => methods.push(d.data().name)); 
        methods.sort();

        if(masterCategories.length===0) masterCategories=["อาหาร","เดินทาง","ช้อปปิ้ง","อื่นๆ"];
        if(methods.length===0) methods=["เงินสด","โอนเงิน"];

        fillSelect(filterCat, masterCategories);
        fillSelect(methodSelect, methods);
        fillSelect(filterMethod, methods);

        renderCategoryChips();

    } catch(e) { console.error(e); }
}

function renderCategoryChips() {
    const container = document.getElementById("category-container");
    if(!container) return;
    container.innerHTML = "";

    masterCategories.forEach(cat => {
        const btn = document.createElement("div");
        btn.className = "cat-chip-btn";
        btn.textContent = cat;
        
        if (selectedCategories.includes(cat)) {
            btn.classList.add("active");
            btn.textContent = `✓ ${cat}`; 
        }

        btn.onclick = () => {
            if (selectedCategories.includes(cat)) {
                selectedCategories = selectedCategories.filter(c => c !== cat);
            } else {
                selectedCategories.push(cat);
            }
            renderCategoryChips();
        };

        container.appendChild(btn);
    });
}

window.changePage = function(delta) { currentPage += delta; renderList(); }

function applyFilters() {
    const fMonth = document.getElementById("filter-month")?.value;
    const fCat = document.getElementById("filter-category")?.value;
    const fMethod = document.getElementById("filter-method")?.value;
    const fText = document.getElementById("filter-text")?.value.toLowerCase().trim();

    filteredRecords = allRecords.filter(r => {
        const matchMonth = fMonth ? (r.date && r.date.startsWith(fMonth)) : true;
        let matchCat = true;
        if (fCat) {
            if (Array.isArray(r.category)) matchCat = r.category.includes(fCat);
            else matchCat = r.category === fCat;
        }
        const matchMethod = fMethod ? r.method === fMethod : true;
        const catText = Array.isArray(r.category) ? r.category.join(" ") : (r.category || "");
        
        const matchText = fText ? (
            (r.item || "").toLowerCase().includes(fText) ||       
            (r.note || "").toLowerCase().includes(fText) ||       
            catText.toLowerCase().includes(fText) ||  
            (r.method || "").toLowerCase().includes(fText) ||     
            (r.income || 0).toString().includes(fText) ||         
            (r.expense || 0).toString().includes(fText)           
        ) : true;
        return matchMonth && matchCat && matchMethod && matchText;
    });
    currentPage = 1; renderList(); updateSummary();
}

function renderList() {
    const container = document.getElementById("table-body");
    if(!container) return; container.innerHTML = "";

    const pageSize = parseInt(document.getElementById("page-size")?.value || 10);
    const totalPages = Math.ceil(filteredRecords.length / pageSize) || 1;
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const displayItems = filteredRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    if(displayItems.length === 0) {
        container.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:40px; color:#94a3b8;">- ไม่พบข้อมูล -</td></tr>`;
        return;
    }

    displayItems.forEach(r => {
        let timeStr = "";
        if (r.createdAt && r.createdAt.seconds) {
            timeStr = new Date(r.createdAt.seconds * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        }

        let catHtml = "";
        const cats = Array.isArray(r.category) ? r.category : [r.category];
        catHtml = cats.map(c => {
            if(!c) return "";
            const color = getColorForCategory(c);
            return `<span class="tag-badge" style="background:${color.bg}; color:${color.text};">${c}</span>`;
        }).join("");

        const incVal = r.income > 0 ? `+${formatNumber(r.income)}` : "-";
        const expVal = r.expense > 0 ? `-${formatNumber(r.expense)}` : "-";

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>
                <div style="font-weight:600; color:#1e293b;">${r.date}</div>
                <div style="font-size:12px; color:#94a3b8; margin-top:2px;">${timeStr}</div>
            </td>
            <td>
                <div style="font-weight:500;">${r.item}</div>
                <div style="font-size:12px; color:#94a3b8; margin-top:2px;">${r.note || ''}</div>
            </td>
            
            <td>${catHtml}</td>

            <td style="text-align:right; color:#16a34a; font-weight:700;">${incVal}</td>
            <td style="text-align:right; color:#dc2626; font-weight:700;">${expVal}</td>
            <td style="text-align:center;"><span style="font-size:12px; border:1px solid #e2e8f0; padding:2px 6px; border-radius:4px; background:#fff;">${r.method}</span></td>
            
            <td style="text-align:center;">
               <div style="display:flex; gap:6px; justify-content:center;">
                   <button style="background:#fff7ed; color:#ea580c; border:1px solid #ffedd5; border-radius:6px; padding:4px 8px; font-size:12px; cursor:pointer;" onclick="window.editRecord('${r.id}')">แก้ไข</button>
                   <button style="background:#fef2f2; color:#b91c1c; border:1px solid #fee2e2; border-radius:6px; padding:4px 8px; font-size:12px; cursor:pointer;" onclick="window.deleteRecord('${r.id}')">ลบ</button>
               </div>
            </td>
        `;
        container.appendChild(tr);
    });

    const controls = document.getElementById("pagination-controls");
    if(controls) {
        controls.innerHTML = `
        <button onclick="window.changePage(-1)" ${currentPage <= 1 ? 'disabled' : ''} style="padding:4px 10px; cursor:pointer; border-radius:4px; border:1px solid #e2e8f0; background:#fff;">&lt;</button>
        <span style="font-size:13px; color:#64748b; align-self:center; font-weight:500;">${currentPage} / ${totalPages}</span>
        <button onclick="window.changePage(1)" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:4px 10px; cursor:pointer; border-radius:4px; border:1px solid #e2e8f0; background:#fff;">&gt;</button>`;
    }
}

function updateSummary() {
    const totalInc = filteredRecords.reduce((sum, r) => sum + (parseFloat(r.income)||0), 0);
    const totalExp = filteredRecords.reduce((sum, r) => sum + (parseFloat(r.expense)||0), 0);
    const net = totalInc - totalExp;

    document.getElementById("sum-income").innerText = formatNumber(totalInc);
    document.getElementById("sum-expense").innerText = formatNumber(totalExp);
    document.getElementById("sum-net").innerText = formatNumber(net);
    
    // Color Logic for Net
    const netEl = document.getElementById("sum-net");
    netEl.style.color = net >= 0 ? '#15803d' : '#b91c1c';
}

function formatNumber(num) {
    return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toggleInputState(active, passive) {
    if (active.value && parseFloat(active.value) > 0) {
        passive.value = ""; passive.disabled = true;
    } else {
        passive.disabled = false;
    }
}

function preventInvalidChars(e) { if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault(); }

function setupEventListeners() {
    const form = document.getElementById("entry-form");
    const incInp = document.getElementById("income");
    const expInp = document.getElementById("expense");

    if(form) {
        incInp.addEventListener("input", () => toggleInputState(incInp, expInp));
        expInp.addEventListener("input", () => toggleInputState(expInp, incInp));
        incInp.addEventListener("keydown", preventInvalidChars);
        expInp.addEventListener("keydown", preventInvalidChars);

        form.addEventListener("submit", (e) => {
            e.preventDefault();
            if(selectedCategories.length===0) { alert("กรุณาเลือกหมวดหมู่ครับ"); return; }

            const newRec = {
                date: document.getElementById("date").value,
                item: document.getElementById("item").value,
                category: selectedCategories, 
                method: document.getElementById("method").value,
                income: parseFloat(incInp.value) || 0,
                expense: parseFloat(expInp.value) || 0,
                note: document.getElementById("note").value
            };
            saveRecord(newRec);
            
            // Reset Form Logic
            form.reset();
            selectedCategories = [];
            renderCategoryChips();
            document.getElementById("date").valueAsDate = new Date();
            incInp.disabled = false;
            expInp.disabled = false;
        });

        form.addEventListener("reset", () => {
            editingId = null;
            resetSubmitButton();
            setTimeout(() => {
                incInp.disabled=false; expInp.disabled=false;
                selectedCategories = []; 
                renderCategoryChips();
                document.getElementById("date").valueAsDate = new Date();
            },0);
        });
    }

    const filterText = document.getElementById("filter-text");
    if(filterText) filterText.addEventListener("input", applyFilters);
    document.getElementById("filter-month")?.addEventListener("change", applyFilters);
    document.getElementById("filter-category")?.addEventListener("change", applyFilters);
    document.getElementById("filter-method")?.addEventListener("change", applyFilters);
    document.getElementById("clear-filter")?.addEventListener("click", () => {
        document.getElementById("filter-month").value = "";
        document.getElementById("filter-category").value = "";
        document.getElementById("filter-method").value = "";
        if(filterText) filterText.value = "";
        applyFilters();
    });
    document.getElementById("page-size")?.addEventListener("change", () => { currentPage = 1; renderList(); });
}
