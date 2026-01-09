/**
 * LEGATECH.IO | UNIFIED MASTER CORE
 * Optimized for speed, scannability, and global search.
 */

const _SB_URL = "https://bagqujotwmmsghcemsdi.supabase.co";
const _SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhZ3F1am90d21tc2doY2Vtc2RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1Mjc2MDcsImV4cCI6MjA4MjEwMzYwN30.I0c-C1wBbJ2uLYhBrlcDofhEvKqXpiMh3P7O6bpJByo";
const _supabase = supabase.createClient(_SB_URL, _SB_KEY);

let currentUserID, currentUserRole, currentUserName;
let myChart = null;
let attendanceChart = null;

// --- UTILS & HELPERS ---
const formatTime = (iso) => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';
const getScoreClass = (s) => (s >= 75 ? 'score-high' : s >= 50 ? 'score-mid' : 'score-low');
const toggleModal = (id) => document.getElementById(id).classList.toggle('hidden');

// --- AUTHENTICATION ENGINE ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;
    const code = document.getElementById('access-code').value;

    if (code !== "LEGATECH2025") return alert("INSTITUTIONAL CODE INVALID");

    const { data, error } = await _supabase.auth.signInWithPassword({ email, password: pass });
    if (error) return alert("AUTH ERROR: " + error.message);
    
    initApp(data.user.id, email);
});

async function initApp(uid, email) {
    const { data } = await _supabase.from('profiles').select('*').eq('id', uid).single();
    currentUserID = uid;
    currentUserRole = data?.role || 'teacher';
    currentUserName = data?.full_name || email.split('@')[0];

    // UI Updates based on Role
    document.getElementById('role-badge').innerText = currentUserRole.toUpperCase() + " ACTIVE";
    if (currentUserRole === 'admin') {
        document.getElementById('admin-only-nav').classList.remove('hidden');
        document.getElementById('admin-assign-field').classList.remove('hidden');
        loadAdminControls();
    }

    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-app').classList.remove('hidden');
    document.getElementById('attendance-date').valueAsDate = new Date();
    showSection('dashboard');
}

// --- NAVIGATION & CONTEXTUAL SEARCH ---
function showSection(name) {
    document.querySelectorAll('.content-sec').forEach(s => s.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    
    document.getElementById('sec-' + name).classList.remove('hidden');
    document.getElementById('btn-' + name).classList.add('active');
    document.getElementById('section-title').innerText = name.toUpperCase();
    
    // Clear search bar when switching sections
    document.getElementById('global-search').value = "";

    const loaders = {
        dashboard: refreshDashboard,
        students: loadStudentHub,
        attendance: loadAttendanceList,
        grades: loadGrades,
        permissions: loadPermissions,
        remarks: loadRemarks,
        admin: loadStaffList
    };
    if (loaders[name]) loaders[name]();
}

/**
 * GLOBAL SEARCH LOGIC
 * Instantly filters current viewable data without database calls.
 */
function handleGlobalSearch(query) {
    const q = query.toLowerCase();
    const activeSection = document.querySelector('.content-sec:not(.hidden)').id;

    if (activeSection === 'sec-students') {
        document.querySelectorAll('#student-list > div').forEach(card => {
            const name = card.querySelector('p.font-black').innerText.toLowerCase();
            card.style.display = name.includes(q) ? 'flex' : 'none';
        });
    } else if (activeSection === 'sec-attendance') {
        document.querySelectorAll('#attendance-list tr').forEach(row => {
            const name = row.querySelector('td:first-child').innerText.toLowerCase();
            row.style.display = name.includes(q) ? 'table-row' : 'none';
        });
    } else if (activeSection === 'sec-grades') {
        document.querySelectorAll('#grade-table-body > div').forEach(item => {
            const text = item.innerText.toLowerCase();
            item.style.display = text.includes(q) ? 'flex' : 'none';
        });
    } else if (activeSection === 'sec-permissions') {
        document.querySelectorAll('#requests-list tr').forEach(row => {
            row.style.display = row.innerText.toLowerCase().includes(q) ? 'table-row' : 'none';
        });
    }
}

// --- DASHBOARD & SMART HUD ---
async function refreshDashboard() {
    await updateSmartAgenda();
    
    // Total Students Stat
    let qS = _supabase.from('students').select('*', { count: 'exact', head: true });
    if (currentUserRole !== 'admin') qS = qS.eq('teacher_id', currentUserID);
    const { count } = await qS;
    document.getElementById('stat-students').innerText = count || 0;

    // Daily Attendance Stat
    const today = new Date().toISOString().split('T')[0];
    let qA = _supabase.from('attendance').select('status, students!inner(teacher_id)').eq('date', today);
    if (currentUserRole !== 'admin') qA = qA.eq('students.teacher_id', currentUserID);
    const { data: attData } = await qA;
    
    if (attData?.length > 0 && count > 0) {
        const pres = attData.filter(a => a.status === 'present').length;
        document.getElementById('stat-attendance').innerText = Math.round((pres / count) * 100) + "%";
    } else {
        document.getElementById('stat-attendance').innerText = "0%";
    }
    
    // Parallel Updates for Performance
    calculateTopStudent(); 
    updateZigzag(); 
    updateRisk(); 
    updateAttendanceTrend();
}

async function updateSmartAgenda() {
    const hud = document.getElementById('smart-agenda-hud');
    let html = '';

    if (currentUserRole === 'admin') {
        const [{ count: reqs }, { count: profs }] = await Promise.all([
            _supabase.from('requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
            _supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher')
        ]);
        html = `
            <div class="bg-indigo-50 p-4 rounded-2xl flex items-center gap-3 border border-indigo-100">
                <div class="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center"><i class="fas fa-clock"></i></div>
                <div><p class="text-[9px] font-black text-indigo-400 uppercase italic">Action Required</p><p class="text-xs font-bold">${reqs || 0} Requests</p></div>
            </div>
            <div class="bg-amber-50 p-4 rounded-2xl flex items-center gap-3 border border-amber-100">
                <div class="w-10 h-10 bg-amber-500 text-white rounded-xl flex items-center justify-center"><i class="fas fa-users"></i></div>
                <div><p class="text-[9px] font-black text-amber-400 uppercase italic">Faculty</p><p class="text-xs font-bold">${profs || 0} Staff Active</p></div>
            </div>`;
    } else {
        const { data: alerts } = await _supabase.from('grades').select('student_id, students!inner(teacher_id)').lt('class_score', 15).eq('students.teacher_id', currentUserID);
        const uniqueAlerts = [...new Set(alerts?.map(a => a.student_id))].length;
        html = `
            <div class="bg-rose-50 p-4 rounded-2xl flex items-center gap-3 border border-rose-100">
                <div class="w-10 h-10 bg-rose-500 text-white rounded-xl flex items-center justify-center"><i class="fas fa-exclamation-triangle"></i></div>
                <div><p class="text-[9px] font-black text-rose-400 uppercase italic">Priority</p><p class="text-xs font-bold">${uniqueAlerts} Failing Students</p></div>
            </div>
            <div class="bg-emerald-50 p-4 rounded-2xl flex items-center gap-3 border border-emerald-100">
                <div class="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center"><i class="fas fa-check-double"></i></div>
                <div><p class="text-[9px] font-black text-emerald-400 uppercase italic">Sync Status</p><p class="text-xs font-bold">Cloud Live</p></div>
            </div>`;
    }
    hud.innerHTML = html;
}

// --- CHARTING ENGINES ---
async function updateAttendanceTrend() {
    const dates = [...Array(7)].map((_, i) => {
        const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().split('T')[0];
    }).reverse();

    let q = _supabase.from('attendance').select('date, status, students!inner(teacher_id)');
    if (currentUserRole !== 'admin') q = q.eq('students.teacher_id', currentUserID);
    const { data } = await q.in('date', dates);

    let qTotal = _supabase.from('students').select('*', { count: 'exact', head: true });
    if (currentUserRole !== 'admin') qTotal = qTotal.eq('teacher_id', currentUserID);
    const { count: total } = await qTotal;

    const dataPoints = dates.map(d => {
        const present = data?.filter(a => a.date === d && a.status === 'present').length || 0;
        return total > 0 ? (present / total) * 100 : 0;
    });

    const ctx = document.getElementById('attendanceSparkline').getContext('2d');
    if (attendanceChart) attendanceChart.destroy();
    attendanceChart = new Chart(ctx, {
        type: 'line',
        data: { labels: dates, datasets: [{ data: dataPoints, borderColor: '#6366f1', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0 }] },
        options: { plugins: { legend: false }, scales: { x: { display: false }, y: { display: false, min: 0, max: 100 } }, responsive: true, maintainAspectRatio: false }
    });
}

async function updateZigzag() {
    let q = _supabase.from('grades').select('subject, class_score, exam_score, students!inner(teacher_id)').neq('subject', 'BEHAVIOUR');
    if (currentUserRole !== 'admin') q = q.eq('students.teacher_id', currentUserID);
    const { data } = await q;
    
    if (!data?.length) return;
    const stats = {};
    data.forEach(g => {
        const sub = g.subject.toUpperCase();
        if (!stats[sub]) stats[sub] = { sum: 0, count: 0 };
        stats[sub].sum += (g.class_score + g.exam_score);
        stats[sub].count++;
    });

    const labels = Object.keys(stats);
    const values = labels.map(l => Math.round(stats[l].sum / stats[l].count));

    const ctx = document.getElementById('progressChart').getContext('2d');
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Performance %', data: values, borderColor: '#6366f1', backgroundColor: 'rgba(99, 102, 241, 0.05)', fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } } }
    });
}

// --- REGISTRY & MODALS ---
async function loadStudentHub(filterT = 'all') {
    let q = _supabase.from('students').select('*');
    if (currentUserRole !== 'admin') q = q.eq('teacher_id', currentUserID);
    else if (filterT !== 'all') q = q.eq('teacher_id', filterT);
    
    const { data: stds } = await q.order('name');
    document.getElementById('student-list').innerHTML = (stds || []).map(s => `
        <div class="bg-white p-6 rounded-[2rem] border flex justify-between items-center group shadow-sm hover:border-indigo-200 transition">
            <div class="flex items-center gap-4">
                <div class="w-10 h-10 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center font-black">${s.name.charAt(0)}</div>
                <div><p class="font-black text-sm text-slate-800">${s.name}</p><p class="text-[9px] text-indigo-400 font-black uppercase tracking-widest">${s.grade_level}</p></div>
            </div>
            <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                <button onclick="openEditStudent('${s.id}')" class="text-indigo-500 bg-indigo-50 w-8 h-8 rounded-full flex items-center justify-center"><i class="fas fa-pen text-[10px]"></i></button>
                <button onclick="openRemarkModal('${s.id}','${s.name}')" class="text-emerald-500 bg-emerald-50 w-8 h-8 rounded-full flex items-center justify-center"><i class="fas fa-comment text-[10px]"></i></button>
                <button onclick="deleteItem('students', '${s.id}', loadStudentHub)" class="text-rose-400 bg-rose-50 w-8 h-8 rounded-full flex items-center justify-center"><i class="fas fa-trash text-[10px]"></i></button>
            </div>
        </div>`).join('');
}

// --- ACADEMIC LEDGER ---
async function loadGrades() {
    let qS = _supabase.from('students').select('id, name');
    if (currentUserRole !== 'admin') qS = qS.eq('teacher_id', currentUserID);
    const { data: stds } = await qS;
    document.getElementById('grade-student-select').innerHTML = stds.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    let qG = _supabase.from('grades').select('*, students!inner(name, teacher_id)').neq('subject', 'BEHAVIOUR');
    if (currentUserRole !== 'admin') qG = qG.eq('students.teacher_id', currentUserID);
    const { data: gs } = await qG.order('created_at', { ascending: false });

    document.getElementById('grade-table-body').innerHTML = (gs || []).map(g => {
        const total = g.class_score + g.exam_score;
        return `
        <div class="p-6 flex justify-between items-center group hover:bg-slate-50 transition">
            <div class="flex items-center gap-6">
                <div class="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center font-black text-indigo-600">${total}</div>
                <div>
                    <b class="text-slate-700 block">${g.students.name}</b>
                    <span class="text-[10px] font-black text-slate-400 uppercase">${g.subject}</span>
                </div>
            </div>
            <button onclick="deleteItem('grades', '${g.id}', loadGrades)" class="text-rose-300 opacity-0 group-hover:opacity-100 transition px-4"><i class="fas fa-trash-alt"></i></button>
        </div>`;
    }).join('');
}

// --- ATTENDANCE SYSTEM ---
async function loadAttendanceList() {
    const date = document.getElementById('attendance-date').value;
    let qS = _supabase.from('students').select('*');
    if (currentUserRole !== 'admin') qS = qS.eq('teacher_id', currentUserID);
    const { data: stds } = await qS.order('name');
    const { data: att } = await _supabase.from('attendance').select('*').eq('date', date);

    document.getElementById('attendance-list').innerHTML = (stds || []).map(s => {
        const r = att?.find(a => a.student_id === s.id);
        return `
        <tr class="hover:bg-slate-50/50 transition">
            <td class="p-6 font-bold text-slate-700">${s.name}</td>
            <td class="p-6 text-right space-x-2">
                <button onclick="markAt('${s.id}','present')" class="px-6 py-2 rounded-xl text-[10px] font-black transition ${r?.status === 'present' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}">PRESENT</button>
                <button onclick="markAt('${s.id}','absent')" class="px-6 py-2 rounded-xl text-[10px] font-black transition ${r?.status === 'absent' ? 'bg-rose-500 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}">ABSENT</button>
            </td>
        </tr>`;
    }).join('');
}

async function markAt(sid, stat) {
    const date = document.getElementById('attendance-date').value;
    await _supabase.from('attendance').upsert({
        student_id: sid, date, status: stat, teacher_id: currentUserID, teacher_name: currentUserName, marked_at: new Date()
    }, { onConflict: 'student_id, date' });
    loadAttendanceList();
    refreshDashboard();
}

// --- GLOBAL HELPERS (DELETE/MODAL) ---
async function deleteItem(table, id, callback) {
    if (!confirm("CONFIRM DELETION: THIS DATA WILL BE PERMANENTLY ERASED.")) return;
    const { error } = await _supabase.from(table).delete().eq('id', id);
    if (error) alert("DELETE ERROR: " + error.message);
    else { callback(); refreshDashboard(); }
}

// --- REMAINING EVENT LISTENERS ---
document.getElementById('form-add-grade').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        student_id: document.getElementById('grade-student-select').value,
        subject: document.getElementById('grade-subject').value,
        class_score: Number(document.getElementById('class-score').value),
        exam_score: Number(document.getElementById('exam-score').value)
    };
    await _supabase.from('grades').insert([payload]);
    toggleModal('modal-add-grade'); loadGrades(); refreshDashboard();
});

// Admin Profile Setup
async function loadAdminControls() {
    const { data } = await _supabase.from('profiles').select('id, full_name').eq('role', 'teacher');
    document.getElementById('filter-container').innerHTML = `
        <select onchange="loadStudentHub(this.value)" class="p-3 bg-white border rounded-xl font-black text-[10px] uppercase shadow-sm">
            <option value="all">Global Database</option>
            ${data.map(t => `<option value="${t.id}">${t.full_name}</option>`).join('')}
        </select>`;
    document.getElementById('std-teacher-assign').innerHTML = data.map(t => `<option value="${t.id}">${t.full_name}</option>`).join('');
}
