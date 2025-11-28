// --- main.js ---
import { db } from "./firebase-config.js";
import { 
    collection, 
    addDoc, 
    deleteDoc, 
    updateDoc, 
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
let editingId = null;

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
    const q = query(recordsCol, orderBy("date", "desc"), orderBy("createdAt", "desc"));
    
    onSnapshot(q, (snapshot) => {
        allRecords = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        applyFilters(); 
    }, (error) => {
        console.error("Error watching records:", error);
    });
}

// --- ฟังก์ชันบันทึก ---
async function saveRecord(rec) {
    try {
        if (editingId) {
            await updateDoc(doc(db, "records", editingId), rec);
            alert("✅ แก้ไขข้อมูลเรียบร้อย");
            
            // Reset UI
            editingId = null;
            const submitBtn = document.querySelector("#entry-form button[type='submit']");
            submitBtn.textContent = "💾 บันทึกรายการ";
            submitBtn.classList.remove("btn-warning");
            submitBtn.classList.add("btn-primary");
            submitBtn.style.background = ""; // Reset gradient
        } else {
            rec.createdAt = serverTimestamp();
            await addDoc(recordsCol, rec);
            alert("✅ บันทึกข้อมูลเรียบร้อย");
        }
    } catch (err) {
        alert("❌ ดำเนินการไม่สำเร็จ: " + err.message);
    }
}

// --- ฟังก์ชันเตรียมข้อมูลเพื่อแก้ไข ---
window.editRecord = function(id) {
    const rec = allRecords.find(r => r.id === id);
    if (!rec) return;

    document.getElementById("date").value = rec.date;
    document.getElementById("item").value = rec.item;
    
    // จัดการ Dropdown หมวดหมู่
    const catSelect = document.getElementById("category");
    Array.from(catSelect.options).forEach(option => option.selected = false);
    if (Array.isArray(rec.category)) {
        rec.category.forEach(val => {
            const option = Array.from(catSelect.options).find(o => o.value === val);
            if (option) option.selected = true;
        });
    } else {
        catSelect.value = rec.category;
    }

    document.getElementById("method").value = rec.method;
    
    // --- ตั้งค่าช่องเงิน (Income/Expense) ---
    const incomeInput = document.getElementById("income");
    const expenseInput = document.getElementById("expense");

    incomeInput.value = rec.income || "";
    expenseInput.value = rec.expense || "";

    // เรียกใช้ฟังก์ชันตรวจสอบเพื่อล็อคช่องทันทีตอนกดแก้ไข
    toggleInputState(incomeInput, expenseInput);

    document.getElementById("note").value = rec.note || "";

    editingId = id;
    const submitBtn = document.querySelector("#entry-form button[type='submit']");
    submitBtn.textContent = "💾 บันทึกการแก้ไข";
    submitBtn.classList.remove("btn-primary");
    submitBtn.classList.add("btn-warning");
    submitBtn.style.background = "linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)";

    document.querySelector(".card-form").scrollIntoView({ behavior: "smooth" });
}

window.deleteRecord = async function(id) {
    if(!confirm("ต้องการลบรายการนี้ใช่หรือไม่?")) return;
    try { await deleteDoc(doc(db, "records", id)); } 
    catch (err) { alert("❌ ลบไม่สำเร็จ"); }
}

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
            if (el.id === "category") el.innerHTML = ""; 
            items.forEach(item => { el.innerHTML += `<option value="${item}">${item}</option>`; });
            if (el.id !== "category") el.value = currentVal;
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

function applyFilters() {
    const fMonth = document.getElementById("filter-month")?.value;
    const fCat = document.getElementById("filter-category")?.value;
    const fMethod = document.getElementById("filter-method")?.value;
    const fText = document.getElementById("filter-text")?.value.toLowerCase().trim();

    filteredRecords = allRecords.filter(r => {
        const matchMonth = fMonth ? (r.date && r.date.startsWith(fMonth)) : true;
        
        let matchCat = true;
        if (fCat) {
            if (Array.isArray(r.category)) {
                matchCat = r.category.includes(fCat);
            } else {
                matchCat = r.category === fCat;
            }
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

    currentPage = 1;
    renderTable();
    updateSummary();
}

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

        let catHtml = "";
        if (Array.isArray(r.category)) {
            catHtml = r.category.map(c => 
                `<span class="pill">${c}</span>`
            ).join("");
        } else {
            catHtml = `<span class="pill">${r.category}</span>`;
        }

        tr.innerHTML = `
            <td>
                ${r.date} 
                <div style="font-size:11px; color:#6b7280; margin-top:2px;">🕒 ${timeStr}</div>
            </td>
            <td>${r.item}</td>
            <td>${catHtml}</td>
            <td class="text-right" style="color:${r.income > 0 ? '#16a34a' : 'inherit'}">${incomeTxt}</td>
            <td class="text-right" style="color:${r.expense > 0 ? '#dc2626' : 'inherit'}">${expenseTxt}</td>
            <td>${r.method}</td>
            <td style="font-size:12px; color:#64748b;">${r.note || ""}</td>
            <td>
               <button class="btn-edit" onclick="window.editRecord('${r.id}')">✏️ แก้ไข</button>
               <button class="btn-delete" onclick="window.deleteRecord('${r.id}')">🗑️ ลบ</button>
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

function updateSummary() {
    const totalInc = filteredRecords.reduce((sum, r) => sum + (parseFloat(r.income)||0), 0);
    const totalExp = filteredRecords.reduce((sum, r) => sum + (parseFloat(r.expense)||0), 0);
    
    const sumIncEl = document.getElementById("sum-income");
    const sumExpEl = document.getElementById("sum-expense");
    const sumNetEl = document.getElementById("sum-net");

    if(sumIncEl) sumIncEl.innerText = `+${formatNumber(totalInc)}`;
    if(sumExpEl) sumExpEl.innerText = `-${formatNumber(totalExp)}`;
    if(sumNetEl) {
        const net = totalInc - totalExp;
        sumNetEl.innerText = `${formatNumber(net)}`;
        sumNetEl.style.color = net >= 0 ? "#059669" : "#dc2626";
    }
}

function formatNumber(num) {
    return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// --- ฟังก์ชันเสริม: สลับสถานะ Input (ล็อค/ปลดล็อค) ---
function toggleInputState(activeInput, passiveInput) {
    if (activeInput.value && parseFloat(activeInput.value) > 0) {
        // ถ้าช่องหลักมีค่า -> ปิดช่องรอง และเคลียร์ค่า
        passiveInput.value = "";
        passiveInput.disabled = true;
        passiveInput.style.backgroundColor = "#e2e8f0"; // สีเทา
        passiveInput.style.cursor = "not-allowed";
        passiveInput.placeholder = "🚫 ล็อค";
    } else {
        // ถ้าช่องหลักว่าง -> เปิดช่องรอง
        passiveInput.disabled = false;
        passiveInput.style.backgroundColor = ""; // คืนสีเดิม
        passiveInput.style.cursor = "text";
        passiveInput.placeholder = "0.00";
    }
}

// --- ฟังก์ชันเสริม: ห้ามพิมพ์ตัวอักษรแปลกปลอม ---
function preventInvalidChars(e) {
    // ห้ามกด e, +, - (อนุญาตแค่ตัวเลข, จุด, และปุ่มควบคุมเช่น backspace)
    if (["e", "E", "+", "-"].includes(e.key)) {
        e.preventDefault();
    }
}

// --- Event Listeners ---
function setupEventListeners() {
    const form = document.getElementById("entry-form");
    const incomeInput = document.getElementById("income");
    const expenseInput = document.getElementById("expense");

    if(form) {
        // 1. Logic ล็อคช่องรายรับ-รายจ่าย
        if (incomeInput && expenseInput) {
            // เมื่อพิมพ์รายรับ
            incomeInput.addEventListener("input", () => {
                toggleInputState(incomeInput, expenseInput);
            });
            // เมื่อพิมพ์รายจ่าย
            expenseInput.addEventListener("input", () => {
                toggleInputState(expenseInput, incomeInput);
            });

            // ห้ามพิมพ์ตัวอักษร e, +, -
            incomeInput.addEventListener("keydown", preventInvalidChars);
            expenseInput.addEventListener("keydown", preventInvalidChars);
        }

        form.addEventListener("submit", (e) => {
            e.preventDefault();

            const catSelect = document.getElementById("category");
            const selectedCategories = Array.from(catSelect.selectedOptions).map(option => option.value);

            if (selectedCategories.length === 0) {
                alert("กรุณาเลือกหมวดหมู่อย่างน้อย 1 รายการ");
                return;
            }

            const newRec = {
                date: document.getElementById("date").value,
                item: document.getElementById("item").value,
                category: selectedCategories,
                method: document.getElementById("method").value,
                income: parseFloat(document.getElementById("income").value) || 0,
                expense: parseFloat(document.getElementById("expense").value) || 0,
                note: document.getElementById("note").value
            };
            
            saveRecord(newRec);

            form.reset();
            Array.from(catSelect.options).forEach(o => o.selected = false);
            document.getElementById("date").valueAsDate = new Date();
        });

        // เมื่อกด Reset ให้ปลดล็อคทุกช่อง
        form.addEventListener("reset", () => {
            editingId = null;
            const submitBtn = document.querySelector("#entry-form button[type='submit']");
            submitBtn.textContent = "💾 บันทึกรายการ";
            submitBtn.style.background = ""; 
            submitBtn.classList.remove("btn-warning");
            submitBtn.classList.add("btn-primary");
            
            // ปลดล็อคช่องเงินทั้งคู่
            setTimeout(() => {
                incomeInput.disabled = false;
                incomeInput.style.backgroundColor = "";
                incomeInput.placeholder = "0.00";

                expenseInput.disabled = false;
                expenseInput.style.backgroundColor = "";
                expenseInput.placeholder = "0.00";

                document.getElementById("date").valueAsDate = new Date();
                const catSelect = document.getElementById("category");
                if(catSelect) catSelect.selectedIndex = -1;
            }, 0);
        });
    }

    const filterText = document.getElementById("filter-text");
    if (filterText) filterText.addEventListener("input", applyFilters);

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

    document.getElementById("page-size")?.addEventListener("change", () => {
        currentPage = 1;
        renderTable();
    });
}
