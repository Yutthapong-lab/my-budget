// --- main.js ---
import { db } from "./firebase-config.js";
import { 
    collection, 
    addDoc, 
    deleteDoc, 
    doc, 
    query, 
    orderBy, 
    onSnapshot, 
    getDocs,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// --- ตัวแปร Global ---
let allRecords = [];
let filteredRecords = [];
let currentPage = 1;

const recordsCol = collection(db, "records"); 

// --- เริ่มทำงาน ---
document.addEventListener('DOMContentLoaded', async () => {
    await loadMasterData();
    const dateInput = document.getElementById('date');
    if(dateInput) dateInput.valueAsDate = new Date();
    
    // เชื่อมต่อ Firebase
    subscribeToFirestore();
    
    // ตั้งค่า Event ต่างๆ
    setupEventListeners();
});

// --- Firebase Real-time ---
function subscribeToFirestore() {
    const q = query(recordsCol, orderBy("date", "desc"));
    onSnapshot(q, (snapshot) => {
        allRecords = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        applyFilters(); 
    }, (error) => {
        console.error("Error watching records:", error);
    });
}

// --- ฟังก์ชันบันทึก ---
export async function addRecord(rec) {
    try {
        rec.createdAt = serverTimestamp(); // บันทึกเวลาปัจจุบันของ Server
        await addDoc(recordsCol, rec);
        alert("✅ บันทึกข้อมูลเรียบร้อย");
    } catch (err) {
        alert("❌ บันทึกไม่สำเร็จ: " + err.message);
    }
}

// --- ฟังก์ชันลบ ---
window.deleteRecord = async function(id) {
    if(!confirm("ต้องการลบรายการนี้ใช่หรือไม่?")) return;
    try { await deleteDoc(doc(db, "records", id)); } 
    catch (err) { alert("❌ ลบไม่สำเร็จ"); }
}

// --- Master Data (หมวดหมู่/วิธีจ่าย) ---
async function loadMasterData() {
    const catSelect = document.getElementById("category");
    const methodSelect = document.getElementById("method");
    const filterCat = document.getElementById("filter-category");
    const filterMethod = document.getElementById("filter-method");

    const fillOptions = (elements, items) => {
        elements.forEach(el => {
            if (!el) return;
            const currentVal = el.value;
            el.innerHTML = '<option value="">-- เลือก --</option>';
            items.forEach(item => { el.innerHTML += `<option value="${item}">${item}</option>`; });
            if(currentVal) el.value = currentVal;
        });
    };

    try {
        const catSnap = await getDocs(collection(db, "categories"));
        let categories = []; catSnap.forEach(d => categories.push(d.data().name)); categories.sort();

        const methSnap = await getDocs(collection(db, "methods"));
        let methods = []; methSnap.forEach(d => methods.push(d.data().name)); methods.sort();

        if (categories.length === 0) categories = ["อาหาร", "เดินทาง", "ช้อปปิ้ง", "เงินเดือน", "อื่นๆ"];
        if (methods.length === 0) methods = ["เงินสด", "โอนเงิน", "บัตรเครดิต"];

        fillOptions([catSelect, filterCat], categories);
        fillOptions([methodSelect, filterMethod], methods);
    } catch (error) { console.error("Error master data:", error); }
}

window.changePage = function(delta) { currentPage += delta; renderTable(); }

// --- LOGIC การค้นหาและกรอง (เหมือนเดิม) ---
function applyFilters() {
    const fMonth = document.getElementById("filter-month")?.value;
    const fCat = document.getElementById("filter-category")?.value;
    const fMethod = document.getElementById("filter-method")?.value;
    const fText = document.getElementById("filter-text")?.value.toLowerCase().trim();

    filteredRecords = allRecords.filter(r => {
        const matchMonth = fMonth ? (r.date && r.date.startsWith(fMonth)) : true;
        const matchCat = fCat ? r.category === fCat : true;
        const matchMethod = fMethod ? r.method === fMethod : true;
        
        const matchText = fText ? (
            (r.item || "").toLowerCase().includes(fText) ||       
            (r.note || "").toLowerCase().includes(fText) ||       
            (r.category || "").toLowerCase().includes(fText) ||   
            (r.method || "").toLowerCase().includes(fText) ||     
            (r.income || 0).toString().includes(fText) ||         
            (r.expense || 0).toString().includes(fText)           
        ) : true;

        return matchMonth && matchCat && matchMethod && matchText;
    });

    currentPage = 1;
    renderTable();
    updateSummary();
}

// --- แสดงตาราง (แก้ไขส่วนแสดงวันที่) ---
function renderTable() {
    const tbody = document.getElementById("table-body");
    if(!tbody) return;
    tbody.innerHTML = "";

    const pageSize = parseInt(document.getElementById("page-size")?.value || 10);
    const totalPages = Math.ceil(filteredRecords.length / pageSize) || 1;

    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const displayItems = filteredRecords.slice(start, end);

    displayItems.forEach(r => {
        const tr = document.createElement("tr");
        const incomeTxt = r.income > 0 ? formatNumber(r.income) : "-";
        const expenseTxt = r.expense > 0 ? formatNumber(r.expense) : "-";

        // --- ส่วนที่เพิ่ม: แปลงเวลาจาก Firestore Timestamp ---
        let timeStr = "";
        if (r.createdAt && r.createdAt.seconds) {
            // แปลง Timestamp เป็น Date Object
            const dateObj = new Date(r.createdAt.seconds * 1000);
            // จัดรูปแบบเป็น HH:mm น.
            timeStr = dateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + " น.";
        }
        // ------------------------------------------------

        tr.innerHTML = `
            <td>
                ${r.date} 
                <div style="font-size:11px; color:#6b7280; margin-top:2px;">🕒 ${timeStr}</div>
            </td>
            <td>${r.item}</td>
            <td><span class="pill" style="background:#f1f5f9; color:#475569;">${r.category}</span></td>
            <td class="text-right" style="color:${r.income > 0 ? '#16a34a' : 'inherit'}">${incomeTxt}</td>
            <td class="text-right" style="color:${r.expense > 0 ? '#dc2626' : 'inherit'}">${expenseTxt}</td>
            <td>${r.method}</td>
            <td style="font-size:12px; color:#64748b;">${r.note || ""}</td>
            <td><button class="btn btn-small btn-danger" onclick="window.deleteRecord('${r.id}')">ลบ</button></td>
        `;
        tbody.appendChild(tr);
    });

    const controls = document.getElementById("pagination-controls");
    if(controls) {
        controls.innerHTML = `<span>รวม ${filteredRecords.length} รายการ | หน้า ${currentPage}/${totalPages} </span>
        <button onclick="window.changePage(-1)" ${currentPage <= 1 ? 'disabled' : ''}>◀</button>
        <button onclick="window.changePage(1)" ${currentPage >= totalPages ? 'disabled' : ''}>▶</button>`;
    }
}

// --- สรุปยอด ---
function updateSummary() {
    const totalInc = filteredRecords.reduce((sum, r) => sum + (parseFloat(r.income)||0), 0);
    const totalExp = filteredRecords.reduce((sum, r) => sum + (parseFloat(r.expense)||0), 0);
    
    const sumIncEl = document.getElementById("sum-income");
    const sumExpEl = document.getElementById("sum-expense");
    const sumNetEl = document.getElementById("sum-net");

    if(sumIncEl) sumIncEl.innerText = `รายรับ: ${formatNumber(totalInc)}`;
    if(sumExpEl) sumExpEl.innerText = `รายจ่าย: ${formatNumber(totalExp)}`;
    if(sumNetEl) {
        const net = totalInc - totalExp;
        sumNetEl.innerText = `สุทธิ: ${formatNumber(net)}`;
        sumNetEl.style.color = net >= 0 ? "#16a34a" : "#dc2626";
    }
}

function formatNumber(num) {
    return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// --- Event Listeners ---
function setupEventListeners() {
    const form = document.getElementById("entry-form");
    if(form) {
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            const newRec = {
                date: document.getElementById("date").value,
                item: document.getElementById("item").value,
                category: document.getElementById("category").value,
                method: document.getElementById("method").value,
                income: parseFloat(document.getElementById("income").value) || 0,
                expense: parseFloat(document.getElementById("expense").value) || 0,
                note: document.getElementById("note").value
            };
            addRecord(newRec);
            form.reset();
            document.getElementById("date").valueAsDate = new Date();
        });
    }

    const filterText = document.getElementById("filter-text");
    if (filterText) filterText.addEventListener("input", applyFilters);

    document.getElementById("filter-month")?.addEventListener("change", applyFilters);
    document.getElementById("filter-category")?.addEventListener("change", applyFilters);
    document.getElementById("filter-method")?.addEventListener("change", applyFilters);

    document.getElementById("apply-filter")?.addEventListener("click", applyFilters);
    document.getElementById("clear-filter")?.addEventListener("click", () => {
        document.getElementById("filter-month").value = "";
        document.getElementById("filter-category").value = "";
        document.getElementById("filter-method").value = "";
        if(filterText) filterText.value = "";
        applyFilters();
    });

    document.getElementById("page-size")?.addEventListener("change", () => {
        currentPage = 1;
        renderTable();
    });
}
