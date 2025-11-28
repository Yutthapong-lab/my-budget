// --- main.js (Final Web Fix) ---
import { db } from "./firebase-config.js";
import { 
    collection, addDoc, deleteDoc, updateDoc, doc, query, orderBy, onSnapshot, getDocs, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

let allRecords = [];
let filteredRecords = [];
let currentPage = 1;
let editingId = null;
let selectedCategories = []; // สำหรับ Chips
const recordsCol = collection(db, "records"); 

// Global variable for master data
let masterCategories = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadMasterData();
    const dateInput = document.getElementById('date');
    if(dateInput) dateInput.valueAsDate = new Date();
    subscribeToFirestore();
    setupEventListeners();
});

// Helper: Color Palettes
function getColorForCategory(name) {
    const palettes = [
        { bg: "#e0e7ff", text: "#4338ca" }, // Indigo
        { bg: "#dcfce7", text: "#15803d" }, // Green
        { bg: "#ffedd5", text: "#c2410c" }, // Orange
        { bg: "#fce7f3", text: "#be185d" }, // Pink
        { bg: "#fef3c7", text: "#b45309" }, // Amber
        { bg: "#e0f2fe", text: "#0369a1" }, // Sky
        { bg: "#f3e8ff", text: "#7e22ce" }  // Purple
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
    if(!confirm("ลบรายการนี้?")) return;
    try { await deleteDoc(doc(db, "records", id)); } catch (err) { alert("Error"); }
}

window.editRecord = function(id) {
    const rec = allRecords.find(r => r.id === id);
    if (!rec) return;

    document.getElementById("date").value = rec.date;
    document.getElementById("item").value = rec.item;
    
    // Set Chips Active
    selectedCategories = Array.isArray(rec.category) ? rec.category : [rec.category];
    renderCategoryChips(); 

    document.getElementById("method").value = rec.method;
    
    const incInp = document.getElementById("income");
    const expInp = document.getElementById("expense");
    incInp.value = rec.income || "";
    expInp.value = rec.expense || "";
    toggleInputState(incInp, expInp);
    
    document.getElementById("note").value = rec.note || "";

    editingId = id;
    const submitBtn = document.querySelector("#entry-form button[type='submit']");
    submitBtn.innerHTML = '<i class="material-icons">edit</i> บันทึกการแก้ไข';
    submitBtn.classList.add("btn-main", "edit-mode"); // Add style class
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetSubmitButton() {
    const submitBtn = document.querySelector("#entry-form button[type='submit']");
    submitBtn.innerHTML = '<i class="material-icons">save</i> บันทึกข้อมูล';
    submitBtn.classList.remove("edit-mode");
}

async function loadMasterData() {
    const methodSelect = document.getElementById("method");
    const filterCat = document.getElementById("filter-category");
    const filterMethod = document.getElementById("filter-method");

    // Helper for dropdowns
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

        // Fill Dropdowns
        fillSelect(filterCat, masterCategories);
        fillSelect(methodSelect, methods);
        fillSelect(filterMethod, methods);

        // Render Chips
        renderCategoryChips();

    } catch(e) { console.error(e); }
}

// --- Logic Render Chips ---
function renderCategoryChips() {
    const container = document.getElementById("category-container");
    if(!container) return;
    container.innerHTML = "";

    masterCategories.forEach(cat => {
        const btn = document.createElement("div");
        btn.className = "chip-btn";
        btn.textContent = cat;
        
        if (selectedCategories.includes(cat)) {
            btn.classList.add("active");
            btn.innerHTML = `<i class="material-icons" style="font-size:14px;">check</i> ${cat}`;
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
        container.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#94a3b8;">ไม่มีรายการ...</td></tr>`;
        return;
    }

    displayItems.forEach(r => {
        let timeStr = "";
        if (r.createdAt && r.createdAt.seconds) {
            timeStr = new Date(r.createdAt.seconds * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + " น.";
        }

        let catHtml = "";
        const cats = Array.isArray(r.category) ? r.category : [r.category];
        catHtml = cats.map(c => {
            if(!c) return "";
            const color = getColorForCategory(c);
            // Pill Style with Color
            return `<span style="background:${color.bg}; color:${color.text}; padding:4px 10px; border-radius:50px; font-size:12px; font-weight:600; margin-right:4px;">${c}</span>`;
        }).join("");

        const incVal = r.income > 0 ? `+${formatNumber(r.income)}` : "-";
        const expVal = r.expense > 0 ? `-${formatNumber(r.expense)}` : "-";

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>
                <div style="font-weight:600; color:#1e293b;">${r.date}</div>
                <div style="font-size:12px; color:#94a3b8; margin-top:2px;">${timeStr}</div>
            </td>
            <td>${r.item} <div style="font-size:12px; color:#94a3b8; margin-top:2px;">${r.note || ''}</div></td>
            <td>${catHtml}</td>
            <td style="text-align:right; color:#16a34a; font-weight:700;">${incVal}</td>
            <td style="text-align:right; color:#dc2626; font-weight:700;">${expVal}</td>
            <td style="text-align:center;"><span class="badge-method">${r.method}</span></td>
            <td style="text-align:center;">
               <button class="action-btn ab-edit" onclick="window.editRecord('${r.id}')"><i class="material-icons" style="font-size:18px;">edit</i></button>
               <button class="action-btn ab-del" onclick="window.deleteRecord('${r.id}')"><i class="material-icons" style="font-size:18px;">delete</i></button>
            </td>
        `;
        container.appendChild(tr);
    });

    const controls = document.getElementById("pagination-controls");
    if(controls) {
        controls.innerHTML = `
        <button onclick="window.changePage(-1)" ${currentPage <= 1 ? 'disabled' : ''} style="border:none; background:white; width:32px; height:32px; border-radius:8px; border:1px solid #e2e8f0; cursor:pointer;"><i class="material-icons" style="font-size:16px; color:#64748b;">chevron_left</i></button>
        <span style="font-size:13px; color:#64748b; align-self:center;">${currentPage} / ${totalPages}</span>
        <button onclick="window.changePage(1)" ${currentPage >= totalPages ? 'disabled' : ''} style="border:none; background:white; width:32px; height:32px; border-radius:8px; border:1px solid #e2e8f0; cursor:pointer;"><i class="material-icons" style="font-size:16px; color:#64748b;">chevron_right</i></button>`;
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
            if(selectedCategories.length===0) { alert("กรุณาเลือกหมวดหมู่ครับ"); return; }

            const newRec = {
                date: document.getElementById("date").value,
                item: document.getElementById("item").value,
                category: selectedCategories, // Use Array
                method: document.getElementById("method").value,
                income: parseFloat(incInp.value) || 0,
                expense: parseFloat(expInp.value) || 0,
                note: document.getElementById("note").value
            };
            saveRecord(newRec);
            form.reset();
            selectedCategories = []; // Reset Chips
            renderCategoryChips();
            document.getElementById("date").valueAsDate = new Date();
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
