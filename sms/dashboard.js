/** * LEGATECH 2026 - FULL APPLICATION CORE (DASHBOARD.JS)
 * VERSION: 4.0.2 (STRICT PRODUCTION + REPORTING ENGINE)
 * NO LOGIC SIMPLIFIED. FULL FUNCTIONALITY PRESERVED.
 */

// --- GLOBAL CONFIGURATION & INSTANTIATION ---
const _SB_URL = "https://bagqujotwmmsghcemsdi.supabase.co";
const _SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhZ3F1am90d21tc2doY2Vtc2RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1Mjc2MDcsImV4cCI6MjA4MjEwMzYwN30.I0c-C1wBbJ2uLYhBrlcDofhEvKqXpiMh3P7O6bpJByo";
const _supabase = supabase.createClient(_SB_URL, _SB_KEY);

let currentUserID, currentUserRole, currentUserName;
let myChart = null;
let attendanceChart = null; 

// --- PROFESSIONAL HELPERS ---
const formatTime = (iso) => iso ? new Date(iso).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'N/A';

const getScoreClass = (s) => {
    if (s >= 75) return 'score-high'; 
    if (s >= 50) return 'score-mid';  
    return 'score-low';              
};

// --- AUTHENTICATION FLOW ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;
    const accessCode = document.getElementById('access-code').value;
    
    // Strict Access Code Enforcement
    if (accessCode !== "LEGATECH2025") {
        return alert("CRITICAL: ACCESS DENIED - INVALID LEGACY CODE");
    }

    const { data, error } = await _supabase.auth.signInWithPassword({ email, password: pass });
    if (error) return alert(error.message);
    
    initApp(data.user.id, email);
});

async function initApp(uid, email) {
    const { data } = await _supabase.from('profiles').select('*').eq('id', uid).single();
    
    currentUserID = uid; 
    currentUserRole = data?.role || 'teacher'; 
    currentUserName = data?.full_name || email.split('@')[0];
    
    // UI Role Branding
    document.getElementById('role-badge').innerText = currentUserRole.toUpperCase() + " ACTIVE";
    
    if (currentUserRole === 'admin') {
        document.getElementById('admin-only-nav').classList.remove('hidden');
        document.getElementById('admin-assign-field').classList.remove('hidden');
        loadAdminControls();
    }
    
    // View Switching
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-app').classList.remove('hidden');
    document.getElementById('attendance-date').valueAsDate = new Date();
    
    showSection('dashboard');
}

// --- NAVIGATION SYSTEM ---
function showSection(name) {
    document.querySelectorAll('.content-sec').forEach(s => s.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    
    document.getElementById('sec-' + name).classList.remove('hidden');
    document.getElementById('btn-' + name).classList.add('active');
    document.getElementById('section-title').innerText = name.toUpperCase();
    
    // Lazy Loading Modules
    if (name === 'dashboard') refreshDashboard();
    if (name === 'students') loadStudentHub();
    if (name === 'attendance') loadAttendanceList();
    if (name === 'grades') {
        loadGrades();
        loadAccumulatedGrades(); 
    }
    if (name === 'permissions') loadPermissions();
    if (name === 'remarks') loadRemarks();
    if (name === 'admin') loadStaffList();
}

// --- DASHBOARD & ANALYTICS ENGINE ---
async function refreshDashboard() {
    await updateSmartAgenda();
    
    // Student Count Stat
    let qS = _supabase.from('students').select('*', { count: 'exact', head: false });
    if (currentUserRole !== 'admin') qS = qS.eq('teacher_id', currentUserID);
    const { count } = await qS;
    document.getElementById('stat-students').innerText = count || 0;

    // Daily Attendance Stat
    const today = new Date().toISOString().split('T')[0];
    let qA = _supabase.from('attendance').select('status, students!inner(teacher_id)').eq('date', today);
    if (currentUserRole !== 'admin') qA = qA.eq('students.teacher_id', currentUserID);
    const { data: attData } = await qA;
    
    if (attData && attData.length > 0 && count > 0) {
        const pres = attData.filter(a => a.status.toLowerCase() === 'present').length;
        document.getElementById('stat-attendance').innerText = Math.round((pres / count) * 100) + "%";
    } else {
        document.getElementById('stat-attendance').innerText = "0%";
    }
    
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

async function updateAttendanceTrend() {
    const last7Days = [...Array(7)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
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
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: { x: { display: false }, y: { display: false, min: -10, max: 110 } },
            responsive: true,
            maintainAspectRatio: false
        }
    });
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
        <div class="bg-white p-6 rounded-[2rem] border flex justify-between items-center group shadow-sm">
            <div class="flex items-center gap-4">
                <div class="w-3 h-3 rounded-full ${live ? 'pulse-green' : 'bg-slate-200'}"></div>
                <div><p class="font-black text-sm text-slate-800">${s.name}</p><p class="text-[9px] text-slate-400 font-black uppercase">${s.grade_level}</p></div>
            </div>
            <div class="flex gap-2">
                <button onclick="openEditStudent('${s.id}')" class="text-indigo-500 bg-indigo-50 w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition"><i class="fas fa-edit text-[10px]"></i></button>
                <button onclick="deleteItem('students', '${s.id}', loadStudentHub)" class="text-rose-400 bg-rose-50 w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition"><i class="fas fa-trash text-[10px]"></i></button>
                <button onclick="openRemarkModal('${s.id}','${s.name}')" class="text-emerald-500 bg-emerald-50 w-8 h-8 rounded-full flex items-center justify-center"><i class="fas fa-plus text-[10px]"></i></button>
            </div>
        </div>`;
    }).join('');
}

// --- SHARED DATA UTILITIES ---
async function deleteItem(table, id, callback) {
    if (!confirm("Are you sure? This cannot be undone.")) return;
    const { error } = await _supabase.from(table).delete().eq('id', id);
    if (error) alert(error.message); 
    else { callback(); refreshDashboard(); }
}

function toggleModal(id) { 
    document.getElementById(id).classList.toggle('hidden'); 
}

function openEnrollModal() {
    document.getElementById('student-modal-title').innerText = "Enroll Student";
    document.getElementById('student-btn-text').innerText = "Finalize";
    document.getElementById('edit-std-id').value = "";
    document.getElementById('form-student').reset();
    toggleModal('modal-student');
}

async function openEditStudent(id) {
    const { data } = await _supabase.from('students').select('*').eq('id', id).single();
    document.getElementById('student-modal-title').innerText = "Edit Record";
    document.getElementById('student-btn-text').innerText = "Update";
    document.getElementById('edit-std-id').value = data.id;
    document.getElementById('std-name').value = data.name;
    document.getElementById('std-grade').value = data.grade_level;
    if (currentUserRole === 'admin') document.getElementById('std-teacher-assign').value = data.teacher_id;
    toggleModal('modal-student');
}

document.getElementById('form-student').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-std-id').value;
    const name = document.getElementById('std-name').value;
    const grade = document.getElementById('std-grade').value;
    const tId = currentUserRole === 'admin' ? document.getElementById('std-teacher-assign').value : currentUserID;
    
    if (id) await _supabase.from('students').update({ name, grade_level: grade, teacher_id: tId }).eq('id', id);
    else await _supabase.from('students').insert([{ name, grade_level: grade, teacher_id: tId }]);
    
    toggleModal('modal-student'); 
    loadStudentHub(); 
    refreshDashboard();
});

// --- REMARKS & BEHAVIOR TRACKING ---
function openRemarkModal(sid, name) { 
    document.getElementById('remark-target-id').value = sid; 
    document.getElementById('remark-target-name').innerText = name; 
    toggleModal('modal-quick-remark'); 
}

async function saveQuickRemark() {
    const sid = document.getElementById('remark-target-id').value;
    const text = document.getElementById('quick-remark-text').value;
    if (!text) return;
    await _supabase.from('grades').insert([{ student_id: sid, subject: "BEHAVIOUR", remark: text, class_score: 0, exam_score: 0 }]);
    document.getElementById('quick-remark-text').value = "";
    toggleModal('modal-quick-remark');
    loadRemarks();
}

async function loadRemarks() {
    const { data } = await _supabase.from('grades').select('*, students!inner(name, teacher_id)').not('remark', 'is', null);
    const filtered = currentUserRole === 'admin' ? data : (data || []).filter(d => d.students.teacher_id === currentUserID);
    document.getElementById('remarks-list').innerHTML = (filtered || []).map(x => `
        <div class="p-6 flex justify-between items-center group border-b last:border-0">
            <div>
                <p class="text-[9px] font-black text-slate-400 italic">${x.students.name}</p>
                <p class="text-sm font-bold text-slate-700">${x.remark}</p>
                <p class="text-[8px] text-slate-300 mt-1 uppercase font-bold">${formatTime(x.created_at)}</p>
            </div>
            <button onclick="deleteItem('grades', '${x.id}', loadRemarks)" class="text-rose-400 opacity-0 group-hover:opacity-100 transition"><i class="fas fa-trash"></i></button>
        </div>`).join('');
}

// --- PERMISSIONS & REQUESTS ---
document.getElementById('form-add-request').addEventListener('submit', async (e) => {
    e.preventDefault();
    const sub = document.getElementById('req-subject').value;
    const msg = document.getElementById('req-message').value;
    await _supabase.from('requests').insert([{ teacher_id: currentUserID, teacher_name: currentUserName, subject: sub, message: msg, status: 'pending' }]);
    document.getElementById('form-add-request').reset();
    toggleModal('modal-add-request');
    loadPermissions();
});

async function loadPermissions() {
    let q = _supabase.from('requests').select('*').order('created_at', { ascending: false });
    if (currentUserRole !== 'admin') q = q.eq('teacher_id', currentUserID);
    const { data } = await q;
    document.getElementById('requests-list').innerHTML = (data || []).map(r => `
        <tr class="hover:bg-slate-50 transition group">
            <td class="p-6">
                <p class="text-[9px] font-black text-slate-400 uppercase">${r.teacher_name}</p>
                <p class="text-sm font-bold">${r.subject}</p>
            </td>
            <td class="p-6 text-[10px] text-slate-500 italic">${r.message}</td>
            <td class="p-6 text-right">
                <span class="px-3 py-1 rounded-full text-[9px] font-black status-${r.status}">${r.status}</span>
                ${currentUserRole === 'admin' && r.status === 'pending' ? `
                    <button onclick="handleRequest('${r.id}','approved')" class="ml-4 text-emerald-500"><i class="fas fa-check"></i></button>
                    <button onclick="handleRequest('${r.id}','denied')" class="ml-2 text-rose-500"><i class="fas fa-times"></i></button>` : ''}
                <button onclick="deleteItem('requests', '${r.id}', loadPermissions)" class="ml-4 text-rose-300 opacity-0 group-hover:opacity-100 transition"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('');
}

async function handleRequest(id, stat) { 
    await _supabase.from('requests').update({ status: stat }).eq('id', id); 
    loadPermissions(); 
}

// --- ACADEMIC CORE ---
async function calculateTopStudent() {
    let qG = _supabase.from('grades').select('student_id, class_score, exam_score, students!inner(name, teacher_id)').neq('subject', 'BEHAVIOUR');
    if (currentUserRole !== 'admin') qG = qG.eq('students.teacher_id', currentUserID);
    const { data: grades } = await qG;
    
    if (!grades || grades.length === 0) return document.getElementById('stat-top-student').innerText = "N/A";
    
    const map = {};
    grades.forEach(g => {
        if (!map[g.student_id]) map[g.student_id] = { n: g.students.name, s: 0, c: 0 };
        map[g.student_id].s += (g.class_score + g.exam_score); 
        map[g.student_id].c++;
    });
    
    let top = "N/A", max = 0;
    Object.values(map).forEach(s => { 
        let a = s.s / s.c; 
        if (a > max) { max = a; top = s.n; } 
    });
    document.getElementById('stat-top-student').innerText = top;
}

async function loadAttendanceList() {
    const date = document.getElementById('attendance-date').value;
    let qS = _supabase.from('students').select('*'); 
    if (currentUserRole !== 'admin') qS = qS.eq('teacher_id', currentUserID);
    
    const { data: stds } = await qS.order('name');
    const { data: att } = await _supabase.from('attendance').select('*').eq('date', date);
    
    document.getElementById('attendance-list').innerHTML = (stds || []).map(s => {
        const r = att?.find(a => a.student_id === s.id);
        return `
        <tr class="border-b last:border-0">
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
    loadAttendanceList(); 
    refreshDashboard();
}

async function loadGrades() {
    let qS = _supabase.from('students').select('id, name'); 
    if(currentUserRole!=='admin') qS = qS.eq('teacher_id', currentUserID);
    const { data: stds } = await qS; 
    
    document.getElementById('grade-student-select').innerHTML = stds.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    
    let qG = _supabase.from('grades').select('*, students!inner(name, teacher_id)').neq('subject', 'BEHAVIOUR');
    if(currentUserRole!=='admin') qG = qG.eq('students.teacher_id', currentUserID);
    const { data: gs } = await qG;
    
    document.getElementById('grade-table-body').innerHTML = (gs || []).map(g => {
        const total = g.class_score + g.exam_score;
        return `
        <div class="p-6 flex justify-between items-center group border-b last:border-0">
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

// --- UNIFIED MATRIX LOGIC + REPORTING ---
// --- UPDATED MATRIX WITH BATCH PRINTING ---
async function loadAccumulatedGrades() {
    let qG = _supabase.from('grades').select('*, students!inner(id, name, teacher_id, grade_level)').neq('subject', 'BEHAVIOUR');
    if(currentUserRole !== 'admin') qG = qG.eq('students.teacher_id', currentUserID);
    const { data: gs } = await qG;

    const uniqueSubjects = [...new Set((gs || []).map(g => g.subject.toUpperCase()))].sort();
    const headRow = document.getElementById('master-table-head');
    
    // Added "Print All" Icon to the header
    headRow.innerHTML = `
        <th class="p-6 sticky left-0 bg-slate-50 border-r z-10 sticky-col flex items-center justify-between">
            <span>Student Name</span>
            <button onclick="generateAllReports()" class="text-indigo-600 hover:text-indigo-800 title="Print All Reports">
                <i class="fas fa-print text-sm"></i>
            </button>
        </th>`;
        
    uniqueSubjects.forEach(subj => {
        headRow.innerHTML += `<th class="p-6 text-center border-r min-w-[100px]">${subj}</th>`;
    });
    headRow.innerHTML += `<th class="p-6 text-center bg-indigo-50 text-indigo-600">AVG %</th>`;

    const studentMap = {};
    (gs || []).forEach(g => {
        const sid = g.student_id;
        if (!studentMap[sid]) {
            studentMap[sid] = { id: sid, name: g.students.name, grade: g.students.grade_level, scores: {}, totalSum: 0, subjectCount: 0 };
        }
        const subjKey = g.subject.toUpperCase();
        const total = g.class_score + g.exam_score;
        studentMap[sid].scores[subjKey] = total;
        studentMap[sid].totalSum += total;
        studentMap[sid].subjectCount++;
    });

    const container = document.getElementById('accumulated-table-body');
    if (container) {
        container.innerHTML = Object.values(studentMap).map(s => {
            const avg = Math.round(s.totalSum / s.subjectCount);
            let subjectCells = uniqueSubjects.map(subj => {
                const score = s.scores[subj];
                return `<td class="p-4 text-center border-r font-bold ${score !== undefined ? getScoreClass(score) : 'text-slate-200'}">${score !== undefined ? score : '-'}</td>`;
            }).join('');

            return `
            <tr class="border-b border-slate-50 hover:bg-slate-50/50 transition">
                <td class="p-4 font-black uppercase text-slate-700 sticky left-0 bg-white z-10 sticky-col border-r">
                   <div class="flex items-center justify-between">
                        <span>${s.name}</span>
                        <button onclick="generateReport('${s.id}')" class="ml-2 text-[8px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded hover:bg-indigo-600 hover:text-white transition">REPORT</button>
                   </div>
                </td>
                ${subjectCells}
                <td class="p-4 text-center bg-indigo-50/30"><span class="font-black ${getScoreClass(avg)}">${avg}%</span></td>
            </tr>`;
        }).join('');
    }
}

// --- BATCH REPORT ENGINE ---
// --- OFFICIAL BATCH REPORT ENGINE (HIGH-FIDELITY) ---
async function generateAllReports() {
    if(!confirm("Generate official reports for all students?")) return;
    
    let q = _supabase.from('grades').select('*, students!inner(name, grade_level, teacher_id)');
    if(currentUserRole !== 'admin') q = q.eq('students.teacher_id', currentUserID);
    const { data: allData } = await q;

    if (!allData || allData.length === 0) return alert("No data available.");

    const groups = allData.reduce((acc, curr) => {
        if (!acc[curr.student_id]) acc[curr.student_id] = { name: curr.students.name, grade: curr.students.grade_level, entries: [] };
        acc[curr.student_id].entries.push(curr);
        return acc;
    }, {});

    let fullHTML = `
    <style>
        @media print { .page-break { page-break-after: always; } }
        body { font-family: 'Inter', sans-serif; color: #1e293b; }
        .report-card { padding: 40px; border: 2px solid #f1f5f9; margin-bottom: 20px; max-width: 800px; margin: auto; }
        .header { text-align: center; border-bottom: 4px solid #6366f1; padding-bottom: 20px; margin-bottom: 30px; }
        .school-name { font-size: 28px; font-weight: 900; color: #4338ca; letter-spacing: -1px; }
        .student-info { display: flex; justify-content: space-between; margin-bottom: 30px; background: #f8fafc; padding: 15px; border-radius: 12px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        th { text-align: left; background: #f1f5f9; padding: 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; }
        td { padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
        .score-pill { font-weight: 800; padding: 4px 8px; border-radius: 6px; }
        .pass { color: #059669; }
        .fail { color: #dc2626; }
        .remarks-section { background: #fff7ed; padding: 20px; border-radius: 12px; border-left: 4px solid #f59e0b; }
        .signature-grid { display: flex; justify-content: space-between; margin-top: 60px; }
        .sig-line { border-top: 1px solid #cbd5e1; width: 200px; text-align: center; padding-top: 8px; font-size: 12px; font-weight: bold; }
    </style>`;

    Object.values(groups).forEach(s => {
        const academic = s.entries.filter(g => g.subject !== 'BEHAVIOUR');
        const logs = s.entries.filter(g => g.subject === 'BEHAVIOUR');
        
        fullHTML += `
            <div class="report-card page-break">
                <div class="header">
                    <div class="school-name">LEGATECH ACADEMY 2026</div>
                    <div style="font-size: 10px; font-weight: bold; color: #64748b; margin-top: 5px;">OFFICIAL STUDENT PROGRESS RECORD</div>
                </div>

                <div class="student-info">
                    <div>
                        <div style="font-size: 10px; color: #64748b; font-weight: bold;">STUDENT NAME</div>
                        <div style="font-size: 18px; font-weight: 900;">${s.name.toUpperCase()}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 10px; color: #64748b; font-weight: bold;">GRADE LEVEL</div>
                        <div style="font-size: 18px; font-weight: 900;">${s.grade}</div>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Subject</th>
                            <th>Class Score</th>
                            <th>Exam Score</th>
                            <th>Total</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>`;
        
        academic.forEach(g => {
            const total = g.class_score + g.exam_score;
            const isPass = total >= 50;
            fullHTML += `
                <tr>
                    <td style="font-weight: bold;">${g.subject}</td>
                    <td>${g.class_score}</td>
                    <td>${g.exam_score}</td>
                    <td class="score-pill">${total}%</td>
                    <td class="${isPass ? 'pass' : 'fail'}" style="font-weight: 900;">${isPass ? 'PASSED' : 'RE-SIT'}</td>
                </tr>`;
        });

        fullHTML += `</tbody></table>`;

        if (logs.length > 0) {
            fullHTML += `
                <div class="remarks-section">
                    <div style="font-size: 10px; font-weight: bold; margin-bottom: 10px;">BEHAVIORAL REMARKS & SYSTEM ALERTS</div>
                    <div style="font-size: 12px; line-height: 1.6;">
                        ${logs.map(l => `• ${l.remark}`).join('<br>')}
                    </div>
                </div>`;
        }

        fullHTML += `
                <div class="signature-grid">
                    <div class="sig-line">Class Teacher</div>
                    <div class="sig-line">Principal</div>
                    <div class="sig-line">Date: ${new Date().toLocaleDateString()}</div>
                </div>
            </div>`;
    });

    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>Batch_Reports_2026</title></head><body onload="window.print()">${fullHTML}</body></html>`);
}

// --- REPORT ENGINE ---
async function generateReport(studentId) {
    const { data: student } = await _supabase.from('students').select('*').eq('id', studentId).single();
    const { data: grades } = await _supabase.from('grades').select('*').eq('student_id', studentId);
    
    if (!grades || grades.length === 0) return alert("No data for report.");

    const academic = grades.filter(g => g.subject !== 'BEHAVIOUR');
    const logs = grades.filter(g => g.subject === 'BEHAVIOUR');
    
    let content = `
    ================================================
           LEGATECH ACADEMIC REPORT 2026
    ================================================
    STUDENT: ${student.name.toUpperCase()}
    GRADE:   ${student.grade_level}
    DATE:    ${new Date().toLocaleDateString()}
    ------------------------------------------------
    ACADEMIC PERFORMANCE:`;

    academic.forEach(g => {
        const total = g.class_score + g.exam_score;
        content += `\n${g.subject.padEnd(15)} : ${total}% (${total >= 50 ? 'PASS' : 'FAIL'})`;
    });

    if (logs.length > 0) {
        content += `\n\nBEHAVIOR & SYSTEM ALERTS:`;
        logs.forEach(l => content += `\n- ${l.remark}`);
    }

    const win = window.open('', '_blank');
    win.document.write(`<pre style="padding:40px; font-family:monospace; line-height:1.5">${content}</pre>`);
    win.print();
}

document.getElementById('form-add-grade').addEventListener('submit', async (e) => {
    e.preventDefault();
    const sid = document.getElementById('grade-student-select').value;
    const subj = document.getElementById('grade-subject').value;
    const cScore = Number(document.getElementById('class-score').value);
    const eScore = Number(document.getElementById('exam-score').value);
    const total = cScore + eScore;

    // Automated Alert System for Underperformance
    if (total < 50) {
        await _supabase.from('grades').insert([{ 
            student_id: sid, subject: "BEHAVIOUR", remark: `SYSTEM AUTO-ALERT: Performance drop in ${subj} (${total}%).`,
            class_score: 0, exam_score: 0 
        }]);
    }

    await _supabase.from('grades').insert([{ student_id: sid, subject: subj, class_score: cScore, exam_score: eScore }]);
    document.getElementById('form-add-grade').reset();
    toggleModal('modal-add-grade'); 
    loadGrades(); 
    loadAccumulatedGrades(); 
    refreshDashboard();
});

// --- ADMIN STAFF & PROFILE MANAGEMENT ---
async function loadStaffList() {
    const { data } = await _supabase.from('profiles').select('*').eq('role', 'teacher');
    document.getElementById('staff-list').innerHTML = (data || []).map(t => `
        <div class="p-6 flex justify-between items-center group">
            <div><p class="font-black text-xs uppercase">${t.full_name}</p><p class="text-[9px] text-slate-400">${t.email}</p></div>
            <button onclick="deleteItem('profiles', '${t.id}', loadStaffList)" class="text-rose-500 opacity-0 group-hover:opacity-100 transition"><i class="fas fa-user-minus"></i></button>
        </div>`).join('');
}

async function loadAdminControls() {
    const { data } = await _supabase.from('profiles').select('id, full_name').eq('role', 'teacher');
    document.getElementById('filter-container').innerHTML = `
        <select onchange="loadStudentHub(this.value)" class="p-3 border rounded-xl font-black text-[10px] uppercase bg-white">
            <option value="all">Global View</option>
            ${(data || []).map(t => `<option value="${t.id}">${t.full_name}</option>`).join('')}
        </select>`;
    document.getElementById('std-teacher-assign').innerHTML = (data || []).map(t => `<option value="${t.id}">${t.full_name}</option>`).join('');
}

// --- ADVANCED CHARTING (ZIGZAG & RISK) ---
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
                label: 'Subject Performance %', data: avgs, stepped: true, borderColor: '#6366f1', borderWidth: 4, 
                fill: true, backgroundColor: 'rgba(99, 102, 241, 0.05)', tension: 0.4
            }] 
        }, 
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } } } 
    });
}

async function updateRisk() {
    let q = _supabase.from('grades').select('student_id, class_score, exam_score, students!inner(name, teacher_id)').neq('subject', 'BEHAVIOUR');
    if (currentUserRole !== 'admin') q = q.eq('students.teacher_id', currentUserID);
    const { data } = await q; 
    
    const map = {}; 
    (data || []).forEach(g => { 
        if(!map[g.student_id]) map[g.student_id] = {n:g.students.name, s:0, c:0}; 
        map[g.student_id].s+=(g.class_score+g.exam_score); 
        map[g.student_id].c++; 
    });
    
    const risks = Object.values(map).filter(x => (x.s/x.c) < 45);
    document.getElementById('at-risk-list').innerHTML = risks.length ? 
        risks.map(r => `<div class="p-3 bg-rose-50 text-rose-600 text-[10px] font-black rounded-xl uppercase border border-rose-100 animate-pulse">${r.n} (${Math.round(r.s/r.c)}%)</div>`).join('') : 
        '<p class="text-[9px] text-emerald-500 font-black">ALL ACADEMIC GOALS MET</p>';
}

document.getElementById('form-add-teacher').addEventListener('submit', async (e) => {
    e.preventDefault(); 
    const name = document.getElementById('t-name').value;
    const email = document.getElementById('t-email').value;
    const password = document.getElementById('t-pass').value;
    
    const { data, error } = await _supabase.auth.signUp({ 
        email, password, options: { data: { full_name: name, role: 'teacher' } } 
    });
    
    if (error) {
        alert("Provision Error: " + error.message);
    } else {
        await _supabase.from('profiles').insert([{ id: data.user.id, full_name: name, email: email, role: 'teacher' }]);
        alert("Teacher Access Granted Successfully!");
        document.getElementById('form-add-teacher').reset();
        loadStaffList();
    }
});
