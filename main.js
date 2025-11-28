// --- main.js (Colorful Mobile-First Edition) ---
import { db } from "./firebase-config.js";
import { 
    collection, addDoc, deleteDoc, updateDoc, doc, query, orderBy, onSnapshot, getDocs, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

let allRecords = [];
let filteredRecords = [];
let currentPage = 1;
let editingId = null;
const recordsCol = collection(db, "records"); 

// Start
document.addEventListener('DOMContentLoaded', async () => {
    await loadMasterData();
    const dateInput = document.getElementById('date');
    if(dateInput) dateInput.valueAsDate = new Date();
    subscribeToFirestore();
    setupEventListeners();
});

// Color Logic
function getColorForCategory(name) {
    const palettes = [
        { bg: "#E0E7FF", text: "#4338CA" }, // Indigo
        { bg: "#DCFCE7", text: "#15803D" }, // Emerald
        { bg: "#FFEDD5", text: "#C2410C" }, // Orange
        { bg: "#FCE7F3", text: "#BE185D" }, // Pink
        { bg: "#FEF3C7", text: "#B45309" }, // Amber
        { bg: "#E0F2FE", text: "#0369A1" }, // Sky
        { bg: "#F3E8FF", text: "#7E22CE" }  // Purple
    ];
    const index = name.charCodeAt(0) % palettes.length;
    return palettes[index];
}

// Firebase
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
    if(!confirm("ลบรายการนี้?")) return;
    try { await deleteDoc(doc(db, "records", id)); } catch (err) { alert("Error"); }
}

window.editRecord = function(id) {
    const rec = allRecords.find(r => r.id === id);
    if (!rec) return;

    document.getElementById("date").value = rec.date;
    document.getElementById("item").value = rec.item;
    
    const catSelect = document.getElementById("category");
    Array.from(catSelect.options).forEach(o => o.selected = false);
    if (Array.isArray(rec.category)) {
        rec.category.forEach(val => {
            const option = Array.from(catSelect.options).find(o => o.value === val);
            if (option) option.selected = true;
        });
    } else { catSelect.value = rec.category; }

    document.getElementById("method").value = rec.method;
    
    const incInp = document.getElementById("income");
    const expInp = document.getElementById("expense");
    incInp.value = rec.income || "";
    expInp.value = rec.expense || "";
    toggleInputState(incInp, expInp);
    
    document.getElementById("note").value = rec.note || "";

    editingId = id;
    const submitBtn = document.querySelector("#entry-form button[type='submit']");
    submitBtn.innerHTML = '<span class="material-icons-round">edit</span> บันทึกแก้ไข';
    submitBtn.classList.add("btn-edit-mode");
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetSubmitButton() {
    const submitBtn = document.querySelector("#entry-form button[type='submit']");
    submitBtn.innerHTML = '<span class="material-icons-round">check_circle</span> บันทึกข้อมูล';
    submitBtn.classList.remove("btn-edit-mode");
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

// --- Render List as Cards ---
function renderList() {
    const container = document.getElementById("table-body");
    if(!container) return; container.innerHTML = "";

    const pageSize = 10;
    const totalPages = Math.ceil(filteredRecords.length / pageSize) || 1;
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const displayItems = filteredRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    if(displayItems.length === 0) {
        container.innerHTML = `<div class="empty-msg">ไม่มีรายการ...</div>`;
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
            return `<span class="tc-pill" style="background:${color.bg}; color:${color.text};">${c}</span>`;
        }).join("");

        const incVal = r.income > 0 ? `+${formatNumber(r.income)}` : "";
        const expVal = r.expense > 0 ? `-${formatNumber(r.expense)}` : "";

        const card = document.createElement("div");
        card.className = "trans-card";
        card.innerHTML = `
            <div class="tc-header">
                <div style="flex:1;">
                   <div class="tc-date">
                      <span class="material-icons-round" style="font-size:14px;">event</span> ${r.date} ${timeStr ? '• '+timeStr : ''}
                   </div>
                   <div class="tc-title">${r.item}</div>
                   <div class="tc-badges">${catHtml}</div>
                </div>
                <div class="action-group">
                    <button class="btn-icon bi-edit" onclick="window.editRecord('${r.id}')"><span class="material-icons-round" style="font-size:16px;">edit</span></button>
                    <button class="btn-icon bi-del" onclick="window.deleteRecord('${r.id}')"><span class="material-icons-round" style="font-size:16px;">delete</span></button>
                </div>
            </div>

            <div class="tc-body">
                <div style="font-size:12px; color:#64748b;">${r.method}</div>
                <div>
                    <span class="val-inc">${incVal}</span>
                    <span class="val-exp">${expVal}</span>
                </div>
            </div>

            ${r.note ? `<div class="tc-footer"><div class="tc-note">Note: ${r.note}</div></div>` : ''}
        `;
        container.appendChild(card);
    });

    const controls = document.getElementById("pagination-controls");
    if(controls) {
        controls.innerHTML = `
        <button onclick="window.changePage(-1)" ${currentPage <= 1 ? 'disabled' : ''} style="border:none; background:#fff; width:36px; height:36px; border-radius:50%; box-shadow:0 2px 6px rgba(0,0,0,0.1); cursor:pointer;"><span class="material-icons-round" style="color:#64748b;">chevron_left</span></button>
        <span style="align-self:center; font-size:13px; color:#A0AEC0;">${currentPage} / ${totalPages}</span>
        <button onclick="window.changePage(1)" ${currentPage >= totalPages ? 'disabled' : ''} style="border:none; background:#fff; width:36px; height:36px; border-radius:50%; box-shadow:0 2px 6px rgba(0,0,0,0.1); cursor:pointer;"><span class="material-icons-round" style="color:#64748b;">chevron_right</span></button>`;
    }
}

function updateSummary() {
    const totalInc = filteredRecords.reduce((sum, r) => sum + (parseFloat(r.income)||0), 0);
    const totalExp = filteredRecords.reduce((sum, r) => sum + (parseFloat(r.expense)||0), 0);
    const net = totalInc - totalExp;

    document.getElementById("sum-income").innerText = formatNumber(totalInc);
    document.getElementById("sum-expense").innerText = formatNumber(totalExp);
    document.getElementById("sum-net").innerText = formatNumber(net);
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
            resetSubmitButton();
            setTimeout(() => {
                incInp.disabled=false; expInp.disabled=false;
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
}
