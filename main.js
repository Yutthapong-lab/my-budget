// --- main.js ---
import { db } from "./firebase-config.js";
import { 
    collection, 
    addDoc, 
    deleteDoc, 
    updateDoc, // เพิ่ม updateDoc เข้ามา
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
let editingId = null; // ตัวแปรเก็บ ID ที่กำลังแก้ไข (ถ้าเป็น null คือโหมดเพิ่มปกติ)

const recordsCol = collection(db, "records"); 

// --- เริ่มทำงาน ---
document.addEventListener('DOMContentLoaded', async () => {
    await loadMasterData();
    const dateInput = document.getElementById('date');
    if(dateInput) dateInput.valueAsDate = new Date();
    
    subscribeToFirestore();
    setupEventListeners();
});

// --- Firebase Real-time ---
function subscribeToFirestore() {
    // เรียงตามวันที่ และ เวลาที่สร้าง (ตามที่คุณทำ Index ไว้)
    const q = query(recordsCol, orderBy("date", "desc"), orderBy("createdAt", "desc"));
    
    onSnapshot(q, (snapshot) => {
        allRecords = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        applyFilters(); 
    }, (error) => {
        console.error("Error watching records:", error);
    });
}

// --- ฟังก์ชันบันทึก (เพิ่ม + แก้ไข) ---
async function saveRecord(rec) {
    try {
        if (editingId) {
            // --- โหมดแก้ไข (Update) ---
            // อัปเดตข้อมูลเดิม (ไม่แก้ createdAt เพื่อให้ลำดับเวลาคงเดิม)
            await updateDoc(doc(db, "records", editingId), rec);
            
            alert("✅ แก้ไขข้อมูลเรียบร้อย");
            
            // รีเซ็ตสถานะกลับเป็นโหมดปกติ
            editingId = null;
            document.querySelector("#entry-form button[type='submit']").textContent = "บันทึกรายการ";
            document.querySelector("#entry-form button[type='submit']").classList.remove("btn-warning");
            document.querySelector("#entry-form button[type='submit']").classList.add("btn-primary");
        } else {
            // --- โหมดเพิ่มใหม่ (Add) ---
            rec.createdAt = serverTimestamp(); // ใส่เวลาเฉพาะตอนเพิ่มใหม่
            await addDoc(recordsCol, rec);
            alert("✅ บันทึกข้อมูลเรียบร้อย");
        }
    } catch (err) {
        alert("❌ ดำเนินการไม่สำเร็จ: " + err.message);
    }
}

// --- ฟังก์ชันเตรียมข้อมูลเพื่อแก้ไข (เรียกจากปุ่มในตาราง) ---
window.editRecord = function(id) {
    // 1. หาข้อมูลจาก ID
    const rec = allRecords.find(r => r.id === id);
    if (!rec) return;

    // 2. นำข้อมูลไปใส่ในฟอร์ม
    document.getElementById("date").value = rec.date;
    document.getElementById("item").value = rec.item;
    document.getElementById("category").value = rec.category;
    document.getElementById("method").value = rec.method;
    document.getElementById("income").value = rec.income || "";
    document.getElementById("expense").value = rec.expense || "";
    document.getElementById("note").value = rec.note || "";

    // 3. เปลี่ยนสถานะเป็นโหมดแก้ไข
    editingId = id;

    // 4. เปลี่ยนหน้าตาปุ่มบันทึก ให้รู้ว่ากำลังแก้
    const submitBtn = document.querySelector("#entry-form button[type='submit']");
    submitBtn.textContent = "💾 บันทึกการแก้ไข";
    submitBtn.classList.remove("btn-primary"); // เอาสีน้ำเงินออก
    submitBtn.classList.add("btn-warning");    // (ถ้ามี class สีส้ม) หรือจะใช้ style ก็ได้
    submitBtn.style.backgroundColor = "#f59e0b"; // สีส้ม เพื่อให้รู้ว่าแก้

    // 5. เลื่อนหน้าจอขึ้นไปที่ฟอร์ม
    document.querySelector(".card-form").scrollIntoView({ behavior: "smooth" });
}

// --- ฟังก์ชันลบ ---
window.deleteRecord = async function(id) {
    if(!confirm("ต้องการลบรายการนี้ใช่หรือไม่?")) return;
    try { await deleteDoc(doc(db, "records", id)); } 
    catch (err) { alert("❌ ลบไม่สำเร็จ"); }
}

// --- Master Data ---
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

// --- LOGIC การกรอง ---
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

// --- แสดงตาราง ---
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

        let timeStr = "";
        if (r.createdAt && r.createdAt.seconds) {
            const dateObj = new Date(r.createdAt.seconds * 1000);
            timeStr = dateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + " น.";
        }

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
            <td>
               <button class="btn btn-small btn-secondary" onclick="window.editRecord('${r.id}')" style="margin-right:4px;">แก้ไข</button>
               <button class="btn btn-small btn-danger" onclick="window.deleteRecord('${r.id}')">ลบ</button>
            </td>
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
            
            // เรียกฟังก์ชัน saveRecord (ซึ่งจะเช็คเองว่า เพิ่ม หรือ แก้ไข)
            saveRecord(newRec);

            form.reset();
            document.getElementById("date").valueAsDate = new Date();
        });

        // เมื่อกดปุ่ม "ล้าง" ให้ยกเลิกโหมดแก้ไขด้วย
        form.addEventListener("reset", () => {
            editingId = null;
            const submitBtn = document.querySelector("#entry-form button[type='submit']");
            submitBtn.textContent = "บันทึกรายการ";
            submitBtn.style.backgroundColor = ""; // คืนสีเดิม
            submitBtn.classList.remove("btn-warning");
            submitBtn.classList.add("btn-primary");
            
            // คืนค่าวันที่ปัจจุบันหลังจาก reset
            setTimeout(() => {
                document.getElementById("date").valueAsDate = new Date();
            }, 0);
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
