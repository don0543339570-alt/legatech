const _SB_URL = "https://bagqujotwmmsghcemsdi.supabase.co";
const _SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhZ3F1am90d21tc2doY2Vtc2RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1Mjc2MDcsImV4cCI6MjA4MjEwMzYwN30.I0c-C1wBbJ2uLYhBrlcDofhEvKqXpiMh3P7O6bpJByo";
const _supabase = supabase.createClient(_SB_URL, _SB_KEY);

let currentUserID, currentUserRole, currentUserName;
let myChart = null;

// --- AUTH ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;
    if (document.getElementById('access-code').value !== "LEGATECH2025") return alert("ACCESS DENIED");
    const { data, error } = await _supabase.auth.signInWithPassword({ email, password: pass });
    if (error) return alert(error.message);
    initApp(data.user.id, email);
});

async function initApp(uid, email) {
    const { data } = await _supabase.from('profiles').select('*').eq('id', uid).single();
    currentUserID = uid; currentUserRole = data?.role || 'teacher'; currentUserName = data?.full_name || email.split('@')[0];
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

// --- NAVIGATION ---
function showSection(name) {
    document.querySelectorAll('.content-sec').forEach(s => s.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('sec-' + name).classList.remove('hidden');
    document.getElementById('btn-' + name).classList.add('active');
    document.getElementById('section-title').innerText = name.toUpperCase();
    if (name === 'dashboard') refreshDashboard();
    if (name === 'students') loadStudentHub();
    if (name === 'attendance') loadAttendanceList();
    if (name === 'grades') loadGrades();
    if (name === 'permissions') loadPermissions();
    if (name === 'remarks') loadRemarks();
    if (name === 'admin') loadStaffList();
}

// --- CORE CRUD (DELETE & EDIT) ---
async function deleteItem(table, id, callback) {
    if (!confirm("Are you sure? This cannot be undone.")) return;
    const { error } = await _supabase.from(table).delete().eq('id', id);
    if (error) alert(error.message); else { callback(); refreshDashboard(); }
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

// --- STUDENT REGISTRY (WITH PULSE) ---
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

// --- REMARKS (FIXED TO USE SQL VIEW) ---
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
    // UPDATED: Now points to the SQL VIEW 'behavioral_remarks'
    const { data } = await _supabase.from('behavioral_remarks').select('*, students!inner(name, teacher_id)').not('remark', 'is', null);
    const filtered = currentUserRole === 'admin' ? data : (data || []).filter(d => d.students.teacher_id === currentUserID);
    document.getElementById('remarks-list').innerHTML = filtered.map(x => `
        <div class="p-6 flex justify-between items-center group">
            <div><p class="text-[9px] font-black text-slate-400 italic">${x.students.name}</p><p class="text-sm font-bold text-slate-700">${x.remark}</p></div>
            <button onclick="deleteItem('grades', '${x.id}', loadRemarks)" class="text-rose-400 opacity-0 group-hover:opacity-100 transition"><i class="fas fa-trash"></i></button>
        </div>`).join('');
}

// --- REQUESTS (FIXED RELOAD) ---
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
                ${currentUserRole === 'admin' && r.status === 'pending' ? `<button onclick="handleRequest('${r.id}','approved')" class="ml-4 text-emerald-500"><i class="fas fa-check"></i></button><button onclick="handleRequest('${r.id}','denied')" class="ml-2 text-rose-500"><i class="fas fa-times"></i></button>` : ''}
                <button onclick="deleteItem('requests', '${r.id}', loadPermissions)" class="ml-4 text-rose-300 opacity-0 group-hover:opacity-100 transition"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('');
}

async function handleRequest(id, stat) { await _supabase.from('requests').update({ status: stat }).eq('id', id); loadPermissions(); }

// --- DASHBOARD & ANALYTICS ---
async function refreshDashboard() {
    let qS = _supabase.from('students').select('*', { count: 'exact', head: false });
    if (currentUserRole !== 'admin') qS = qS.eq('teacher_id', currentUserID);
    const { count } = await qS;
    document.getElementById('stat-students').innerText = count || 0;

    const today = new Date().toISOString().split('T')[0];
    let qA = _supabase.from('attendance').select('status, students!inner(teacher_id)').eq('date', today);
    if (currentUserRole !== 'admin') qA = qA.eq('students.teacher_id', currentUserID);
    const { data: attData } = await qA;
    if (attData && attData.length > 0 && count > 0) {
        const pres = attData.filter(a => a.status.toLowerCase() === 'present').length;
        document.getElementById('stat-attendance').innerText = Math.round((pres / count) * 100) + "%";
    } else document.getElementById('stat-attendance').innerText = "0%";
    calculateTopStudent(); updateZigzag(); updateRisk();
}

async function calculateTopStudent() {
    // UPDATED: Now points to academic_grades view so BEHAVIOUR remarks don't lower rank
    let qG = _supabase.from('academic_grades').select('student_id, class_score, exam_score, students!inner(name, teacher_id)');
    if (currentUserRole !== 'admin') qG = qG.eq('students.teacher_id', currentUserID);
    const { data: grades } = await qG;
    if (!grades || grades.length === 0) return document.getElementById('stat-top-student').innerText = "N/A";
    const map = {};
    grades.forEach(g => {
        if (!map[g.student_id]) map[g.student_id] = { n: g.students.name, s: 0, c: 0 };
        map[g.student_id].s += (g.class_score + g.exam_score); map[g.student_id].c++;
    });
    let top = "N/A", max = 0;
    Object.values(map).forEach(s => { let a = s.s / s.c; if (a > max) { max = a; top = s.n; } });
    document.getElementById('stat-top-student').innerText = top;
}

// --- ATTENDANCE ---
async function loadAttendanceList() {
    const date = document.getElementById('attendance-date').value;
    let qS = _supabase.from('students').select('*'); if (currentUserRole !== 'admin') qS = qS.eq('teacher_id', currentUserID);
    const { data: stds } = await qS.order('name');
    const { data: att } = await _supabase.from('attendance').select('*').eq('date', date);
    document.getElementById('attendance-list').innerHTML = (stds || []).map(s => {
        const r = att?.find(a => a.student_id === s.id);
        return `<tr><td class="p-6 font-bold">${s.name}</td><td class="p-6 text-right"><button onclick="markAt('${s.id}','present')" class="w-10 h-10 ${r?.status==='present'?'bg-emerald-500 text-white':'bg-emerald-50 text-emerald-500'} rounded-xl font-black mr-2">P</button><button onclick="markAt('${s.id}','absent')" class="w-10 h-10 ${r?.status==='absent'?'bg-rose-500 text-white':'bg-rose-50 text-rose-500'} rounded-xl font-black">A</button></td></tr>`;
    }).join('');
}

async function markAt(sid, stat) {
    const date = document.getElementById('attendance-date').value;
    await _supabase.from('attendance').upsert({ student_id: sid, date, status: stat, teacher_id: currentUserID, teacher_name: currentUserName, marked_at: new Date() }, { onConflict: 'student_id, date' });
    loadAttendanceList(); refreshDashboard();
}

// --- GRADES (UPDATED TO USE SQL VIEW) ---
async function loadGrades() {
    let qS = _supabase.from('students').select('id, name'); if(currentUserRole!=='admin') qS = qS.eq('teacher_id', currentUserID);
    const { data: stds } = await qS; document.getElementById('grade-student-select').innerHTML = stds.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    
    // UPDATED: Now points to the SQL VIEW 'academic_grades' (excludes BEHAVIOUR)
    let qG = _supabase.from('academic_grades').select('*, students!inner(name, teacher_id)');
    
    if(currentUserRole!=='admin') qG = qG.eq('students.teacher_id', currentUserID);
    const { data: gs } = await qG;
    document.getElementById('grade-table-body').innerHTML = (gs || []).map(g => `
        <div class="p-6 flex justify-between items-center group">
            <div><b>${g.students.name}</b><br><span class="text-[10px] font-black text-indigo-500 uppercase">${g.subject}: ${g.class_score+g.exam_score}%</span></div>
            <button onclick="deleteItem('grades', '${g.id}', loadGrades)" class="text-rose-500 opacity-0 group-hover:opacity-100 transition"><i class="fas fa-trash-alt"></i></button>
        </div>`).join('');
}

document.getElementById('form-add-grade').addEventListener('submit', async (e) => {
    e.preventDefault();
    await _supabase.from('grades').insert([{ student_id: document.getElementById('grade-student-select').value, subject: document.getElementById('grade-subject').value, class_score: Number(document.getElementById('class-score').value), exam_score: Number(document.getElementById('exam-score').value) }]);
    toggleModal('modal-add-grade'); loadGrades(); refreshDashboard();
});

// --- ADMIN HUB ---
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
    document.getElementById('filter-container').innerHTML = `<select onchange="loadStudentHub(this.value)" class="p-3 border rounded-xl font-black text-[10px] uppercase bg-white"><option value="all">Global View</option>${data.map(t => `<option value="${t.id}">${t.full_name}</option>`).join('')}</select>`;
    document.getElementById('std-teacher-assign').innerHTML = data.map(t => `<option value="${t.id}">${t.full_name}</option>`).join('');
}

// --- VISUAL ANALYTICS ---
async function updateZigzag() {
    // UPDATED: Now uses academic_grades view so chart doesn't tank from remarks
    let q = _supabase.from('academic_grades').select('subject, class_score, exam_score, students!inner(teacher_id)');
    if (currentUserRole !== 'admin') q = q.eq('students.teacher_id', currentUserID);
    const { data } = await q; if (!data || data.length === 0) return;
    const subs = {}; data.forEach(g => { const s = g.subject.toUpperCase(); if(!subs[s]) subs[s] = {t:0,c:0}; subs[s].t+=(g.class_score+g.exam_score); subs[s].c++; });
    const lbls = Object.keys(subs); const avgs = lbls.map(l => Math.round(subs[l].t / subs[l].c));
    const ctx = document.getElementById('progressChart').getContext('2d');
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, { type: 'line', data: { labels: lbls, datasets: [{ label: 'Average', data: avgs, stepped: true, borderColor: '#6366f1', borderWidth: 4, fill: true, backgroundColor: 'rgba(99, 102, 241, 0.05)' }] }, options: { responsive: true, maintainAspectRatio: false } });
}

async function updateRisk() {
    // UPDATED: Now uses academic_grades view to avoid false failure alerts
    let q = _supabase.from('academic_grades').select('student_id, class_score, exam_score, students!inner(name, teacher_id)');
    if (currentUserRole !== 'admin') q = q.eq('students.teacher_id', currentUserID);
    const { data } = await q; const map = {}; (data || []).forEach(g => { if(!map[g.student_id]) map[g.student_id] = {n:g.students.name, s:0, c:0}; map[g.student_id].s+=(g.class_score+g.exam_score); map[g.student_id].c++; });
    const risks = Object.values(map).filter(x => (x.s/x.c) < 45);
    document.getElementById('at-risk-list').innerHTML = risks.length ? risks.map(r => `<div class="p-3 bg-rose-50 text-rose-600 text-[10px] font-black rounded-xl uppercase">${r.n} (${Math.round(r.s/r.c)}%)</div>`).join('') : '<p class="text-[9px] text-emerald-500 font-black">ALL CLEAR</p>';
}

function toggleModal(id) { document.getElementById(id).classList.toggle('hidden'); }

// --- TEACHER REGISTRATION (FIX RELOAD) ---
document.getElementById('form-add-teacher').addEventListener('submit', async (e) => {
    e.preventDefault(); 
    
    const name = document.getElementById('t-name').value;
    const email = document.getElementById('t-email').value;
    const password = document.getElementById('t-pass').value;

    const { data, error } = await _supabase.auth.signUp({
        email: email,
        password: password,
        options: { data: { full_name: name, role: 'teacher' } }
    });

    if (error) {
        alert("Error: " + error.message);
    } else {
        await _supabase.from('profiles').insert([{ id: data.user.id, full_name: name, email: email, role: 'teacher' }]);
        alert("Teacher Access Granted Successfully!");
        document.getElementById('form-add-teacher').reset();
        loadStaffList();
    }
});
