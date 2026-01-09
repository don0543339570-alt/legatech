/**
 * LEGATECH.IO | COMPREHENSIVE INSTITUTIONAL CORE
 * Version: 2026.1.A
 * Status: Full Feature Set (No Simplification)
 */

const _SB_URL = "https://bagqujotwmmsghcemsdi.supabase.co";
const _SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhZ3F1am90d21tc2doY2Vtc2RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1Mjc2MDcsImV4cCI6MjA4MjEwMzYwN30.I0c-C1wBbJ2uLYhBrlcDofhEvKqXpiMh3P7O6bpJByo";
const _supabase = supabase.createClient(_SB_URL, _SB_KEY);

let currentUserID, currentUserRole, currentUserName;
let myChart = null;
let attendanceChart = null; 

// --- PROFESSIONAL HELPERS & FORMATTERS ---
const formatTime = (iso) => iso ? new Date(iso).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'N/A';
const getScoreClass = (s) => {
    if (s >= 75) return 'score-high'; 
    if (s >= 50) return 'score-mid';  
    return 'score-low';              
};
function toggleModal(id) { document.getElementById(id).classList.toggle('hidden'); }

// --- AUTHENTICATION ENGINE ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;
    const accessCode = document.getElementById('access-code').value;
    
    if (accessCode !== "LEGATECH2025") return alert("ACCESS DENIED: INVALID INSTITUTIONAL CODE");
    
    const { data, error } = await _supabase.auth.signInWithPassword({ email, password: pass });
    if (error) return alert("AUTH ERROR: " + error.message);
    
    initApp(data.user.id, email);
});

async function initApp(uid, email) {
    // Fetch Profile Details
    const { data: profile, error: pError } = await _supabase.from('profiles').select('*').eq('id', uid).single();
    
    currentUserID = uid; 
    currentUserRole = profile?.role || 'teacher'; 
    currentUserName = profile?.full_name || email.split('@')[0];
    
    document.getElementById('role-badge').innerText = currentUserRole.toUpperCase() + " ACTIVE";
    
    if (currentUserRole === 'admin') {
        document.getElementById('admin-only-nav').classList.remove('hidden');
        document.getElementById('admin-assign-field').classList.remove('hidden');
        loadAdminControls();
    }
    
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-app').classList.remove('hidden');
    document.getElementById('attendance-date').valueAsDate = new Date();
    
    // Initial Route
    showSection('dashboard');
}

// --- NAVIGATION & GLOBAL SEARCH ---
function showSection(name) {
    document.querySelectorAll('.content-sec').forEach(s => s.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    
    document.getElementById('sec-' + name).classList.remove('hidden');
    document.getElementById('btn-' + name).classList.add('active');
    document.getElementById('section-title').innerText = name.toUpperCase();
    
    // Reset Global Search input on switch
    document.getElementById('global-search').value = "";

    // Execution Contexts
    if (name === 'dashboard') refreshDashboard();
    if (name === 'students') loadStudentHub();
    if (name === 'attendance') loadAttendanceList();
    if (name === 'grades') loadGrades();
    if (name === 'permissions') loadPermissions();
    if (name === 'remarks') loadRemarks();
    if (name === 'admin') loadStaffList();
}

/**
 * GLOBAL SEARCH HANDLER
 * High-speed DOM filtering for large datasets
 */
function handleGlobalSearch(query) {
    const q = query.toLowerCase();
    const activeSec = document.querySelector('.content-sec:not(.hidden)').id;

    if (activeSec === 'sec-students') {
        document.querySelectorAll('#student-list > div').forEach(el => {
            el.style.display = el.innerText.toLowerCase().includes(q) ? 'flex' : 'none';
        });
    } else if (activeSec === 'sec-attendance') {
        document.querySelectorAll('#attendance-list tr').forEach(el => {
            el.style.display = el.innerText.toLowerCase().includes(q) ? 'table-row' : 'none';
        });
    } else if (activeSec === 'sec-grades') {
        document.querySelectorAll('#grade-table-body > div').forEach(el => {
            el.style.display = el.innerText.toLowerCase().includes(q) ? 'flex' : 'none';
        });
    } else if (activeSec === 'sec-permissions') {
        document.querySelectorAll('#requests-list tr').forEach(el => {
            el.style.display = el.innerText.toLowerCase().includes(q) ? 'table-row' : 'none';
        });
    }
}

// --- DASHBOARD & ANALYTICS ---
async function refreshDashboard() {
    await updateSmartAgenda();

    // Student Count Logic
    let qS = _supabase.from('students').select('*', { count: 'exact', head: false });
    if (currentUserRole !== 'admin') qS = qS.eq('teacher_id', currentUserID);
    const { count, data: stdData } = await qS;
    document.getElementById('stat-students').innerText = count || 0;

    // Daily Attendance Percentages
    const today = new Date().toISOString().split('T')[0];
    let qA = _supabase.from('attendance').select('status, students!inner(teacher_id)').eq('date', today);
    if (currentUserRole !== 'admin') qA = qA.eq('students.teacher_id', currentUserID);
    const { data: attData } = await qA;
    
    if (attData && attData.length > 0 && count > 0) {
        const pres = attData.filter(a => a.status.toLowerCase() === 'present').length;
        document.getElementById('stat-attendance').innerText = Math.round((pres / count) * 100) + "%";
    } else document.getElementById('stat-attendance').innerText = "0%";
    
    // Core Modules
    calculateTopStudent(); 
    updateZigzag(); 
    updateRisk(); 
    updateAttendanceTrend();
}

async function updateSmartAgenda() {
    const hud = document.getElementById('smart-agenda-hud');
    let html = '';

    if (currentUserRole === 'admin') {
        const { data: reqs } = await _supabase.from('requests').select('id').eq('status', 'pending');
        const { data: profs } = await _supabase.from('profiles').select('id').eq('role', 'teacher');
        html = `
            <div class="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl flex items-center gap-3">
                <div class="w-10 h-10 bg-indigo-500 text-white rounded-xl flex items-center justify-center shadow-lg"><i class="fas fa-bell"></i></div>
                <div><p class="text-[9px] font-black text-indigo-400 uppercase italic">Admin Alert</p><p class="text-xs font-bold text-indigo-900">${reqs?.length || 0} Pending Approvals</p></div>
            </div>
            <div class="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-center gap-3">
                <div class="w-10 h-10 bg-amber-500 text-white rounded-xl flex items-center justify-center shadow-lg"><i class="fas fa-chalkboard-teacher"></i></div>
                <div><p class="text-[9px] font-black text-amber-400 uppercase italic">Staff</p><p class="text-xs font-bold text-amber-900">${profs?.length || 0} Faculty Members</p></div>
            </div>`;
    } else {
        const { data: lowGrades } = await _supabase.from('grades').select('student_id, students!inner(teacher_id)').lt('class_score', 15).eq('students.teacher_id', currentUserID);
        const alertCount = [...new Set(lowGrades?.map(r => r.student_id))].length;
        html = `
            <div class="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center gap-3">
                <div class="w-10 h-10 bg-rose-500 text-white rounded-xl flex items-center justify-center shadow-lg"><i class="fas fa-exclamation-circle"></i></div>
                <div><p class="text-[9px] font-black text-rose-400 uppercase italic">Critical</p><p class="text-xs font-bold text-rose-900">${alertCount} Student Alerts</p></div>
            </div>
            <div class="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-center gap-3">
                <div class="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-lg"><i class="fas fa-shield-alt"></i></div>
                <div><p class="text-[9px] font-black text-emerald-400 uppercase italic">Security</p><p class="text-xs font-bold text-emerald-900">Encrypted Session</p></div>
            </div>`;
    }
    hud.innerHTML = html;
}

// --- STUDENT MANAGEMENT ---
async function loadStudentHub(filterT = 'all') {
    const today = new Date().toISOString().split('T')[0];
    let q = _supabase.from('students').select('*');
    if (currentUserRole !== 'admin') q = q.eq('teacher_id', currentUserID);
    else if (filterT !== 'all') q = q.eq('teacher_id', filterT);
    
    const { data: stds } = await q.order('name');
    const { data: attToday } = await _supabase.from('attendance').select('student_id, status').eq('date', today);

    document.getElementById('student-list').innerHTML = (stds || []).map(s => {
        const live = attToday?.find(a => a.student_id === s.id && a.status.toLowerCase() === 'present');
        return `
        <div class="bg-white p-6 rounded-[2rem] border flex justify-between items-center group shadow-sm hover:border-indigo-200 transition">
            <div class="flex items-center gap-4">
                <div class="w-3 h-3 rounded-full ${live ? 'bg-emerald-500' : 'bg-slate-200'}"></div>
                <div><p class="font-black text-sm text-slate-800">${s.name}</p><p class="text-[9px] text-slate-400 font-black uppercase tracking-widest">${s.grade_level}</p></div>
            </div>
            <div class="flex gap-2">
                <button onclick="openEditStudent('${s.id}')" class="text-indigo-500 bg-indigo-50 w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-indigo-500 hover:text-white"><i class="fas fa-edit text-[10px]"></i></button>
                <button onclick="deleteItem('students', '${s.id}', loadStudentHub)" class="text-rose-400 bg-rose-50 w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-rose-500 hover:text-white"><i class="fas fa-trash text-[10px]"></i></button>
                <button onclick="openRemarkModal('${s.id}','${s.name}')" class="text-emerald-500 bg-emerald-50 w-8 h-8 rounded-full flex items-center justify-center hover:bg-emerald-500 hover:text-white"><i class="fas fa-plus text-[10px]"></i></button>
            </div>
        </div>`;
    }).join('');
}

// --- GRADE & ACADEMIC ENGINE ---
async function loadGrades() {
    let qS = _supabase.from('students').select('id, name'); 
    if(currentUserRole!=='admin') qS = qS.eq('teacher_id', currentUserID);
    const { data: stds } = await qS; 
    document.getElementById('grade-student-select').innerHTML = stds.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    let qG = _supabase.from('grades').select('*, students!inner(name, teacher_id)').neq('subject', 'BEHAVIOUR');
    if(currentUserRole!=='admin') qG = qG.eq('students.teacher_id', currentUserID);
    const { data: gs } = await qG.order('created_at', { ascending: false });

    document.getElementById('grade-table-body').innerHTML = (gs || []).map(g => {
        const total = g.class_score + g.exam_score;
        return `
        <div class="p-6 flex justify-between items-center group border-b last:border-0 hover:bg-slate-50 transition">
            <div>
                <b class="text-slate-700">${g.students.name}</b><br>
                <span class="text-[10px] font-black text-indigo-400 uppercase tracking-widest">${g.subject}</span>
                <p class="text-[8px] text-slate-300 font-bold uppercase">${formatTime(g.created_at)}</p>
            </div>
            <div class="flex items-center gap-6">
                <span class="text-lg font-black ${getScoreClass(total)}">${total}%</span>
                <button onclick="deleteItem('grades', '${g.id}', loadGrades)" class="text-rose-500 opacity-0 group-hover:opacity-100 transition"><i class="fas fa-trash-alt"></i></button>
            </div>
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
        <tr class="border-b last:border-0 hover:bg-slate-50 transition">
            <td class="p-6 font-bold text-slate-700">${s.name}</td>
            <td class="p-6 text-center text-[10px] text-slate-400 font-black uppercase">${r ? formatTime(r.marked_at) : '--:--'}</td>
            <td class="p-6 text-right">
                <button onclick="markAt('${s.id}','present')" class="w-10 h-10 ${r?.status==='present'?'bg-emerald-500 text-white shadow-lg shadow-emerald-200':'bg-emerald-50 text-emerald-500'} rounded-xl font-black mr-2 transition-all">P</button>
                <button onclick="markAt('${s.id}','absent')" class="w-10 h-10 ${r?.status==='absent'?'bg-rose-500 text-white shadow-lg shadow-rose-200':'bg-rose-50 text-rose-500'} rounded-xl font-black transition-all">A</button>
            </td>
        </tr>`;
    }).join('');
}

async function markAt(sid, stat) {
    const date = document.getElementById('attendance-date').value;
    await _supabase.from('attendance').upsert({ 
        student_id: sid, date, status: stat, teacher_id: currentUserID, teacher_name: currentUserName, marked_at: new Date() 
    }, { onConflict: 'student_id, date' });
    loadAttendanceList(); refreshDashboard();
}

// --- VISUALIZATION ENGINES ---
async function updateAttendanceTrend() {
    const last7Days = [...Array(7)].map((_, i) => {
        const d = new Date(); d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0];
    }).reverse();

    let qA = _supabase.from('attendance').select('date, status, students!inner(teacher_id)');
    if (currentUserRole !== 'admin') qA = qA.eq('students.teacher_id', currentUserID);
    const { data: attHistory } = await qA.in('date', last7Days);

    let qS = _supabase.from('students').select('*', { count: 'exact', head: true });
    if (currentUserRole !== 'admin') qS = qS.eq('teacher_id', currentUserID);
    const { count: totalStds } = await qS;

    let dailyPercents = last7Days.map(date => {
        const dayAtt = (attHistory || []).filter(a => a.date === date && a.status === 'present').length;
        return totalStds > 0 ? Math.round((dayAtt / totalStds) * 100) : 0;
    });

    const canvas = document.getElementById('attendanceSparkline');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (attendanceChart) attendanceChart.destroy();
    
    attendanceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: last7Days,
            datasets: [{
                data: dailyPercents,
                borderColor: '#10b981',
                borderWidth: 2,
                pointRadius: 2,
                fill: true,
                backgroundColor: 'rgba(16, 185, 129, 0.05)',
                tension: 0.4
            }]
        },
        options: {
            plugins: { legend: { display: false }, tooltip: { enabled: true } },
            scales: { x: { display: false }, y: { display: false, min: 0, max: 100 } },
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

async function updateZigzag() {
    let q = _supabase.from('grades').select('subject, class_score, exam_score, students!inner(teacher_id)').neq('subject', 'BEHAVIOUR');
    if (currentUserRole !== 'admin') q = q.eq('students.teacher_id', currentUserID);
    const { data } = await q; 
    if (!data || data.length === 0) return;
    const subs = {}; 
    data.forEach(g => { 
        const s = g.subject.toUpperCase(); 
        if(!subs[s]) subs[s] = {t:0,c:0}; 
        subs[s].t+=(g.class_score+g.exam_score); subs[s].c++; 
    });
    const lbls = Object.keys(subs); 
    const avgs = lbls.map(l => Math.round(subs[l].t / subs[l].c));
    const ctx = document.getElementById('progressChart').getContext('2d');
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, { 
        type: 'line', 
        data: { 
            labels: lbls, 
            datasets: [{ 
                label: 'Performance %', data: avgs, borderColor: '#6366f1', borderWidth: 4, 
                fill: true, backgroundColor: 'rgba(99, 102, 241, 0.05)', tension: 0.4
            }] 
        }, 
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            scales: { y: { min: 0, max: 100 } },
            plugins: { legend: { display: false } }
        } 
    });
}

// --- MISC / CRUD OPERATORS ---
async function deleteItem(table, id, callback) {
    if (!confirm("Permanent Deletion Requested. Proceed?")) return;
    const { error } = await _supabase.from(table).delete().eq('id', id);
    if (error) alert("ERR: " + error.message); 
    else { callback(); refreshDashboard(); }
}

async function loadAdminControls() {
    const { data } = await _supabase.from('profiles').select('id, full_name').eq('role', 'teacher');
    document.getElementById('filter-container').innerHTML = `
        <select onchange="loadStudentHub(this.value)" class="p-3 border rounded-xl font-black text-[10px] uppercase bg-white shadow-sm">
            <option value="all">Global DB View</option>
            ${data.map(t => `<option value="${t.id}">${t.full_name}</option>`).join('')}
        </select>`;
    document.getElementById('std-teacher-assign').innerHTML = data.map(t => `<option value="${t.id}">${t.full_name}</option>`).join('');
}

// --- EVENT HANDLERS ---
document.getElementById('form-student').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-std-id').value;
    const name = document.getElementById('std-name').value;
    const grade = document.getElementById('std-grade').value;
    const tId = currentUserRole === 'admin' ? document.getElementById('std-teacher-assign').value : currentUserID;
    if (id) await _supabase.from('students').update({ name, grade_level: grade, teacher_id: tId }).eq('id', id);
    else await _supabase.from('students').insert([{ name, grade_level: grade, teacher_id: tId }]);
    toggleModal('modal-student'); loadStudentHub(); refreshDashboard();
});

document.getElementById('form-add-grade').addEventListener('submit', async (e) => {
    e.preventDefault();
    const sid = document.getElementById('grade-student-select').value;
    const subj = document.getElementById('grade-subject').value;
    const cScore = Number(document.getElementById('class-score').value);
    const eScore = Number(document.getElementById('exam-score').value);
    const total = cScore + eScore;
    
    if (total < 50) {
        await _supabase.from('grades').insert([{ 
            student_id: sid, subject: "BEHAVIOUR", remark: `AUTO-ALERT: Failed ${subj} (${total}%).`,
            class_score: 0, exam_score: 0 
        }]);
    }
    await _supabase.from('grades').insert([{ student_id: sid, subject: subj, class_score: cScore, exam_score: eScore }]);
    toggleModal('modal-add-grade'); loadGrades(); refreshDashboard();
});
