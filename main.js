// --- main.js ---
import { db } from "./firebase-config.js";
// ⚠️ Import ให้ครบทุกตัว
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged, 
    setPersistence, 
    browserSessionPersistence,
    deleteUser,
    reauthenticateWithCredential,
    EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";

import { 
    collection, addDoc, deleteDoc, updateDoc, doc, query, orderBy, onSnapshot, getDocs, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// ==========================================
// >>> 1. ส่วนตั้งค่าและฟังก์ชันช่วย (Helper) <<<
// ==========================================

const APP_INFO = {
    version: "v1.1.3", // Update Version
    credit: "Created by Yutthapong R.",
    copyrightYear: "2025"
};

// ⚠️ [สำคัญ] เปลี่ยนตรงนี้เป็นอีเมลของคุณ
const ADMIN_EMAIL = "yutthapong.guide@gmail.com"; 

// ฟังก์ชันช่วย Reset Eye View (ปิดตา)
function resetEyeView() {
    const passInput = document.getElementById('login-pass');
    const toggleIcon = document.getElementById('toggle-password');
    
    if (passInput) {
        passInput.setAttribute('type', 'password'); // บังคับให้เป็น password (ซ่อน)
    }
    if (toggleIcon) {
        toggleIcon.classList.remove('fa-eye-slash'); // เอาขีดฆ่าออก
        toggleIcon.classList.add('fa-eye'); // ใส่รูปตาปกติ
    }
}

// ฟังก์ชันแปลงตัวเลข
function formatNumber(n) { 
    if (n === undefined || n === null || isNaN(n)) return "0.00";
    return Number(n).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}); 
}

function formatThaiDate(dateString) {
    if (!dateString) return "-";
    try {
        const [y, m, d] = dateString.split('-');
        const thaiYear = parseInt(y) + 543;
        return `${d}/${m}/${thaiYear}`;
    } catch(e) { return dateString; }
}

function getColorForCategory(name) {
    const palettes = [{ bg: "#eef2ff", text: "#4338ca" }, { bg: "#f0fdf4", text: "#15803d" }, { bg: "#fff7ed", text: "#c2410c" }, { bg: "#fdf2f8", text: "#be185d" }];
    if (!name || typeof name !== 'string') return palettes[0];
    const charCode = name.charCodeAt(0) || 0;
    return palettes[charCode % palettes.length] || palettes[0];
}

function toggleInputState(active, passive) {
    if (active.value && parseFloat(active.value) > 0) { 
        passive.value = ""; 
        passive.disabled = true; 
    } else { 
        passive.disabled = false; 
    }
}

// ==========================================
// >>> 2. ตัวแปรระบบ <<<
// ==========================================

let allRecords = [];
let filteredRecords = [];
let currentPage = 1;
let editingId = null;
let selectedCategories = [];
let masterCategories = [];
let recordsCol = null;
let unsubscribe = null;
const auth = getAuth();
let isRegisterMode = false;

// ตั้งค่าให้ปิดเว็บแล้ว Logout ทันที
setPersistence(auth, browserSessionPersistence)
  .then(() => console.log("Session Persistence: ON"))
  .catch((error) => console.error("Persistence Error:", error));

// ==========================================
// >>> 3. การทำงานหลัก (Main Logic) <<<
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    // ใส่เครดิตหน้าเว็บ
    const fCred = document.getElementById('footer-credit');
    if(fCred) fCred.innerText = `${APP_INFO.credit} | Copyright © ${APP_INFO.copyrightYear}`;

    checkAdminAccess(); 

    onAuthStateChanged(auth, async (user) => {
        const loginSection = document.getElementById('login-section');
        const dashboardSection = document.getElementById('dashboard-section');
        const footer = document.getElementById('app-footer');
        const userDisplay = document.getElementById('user-display');
        const settingLink = document.querySelector('.setting-link');
        const fVer = document.getElementById('footer-version');

        if (user) {
            // Login แล้ว
            loginSection.style.display = 'none';
            dashboardSection.style.display = 'flex';
            footer.style.display = 'flex';
            
            if (userDisplay) userDisplay.innerText = user.email || "User";

            // เช็ก Admin เพื่อโชว์ปุ่มจัดการ
            let versionText = APP_INFO.version;
            if (user.email === ADMIN_EMAIL) {
                versionText += " (Super Admin)";
                if(settingLink) settingLink.style.display = 'flex';
            } else {
                if(settingLink) settingLink.style.display = 'none';
            }
            if(fVer) fVer.innerText = versionText;

            recordsCol = collection(db, "users", user.uid, "records");
            await loadMasterData();
            const dateInput = document.getElementById('date');
            if(dateInput) dateInput.valueAsDate = new Date();
            
            subscribeToFirestore();
            startClock();
            fetchWeather();
            setupExportPDF();
        } else {
            // ยังไม่ Login หรือ Logout แล้ว
            loginSection.style.display = 'block';
            dashboardSection.style.display = 'none';
            footer.style.display = 'none';
            if(userDisplay) userDisplay.innerText = "...";
            if(fVer) fVer.innerText = APP_INFO.version;
            
            if(unsubscribe) unsubscribe();
            allRecords = [];
            recordsCol = null;

            // สั่งล้างช่อง Input และปิดตา ทุกครั้งที่สถานะเป็น Logout
            if(document.getElementById('login-email')) document.getElementById('login-email').value = "";
            if(document.getElementById('login-pass')) document.getElementById('login-pass').value = "";
            if(document.getElementById('login-error')) document.getElementById('login-error').innerText = "";
            resetEyeView(); // เรียกฟังก์ชันปิดตา
        }
    });

    setupAuthListeners();
    setupEventListeners();
});

function checkAdminAccess() {
    if (window.location.pathname.includes("manage.html")) {
        onAuthStateChanged(auth, (user) => {
            if (!user || user.email !== ADMIN_EMAIL) {
                alert("⛔ ขออภัย คุณไม่มีสิทธิ์เข้าถึงหน้านี้");
                window.location.href = "index.html"; 
            }
        });
    }
}

// --- Auth System ---
function setupAuthListeners() {
    const loginForm = document.getElementById('login-form');
    const switchBtn = document.getElementById('auth-switch-btn');
    const switchText = document.getElementById('auth-switch-text');
    const authTitle = document.getElementById('auth-title');
    const authBtn = document.getElementById('auth-btn');
    const errDiv = document.getElementById('login-error');
    const emailInput = document.getElementById('login-email');
    const passInput = document.getElementById('login-pass');

    // >>> [UPDATE Fix 1] ฟังก์ชันปุ่ม Reset (ยางลบ) <<<
    const btnResetLogin = document.getElementById('btn-reset-login');
    if (btnResetLogin) {
        btnResetLogin.addEventListener('click', () => {
            emailInput.value = "";
            passInput.value = "";
            errDiv.innerText = "";
            emailInput.focus();
            resetEyeView(); // บังคับปิดตาเมื่อกด Reset
        });
    }

    // 1. สลับโหมด
    if (switchBtn) {
        switchBtn.addEventListener('click', () => {
            isRegisterMode = !isRegisterMode; 
            errDiv.innerText = ""; 
            
            // ล้างค่า
            emailInput.value = "";
            passInput.value = "";

            // >>> [UPDATE Fix 1] Reset Eye View เมื่อสลับโหมด <<<
            resetEyeView(); // บังคับปิดตาเมื่อสลับโหมด

            if (isRegisterMode) {
                authTitle.innerText = "สมัครสมาชิกใหม่";
                authBtn.innerText = "ลงทะเบียน";
                switchText.innerText = "มีบัญชีอยู่แล้ว?";
                switchBtn.innerText = "เข้าสู่ระบบ";
                authBtn.style.background = "#10b981"; 
            } else {
                authTitle.innerText = "เข้าสู่ระบบ";
                authBtn.innerText = "เข้าใช้งาน";
                switchText.innerText = "ยังไม่มีบัญชี?";
                switchBtn.innerText = "สมัครสมาชิก";
                authBtn.style.background = "var(--primary)"; 
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = emailInput.value;
            const pass = passInput.value;
            errDiv.innerText = "กำลังตรวจสอบ...";
            try {
                if (isRegisterMode) {
                    await createUserWithEmailAndPassword(auth, email, pass);
                } else {
                    await signInWithEmailAndPassword(auth, email, pass);
                }
                errDiv.innerText = "";
            } catch (error) {
                console.error(error);
                let msg = "เกิดข้อผิดพลาด";
                if(error.code === 'auth/email-already-in-use') msg = "อีเมลนี้มีผู้ใช้งานแล้ว";
                else if(error.code === 'auth/weak-password') msg = "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร";
                else if(error.code === 'auth/invalid-email') msg = "รูปแบบอีเมลไม่ถูกต้อง";
                else if(error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') msg = "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
                else if(error.code === 'auth/too-many-requests') msg = "กรอกรหัสผิดบ่อยเกินไป กรุณารอสักครู่";
                errDiv.innerText = msg;
            }
        });
    }

    // 2. Logout
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if(confirm("ออกจากระบบ?")) {
                signOut(auth).then(() => {
                    console.log("Logged out");
                });
            }
        });
    }

    // 3. Delete Account
    const deleteAccBtn = document.getElementById('btn-delete-account');
    if (deleteAccBtn) {
        deleteAccBtn.addEventListener('click', async () => {
            const confirmMsg = prompt("⚠️ คำเตือน: ข้อมูลทั้งหมดจะถูกลบถาวรและกู้คืนไม่ได้!\nหากต้องการลบ พิมพ์คำว่า 'DELETE' ในช่องข้างล่าง:");
            
            if (confirmMsg === 'DELETE') {
                const user = auth.currentUser;
                if (!user) return;

                try {
                    deleteAccBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังลบ...';
                    deleteAccBtn.disabled = true;
                    
                    if (recordsCol) {
                        const snapshot = await getDocs(recordsCol);
                        if (!snapshot.empty) {
                            const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
                            await Promise.all(deletePromises);
                        }
                    }

                    await deleteUser(user);
                    alert("ลบบัญชีเรียบร้อยแล้ว");

                } catch (error) {
                    console.error("Delete Error:", error);
                    
                    if (error.code === 'auth/requires-recent-login') {
                        const password = prompt("เพื่อความปลอดภัย กรุณากรอกรหัสผ่านเพื่อยืนยันการลบ:");
                        if (password) {
                            try {
                                const credential = EmailAuthProvider.credential(user.email, password);
                                await reauthenticateWithCredential(user, credential);
                                await deleteUser(user);
                                alert("ลบบัญชีเรียบร้อยแล้ว");
                            } catch (reAuthErr) {
                                alert("รหัสผ่านไม่ถูกต้อง หรือเกิดข้อผิดพลาด: " + reAuthErr.message);
                            }
                        }
                    } else {
                        alert("เกิดข้อผิดพลาด: " + error.message);
                    }
                    deleteAccBtn.innerHTML = '<i class="fa-solid fa-user-xmark"></i> ลบบัญชีถาวร';
                    deleteAccBtn.disabled = false;
                }
            }
        });
    }

    // Eye View
    const togglePassword = document.getElementById('toggle-password');
    if (togglePassword && passInput) {
        togglePassword.addEventListener('click', function () {
            const type = passInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passInput.setAttribute('type', type);
            this.classList.toggle('fa-eye');
            this.classList.toggle('fa-eye-slash');
        });
    }
}

// --- Data Management ---
function subscribeToFirestore() {
    if (!recordsCol) return;
    if (unsubscribe) unsubscribe();
    
    const q = query(recordsCol, orderBy("date", "desc"), orderBy("createdAt", "desc"));
    unsubscribe = onSnapshot(q, (snapshot) => {
        allRecords = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        applyFilters(); 
    }, (error) => console.error("Data fetch error:", error));
}

async function saveRecord(rec) {
    if (!recordsCol) return alert("กรุณา Login ก่อน");
    try {
        if (editingId) { 
            await updateDoc(doc(recordsCol, editingId), rec); 
            editingId = null; resetSubmitButton(); 
        } else { 
            rec.createdAt = serverTimestamp(); 
            await addDoc(recordsCol, rec); 
        }
    } catch (err) { alert(err.message); }
}

window.deleteRecord = async function(id) {
    if (!recordsCol) return;
    if(confirm("ลบรายการนี้?")) await deleteDoc(doc(recordsCol, id));
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
    btn.innerHTML = '<i class="fa-solid fa-floppy-disk anim-beat"></i> บันทึกข้อมูล'; btn.classList.remove("edit-mode");
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

// --- Features ---
function startClock() {
    const updateTime = () => {
        const now = new Date();
        const timeEl = document.getElementById('clock-display');
        const dateEl = document.getElementById('date-display');
        if(timeEl) timeEl.innerHTML = `<i class="fa-solid fa-clock anim-spin"></i> ${now.toLocaleTimeString('th-TH', { hour12: false })}`;
        if(dateEl) dateEl.innerText = now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
    };
    updateTime(); setInterval(updateTime, 1000);
}

function fetchWeather() {
    const updateUI = (temp, desc, locName) => {
        document.getElementById('temp-val').innerText = temp;
        document.getElementById('location-name').innerText = locName;
    }
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
            try {
                const { latitude: lat, longitude: lon } = pos.coords;
                const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
                const weatherData = await weatherRes.json();
                let locationName = "ตำแหน่งปัจจุบัน";
                try {
                    const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&accept-language=th`);
                    const geoData = await geoRes.json();
                    if (geoData.address) {
                        const addr = geoData.address;
                        const localArea = addr.suburb || addr.district || addr.town || "";
                        const province = addr.province || addr.city || "";
                        if (localArea && province) locationName = `${localArea} ${province}`;
                        else if (province) locationName = province;
                    }
                } catch (geoErr) { console.warn(geoErr); }
                if(weatherData.current_weather) {
                    updateUI(weatherData.current_weather.temperature, weatherData.current_weather.weathercode, locationName);
                }
            } catch(e) { console.error(e); }
        }, () => updateUI("--", 0, "ไม่พบตำแหน่ง"));
    }
}

// --- PDF Export ---
function setupExportPDF() {
    const btn = document.getElementById('btn-export-pdf');
    if(!btn) return;
    const arrayBufferToBase64 = (buffer) => {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) { binary += String.fromCharCode(bytes[i]); }
        return window.btoa(binary);
    };
    btn.addEventListener('click', async () => {
        const originalText = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลด...`;
        btn.disabled = true;
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            const fontUrl = 'https://cdn.jsdelivr.net/gh/cadsondemak/Sarabun@master/fonts/Sarabun-Regular.ttf';
            const response = await fetch(fontUrl);
            if (!response.ok) throw new Error(`โหลดฟอนต์ไม่สำเร็จ`);
            const fontBuffer = await response.arrayBuffer();
            const fontBase64 = arrayBufferToBase64(fontBuffer);
            doc.addFileToVFS("Sarabun.ttf", fontBase64);
            doc.addFont("Sarabun.ttf", "Sarabun", "normal");
            doc.setFont("Sarabun"); 
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> สร้าง PDF...`;
            doc.setFontSize(18); 
            doc.text("My Budget Report", 14, 22);
            doc.setFontSize(10); 
            doc.text(`Exported: ${new Date().toLocaleString('th-TH')}`, 14, 28);
            doc.text(`Total Items: ${filteredRecords.length}`, 14, 33);
            const tableColumn = ["Date / Time", "Item", "Income", "Expense", "Category", "Method"];
            const tableRows = filteredRecords.map(r => {
                let timeStr = "";
                if (r.createdAt) timeStr = new Date(r.createdAt.seconds*1000).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}) + " น.";
                const dateTimeStr = `${formatThaiDate(r.date)}\n${timeStr}`;
                return [dateTimeStr, r.item, r.income>0?r.income.toFixed(2):"-", r.expense>0?r.expense.toFixed(2):"-", Array.isArray(r.category)?r.category.join(", "):r.category, r.method];
            });
            doc.autoTable({ 
                head: [tableColumn], body: tableRows, startY: 40,
                styles: { font: 'Sarabun', fontStyle: 'normal', valign: 'middle' },
                headStyles: { fillColor: [99, 102, 241], font: 'Sarabun', halign: 'center' },
                columnStyles: { 0: { halign: 'center' } } 
            });
            const pageCount = doc.internal.getNumberOfPages();
            const pageWidth = doc.internal.pageSize.width;
            const pageHeight = doc.internal.pageSize.height;
            doc.setFontSize(8); doc.setTextColor(100); 
            for(let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.text(`หน้าที่ ${i} จาก ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
            }
            const d = new Date();
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear() + 543;
            const h = String(d.getHours()).padStart(2, '0');
            const m = String(d.getMinutes()).padStart(2, '0');
            const s = String(d.getSeconds()).padStart(2, '0');
            
            const fileNameStr = `my-budget-report_${day}${month}${year}-${h}${m}${s}.pdf`;
            doc.save(fileNameStr);

        } catch (err) { console.error(err); alert(`Error: ${err.message}`); } 
        finally { btn.innerHTML = originalText; btn.disabled = false; }
    });
}

// --- Render & Filters ---
window.changePage = function(delta) { currentPage += delta; renderList(); }

function applyFilters() {
    const fStart = document.getElementById("filter-start")?.value;
    const fEnd = document.getElementById("filter-end")?.value;
    const fCat = document.getElementById("filter-category")?.value;
    const fMethod = document.getElementById("filter-method")?.value;
    const fText = document.getElementById("filter-text")?.value.toLowerCase().trim();

    filteredRecords = allRecords.filter(r => {
        let isDateMatch = true;
        if (fStart && fEnd) isDateMatch = r.date >= fStart && r.date <= fEnd;
        else if (fStart) isDateMatch = r.date >= fStart;
        else if (fEnd) isDateMatch = r.date <= fEnd;

        const mCat = fCat ? (Array.isArray(r.category) ? r.category.includes(fCat) : r.category===fCat) : true;
        const mMethod = fMethod ? r.method === fMethod : true;
        const mText = fText ? JSON.stringify(r).toLowerCase().includes(fText) : true;
        return isDateMatch && mCat && mMethod && mText;
    });
    currentPage = 1; renderList(); updateSummary();
}

function renderList() {
    const container = document.getElementById("table-body");
    container.innerHTML = "";
    
    let pageSize = parseInt(document.getElementById("page-size")?.value);
    if(isNaN(pageSize) || pageSize < 1) pageSize = 10;

    const totalPages = Math.ceil(filteredRecords.length / pageSize) || 1;
    if (currentPage < 1) currentPage = 1; 
    if (currentPage > totalPages) currentPage = totalPages;

    const displayItems = filteredRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const totalCountEl = document.getElementById("total-count");
    if(totalCountEl) totalCountEl.innerText = filteredRecords.length;

    if(displayItems.length === 0) {
        container.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:40px; color:#94a3b8;"><i class="fa-solid fa-inbox fa-bounce" style="font-size:24px; margin-bottom:8px;"></i><br>- ไม่พบข้อมูล -</td></tr>`;
        return;
    }

    displayItems.forEach(r => {
        try {
            const thaiDate = formatThaiDate(r.date) || "-";
            let timeStr = "";
            try { if(r.createdAt && r.createdAt.seconds) timeStr = new Date(r.createdAt.seconds * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + " น."; } catch(e){}

            const itemText = r.item || "ไม่มีชื่อ";
            const incomeNum = parseFloat(r.income) || 0;
            const expenseNum = parseFloat(r.expense) || 0;
            const incVal = incomeNum > 0 ? `+${formatNumber(incomeNum)}` : "-";
            const expVal = expenseNum > 0 ? `-${formatNumber(expenseNum)}` : "-";
            
            const cats = Array.isArray(r.category) ? r.category : [r.category || "ทั่วไป"];
            const catHtml = cats.map(c => {
                const col = getColorForCategory(c);
                return `<span class="tag-badge" style="background:${col.bg}; color:${col.text};"><i class="fa-solid fa-tag" style="font-size:10px;"></i> ${c}</span>`;
            }).join("");

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="text-align:center;">
                    <div style="font-weight:600;">${thaiDate}</div>
                    <div style="font-size:12px; color:#94a3b8;">${timeStr}</div>
                </td>
                <td>
                    <div style="font-weight:600; color:#334155;">${itemText}</div>
                    <div style="font-size:12px; color:#94a3b8;">${r.note || ""}</div>
                </td>
                <td style="text-align:right; color:#059669; font-weight:700;">${incVal}</td>
                <td style="text-align:right; color:#e11d48; font-weight:700;">${expVal}</td>
                <td style="text-align:center;">${catHtml}</td>
                <td style="text-align:center;">
                <span class="method-pill"><i class="fa-solid fa-credit-card" style="font-size:10px; color:#64748b;"></i> ${r.method || "-"}</span>
                </td>
                <td style="text-align:center;">
                <div style="display:flex; gap:6px; justify-content:center;">
                    <button style="background:#fff7ed; color:#ea580c; border:1px solid #ffedd5; padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer;" onclick="window.editRecord('${r.id}')" title="แก้ไข"><i class="fa-solid fa-pen"></i></button>
                    <button style="background:#fef2f2; color:#b91c1c; border:1px solid #fee2e2; padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer;" onclick="window.deleteRecord('${r.id}')" title="ลบ"><i class="fa-solid fa-trash"></i></button>
                </div>
                </td>
            `;
            container.appendChild(tr);
        } catch (rowErr) {
            console.error("Error rendering row:", rowErr);
        }
    });
    
    const paginationEl = document.getElementById("pagination-controls");
    if(paginationEl) {
        paginationEl.innerHTML = `
            <button onclick="window.changePage(-1)" ${currentPage <= 1 ? 'disabled' : ''} style="padding:4px 10px; cursor:pointer; background:#fff; border:1px solid #e2e8f0; border-radius:4px;"><i class="fa-solid fa-chevron-left"></i></button>
            <span style="font-size:13px; color:#64748b; align-self:center;">${currentPage} / ${totalPages}</span>
            <button onclick="window.changePage(1)" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:4px 10px; cursor:pointer; background:#fff; border:1px solid #e2e8f0; border-radius:4px;"><i class="fa-solid fa-chevron-right"></i></button>`;
    }
}

function updateSummary() {
    const inc = filteredRecords.reduce((s,r)=>s+(parseFloat(r.income)||0),0);
    const exp = filteredRecords.reduce((s,r)=>s+(parseFloat(r.expense)||0),0);
    document.getElementById("sum-income").innerText = formatNumber(inc);
    document.getElementById("sum-expense").innerText = formatNumber(exp);
    const net = inc - exp;
    const netEl = document.getElementById("sum-net");
    netEl.innerText = formatNumber(net);
    netEl.style.color = net >= 0 ? '#0284c7' : '#e11d48';
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
            
            // เช็กรายรับรวม
            const incomeVal = parseFloat(inc.value) || 0;
            const expenseVal = parseFloat(exp.value) || 0;
            const currentTotalIncome = allRecords.reduce((sum, r) => sum + (Number(r.income) || 0), 0);
            
            if (expenseVal > 0 && currentTotalIncome <= 0) {
                alert("⚠️ ไม่สามารถบันทึกรายจ่ายได้ เนื่องจากยอดรายรับรวมยังเป็น 0 ครับ \nกรุณาบันทึกรายรับก่อนครับ");
                
                // >>> [UPDATE Fix 2] เคลียร์ข้อมูลและปลดล็อกช่องตัวเลข <<<
                inc.value = "";
                exp.value = "";
                inc.disabled = false;
                exp.disabled = false;
                inc.focus(); // นำเคอร์เซอร์ไปช่องรายรับให้
                return;
            }

            saveRecord({
                date: document.getElementById("date").value, item: document.getElementById("item").value,
                category: selectedCategories, method: document.getElementById("method").value,
                income: incomeVal, expense: expenseVal, note: document.getElementById("note").value
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
        document.getElementById("filter-start").value="";
        document.getElementById("filter-end").value="";
        document.getElementById("filter-category").value="";
        document.getElementById("filter-method").value=""; if(ft) ft.value=""; applyFilters();
    });
    document.getElementById("filter-start")?.addEventListener("change", applyFilters);
    document.getElementById("filter-end")?.addEventListener("change", applyFilters);
    
    document.getElementById("page-size")?.addEventListener("change", ()=>{ currentPage=1; renderList(); });
}
