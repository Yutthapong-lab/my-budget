// --- main.js (Version: Colorful Categories & Modern Buttons) ---
import { db } from "./firebase-config.js";
import { 
    collection, addDoc, deleteDoc, updateDoc, doc, query, orderBy, onSnapshot, getDocs, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// Global Variables
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

// --- Helper: สุ่มสีพาสเทลสำหรับหมวดหมู่ ---
function getColorForCategory(name) {
    // ชุดสีพาสเทล (Background, Text)
    const palettes = [
        { bg: "#dbeafe", text: "#1e40af" }, // Blue
        { bg: "#dcfce7", text: "#166534" }, // Green
        { bg: "#fce7f3", text: "#9d174d" }, // Pink
        { bg: "#ffedd5", text: "#9a3412" }, // Orange
        { bg: "#f3e8ff", text: "#6b21a8" }, // Purple
        { bg: "#e0f2fe", text: "#075985" }, // Sky
        { bg: "#fee2e2", text: "#991b1b" }  // Red
    ];
    // ใช้ตัวอักษรตัวแรกแปลงเป็นตัวเลขเพื่อเลือกสี (เพื่อให้หมวดเดิมได้สีเดิมเสมอ)
    const index = name.charCodeAt(0) % palettes.length;
    return palettes[index];
}

// --- Firebase Functions ---
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
            alert("✅ แก้ไขข้อมูลเรียบร้อย");
            // Reset UI
            editingId = null;
            const submitBtn = document.querySelector("#entry-form button[type='submit']");
            submitBtn.innerHTML = '<span class="material-icons-round">save</span> บันทึกรายการ';
            submitBtn.classList.remove("btn-edit-mode");
        } else {
            rec.createdAt = serverTimestamp();
            await addDoc(recordsCol, rec);
            alert("✅ บันทึกข้อมูลเรียบร้อย");
        }
    } catch (err) { alert("❌ Error: " + err.message); }
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
    
    // Multi-select Category
    const catSelect = document.getElementById("category");
    Array.from(catSelect.options).forEach(o => o.selected = false);
    if (Array.isArray(rec.category)) {
        rec.category.forEach(val => {
            const option = Array.from(catSelect.options).find(o => o.value === val);
            if (option) option.selected = true;
        });
    } else { catSelect.value = rec.category; }

    document.getElementById("method").value = rec.method;
    
    // Toggle Inputs
    const incInp = document.getElementById("income");
    const expInp = document.getElementById("expense");
    incInp.value = rec.income || "";
    expInp.value = rec.expense || "";
    toggleInputState(incInp, expInp);
    
    document.getElementById("note").value = rec.note || "";

    editingId = id;
    const submitBtn = document.querySelector("#entry-form button[type='submit']");
    submitBtn.innerHTML = '<span class="material-icons-round">edit</span> บันทึกการแก้ไข';
    submitBtn.classList.add("btn-edit-mode");
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadMasterData() {
    const catSelect = document.getElementById("category");
    const methodSelect = document.getElementById("method");
    const filterCat = document.getElementById("filter-category");
    const filterMethod = document.getElementById("filter-method");

    const fillOptions = (elements, items) => {
        elements.forEach(el => {
            if(!el) return;
            const currentVal = el.value;
            el.innerHTML = '<option value="">-- เลือก --</option>';
            if(el.id === "category") el.innerHTML = ""; 
            items.forEach(item => { el.innerHTML += `<option value="${item}">${item}</option>`; });
            if(el.id !== "category") el.value = currentVal;
        });
    };

    try {
        const catSnap = await getDocs(collection(db, "categories"));
        let categories = []; catSnap.forEach(d => categories.push(d.data().name)); categories.sort();

        const methSnap = await getDocs(collection(db, "methods"));
        let methods = []; methSnap.forEach(d => methods.push(d.data().name)); methods.sort();

        if(categories.length===0) categories=["อาหาร","เดินทาง","ช้อปปิ้ง","อื่นๆ"];
        if(methods.length===0) methods=["เงินสด","โอนเงิน"];

        fillOptions([catSelect, filterCat], categories);
        fillOptions([methodSelect, filterMethod], methods);
    } catch(e) { console.error(e); }
}

window.changePage = function(delta) { currentPage += delta; renderTable(); }

function applyFilters() {
    const fMonth = document.getElementById("filter-month")?.value;
    const fText = document.getElementById("filter-text")?.value.toLowerCase().trim();

    filteredRecords = allRecords.filter(r => {
        const matchMonth = fMonth ? (r.date && r.date.startsWith(fMonth)) : true;
        const catText = Array.isArray(r.category) ? r.category.join(" ") : (r.category || "");
        
        const matchText = fText ? (
            (r.item || "").toLowerCase().includes(fText) ||       
            (r.note || "").toLowerCase().includes(fText) ||       
            catText.toLowerCase().includes(fText) ||  
            (r.method || "").toLowerCase().includes(fText) ||     
            (r.income || 0).toString().includes(fText) ||         
            (r.expense || 0).toString().includes(fText)           
        ) : true;
        return matchMonth && matchText;
    });
    currentPage = 1; renderTable(); updateSummary();
}

// --- Render Table (with Colors & Icons) ---
function renderTable() {
    const tbody = document.getElementById("table-body");
    if(!tbody) return; tbody.innerHTML = "";

    const pageSize = parseInt(document.getElementById("page-size")?.value || 10);
    const totalPages = Math.ceil(filteredRecords.length / pageSize) || 1;
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const displayItems = filteredRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    displayItems.forEach(r => {
        const tr = document.createElement("tr");
        const incomeTxt = r.income > 0 ? formatNumber(r.income) : "-";
        const expenseTxt = r.expense > 0 ? formatNumber(r.expense) : "-";

        let timeStr = "";
        if (r.createdAt && r.createdAt.seconds) {
            timeStr = new Date(r.createdAt.seconds * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + " น.";
        }

        // Generate Colorful Category Pills
        let catHtml = "";
        const cats = Array.isArray(r.category) ? r.category : [r.category];
        catHtml = cats.map(c => {
            if(!c) return "";
            const color = getColorForCategory(c);
            return `<span class="cat-pill" style="background:${color.bg}; color:${color.text};">${c}</span>`;
        }).join("");

        tr.innerHTML = `
            <td>
                <div style="font-weight:500;">${r.date}</div>
                <div style="font-size:11px; color:#94a3b8; display:flex; align-items:center; gap:2px;">
                    <span class="material-icons-round" style="font-size:12px;">schedule</span> ${timeStr}
                </div>
            </td>
            <td>${r.item}</td>
            <td>${catHtml}</td>
            <td class="text-right" style="color:#16a34a; font-weight:500;">${incomeTxt}</td>
            <td class="text-right" style="color:#dc2626; font-weight:500;">${expenseTxt}</td>
            <td><span style="background:#f8fafc; padding:2px 8px; border-radius:4px; border:1px solid #e2e8f0; font-size:12px;">${r.method}</span></td>
            <td>${r.note || "-"}</td>
            <td style="text-align:center;">
               <button class="action-btn btn-edit-row" onclick="window.editRecord('${r.id}')" title="แก้ไข">
                 <span class="material-icons-round" style="font-size:18px;">edit</span>
               </button>
               <button class="action-btn btn-del-row" onclick="window.deleteRecord('${r.id}')" title="ลบ">
                 <span class="material-icons-round" style="font-size:18px;">delete</span>
               </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const controls = document.getElementById("pagination-controls");
    if(controls) {
        controls.innerHTML = `
        <button onclick="window.changePage(-1)" ${currentPage <= 1 ? 'disabled' : ''} class="action-btn btn-edit-row"><span class="material-icons-round">chevron_left</span></button>
        <span style="font-size:13px; align-self:center;">หน้า ${currentPage} / ${totalPages}</span>
        <button onclick="window.changePage(1)" ${currentPage >= totalPages ? 'disabled' : ''} class="action-btn btn-edit-row"><span class="material-icons-round">chevron_right</span></button>`;
    }
}

function updateSummary() {
    const totalInc = filteredRecords.reduce((sum, r) => sum + (parseFloat(r.income)||0), 0);
    const totalExp = filteredRecords.reduce((sum, r) => sum + (parseFloat(r.expense)||0), 0);
    const net = totalInc - totalExp;

    document.getElementById("sum-income").innerText = formatNumber(totalInc);
    document.getElementById("sum-expense").innerText = formatNumber(totalExp);
    const netEl = document.getElementById("sum-net");
    netEl.innerText = formatNumber(net);
    netEl.style.color = net >= 0 ? "#6366f1" : "#dc2626";
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
            const catSelect = document.getElementById("category");
            const selectedCats = Array.from(catSelect.selectedOptions).map(o => o.value);
            if(selectedCats.length===0) { alert("เลือกหมวดหมู่ก่อนครับ"); return; }

            const newRec = {
                date: document.getElementById("date").value,
                item: document.getElementById("item").value,
                category: selectedCats,
                method: document.getElementById("method").value,
                income: parseFloat(incInp.value) || 0,
                expense: parseFloat(expInp.value) || 0,
                note: document.getElementById("note").value
            };
            saveRecord(newRec);
            form.reset();
            Array.from(catSelect.options).forEach(o=>o.selected=false);
            document.getElementById("date").valueAsDate = new Date();
        });

        form.addEventListener("reset", () => {
            editingId = null;
            const submitBtn = document.querySelector("#entry-form button[type='submit']");
            submitBtn.innerHTML = '<span class="material-icons-round">save</span> บันทึกรายการ';
            submitBtn.classList.remove("btn-edit-mode");
            setTimeout(() => {
                incInp.disabled=false; expInp.disabled=false;
                document.getElementById("date").valueAsDate = new Date();
            },0);
        });
    }

    const filterText = document.getElementById("filter-text");
    if(filterText) filterText.addEventListener("input", applyFilters);
    document.getElementById("filter-month")?.addEventListener("change", applyFilters);
    document.getElementById("clear-filter")?.addEventListener("click", () => {
        document.getElementById("filter-month").value = "";
        if(filterText) filterText.value = "";
        applyFilters();
    });
    document.getElementById("page-size")?.addEventListener("change", () => { currentPage = 1; renderTable(); });
}
