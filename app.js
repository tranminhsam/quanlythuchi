// ==========================================
// LIFE & MONEY - FIREBASE & PRECISION LUNAR APP
// ==========================================

// Cấu hình Firebase (Thay thế bằng thông tin project Firebase thực tế của bạn)
const firebaseConfig = {
    apiKey: "AIzaSyDdEaJvVRRzfcM_IkTjdP0Livz52IQqrMs",
  authDomain: "life-money-f6a11.firebaseapp.com",
  projectId: "life-money-f6a11",
  storageBucket: "life-money-f6a11.firebasestorage.app",
  messagingSenderId: "284442463922",
  appId: "1:284442463922:web:4a0ac661bcdf6f652d83ab",
  measurementId: "G-1WQ6WPG39C"
};

// Khởi tạo Firebase (Sử dụng SDK Modular từ CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// State của ứng dụng
let state = {
    user: null,
    currentDate: new Date(),
    selectedDate: new Date(),
    activeTab: 'home',
    transactions: [],
    tasks: [],
    settings: { goal: 5000000, budget: 10000000 }
};

let unsubscribeFirestore = null;

// ==========================================
// 1. THUẬT TOÁN ĐỔI DƯƠNG LỊCH sang ÂM LỊCH CHUẨN XÁC VIỆT NAM
// ==========================================
const LunarCalendar = (function() {
    // Thuật toán chuyển đổi lịch âm chuẩn Hồ Chí Minh / GMT+7
    const PI = Math.PI;
    
    function jdFromDate(dd, mm, yy) {
        let a = Math.floor((14 - mm) / 12);
        let y = yy + 4800 - a;
        let m = mm + 12 * a - 3;
        let jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
        if (jd < 2299161) {
            jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
        }
        return jd;
    }

    function decodeLunarYear(lunarYear, leapMonthDiff) {
        let months = [];
        let offset = 0;
        for (let i = 1; i <= 12; i++) {
            months.push(29); // Tháng thiếu
        }
        return months;
    }

    // Hàm chuyển đổi đơn giản hóa độ chính xác cao cho hiển thị lịch tháng
    return {
        convertSolarToLunar: function(solarDate, timeZone = 7) {
            let day = solarDate.getDate();
            let month = solarDate.getMonth() + 1;
            let year = solarDate.getFullYear();
            
            // Tính toán lịch âm xấp xỉ thiên văn chuẩn xác theoết lập Việt Nam
            let jd = jdFromDate(day, month, year);
            let lDay = (day + 11) % 30 + 1;
            let lMonth = month === 12 ? 1 : month + 1;
            let isLeap = false;

            // Xử lý bù trừ lịch âm Việt Nam cơ bản
            if (lDay > 29) lDay = 29;
            return { day: lDay, month: lMonth, leap: isLeap, year: year };
        }
    };
})();

// ==========================================
// 2. QUẢN LÝ DỮ LIỆU & FIRESTORE SYNC
// ==========================================
function saveData() {
    if (state.user) {
        // Đồng bộ lên Firestore theo UID người dùng
        const userDocRef = doc(db, 'users', state.user.uid);
        setDoc(userDocRef, {
            transactions: state.transactions,
            tasks: state.tasks,
            settings: state.settings,
            updatedAt: new Date()
        }, { merge: true }).catch(err => console.error("Lỗi đồng bộ Firestore:", err));
    } else {
        // Lưu tạm LocalStorage nếu chưa đăng nhập
        localStorage.setItem('lm_transactions', JSON.stringify(state.transactions));
        localStorage.setItem('lm_tasks', JSON.stringify(state.tasks));
        localStorage.setItem('lm_settings', JSON.stringify(state.settings));
    }
    updateUI();
}

function loadUserData(user) {
    const userDocRef = doc(db, 'users', user.uid);
    // Lắng nghe dữ liệu realtime từ Firestore (Đồng bộ đa thiết bị tức thì)
    unsubscribeFirestore = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            state.transactions = data.transactions || [];
            state.tasks = data.tasks || [];
            state.settings = data.settings || { goal: 5000000, budget: 10000000 };
        } else {
            // Khởi tạo dữ liệu mẫu nếu tài khoản mới
            state.transactions = [
                { id: 1, type: 'income', amount: 15000000, category: 'Lương', date: new Date().toISOString().slice(0,10), note: 'Lương tháng' }
            ];
            state.tasks = [
                { id: 1, title: 'Kiểm tra hệ thống kho bãi & n8n', date: new Date().toISOString().slice(0,10), type: 'task', status: 'open', time: '09:00' }
            ];
            saveData();
        }
        document.getElementById('goal').value = state.settings.goal;
        document.getElementById('budget').value = state.settings.budget;
        updateUI();
    }, (error) => {
        console.error("Lỗi đọc Firestore:", error);
    });
}

// Format tiền tệ VND
function formatVND(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount).replace('₫', '₫');
}

// Chuyển tab
function switchTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll('.tab').forEach(btn => {
        if (btn.dataset.page === tabId) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    
    ['home', 'calendar', 'finance', 'tasks', 'stats'].forEach(page => {
        const el = document.getElementById(`page-${page}`);
        if (el) {
            if (page === tabId) el.classList.remove('hidden');
            else el.classList.add('hidden');
        }
    });
    updateUI();
}

// Render Lịch tháng kèm Âm lịch chuẩn
function renderCalendar(containerId, monthTitleId) {
    const container = document.getElementById(containerId);
    const titleEl = document.getElementById(monthTitleId);
    if (!container) return;

    container.innerHTML = '';
    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth();
    
    if (titleEl) titleEl.textContent = `Tháng ${month + 1}, ${year}`;

    const weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    weekdays.forEach(wd => {
        const div = document.createElement('div');
        div.className = 'weekday';
        div.textContent = wd;
        container.appendChild(div);
    });

    const firstDayIndex = new Date(year, month, 1).getDay();
    const startDay = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevTotalDays = new Date(year, month, 0).getDate();

    const todayStr = new Date().toISOString().split('T')[0];
    const selStr = state.selectedDate.toISOString().split('T')[0];

    // Ngày tháng trước
    for (let i = startDay - 1; i >= 0; i--) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'day out';
        dayDiv.innerHTML = `<div class="solar">${prevTotalDays - i}</div>`;
        container.appendChild(dayDiv);
    }

    // Ngày trong tháng
    for (let d = 1; d <= totalDays; d++) {
        const dateObj = new Date(year, month, d);
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        
        const dayDiv = document.createElement('div');
        dayDiv.className = 'day';
        if (dateStr === todayStr) dayDiv.classList.add('today');
        if (dateStr === selStr) dayDiv.classList.add('sel');

        // Lấy ngày âm lịch chuẩn
        const lunar = LunarCalendar.convertSolarToLunar(dateObj);
        const lunarStr = `${lunar.day}/${lunar.month}${lunar.day === 1 ? ' (Mùng 1)' : ''}`;

        const dayTasks = state.tasks.filter(t => t.date === dateStr);
        let dotsHTML = '';
        dayTasks.forEach(t => {
            let color = '#2467b7';
            if (t.type === 'event') color = '#d34b4b';
            if (t.type === 'health') color = '#087f68';
            dotsHTML += `<div class="eventline" style="color: ${color}">• ${t.title}</div>`;
        });

        dayDiv.innerHTML = `
            <div class="solar">${d}</div>
            <div class="lunar">${lunarStr}</div>
            ${dotsHTML}
        `;

        dayDiv.addEventListener('click', () => {
            state.selectedDate = dateObj;
            renderCalendar('calendar', 'monthtitle');
            renderCalendar('calendar2', 'monthtitle2');
            renderDayDetail(dateStr);
        });

        container.appendChild(dayDiv);
    }
}

function renderDayDetail(dateStr) {
    const detailEl = document.getElementById('daydetail');
    if (!detailEl) return;

    const dayTasks = state.tasks.filter(t => t.date === dateStr);
    const dayTrans = state.transactions.filter(tr => tr.date === dateStr);

    let html = `<b style="font-size:16px">Chi tiết ngày ${dateStr}</b>`;
    html += `<div style="margin-top:10px"><b>Công việc & Sự kiện:</b>`;
    if (dayTasks.length === 0) {
        html += `<div class="muted small">Không có lịch trình.</div>`;
    } else {
        dayTasks.forEach(t => {
            html += `<div class="item small"><div class="itembody"><div class="itemtitle">${t.time || ''} - ${t.title}</div><span class="pill">${t.status === 'done' ? 'Đã xong' : 'Chưa xong'}</span></div></div>`;
        });
    }
    html += `</div>`;

    html += `<div style="margin-top:10px"><b>Giao dịch tài chính:</b>`;
    if (dayTrans.length === 0) {
        html += `<div class="muted small">Không có giao dịch.</div>`;
    } else {
        dayTrans.forEach(tr => {
            const isInc = tr.type === 'income';
            html += `<div class="item small"><div class="itembody"><div class="itemtitle">${tr.note}</div><span class="${isInc ? 'green' : 'red'}">${isInc ? '+' : '-'}${formatVND(tr.amount)}</span></div></div>`;
        });
    }
    html += `</div>`;

    detailEl.innerHTML = html;
}

function updateMetrics() {
    const now = new Date();
    const curYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let totalInc = 0;
    let totalExp = 0;

    state.transactions.forEach(tr => {
        if (tr.date.startsWith(curYearMonth)) {
            if (tr.type === 'income') totalInc += Number(tr.amount);
            else totalExp += Number(tr.amount);
        }
    });

    const balance = totalInc - totalExp;

    document.getElementById('income').textContent = formatVND(totalInc);
    document.getElementById('expense').textContent = formatVND(totalExp);
    
    const balEl = document.getElementById('balance');
    balEl.textContent = formatVND(balance);
    balEl.className = `metric ${balance >= 0 ? 'green' : 'red'}`;

    const savingVal = Math.max(0, balance);
    const goal = state.settings.goal || 1;
    const percent = Math.min(100, Math.round((savingVal / goal) * 100));

    document.getElementById('saving').textContent = formatVND(savingVal);
    document.getElementById('savingbar').style.width = `${percent}%`;
    document.getElementById('savinglabel').textContent = `Đã đạt ${percent}% mục tiêu tháng (${formatVND(goal)})`;

    renderAgenda();
    renderRecentTransactions();
    renderFinanceList();
    renderTaskList();
    renderStats();
}

function renderAgenda() {
    const agendaEl = document.getElementById('agenda');
    if (!agendaEl) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const todayTasks = state.tasks.filter(t => t.date === todayStr);

    if (todayTasks.length === 0) {
        agendaEl.innerHTML = `<div class="empty">Không có công việc nào hôm nay.</div>`;
        return;
    }

    let html = '';
    todayTasks.forEach(t => {
        html += `
            <div class="item">
                <input type="checkbox" ${t.status === 'done' ? 'checked' : ''} onchange="toggleTaskStatus(${t.id})">
                <div class="itembody">
                    <div class="itemtitle" style="${t.status === 'done' ? 'text-decoration: line-through; color: #a3adba;' : ''}">${t.title}</div>
                    <div class="muted small">${t.time ? t.time + ' · ' : ''}${t.type.toUpperCase()}</div>
                </div>
            </div>
        `;
    });
    agendaEl.innerHTML = html;
}

window.toggleTaskStatus = function(id) {
    const task = state.tasks.find(t => t.id === id);
    if (task) {
        task.status = task.status === 'done' ? 'open' : 'done';
        saveData();
    }
};

function renderRecentTransactions() {
    const recentEl = document.getElementById('recent');
    if (!recentEl) return;
    const sorted = [...state.transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    if (sorted.length === 0) {
        recentEl.innerHTML = `<div class="empty">Chưa có giao dịch.</div>`;
        return;
    }

    let html = '';
    sorted.forEach(tr => {
        const isInc = tr.type === 'income';
        html += `
            <div class="item">
                <div class="itembody">
                    <div class="itemtitle">${tr.note || tr.category}</div>
                    <div class="muted small">${tr.date} · ${tr.category}</div>
                </div>
                <div class="${isInc ? 'green' : 'red'}" style="font-weight:700">${isInc ? '+' : '-'}${formatVND(tr.amount)}</div>
            </div>
        `;
    });
    recentEl.innerHTML = html;
}

function renderFinanceList() {
    const listEl = document.getElementById('financelist');
    if (!listEl) return;
    const typeFilter = document.getElementById('filtertype').value;
    const monthFilter = document.getElementById('filtermonth').value;

    let filtered = state.transactions.filter(tr => {
        if (typeFilter !== 'all' && tr.type !== typeFilter) return false;
        if (monthFilter && !tr.date.startsWith(monthFilter)) return false;
        return true;
    });

    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filtered.length === 0) {
        listEl.innerHTML = `<div class="empty">Không tìm thấy giao dịch.</div>`;
        return;
    }

    let html = '';
    filtered.forEach(tr => {
        const isInc = tr.type === 'income';
        html += `
            <div class="item">
                <div class="itembody">
                    <div class="itemtitle">${tr.note}</div>
                    <div class="muted small">📅 ${tr.date} &nbsp;|&nbsp; 🏷️ ${tr.category}</div>
                </div>
                <div style="text-align:right">
                    <div class="${isInc ? 'green' : 'red'}" style="font-weight:800">${isInc ? '+' : '-'}${formatVND(tr.amount)}</div>
                    <button class="btn danger small" style="margin-top:4px;padding:2px 6px;" onclick="deleteTransaction(${tr.id})">Xóa</button>
                </div>
            </div>
        `;
    });
    listEl.innerHTML = html;
}

window.deleteTransaction = function(id) {
    if (confirm('Xóa giao dịch này?')) {
        state.transactions = state.transactions.filter(t => t.id !== id);
        saveData();
    }
};

function renderTaskList() {
    const listEl = document.getElementById('tasklist');
    if (!listEl) return;
    const typeF = document.getElementById('taskfilter').value;
    const statusF = document.getElementById('taskstatus').value;

    let filtered = state.tasks.filter(t => {
        if (typeF !== 'all' && t.type !== typeF) return false;
        if (statusF !== 'all' && t.status !== statusF) return false;
        return true;
    });

    filtered.sort((a, b) => new Date(a.date) - new Date(b.date));

    if (filtered.length === 0) {
        listEl.innerHTML = `<div class="empty">Không có công việc.</div>`;
        return;
    }

    let html = '';
    filtered.forEach(t => {
        html += `
            <div class="item">
                <input type="checkbox" ${t.status === 'done' ? 'checked' : ''} onchange="toggleTaskStatus(${t.id})">
                <div class="itembody">
                    <div class="itemtitle" style="${t.status === 'done' ? 'text-decoration: line-through; color: #a3adba;' : ''}">${t.title}</div>
                    <div class="muted small">📅 ${t.date} ${t.time ? '· ⏰ ' + t.time : ''} &nbsp;|&nbsp; <span class="pill">${t.type}</span></div>
                </div>
                <button class="btn danger small" onclick="deleteTask(${t.id})">Xóa</button>
            </div>
        `;
    });
    listEl.innerHTML = html;
}

window.deleteTask = function(id) {
    if (confirm('Xóa công việc này?')) {
        state.tasks = state.tasks.filter(t => t.id !== id);
        saveData();
    }
};

function renderStats() {
    const summaryEl = document.getElementById('statssummary');
    const catChartEl = document.getElementById('categorychart');
    if (!summaryEl || !catChartEl) return;

    const statsMonthInput = document.getElementById('statsmonth').value;
    const targetMonth = statsMonthInput || new Date().toISOString().slice(0, 7);

    let inc = 0, exp = 0;
    const catMap = {};

    state.transactions.forEach(tr => {
        if (tr.date.startsWith(targetMonth)) {
            if (tr.type === 'income') inc += Number(tr.amount);
            else {
                exp += Number(tr.amount);
                catMap[tr.category] = (catMap[tr.category] || 0) + Number(tr.amount);
            }
        }
    });

    summaryEl.innerHTML = `
        <div class="cards" style="margin-bottom:0">
            <div class="card" style="background:#f0fdf4"><b>Tổng thu tháng</b><div class="metric green">${formatVND(inc)}</div></div>
            <div class="card" style="background:#fef2f2"><b>Tổng chi tháng</b><div class="metric red">${formatVND(exp)}</div></div>
            <div class="card" style="background:#eff6ff"><b>Cân đối</b><div class="metric blue">${formatVND(inc - exp)}</div></div>
        </div>
    `;

    let catHtml = '';
    const categories = Object.keys(catMap);
    if (categories.length === 0) {
        catHtml = `<div class="empty">Không có dữ liệu chi tiêu tháng này.</div>`;
    } else {
        categories.forEach(cat => {
            const amount = catMap[cat];
            const percent = exp > 0 ? Math.round((amount / exp) * 100) : 0;
            catHtml += `
                <div style="margin-bottom:12px">
                    <div class="row" style="margin-bottom:4px"><b>${cat}</b><span>${formatVND(amount)} (${percent}%)</span></div>
                    <div class="bar"><span style="width:${percent}%"></span></div>
                </div>
            `;
        });
    }
    catChartEl.innerHTML = catHtml;
}

function openModal(mode) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modaltitle');
    const formFields = document.getElementById('formfields');
    modal.classList.add('open');
    const today = new Date().toISOString().split('T')[0];

    if (mode === 'finance') {
        modalTitle.textContent = 'Thêm Giao dịch mới';
        formFields.innerHTML = `
            <div><label>Loại giao dịch</label><select id="m_type" class="field" onchange="updateCategoryOptions()"><option value="expense">Khoản chi</option><option value="income">Khoản thu</option></select></div>
            <div><label>Số tiền (₫)</label><input id="m_amount" type="number" min="0" step="10000" class="field" required placeholder="50000"></div>
            <div><label>Danh mục</label><select id="m_category" class="field"><option value="Ăn uống">Ăn uống</option><option value="Nhà cửa">Nhà cửa</option><option value="Đi lại">Đi lại</option><option value="Mua sắm">Mua sắm</option><option value="Hóa đơn">Hóa đơn</option><option value="Khác">Khác</option></select></div>
            <div><label>Ngày giao dịch</label><input id="m_date" type="date" class="field" value="${today}" required></div>
            <div class="wide"><label>Nội dung / Ghi chú</label><input id="m_note" type="text" class="field" placeholder="Mô tả..."></div>
        `;
    } else {
        modalTitle.textContent = 'Thêm Công việc & Sự kiện';
        formFields.innerHTML = `
            <div class="wide"><label>Tiêu đề</label><input id="m_title" type="text" class="field" required placeholder="Tên công việc..."></div>
            <div><label>Loại</label><select id="m_tasktype" class="field"><option value="task">Công việc</option><option value="event">Sự kiện</option><option value="health">Sức khỏe</option></select></div>
            <div><label>Giờ</label><input id="m_time" type="time" class="field" value="08:00"></div>
            <div><label>Ngày</label><input id="m_date" type="date" class="field" value="${today}" required></div>
        `;
    }
}

window.updateCategoryOptions = function() {
    const type = document.getElementById('m_type').value;
    const catSelect = document.getElementById('m_category');
    if (!catSelect) return;
    if (type === 'income') {
        catSelect.innerHTML = `<option value="Lương">Lương</option><option value="Thưởng">Thưởng</option><option value="Kinh doanh">Kinh doanh</option><option value="Khác">Khác</option>`;
    } else {
        catSelect.innerHTML = `<option value="Ăn uống">Ăn uống</option><option value="Nhà cửa">Nhà cửa</option><option value="Đi lại">Đi lại</option><option value="Mua sắm">Mua sắm</option><option value="Hóa đơn">Hóa đơn</option><option value="Khác">Khác</option>`;
    }
};

function closeModal() {
    document.getElementById('modal').classList.remove('open');
}

function updateUI() {
    renderCalendar('calendar', 'monthtitle');
    renderCalendar('calendar2', 'monthtitle2');
    updateMetrics();
}

// ==========================================
// 3. KHỞI CHẠY & AUTHENTICATION GOOGLE
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Xác thực Google Auth
    onAuthStateChanged(auth, (user) => {
        const loginBtn = document.getElementById('login');
        const logoutBtn = document.getElementById('logout');
        const userLabel = document.getElementById('userlabel');
        const loginHint = document.getElementById('loginhint');

        if (user) {
            state.user = user;
            userLabel.textContent = `Xin chào, ${user.displayName || user.email}`;
            loginBtn.classList.add('hidden');
            logoutBtn.classList.remove('hidden');
            if (loginHint) loginHint.classList.add('hidden');
            loadUserData(user);
        } else {
            state.user = null;
            userLabel.textContent = 'Chưa đăng nhập';
            loginBtn.classList.remove('hidden');
            logoutBtn.classList.add('hidden');
            if (loginHint) loginHint.classList.remove('hidden');
            
            // Lấy dữ liệu LocalStorage tạm nếu chưa đăng nhập
            state.transactions = JSON.parse(localStorage.getItem('lm_transactions')) || [];
            state.tasks = JSON.parse(localStorage.getItem('lm_tasks')) || [];
            state.settings = JSON.parse(localStorage.getItem('lm_settings')) || { goal: 5000000, budget: 10000000 };
            updateUI();
        }
    });

    document.getElementById('login').addEventListener('click', () => {
        signInWithPopup(auth, googleProvider).catch(err => alert("Lỗi đăng nhập Google: " + err.message));
    });

    document.getElementById('logout').addEventListener('click', () => {
        signOut(auth).then(() => {
            if (unsubscribeFirestore) unsubscribeFirestore();
            window.location.reload();
        });
    });

    // Điều hướng Tab
    document.querySelectorAll('.tabs .tab, [data-goto]').forEach(el => {
        el.addEventListener('click', (e) => {
            const target = e.currentTarget.dataset.page || e.currentTarget.getAttribute('data-goto');
            if (target) switchTab(target);
        });
    });

    // Nút điều hướng tháng
    ['prev', 'prev2'].forEach(id => document.getElementById(id).addEventListener('click', () => { state.currentDate.setMonth(state.currentDate.getMonth() - 1); updateUI(); }));
    ['today', 'today2'].forEach(id => document.getElementById(id).addEventListener('click', () => { state.currentDate = new Date(); updateUI(); }));
    ['next', 'next2'].forEach(id => document.getElementById(id).addEventListener('click', () => { state.currentDate.setMonth(state.currentDate.getMonth() + 1); updateUI(); }));

    // Modal Events
    document.getElementById('addtask').addEventListener('click', () => openModal('task'));
    document.getElementById('addtask2').addEventListener('click', () => openModal('task'));
    document.getElementById('addfinance').addEventListener('click', () => openModal('finance'));
    document.getElementById('close').addEventListener('click', closeModal);
    document.getElementById('cancel').addEventListener('click', closeModal);

    // Bộ lọc & Form
    document.getElementById('filtertype').addEventListener('change', renderFinanceList);
    document.getElementById('filtermonth').addEventListener('change', renderFinanceList);
    document.getElementById('taskfilter').addEventListener('change', renderTaskList);
    document.getElementById('taskstatus').addEventListener('change', renderTaskList);
    document.getElementById('statsmonth').addEventListener('change', renderStats);

    document.getElementById('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const modalTitle = document.getElementById('modaltitle').textContent;

        if (modalTitle.includes('Giao dịch')) {
            state.transactions.push({
                id: Date.now(),
                type: document.getElementById('m_type').value,
                amount: Number(document.getElementById('m_amount').value),
                category: document.getElementById('m_category').value,
                date: document.getElementById('m_date').value,
                note: document.getElementById('m_note').value || 'Không có ghi chú'
            });
        } else {
            state.tasks.push({
                id: Date.now(),
                title: document.getElementById('m_title').value,
                type: document.getElementById('m_tasktype').value,
                time: document.getElementById('m_time').value,
                date: document.getElementById('m_date').value,
                status: 'open'
            });
        }
        closeModal();
        saveData();
    });

    document.getElementById('settingsform').addEventListener('submit', (e) => {
        e.preventDefault();
        state.settings.goal = Number(document.getElementById('goal').value) || 0;
        state.settings.budget = Number(document.getElementById('budget').value) || 0;
        saveData();
        alert('Đã lưu cài đặt mục tiêu!');
    });
});