// ==========================================
// LIFE & MONEY - GOALS & PRECISE LUNAR APP
// ==========================================

const firebaseConfig = {
    apiKey: "AIzaSyDdEaJvVRRzfcM_IkTjdP0Livz52IQqrMs",
  authDomain: "life-money-f6a11.firebaseapp.com",
  projectId: "life-money-f6a11",
  storageBucket: "life-money-f6a11.firebasestorage.app",
  messagingSenderId: "284442463922",
  appId: "1:284442463922:web:4a0ac661bcdf6f652d83ab",
  measurementId: "G-1WQ6WPG39C"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let syncId = localStorage.getItem('lm_sync_id') || 'sam_quanlythuchi_2026';

let state = {
    currentDate: new Date(),
    selectedDate: new Date(),
    activeTab: 'home',
    transactions: [],
    tasks: [],
    goals: [], // Danh sách mục tiêu (mua nhà, mua xe...)
    settings: { goal: 5000000, budget: 10000000 }
};

let isSyncing = false;
let unsubscribeFirestore = null;

function getLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Thuật toán Âm lịch chuẩn xác Việt Nam (Hồ Chí Minh GMT+7)
const LunarCalendar = (function() {
    const INT = Math.floor;
    function jdn(dd, mm, yy) {
        let a = INT((14 - mm) / 12);
        let y = yy + 4800 - a;
        let m = mm + 12 * a - 3;
        let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045;
        if (jd < 2299161) jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
        return jd;
    }
    const TIMEZONE = 7.0;
    function getNewMoonDay(k, timeZone) {
        let T = k / 123685.0531507;
        let T2 = T * T;
        let T3 = T2 * T;
        let dr = Math.PI / 180.0;
        let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
        let M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
        let Mprime = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
        let F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
        let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * M * dr);
        C1 -= 0.4068 * Math.sin(Mprime * dr) + 0.0161 * Math.sin(2 * Mprime * dr);
        C1 -= 0.0004 * Math.sin(3 * Mprime * dr) + 0.0104 * Math.sin(2 * F * dr) - 0.0051 * Math.sin((M + Mprime) * dr);
        return INT(Jd1 + C1 + 0.5 + timeZone / 24.0);
    }
    function getLunarMonth11(yy, timeZone) {
        let off = jdn(31, 12, yy) - 2415021;
        let k = INT(off / 29.53058868);
        let nm = getNewMoonDay(k, timeZone);
        if (getSunLongitude(nm, timeZone) >= 9) nm = getNewMoonDay(k - 1, timeZone);
        return nm;
    }
    function getSunLongitude(jdnVal, timeZone) {
        let T = (jdnVal - 2451545.0 - timeZone / 24.0) / 36525.0;
        let L0 = 280.46646 + 36000.76983 * T;
        let M = 357.52911 + 35999.05029 * T;
        let C = 1.914602 * Math.sin(M * Math.PI / 180.0);
        let L = L0 + C;
        while (L < 0) L += 360;
        while (L >= 360) L -= 360;
        return INT(L / 30);
    }
    return {
        convertSolarToLunar: function(solarDate) {
            let dd = solarDate.getDate(), mm = solarDate.getMonth() + 1, yy = solarDate.getFullYear();
            let jd = jdn(dd, mm, yy);
            let k = INT((jd - 2415020.75933) / 29.53058868);
            let nm = getNewMoonDay(k, TIMEZONE);
            if (nm > jd) { k--; nm = getNewMoonDay(k, TIMEZONE); }
            let lDay = jd - nm + 1;
            let a11 = getLunarMonth11(yy, TIMEZONE);
            if (a11 >= nm) a11 = getLunarMonth11(yy - 1, TIMEZONE);
            let lunarMonth = INT((nm - a11) / 29.5 + 0.5) + 11;
            if (lunarMonth > 12) lunarMonth -= 12;
            return { day: lDay, month: lunarMonth, year: yy };
        }
    };
})();

function saveData() {
    if (isSyncing) return;
    
    const docRef = doc(db, 'shared_data', syncId);
    setDoc(docRef, {
        transactions: state.transactions,
        tasks: state.tasks,
        goals: state.goals,
        settings: state.settings,
        updatedAt: new Date().toISOString()
    }, { merge: true }).catch(err => console.error("Lỗi đồng bộ:", err));

    localStorage.setItem('lm_transactions', JSON.stringify(state.transactions));
    localStorage.setItem('lm_tasks', JSON.stringify(state.tasks));
    localStorage.setItem('lm_goals', JSON.stringify(state.goals));
    localStorage.setItem('lm_settings', JSON.stringify(state.settings));
    updateUI();
}

function initRealtimeSync() {
    if (unsubscribeFirestore) unsubscribeFirestore();

    const docRef = doc(db, 'shared_data', syncId);
    unsubscribeFirestore = onSnapshot(docRef, (docSnap) => {
        isSyncing = true;
        if (docSnap.exists()) {
            const data = docSnap.data();
            state.transactions = data.transactions || [];
            state.tasks = data.tasks || [];
            state.goals = data.goals || [
                { id: 1, title: '🏠 Mua nhà mới', target: 500000000, current: 120000000, deadline: '2028-12-31' },
                { id: 2, title: '🚗 Mua ô tô gia đình', target: 600000000, current: 80000000, deadline: '2027-06-30' },
                { id: 3, title: '✈️ Du lịch Châu Âu', target: 80000000, current: 35000000, deadline: '2026-11-30' }
            ];
            state.settings = data.settings || { goal: 5000000, budget: 10000000 };
        } else {
            state.transactions = [
                { id: Date.now(), type: 'income', amount: 15000000, category: 'Lương', date: getLocalDateString(new Date()), note: 'Lương tháng' }
            ];
            state.tasks = [
                { id: Date.now() + 1, title: 'Kiểm tra hệ thống kho bãi', date: getLocalDateString(new Date()), type: 'task', status: 'open', time: '09:00' }
            ];
            state.goals = [
                { id: 1, title: '🏠 Mua nhà mới', target: 500000000, current: 120000000, deadline: '2028-12-31' },
                { id: 2, title: '🚗 Mua ô tô gia đình', target: 600000000, current: 80000000, deadline: '2027-06-30' }
            ];
            saveData();
        }
        const goalEl = document.getElementById('goal');
        const budgetEl = document.getElementById('budget');
        if (goalEl) goalEl.value = state.settings.goal;
        if (budgetEl) budgetEl.value = state.settings.budget;
        isSyncing = false;
        updateUI();
    }, (error) => {
        isSyncing = false;
        console.error("Lỗi kết nối thời gian thực:", error);
    });
}

function formatVND(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount).replace('₫', '₫');
}

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

function renderCalendar(containerId, monthTitleId) {
    const container = document.getElementById(containerId);
    const titleEl = document.getElementById(monthTitleId);
    if (!container) return;

    container.innerHTML = '';
    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth();
    
    if (titleEl) titleEl.textContent = `Tháng ${month + 1}, ${year}`;

    ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].forEach(wd => {
        const div = document.createElement('div');
        div.className = 'weekday';
        div.textContent = wd;
        container.appendChild(div);
    });

    const firstDayIndex = new Date(year, month, 1).getDay();
    const startDay = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevTotalDays = new Date(year, month, 0).getDate();

    const todayStr = getLocalDateString(new Date());
    const selStr = getLocalDateString(state.selectedDate);

    for (let i = startDay - 1; i >= 0; i--) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'day out';
        dayDiv.innerHTML = `<div class="solar">${prevTotalDays - i}</div>`;
        container.appendChild(dayDiv);
    }

    for (let d = 1; d <= totalDays; d++) {
        const dateObj = new Date(year, month, d);
        const dateStr = getLocalDateString(dateObj);
        
        const dayDiv = document.createElement('div');
        dayDiv.className = 'day';
        if (dateStr === todayStr) dayDiv.classList.add('today');
        if (dateStr === selStr) dayDiv.classList.add('sel');

        const lunar = LunarCalendar.convertSolarToLunar(dateObj);
        const lunarStr = `${lunar.day}/${lunar.month}${lunar.day === 1 ? ' (M1)' : ''}`;

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
            state.selectedDate = new Date(year, month, d);
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
        if (tr.date && tr.date.startsWith(curYearMonth)) {
            if (tr.type === 'income') totalInc += Number(tr.amount);
            else totalExp += Number(tr.amount);
        }
    });

    const balance = totalInc - totalExp;

    const incEl = document.getElementById('income');
    const expEl = document.getElementById('expense');
    const balEl = document.getElementById('balance');

    if (incEl) incEl.textContent = formatVND(totalInc);
    if (expEl) expEl.textContent = formatVND(totalExp);
    
    if (balEl) {
        balEl.textContent = formatVND(balance);
        balEl.className = `metric ${balance >= 0 ? 'green' : 'red'}`;
    }

    const savingVal = Math.max(0, balance);
    const goal = state.settings.goal || 1;
    const percent = Math.min(100, Math.round((savingVal / goal) * 100));

    const savingEl = document.getElementById('saving');
    const savingBarEl = document.getElementById('savingbar');
    const savingLabelEl = document.getElementById('savinglabel');

    if (savingEl) savingEl.textContent = formatVND(savingVal);
    if (savingBarEl) savingBarEl.style.width = `${percent}%`;
    if (savingLabelEl) savingLabelEl.textContent = `Đã đạt ${percent}% mục tiêu tháng (${formatVND(goal)})`;

    renderAgenda();
    renderRecentTransactions();
    renderFinanceList();
    renderTaskList();
    renderStats();
    renderGoalsList();
}

function renderGoalsList() {
    const goalListEl = document.getElementById('goallist');
    if (!goalListEl) return;

    if (!state.goals || state.goals.length === 0) {
        goalListEl.innerHTML = `<div class="empty">Chưa có mục tiêu lớn nào. Hãy thêm mới!</div>`;
        return;
    }

    let html = '';
    state.goals.forEach(g => {
        const percent = Math.min(100, Math.round((g.current / g.target) * 100));
        html += `
            <div style="padding:12px 0; border-bottom:1px solid #edf1f5">
                <div class="row" style="margin-bottom:6px">
                    <div><b>${g.title}</b><div class="muted small">⏰ Hạn: ${g.deadline}</div></div>
                    <div style="text-align:right">
                        <span style="font-weight:700; color:#087f68">${formatVND(g.current)}</span> / ${formatVND(g.target)}
                        <button class="btn danger small" style="margin-left:8px; padding:2px 6px;" onclick="deleteGoal(${g.id})">Xóa</button>
                    </div>
                </div>
                <div class="row" style="margin-bottom:4px"><span class="muted small">Tiến độ: ${percent}%</span><button class="btn small" style="padding:1px 6px; font-size:11px;" onclick="addFundToGoal(${g.id})">＋ Nạp tiền</button></div>
                <div class="bar"><span style="width:${percent}%"></span></div>
            </div>
        `;
    });
    goalListEl.innerHTML = html;
}

window.deleteGoal = function(id) {
    if (confirm('Xóa mục tiêu này?')) {
        state.goals = state.goals.filter(g => g.id !== id);
        saveData();
    }
};

window.addFundToGoal = function(id) {
    const goal = state.goals.find(g => g.id === id);
    if (!goal) return;
    const amountStr = prompt(`Nhập số tiền muốn nạp thêm cho mục tiêu "${goal.title}" (₫):`, "5000000");
    if (amountStr && !isNaN(amountStr)) {
        goal.current += Number(amountStr);
        saveData();
        alert('Cập nhật tiến độ thành công!');
    }
};

function renderAgenda() {
    const agendaEl = document.getElementById('agenda');
    if (!agendaEl) return;
    const todayStr = getLocalDateString(new Date());
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
        if (monthFilter && tr.date && !tr.date.startsWith(monthFilter)) return false;
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
        if (tr.date && tr.date.startsWith(targetMonth)) {
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
    if (!modal) return;
    modal.classList.add('open');
    const today = getLocalDateString(state.selectedDate);

    if (mode === 'finance') {
        modalTitle.textContent = 'Thêm Giao dịch mới';
        formFields.innerHTML = `
            <div><label>Loại giao dịch</label><select id="m_type" class="field" onchange="updateCategoryOptions()"><option value="expense">Khoản chi</option><option value="income">Khoản thu</option></select></div>
            <div><label>Số tiền (₫)</label><input id="m_amount" type="number" min="0" step="10000" class="field" required placeholder="50000"></div>
            <div><label>Danh mục</label><select id="m_category" class="field"><option value="Ăn uống">Ăn uống</option><option value="Nhà cửa">Nhà cửa</option><option value="Đi lại">Đi lại</option><option value="Mua sắm">Mua sắm</option><option value="Hóa đơn">Hóa đơn</option><option value="Khác">Khác</option></select></div>
            <div><label>Ngày giao dịch</label><input id="m_date" type="date" class="field" value="${today}" required></div>
            <div class="wide"><label>Nội dung / Ghi chú</label><input id="m_note" type="text" class="field" placeholder="Mô tả..."></div>
        `;
    } else if (mode === 'goal') {
        modalTitle.textContent = 'Thêm Mục tiêu tài chính mới';
        formFields.innerHTML = `
            <div class="wide"><label>Tên mục tiêu (VD: Mua nhà, Mua xe, Du lịch)</label><input id="g_title" type="text" class="field" required placeholder="Nhập tên mục tiêu..."></div>
            <div><label>Số tiền mục tiêu (₫)</label><input id="g_target" type="number" min="0" step="1000000" class="field" required placeholder="500000000"></div>
            <div><label>Số tiền đã tích lũy hiện tại (₫)</label><input id="g_current" type="number" min="0" step="1000000" class="field" value="0" required></div>
            <div class="wide"><label>Thời hạn hoàn thành</label><input id="g_deadline" type="date" class="field" required></div>
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
    const modal = document.getElementById('modal');
    if (modal) modal.classList.remove('open');
}

function updateUI() {
    renderCalendar('calendar', 'monthtitle');
    renderCalendar('calendar2', 'monthtitle2');
    updateMetrics();
}

document.addEventListener('DOMContentLoaded', () => {
    const userLabelContainer = document.getElementById('userlabel')?.parentElement;
    if (userLabelContainer) {
        userLabelContainer.innerHTML = `
            <div style="display:flex; align-items:center; gap:6px;">
                <span class="muted small">Mã đồng bộ:</span>
                <input id="syncidinput" type="text" value="${syncId}" class="field" style="padding:4px 8px; font-size:12px; width:150px;" title="Nhập mã đồng bộ bảo mật của bạn">
                <button id="saveSyncId" class="btn primary" style="padding:4px 8px; font-size:12px;">Đổi</button>
            </div>
        `;

        document.getElementById('saveSyncId').addEventListener('click', () => {
            const newId = document.getElementById('syncidinput').value.trim();
            if (newId) {
                syncId = newId;
                localStorage.setItem('lm_sync_id', syncId);
                alert(`Đã chuyển sang mã đồng bộ: ${syncId}`);
                initRealtimeSync();
            } else {
                alert('Vui lòng nhập mã đồng bộ hợp lệ!');
            }
        });
    }

    initRealtimeSync();

    document.querySelectorAll('.tabs .tab, [data-goto]').forEach(el => {
        el.addEventListener('click', (e) => {
            const target = e.currentTarget.dataset.page || e.currentTarget.getAttribute('data-goto');
            if (target) switchTab(target);
        });
    });

    ['prev', 'prev2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', () => { state.currentDate.setMonth(state.currentDate.getMonth() - 1); updateUI(); });
    });
    ['today', 'today2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', () => { state.currentDate = new Date(); updateUI(); });
    });
    ['next', 'next2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', () => { state.currentDate.setMonth(state.currentDate.getMonth() + 1); updateUI(); });
    });

    const addTaskBtn1 = document.getElementById('addtask');
    const addTaskBtn2 = document.getElementById('addtask2');
    const addFinanceBtn = document.getElementById('addfinance');
    const addGoalBtn = document.getElementById('addgoalbtn');
    const closeBtn = document.getElementById('close');
    const cancelBtn = document.getElementById('cancel');

    if (addTaskBtn1) addTaskBtn1.addEventListener('click', () => openModal('task'));
    if (addTaskBtn2) addTaskBtn2.addEventListener('click', () => openModal('task'));
    if (addFinanceBtn) addFinanceBtn.addEventListener('click', () => openModal('finance'));
    if (addGoalBtn) addGoalBtn.addEventListener('click', () => openModal('goal'));
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    const filterType = document.getElementById('filtertype');
    const filterMonth = document.getElementById('filtermonth');
    const taskFilter = document.getElementById('taskfilter');
    const taskStatus = document.getElementById('taskstatus');
    const statsMonth = document.getElementById('statsmonth');

    if (filterType) filterType.addEventListener('change', renderFinanceList);
    if (filterMonth) filterMonth.addEventListener('change', renderFinanceList);
    if (taskFilter) taskFilter.addEventListener('change', renderTaskList);
    if (taskStatus) taskStatus.addEventListener('change', renderTaskList);
    if (statsMonth) statsMonth.addEventListener('change', renderStats);

    const form = document.getElementById('form');
    if (form) {
        form.addEventListener('submit', (e) => {
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
            } else if (modalTitle.includes('Mục tiêu tài chính')) {
                state.goals.push({
                    id: Date.now(),
                    title: document.getElementById('g_title').value,
                    target: Number(document.getElementById('g_target').value),
                    current: Number(document.getElementById('g_current').value),
                    deadline: document.getElementById('g_deadline').value
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
    }

    const settingsForm = document.getElementById('settingsform');
    if (settingsForm) {
        settingsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const goalInput = document.getElementById('goal');
            const budgetInput = document.getElementById('budget');
            if (goalInput) state.settings.goal = Number(goalInput.value) || 0;
            if (budgetInput) state.settings.budget = Number(budgetInput.value) || 0;
            saveData();
            alert('Đã lưu cài đặt mục tiêu tháng!');
        });
    }

    updateUI();
});