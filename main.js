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
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// Import เพื่อดึงหมวดหมู่ (Master Data) เหมือนเดิม
import { getDocs } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// ตัวแปร Global
let allRecords = [];
let filteredRecords = [];
let currentPage = 1;
const recordsCol = collection(db, "records"); // ชื่อ Collection ที่จะเก็บรายการ

// เริ่มทำงานเมื่อโหลดหน้าเว็บ
document.addEventListener('DOMContentLoaded', async () => {
    // 1. โหลด Master Data (หมวดหมู่/วิธีจ่าย)
    await loadMasterData();

    // 2. ตั้งค่าวันที่ปัจจุบันในฟอร์ม
    const dateInput = document.getElementById('date');
    if(dateInput) dateInput.valueAsDate = new Date();

    // 3. เชื่อมต่อ Firebase เพื่อดึงรายการ (Real-time)
    subscribeToFirestore();

    // 4. ผูกปุ่มกดต่างๆ
    setupEventListeners();
});

// --- ส่วนจัดการ Firebase (Transactions: รายรับรายจ่าย) ---

// ฟังข้อมูลจาก Firebase แบบ Real-time (ข้อมูลเปลี่ยน ตารางเปลี่ยนทันที)
function subscribeToFirestore() {
    // เรียงตามวันที่ (Date) จากใหม่ไปเก่า
    const q = query(recordsCol, orderBy("date", "desc"));

    // onSnapshot จะทำงานทุกครั้งที่มีการเพิ่ม/ลบ/แก้ไข ข้อมูลใน Database
    onSnapshot(q, (snapshot) => {
        allRecords = snapshot.docs.map(d => ({ 
            id: d.id, 
            ...d.data() 
        }));
        
        // เมื่อได้ข้อมูลมาแล้ว ให้สั่งกรองและแสดงผลทันที
        applyFilters();
    }, (error) => {
        console.error("Error watching records:", error);
        // กรณี Permission Denied หรือเน็ตหลุด
        const tbody = document.getElementById("table-body");
        if(tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:red;">โหลดข้อมูลไม่สำเร็จ (ตรวจสอบ Internet หรือ Security Rules)</td></tr>`;
    });
}

// เพิ่มรายการลง Firebase
export async function addRecord(rec) {
    try {
        // เพิ่ม timestamp เพื่อใช้ดูเวลาบันทึกจริงได้ (optional)
        rec.createdAt = serverTimestamp();
        
        await addDoc(recordsCol, rec);
        alert("✅ บันทึกข้อมูลขึ้น Cloud เรียบร้อย");
    } catch (err) {
        console.error("Error adding record:", err);
        alert("❌ บันทึกไม่สำเร็จ: " + err.message);
    }
}

// ลบรายการจาก Firebase
window.deleteRecord = async function(id) {
    if(!confirm("ต้องการลบรายการนี้จากฐานข้อมูลใช่หรือไม่?")) return;
    try {
        await deleteDoc(doc(db, "records", id));
    } catch (err) {
        console.error("Error deleting record:", err);
        alert("❌ ลบไม่สำเร็จ");
    }
}

// --- ส่วนจัดการ Firebase (Master Data: หมวดหมู่/วิธีจ่าย) ---
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
            items.forEach(item => {
                el.innerHTML += `<option value="${item}">${item}</option>`;
            });
            if(currentVal) el.value = currentVal;
        });
    };

    try {
        const catSnapshot = await getDocs(collection(db, "categories"));
        let categories = [];
        catSnapshot.forEach(doc => categories.push(doc.data().name));
        categories.sort();

        const methodSnapshot = await getDocs(collection(db, "methods"));
        let methods = [];
        methodSnapshot.forEach(doc => methods.push(doc.data().name));
        methods.sort();

        if (categories.length === 0) categories = ["อาหาร", "เดินทาง", "ช้อปปิ้ง", "เงินเดือน", "อื่นๆ"];
        if (methods.length === 0) methods = ["เงินสด", "โอนเงิน", "บัตรเครดิต"];

        fillOptions([catSelect, filterCat], categories);
        fillOptions([methodSelect, filterMethod], methods);
    } catch (error) {
        console.error("Error loading master data:", error);
    }
}

// --- ฟังก์ชันเปลี่ยนหน้า (Pagination) ---
window.changePage = function(delta) {
    currentPage += delta;
    renderTable();
}

// --- ส่วนการกรองและแสดงผล (Logic เดิม) ---
function applyFilters() {
    const fMonth = document.getElementById("filter-month")?.value;
    const fCat = document.getElementById("filter-category")?.value;
    const fMethod = document.getElementById("filter-method")?.value;
    const fText = document.getElementById("filter-text")?.value.toLowerCase();

    filteredRecords = allRecords.filter(r => {
        const matchMonth = fMonth ? (r.date && r.date.startsWith(fMonth)) : true;
        const matchCat = fCat ? r.category === fCat : true;
        const matchMethod = fMethod ? r.method === fMethod : true;
        const matchText = fText ? (
            (r.item || "").toLowerCase().includes(fText) || 
            (r.note || "").toLowerCase().includes(fText)
        ) : true;

        return matchMonth && matchCat && matchMethod && matchText;
    });

    currentPage = 1;
    renderTable();
    updateSummary();
}

function renderTable() {
    const tbody = document.getElementById("table-body");
    if(!tbody) return;
    tbody.innerHTML = "";

    // หมายเหตุ: allRecords ถูกเรียงจาก Firebase มาแล้ว แต่ถ้ากรองแล้วอยากเรียงอีกรอบก็ได้
    // filteredRecords.sort((a,b) => new Date(b.date) - new Date(a.date));

    const pageSizeEl = document.getElementById("page-size");
    const pageSize = pageSizeEl ? parseInt(pageSizeEl.value) : 10;
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

        tr.innerHTML = `
            <td>${r.date}</td>
            <td>${r.item}</td>
            <td><span class="pill" style="background:#f1f5f9; color:#475569;">${r.category}</span></td>
            <td class="text-right" style="color:${r.income > 0 ? '#16a34a' : 'inherit'}">${incomeTxt}</td>
            <td class="text-right" style="color:${r.expense > 0 ? '#dc2626' : 'inherit'}">${expenseTxt}</td>
            <td>${r.method}</td>
            <td style="font-size:12px; color:#64748b;">${r.note || ""}</td>
            <td>
               <button class="btn btn-small btn-danger" onclick="window.deleteRecord('${r.id}')">ลบ</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    renderPaginationControls(totalPages, filteredRecords.length);
}

function renderPaginationControls(totalPages, totalItems) {
    const container = document.getElementById("pagination-controls");
    if(!container) return;
    
    let html = `<span>รวม ${totalItems} รายการ | หน้า ${currentPage}/${totalPages} </span>`;
    html += `<button onclick="window.changePage(-1)" ${currentPage <= 1 ? 'disabled' : ''}>◀</button>`;
    html += `<button onclick="window.changePage(1)" ${currentPage >= totalPages ? 'disabled' : ''}>▶</button>`;
    container.innerHTML = html;
}

function updateSummary() {
    const totalInc = filteredRecords.reduce((sum, r) => sum + (parseFloat(r.income)||0), 0);
    const totalExp = filteredRecords.reduce((sum, r) => sum + (parseFloat(r.expense)||0), 0);
    const net = totalInc - totalExp;

    const sumIncEl = document.getElementById("sum-income");
    const sumExpEl = document.getElementById("sum-expense");
    const sumNetEl = document.getElementById("sum-net");

    if(sumIncEl) sumIncEl.innerText = `รายรับ: ${formatNumber(totalInc)}`;
    if(sumExpEl) sumExpEl.innerText = `รายจ่าย: ${formatNumber(totalExp)}`;
    if(sumNetEl) {
        sumNetEl.innerText = `สุทธิ: ${formatNumber(net)}`;
        sumNetEl.style.color = net >= 0 ? "#16a34a" : "#dc2626";
    }
}

function formatNumber(num) {
    return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// --- Setup Event Listeners ---
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

    document.getElementById("apply-filter")?.addEventListener("click", applyFilters);
    document.getElementById("clear-filter")?.addEventListener("click", () => {
        document.getElementById("filter-month").value = "";
        document.getElementById("filter-category").value = "";
        document.getElementById("filter-method").value = "";
        document.getElementById("filter-text").value = "";
        applyFilters();
    });

    document.getElementById("page-size")?.addEventListener("change", () => {
        currentPage = 1;
        renderTable();
    });
}
