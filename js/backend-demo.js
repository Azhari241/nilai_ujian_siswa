/* =========================================================================
 * DEMO BACKEND — hanya untuk pratinjau ketika Supabase BELUM dikonfigurasi
 * oleh administrator (config.js kosong). Meniru aturan database 0003:
 *   • setiap baris punya teacher_id; guru hanya melihat/mengubah miliknya
 *   • relasi lintas guru ditolak (kelas/ujian/siswa harus milik guru yang sama)
 *   • akun guru hanya dibuat admin; guru tidak bisa mengubah role sendiri
 * Data DEMO tersimpan di browser ini saja dan bukan data sekolah.
 * ========================================================================= */
(function () {
  const KEY = 'sm_demo_db_v3';
  const OLD_KEY = 'sm_demo_db_v2';
  const BACKUP_KEY = 'sm_demo_db_v2_backup_phase1';
  const MIGRATION_KEY = 'sm_demo_migrated_phase1_v3';
  const SKEY = 'sm_demo_session_v2';
  const STUDENT_SKEY = 'sm_demo_student_session_v1';
  const ACTIVE_SESSION_KEY = 'sm_demo_active_session_v1';
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now());
  const now = () => new Date().toISOString();
  const OWNED = ['classes', 'subjects', 'students', 'exams', 'exam_questions', 'grades', 'exam_responses', 'publication_settings', 'student_accounts', 'games', 'game_questions', 'game_assignments', 'game_attempts', 'game_results'];
  const GAME_TABLES = ['games', 'game_questions', 'game_assignments', 'game_attempts', 'game_results'];
  const ACCOUNT_STATUSES = ['PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'DISABLED'];
  const PBKDF2_ITERATIONS = 100000;

  const defSettings = (tid, school, schoolId) => ({ id: uid(), teacher_id: tid, school_id: schoolId || null, enabled: false, message: '', academic_year: '2026/2027', semester: 'Ganjil', default_kktp: 75, school_name: school || '' });
  const empty = () => ({
    schools: [{ id: 'demo-school-a', school_name: 'SMP Contoh (DEMO)', school_code: 'SMPDEMO', status: 'ACTIVE', created_at: now() }],
    classes: [], subjects: [], students: [], exams: [], exam_questions: [], grades: [], exam_responses: [], publication_settings: [], student_accounts: [], student_auth_events: [], audit_logs: [],
    games: [], game_questions: [], game_assignments: [], game_attempts: [], game_results: [], live_game_rooms: [], live_game_participants: [],
    profiles: [
      { id: 'demo-admin', role: 'admin', active: true, platform_admin: true, school_id: 'demo-school-a', full_name: 'Admin Sekolah', school_name: 'SMP Contoh (DEMO)', subject: '', email: 'admin.demo@contoh.sch.id', sign_enabled: true, sign_title: 'Guru Mata Pelajaran', sign_place: 'Bandung', sign_nip: '' },
      { id: 'demo-guru-a', role: 'teacher', active: true, school_id: 'demo-school-a', full_name: 'Ustadz Fulan (Guru A)', school_name: 'SMP Contoh (DEMO)', subject: 'Bahasa Arab', email: 'guru.a@contoh.sch.id', sign_enabled: true, sign_title: 'Guru Mata Pelajaran', sign_place: 'Bandung', sign_nip: '' },
      { id: 'demo-guru-b', role: 'teacher', active: true, school_id: 'demo-school-a', full_name: 'Ibu Siti (Guru B)', school_name: 'SMP Contoh (DEMO)', subject: 'Matematika', email: 'guru.b@contoh.sch.id', sign_enabled: false, sign_title: 'Guru Mata Pelajaran', sign_place: '', sign_nip: '' },
    ],
    portal_settings: [],
    app_settings: { portal_master: true }, // sakelar utama Portal Siswa sekolah (hanya admin)
  });

  const schoolKey = (name) => String(name || 'Sekolah DEMO').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  function migrateV2(old) {
    const db = Object.assign(empty(), old);
    const byName = new Map();
    (db.schools || []).forEach((s) => byName.set(schoolKey(s.school_name), s));
    (db.profiles || []).forEach((p) => {
      if (p.id === 'demo-admin') p.platform_admin = true;
      let school = p.school_id && (db.schools || []).find((x) => x.id === p.school_id);
      if (!school) {
        const k = schoolKey(p.school_name);
        school = byName.get(k);
        if (!school) {
          school = { id: uid(), school_name: p.school_name || 'Sekolah DEMO', school_code: 'SCH' + uid().replace(/-/g, '').slice(0, 8).toUpperCase(), status: 'ACTIVE', created_at: now() };
          db.schools.push(school); byName.set(k, school);
        }
        p.school_id = school.id;
      }
    });
    const ownerSchool = (teacherId) => ((db.profiles || []).find((p) => p.id === teacherId) || {}).school_id || null;
    OWNED.filter((t) => t !== 'student_accounts').forEach((t) => (db[t] || []).forEach((r) => { if (!r.school_id) r.school_id = ownerSchool(r.teacher_id); }));
    (db.portal_settings || []).forEach((p) => { if (!p.school_id) p.school_id = ownerSchool(p.teacher_id); });
    (db.audit_logs || []).forEach((l) => { if (!l.school_id) l.school_id = ownerSchool(l.actor); });
    db.student_accounts = db.student_accounts || [];
    db.student_auth_events = db.student_auth_events || [];
    db.schools = db.schools || [];
    return db;
  }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && d.profiles) return Object.assign(empty(), d);
    } catch (e) {}
    if (!localStorage.getItem(MIGRATION_KEY)) {
      const legacy = localStorage.getItem(OLD_KEY);
      if (legacy) {
        // Preserve the complete v2 snapshot before writing the migrated database.
        if (!localStorage.getItem(BACKUP_KEY)) localStorage.setItem(BACKUP_KEY, legacy);
        const migrated = migrateV2(JSON.parse(legacy));
        migrated.profiles.forEach((p) => { if (!migrated.portal_settings.some((x) => x.teacher_id === p.id)) migrated.portal_settings.push(defSettings(p.id, p.school_name, p.school_id)); });
        localStorage.setItem(KEY, JSON.stringify(migrated));
        localStorage.setItem(MIGRATION_KEY, '1');
        return migrated;
      }
      localStorage.setItem(MIGRATION_KEY, '1');
    }
    const d = empty(); d.profiles.forEach((p) => d.portal_settings.push(defSettings(p.id, p.school_name, p.school_id))); return d;
  }
  function save(db) { localStorage.setItem(KEY, JSON.stringify(db)); }
  function session() { try { return JSON.parse(localStorage.getItem(SKEY)); } catch (e) { return null; } }
  function me(db) {
    const active = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (active === 'student' || active === 'none') throw new DbError('Sesi aktif tidak memiliki hak akses guru. Silakan login sebagai guru.', '42501');
    const s = session(); if (!s) throw new DbError('Sesi berakhir. Silakan login kembali.', '401');
    const p = db.profiles.find((x) => x.id === s.user.id);
    if (!p || !p.active || !['teacher', 'admin'].includes(p.role)) throw new DbError('Akun tidak aktif atau belum disetujui sebagai guru.', '42501');
    if (!p.school_id || !db.schools.some((x) => x.id === p.school_id && x.status === 'ACTIVE')) throw new DbError('Sekolah akun tidak aktif atau tidak ditemukan.', '42501');
    return p;
  }

  const normName = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const SEM = { Ganjil: 1, Genap: 2 };
  const sortResults = (a, b) => (b.academic_year || '').localeCompare(a.academic_year || '') || (SEM[a.semester] - SEM[b.semester]) || a.subject.localeCompare(b.subject) || (a.date || '').localeCompare(b.date || '');

  class DbError extends Error { constructor(msg, code) { super(msg); this.code = code; } }

  // UNIQUE per guru (sesuai 0003)
  const UNIQUE = {
    students: [['nisn', 'NISN sudah digunakan siswa lain'], ['student_code', 'Kode siswa sudah digunakan'], ['nis', 'NIS sudah digunakan siswa lain']],
    classes: [[['name', 'academic_year'], 'Kelas dengan nama dan tahun pelajaran yang sama sudah ada']],
    subjects: [['name', 'Mata pelajaran sudah ada']],
    grades: [[['exam_id', 'student_id'], 'Nilai untuk siswa ini sudah ada pada penilaian tersebut']],
  };
  function checkUnique(db, table, row, ignoreId) {
    for (const [cols, msg] of (UNIQUE[table] || [])) {
      const c = Array.isArray(cols) ? cols : [cols];
      if (c.some((k) => row[k] === undefined || row[k] === null || row[k] === '')) continue;
      const hit = db[table].find((r) => r.id !== ignoreId && r.teacher_id === row.teacher_id && c.every((k) => String(r[k]).toLowerCase() === String(row[k]).toLowerCase()));
      if (hit) throw new DbError(msg, '23505');
    }
    if (table === 'schools' && db.schools.some((x) => x.id !== ignoreId && String(x.school_code).toLowerCase() === String(row.school_code).toLowerCase())) throw new DbError('Kode sekolah sudah digunakan.', '23505');
  }
  // relasi harus milik guru yang sama (meniru trigger enforce_owner)
  const FK = {
    student_accounts: [['student_id', 'students', 'Siswa']],
    students: [['class_id', 'classes', 'Kelas']],
    exams: [['class_id', 'classes', 'Kelas'], ['subject_id', 'subjects', 'Mata pelajaran']],
    exam_questions: [['exam_id', 'exams', 'Ujian/tugas']],
    exam_responses: [['exam_id', 'exams', 'Ujian/tugas']],
    publication_settings: [['exam_id', 'exams', 'Ujian/tugas']],
    grades: [['exam_id', 'exams', 'Penilaian'], ['student_id', 'students', 'Siswa']],
  };
  function checkFK(db, table, row) {
    for (const [col, parent, label] of (FK[table] || [])) {
      if (!row[col]) continue;
      const p = db[parent].find((x) => x.id === row[col]);
      if (!p) throw new DbError(`${label} tidak ditemukan`, '23503');
      if (p.teacher_id !== row.teacher_id || p.school_id !== row.school_id) throw new DbError(`${label} bukan milik Anda atau berbeda sekolah`, '42501');
    }
    if (row.school_id) {
      const school = db.schools.find((x) => x.id === row.school_id && x.status === 'ACTIVE');
      if (!school) throw new DbError('Sekolah tidak ditemukan atau tidak aktif.', '42501');
    }
  }
  const randomChars = (length, alphabet) => {
    const bytes = new Uint8Array(length); crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  };
  const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const fromHex = (hex) => new Uint8Array((hex.match(/.{1,2}/g) || []).map((x) => parseInt(x, 16)));
  async function passwordHash(password, saltHex) {
    if (!crypto.subtle) throw new DbError('Browser ini tidak menyediakan Web Crypto. Buka website melalui localhost atau HTTPS.');
    const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256);
    return { salt: toHex(salt), hash: toHex(new Uint8Array(bits)), iterations: PBKDF2_ITERATIONS };
  }
  async function passwordMatches(account, password) {
    if (!account || !account.password_hash || !account.password_salt) return false;
    const computed = await passwordHash(password, account.password_salt);
    return computed.hash === account.password_hash;
  }
  const safeAccount = (account) => {
    if (!account) return null;
    const { password_hash, password_salt, password_iterations, ...safe } = account;
    return safe;
  };
  function meStudent(db, allowMustChange = false) {
    if (localStorage.getItem(ACTIVE_SESSION_KEY) !== 'student') throw new DbError('Sesi siswa tidak aktif. Silakan login kembali.', '401');
    let s = null; try { s = JSON.parse(localStorage.getItem(STUDENT_SKEY)); } catch (e) {}
    const account = s && db.student_accounts.find((a) => a.id === s.account_id);
    if (!account || account.account_status !== 'ACTIVE') throw new DbError('Akun siswa tidak aktif atau sesi tidak valid.', '42501');
    const student = db.students.find((x) => x.id === account.student_id);
    if (!student || student.status !== 'aktif' || student.teacher_id !== account.teacher_id || student.school_id !== account.school_id) throw new DbError('Data siswa tidak aktif atau relasi akun tidak valid.', '42501');
    const teacher = db.profiles.find((p) => p.id === account.teacher_id);
    const school = db.schools.find((p) => p.id === account.school_id && p.status === 'ACTIVE');
    if (!teacher || !teacher.active || teacher.school_id !== account.school_id || !school) throw new DbError('Sekolah atau pemilik akun tidak aktif.', '42501');
    if (account.must_change_password && !allowMustChange) throw new DbError('Ganti password sementara sebelum melanjutkan.', 'PASSWORD_CHANGE_REQUIRED');
    return { account, student, teacher, school };
  }
  function findOwnedLiveRoom(db, roomId, teacher) {
    const room = (db.live_game_rooms || []).find((r) => r.id === roomId && r.teacher_id === teacher.id && r.school_id === teacher.school_id);
    if (!room) throw new DbError('Ruang permainan tidak ditemukan atau bukan milik Anda.', '42501');
    return room;
  }
  function liveRoomView(db, room, hostView) {
    const game = (db.games || []).find((g) => g.id === room.game_id && g.teacher_id === room.teacher_id && g.school_id === room.school_id) || {};
    const cls = db.classes.find((c) => c.id === room.class_id && c.teacher_id === room.teacher_id && c.school_id === room.school_id) || {};
    const teacher = db.profiles.find((p) => p.id === room.teacher_id && p.school_id === room.school_id) || {};
    const participants = (db.live_game_participants || []).filter((p) => p.room_id === room.id && p.teacher_id === room.teacher_id && p.school_id === room.school_id && p.status === 'JOINED').map((p) => ({ id: p.id, student_name: p.student_name, status: p.status, joined_at: p.joined_at }));
    return { id: room.id, code: room.code, assignment_id: room.assignment_id, game_id: room.game_id, game_title: game.title || game.name || 'Game', game_settings: hostView ? (game.settings || {}) : undefined, class_id: room.class_id, class_name: cls.name || '—', teacher_name: teacher.full_name || 'Guru', school_id: room.school_id, status: room.status, min_participants: room.min_participants, max_participants: room.max_participants, allow_late_join: !!room.allow_late_join, created_at: room.created_at, expires_at: room.expires_at, countdown_ends_at: room.countdown_ends_at, started_at: room.started_at, completed_at: room.completed_at, participant_count: participants.length, participants, host_view: !!hostView };
  }
  function expireLiveGameRoom(room) {
    if (room && room.expires_at && Date.parse(room.expires_at) <= Date.now() && ['WAITING', 'LOCKED', 'COUNTDOWN', 'IN_PROGRESS', 'PAUSED'].includes(room.status)) {
      room.status = 'EXPIRED'; room.updated_at = now(); return true;
    }
    return false;
  }
  function newLiveGameCode(db) {
    let code = ''; let tries = 0;
    do { code = randomChars(6, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'); tries++; } while ((db.live_game_rooms || []).some((r) => r.code === code) && tries < 100);
    if ((db.live_game_rooms || []).some((r) => r.code === code)) throw new DbError('Kode ruang belum dapat dibuat. Coba lagi.');
    return code;
  }
  const masterOn = (db) => !db.app_settings || db.app_settings.portal_master !== false;
  const openTeachers = (db) => (masterOn(db) ? db.portal_settings.filter((ps) => ps.enabled && db.profiles.some((p) => p.id === ps.teacher_id && p.active && ['teacher', 'admin'].includes(p.role) && db.schools.some((s) => s.id === p.school_id && s.status === 'ACTIVE'))).map((ps) => ps.teacher_id) : []);
  const mine = (db, table, id) => { const t = me(db); const r = db[table].find((x) => x.id === id && x.teacher_id === t.id && (!OWNED.includes(table) || x.school_id === t.school_id)); if (!r) throw new DbError('Data tidak ditemukan', 'PGRST116'); return r; };

  const DemoBackend = {
    mode: 'demo',
    label: 'DEMO',
    async getSession() { await wait(50); const active = localStorage.getItem(ACTIVE_SESSION_KEY); return active === 'student' || active === 'none' ? null : session(); },
    async getStudentSession() {
      await wait(40);
      if (localStorage.getItem(ACTIVE_SESSION_KEY) !== 'student') return null;
      try { const x = meStudent(load(), true); return { user: { id: x.account.id }, student: { id: x.student.id, full_name: x.student.full_name }, account: { id: x.account.id, username: x.account.username, school_id: x.account.school_id, teacher_id: x.account.teacher_id, account_status: x.account.account_status, must_change_password: x.account.must_change_password } }; }
      catch (e) { return null; }
    },
    async getStudentProfile() {
      const db = load(); const x = meStudent(db); const cls = db.classes.find((c) => c.id === x.student.class_id && c.teacher_id === x.student.teacher_id && c.school_id === x.student.school_id);
      return { student: { id: x.student.id, full_name: x.student.full_name, nis: x.student.nis || '', student_code: x.student.student_code || '', status: x.student.status }, class: cls ? { id: cls.id, name: cls.name, grade: cls.grade, academic_year: cls.academic_year } : null, school: { id: x.school.id, school_name: x.school.school_name }, account: safeAccount(x.account) };
    },
    async getStudentPortalData() {
      await wait(120);
      const db = load(); const x = meStudent(db); const { student, account, teacher, school } = x;
      const cls = db.classes.find((c) => c.id === student.class_id && c.teacher_id === teacher.id && c.school_id === school.id) || null;
      const ownExams = db.exams.filter((e) => e.teacher_id === teacher.id && e.school_id === school.id);
      const examById = new Map(ownExams.map((e) => [e.id, e]));
      const subjectById = new Map(db.subjects.filter((s) => s.teacher_id === teacher.id && s.school_id === school.id).map((s) => [s.id, s]));
      const published = (examId) => db.publication_settings.some((p) => p.exam_id === examId && p.teacher_id === teacher.id && p.school_id === school.id && p.is_published);
      const grades = db.grades.filter((g) => g.student_id === student.id && g.teacher_id === teacher.id && g.school_id === school.id && examById.has(g.exam_id) && published(g.exam_id)).map((g) => {
        const exam = examById.get(g.exam_id); const subject = subjectById.get(exam.subject_id);
        return { id: g.id, exam_name: exam.name, kind: exam.kind || 'ujian', subject: subject ? subject.name : '—', score: g.score, semester: exam.semester || '—', academic_year: exam.academic_year || '—', date: exam.date || exam.created_at, class_name: (db.classes.find((c) => c.id === exam.class_id && c.teacher_id === teacher.id && c.school_id === school.id) || {}).name || '—', published: true };
      }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      const localNow = new Date(); const today = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;
      const tasks = ownExams.filter((e) => e.kind === 'tugas' && cls && e.class_id === cls.id).map((e) => {
        const subject = subjectById.get(e.subject_id); const response = db.exam_responses.find((r) => r.exam_id === e.id && r.student_id === student.id && r.teacher_id === teacher.id && r.school_id === school.id);
        const due = e.due_date || e.date || '';
        const status = response ? 'Sudah dikerjakan' : (due && due < today ? 'Tenggat lewat · belum ada kiriman' : 'Belum dikerjakan');
        return { id: e.id, title: e.name, subject: subject ? subject.name : '—', teacher: teacher.full_name, description: e.description || e.instructions || '', due_date: due, status, semester: e.semester || '—', class_name: cls.name };
      }).sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
      // Fase ini belum memiliki modul penugasan game atau katalog materi guru.
      // Baca hanya penugasan berstatus terbit dan berelasi ke kelas pemilik bila kelak tersedia.
      const assignments = Array.isArray(db.game_assignments) ? db.game_assignments : [];
      const gameRecords = Array.isArray(db.games) ? db.games : [];
      const games = assignments.filter((a) => cls && a.teacher_id === teacher.id && a.school_id === school.id && a.class_id === cls.id && a.published === true && a.enabled !== false).map((a) => {
        const game = gameRecords.find((g) => g.id === a.game_id && g.teacher_id === teacher.id && g.school_id === school.id);
        if (!game) return null;
        const subject = subjectById.get(game.subject_id);
        if (game.status !== 'PUBLISHED') return null;
        const usedAttempts = (db.game_attempts || []).filter((r) => r.assignment_id === a.id && r.student_id === student.id && r.teacher_id === teacher.id && r.school_id === school.id && r.mode === 'individual' && r.status === 'COMPLETED').length;
        const limit = Number(a.max_attempts ?? (game.settings || {}).max_attempts) || 0;
        const availability = a.start_at && Date.parse(a.start_at) > Date.now() ? 'Jadwal belum dimulai' : a.end_at && Date.parse(a.end_at) < Date.now() ? 'Penugasan berakhir' : limit > 0 && usedAttempts >= limit ? 'Batas percobaan tercapai' : 'Belum dimainkan';
        return { id: a.id, game_id: game.id, title: game.title || game.name || 'Game', template: game.template, settings: game.settings || {}, modes: a.modes || (game.settings || {}).modes || ['individual'], max_attempts: limit, attempts_used: usedAttempts, subject: subject ? subject.name : '—', class_name: cls.name, chapter: game.chapter || '', material: game.material || '', teacher: teacher.full_name, description: game.description || '', difficulty: game.difficulty || '—', status: availability, start_at: a.start_at || null, end_at: a.end_at || null };
      }).filter(Boolean);
      const rawMaterials = Array.isArray(db.materials) ? db.materials : [];
      const materials = rawMaterials.filter((m) => cls && m.teacher_id === teacher.id && m.school_id === school.id && m.class_id === cls.id && m.published === true).map((m) => ({ id: m.id, title: m.title || m.name || 'Materi', subject: (subjectById.get(m.subject_id) || {}).name || '—', class_name: cls.name, semester: m.semester || '—', chapter: m.chapter || m.chapter_name || '', description: m.description || '', teacher: teacher.full_name, content: m.content || '' }));
      const history = [];
      db.student_auth_events.filter((e) => e.account_id === account.id && e.event === 'login_success').forEach((e) => history.push({ id: e.id, kind: 'login', title: 'Login Portal Siswa', description: 'Berhasil masuk ke akun belajar.', at: e.created_at }));
      db.exam_responses.filter((r) => r.student_id === student.id && r.teacher_id === teacher.id && r.school_id === school.id).forEach((r) => {
        const exam = examById.get(r.exam_id); if (exam && exam.kind === 'tugas') history.push({ id: 'task-' + r.id, kind: 'task', title: 'Tugas dikerjakan: ' + exam.name, description: 'Kiriman tercatat.', at: r.submitted_at || r.created_at });
      });
      grades.forEach((g) => history.push({ id: 'grade-' + g.id, kind: 'grade', title: 'Nilai dipublikasikan: ' + g.exam_name, description: `${g.subject} · ${g.score}`, at: g.date }));
      (db.game_results || []).filter((r) => r.student_id === student.id && r.account_id === account.id && r.teacher_id === teacher.id && r.school_id === school.id).forEach((r) => { const game = db.games.find((g) => g.id === r.game_id && g.teacher_id === teacher.id && g.school_id === school.id); history.push({ id: 'game-' + r.id, kind: 'game', title: 'Game selesai: ' + (game ? game.title : 'Game'), description: `${r.score} poin · ${r.mode === 'live' ? 'Live Game' : 'Individu'}`, at: r.completed_at }); });
      history.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
      const profile = { student: { id: student.id, full_name: student.full_name, nis: student.nis || '', student_code: student.student_code || '', status: student.status }, class: cls ? { id: cls.id, name: cls.name, grade: cls.grade, academic_year: cls.academic_year } : null, school: { id: school.id, school_name: school.school_name }, account: { username: account.username, account_status: account.account_status, must_change_password: account.must_change_password, last_login: account.last_login || null } };
      return { profile, teacher: { full_name: teacher.full_name }, grades, tasks, games, materials, history, summary: { published_grades: grades.length, tasks: tasks.length, pending_tasks: tasks.filter((t) => !t.status.startsWith('Sudah')).length, games: games.length, activities: history.length } };
    },
    /* ---------- Arabic game engine contract (DEMO only) ---------- */
    async listTeacherGames() {
      await wait(80); const db = load(); const t = me(db);
      const subjects = new Map(db.subjects.filter((s) => s.teacher_id === t.id && s.school_id === t.school_id).map((s) => [s.id, s]));
      const classes = new Map(db.classes.filter((c) => c.teacher_id === t.id && c.school_id === t.school_id).map((c) => [c.id, c]));
      return (db.games || []).filter((g) => g.teacher_id === t.id && g.school_id === t.school_id).map((g) => ({ ...g, subject_name: (subjects.get(g.subject_id) || {}).name || '—', question_count: (db.game_questions || []).filter((q) => q.game_id === g.id && q.teacher_id === t.id && q.school_id === t.school_id).length, assignments: (db.game_assignments || []).filter((a) => a.game_id === g.id && a.teacher_id === t.id && a.school_id === t.school_id).map((a) => ({ ...a, class_name: (classes.get(a.class_id) || {}).name || '—' })) }));
    },
    async getTeacherGameEditor(gameId) {
      await wait(50); const db=load(); const t=me(db); const game=(db.games||[]).find((g)=>g.id===gameId&&g.teacher_id===t.id&&g.school_id===t.school_id);
      if(!game) throw new DbError('Game tidak ditemukan atau bukan milik Anda.','42501');
      const questions=(db.game_questions||[]).filter((q)=>q.game_id===game.id&&q.teacher_id===t.id&&q.school_id===t.school_id).sort((a,b)=>a.position-b.position);
      return { game, questions };
    },
    async saveGameDefinition({ game_id, game, questions } = {}) {
      await wait(100); const db = load(); const t = me(db);
      if (!game || !String(game.title || '').trim()) throw new DbError('Nama game wajib diisi.');
      if (!['who_am_i', 'letters', 'memory', 'sentence', 'true_false', 'competition'].includes(game.template)) throw new DbError('Jenis permainan tidak valid.');
      const qs = Array.isArray(questions) ? questions : [];
      if (game.status === 'PUBLISHED' && !qs.length) throw new DbError('Game tidak dapat diterbitkan tanpa soal.');
      const subject = game.subject_id && db.subjects.find((s) => s.id === game.subject_id && s.teacher_id === t.id && s.school_id === t.school_id);
      if (game.subject_id && !subject) throw new DbError('Mata pelajaran tidak ditemukan pada akun guru ini.');
      const settings = Object.assign({ modes: ['individual', 'live'], duration_seconds: 600, question_count: Math.max(1, Array.isArray(questions) ? questions.length : 0), points_per_question: 10, wrong_points: 0, shuffle_questions: true, shuffle_options: true, max_attempts: 1, show_explanation: true, show_leaderboard: true, speed_bonus: false }, game.settings || {});
      if (!Array.isArray(settings.modes) || settings.modes.some((m) => !['individual','live'].includes(m)) || !settings.modes.length) throw new DbError('Pilih mode Individu, Live, atau keduanya.');
      if (!Number.isInteger(Number(settings.duration_seconds)) || Number(settings.duration_seconds) < 0 || Number(settings.duration_seconds) > 86400) throw new DbError('Durasi harus 0–86400 detik.');
      if (!Number.isInteger(Number(settings.question_count)) || Number(settings.question_count) < 1 || Number(settings.question_count) > 500) throw new DbError('Jumlah soal harus 1–500.');
      if (!Number.isInteger(Number(settings.max_attempts)) || Number(settings.max_attempts) < 0 || Number(settings.max_attempts) > 1000) throw new DbError('Batas percobaan harus 0–1000.');
      const record = game_id ? (db.games || []).find((g) => g.id === game_id && g.teacher_id === t.id && g.school_id === t.school_id) : null;
      if (game_id && !record) throw new DbError('Game tidak ditemukan atau bukan milik Anda.', '42501');
      const saved = Object.assign(record || { id: uid(), teacher_id: t.id, school_id: t.school_id, created_at: now() }, {
        title: String(game.title).trim(), description: String(game.description || ''), template: game.template,
        subject_id: game.subject_id || null, chapter: String(game.chapter || ''), material: String(game.material || ''), difficulty: game.difficulty || 'Sedang',
        status: game.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT', settings, updated_at: now()
      });
      const normalized = qs.map((q, i) => {
        if (!String(q.prompt || q.text || '').trim()) throw new DbError(`Teks soal nomor ${i + 1} wajib diisi.`);
        const choices = Array.isArray(q.options) ? q.options.map((v) => String(v)) : [];
        const questionType = q.question_type || (saved.template === 'competition' ? 'mcq' : saved.template);
        if (saved.template === 'competition' && !['mcq','true_false','letters','sentence','vocab'].includes(questionType)) throw new DbError(`Tipe soal kompetisi nomor ${i + 1} tidak valid.`);
        if ((saved.template === 'who_am_i' || (saved.template === 'competition' && ['mcq','vocab'].includes(questionType))) && !choices.length) throw new DbError(`Soal ${i + 1} harus memiliki pilihan jawaban.`);
        if ((saved.template === 'letters' || saved.template === 'sentence' || (saved.template === 'competition' && ['letters','sentence'].includes(questionType))) && !choices.length) throw new DbError(`Soal susun nomor ${i + 1} harus memiliki huruf/kata acak.`);
        if (saved.template === 'who_am_i' && choices.length !== 4) throw new DbError(`Game مَنْ أَنَا؟ memerlukan tepat empat pilihan pada soal ${i + 1}.`);
        if ((saved.template === 'who_am_i' || (saved.template === 'competition' && ['mcq','vocab'].includes(questionType))) && !choices.includes(String(q.correct_answer ?? q.answer_key ?? ''))) throw new DbError(`Kunci soal ${i + 1} harus sama dengan salah satu pilihan.`);
        if ((saved.template === 'letters' || saved.template === 'sentence' || (saved.template === 'competition' && ['letters','sentence'].includes(questionType))) && (!Array.isArray(q.correct_answer) || q.correct_answer.length !== choices.length)) throw new DbError(`Jumlah token kunci dan token acak harus sama pada soal ${i + 1}.`);
        if ((saved.template === 'true_false' || (saved.template === 'competition' && questionType === 'true_false')) && !['صَحِيحٌ','خَطَأٌ'].includes(String(q.correct_answer))) throw new DbError(`Kunci soal ${i + 1} harus صَحِيحٌ atau خَطَأٌ.`);
        if (saved.template === 'memory' && !(q.pair_left && q.pair_right)) throw new DbError(`Pasangan kartu nomor ${i + 1} belum lengkap.`);
        if (!Array.isArray(q.correct_answer) && (q.correct_answer === undefined || q.correct_answer === null || q.correct_answer === '')) throw new DbError(`Kunci jawaban soal ${i + 1} wajib diisi.`);
        const row = Object.assign({}, q, { id: q.id || uid(), game_id: saved.id, teacher_id: t.id, school_id: t.school_id, position: i + 1, question_type: questionType, prompt: String(q.prompt || q.text || ''), options: choices, points: Math.max(0, Number(q.points) || Number(saved.settings.points_per_question) || 10), updated_at: now() });
        if (saved.template === 'memory') { row.pair_left_id = row.pair_left_id || uid(); row.pair_right_id = row.pair_right_id || uid(); row.pair_map = { [row.pair_left_id]: row.pair_right_id }; }
        return row;
      });
      if (!db.games) db.games = []; if (!db.game_questions) db.game_questions = [];
      if (!record) db.games.push(saved);
      db.game_questions = db.game_questions.filter((q) => !(q.game_id === saved.id && q.teacher_id === t.id && q.school_id === t.school_id)).concat(normalized);
      db.audit_logs.unshift({ id: uid(), actor: t.id, school_id: t.school_id, action: record ? 'game_update' : 'game_create', entity: 'games', entity_id: saved.id, detail: { title: saved.title, question_count: normalized.length, status: saved.status }, created_at: now() });
      save(db); return { ...saved, question_count: normalized.length };
    },
    async createGameAssignment({ game_id, class_id, start_at = null, end_at = null, max_attempts, modes } = {}) {
      await wait(80); const db = load(); const t = me(db);
      const game = (db.games || []).find((g) => g.id === game_id && g.teacher_id === t.id && g.school_id === t.school_id && g.status === 'PUBLISHED');
      const cls = db.classes.find((c) => c.id === class_id && c.teacher_id === t.id && c.school_id === t.school_id);
      if (!game || !cls) throw new DbError('Game harus sudah diterbitkan dan kelas harus milik guru/sekolah yang sama.', '42501');
      const requestedModes = modes === undefined ? ((game.settings || {}).modes || ['individual']) : modes;
      if (!Array.isArray(requestedModes)) throw new DbError('Daftar mode penugasan tidak valid.');
      const allowedModes = requestedModes.filter((m) => ['individual', 'live'].includes(m));
      if (!allowedModes.length) throw new DbError('Pilih minimal satu mode permainan.');
      if (start_at && !Number.isFinite(Date.parse(start_at)) || end_at && !Number.isFinite(Date.parse(end_at))) throw new DbError('Jadwal mulai atau berakhir tidak valid.');
      if (start_at && end_at && Date.parse(end_at) < Date.parse(start_at)) throw new DbError('Jadwal berakhir harus setelah jadwal mulai.');
      const attemptLimit = Number(max_attempts ?? game.settings.max_attempts ?? 0);
      if (!Number.isInteger(attemptLimit) || attemptLimit < 0 || attemptLimit > 1000) throw new DbError('Batas percobaan harus 0–1000.');
      const assignment = { id: uid(), game_id, class_id, teacher_id: t.id, school_id: t.school_id, published: true, enabled: true, status: 'PUBLISHED', start_at: start_at || null, end_at: end_at || null, max_attempts: attemptLimit, modes: allowedModes, created_at: now(), updated_at: now() };
      if (db.game_assignments.some((a) => a.game_id === game_id && a.class_id === class_id && a.teacher_id === t.id && a.school_id === t.school_id && a.enabled !== false)) throw new DbError('Game sudah ditugaskan ke kelas ini.');
      db.game_assignments.push(assignment); save(db); return assignment;
    },
    async listStudentGameHistory() {
      const db = load(); const x = meStudent(db);
      return (db.game_results || []).filter((r) => r.student_id === x.student.id && r.account_id === x.account.id && r.teacher_id === x.teacher.id && r.school_id === x.school.id).sort((a,b) => String(b.completed_at).localeCompare(String(a.completed_at)));
    },
    async getStudentGameDetail(assignmentId) {
      await wait(60); const db = load(); const x = meStudent(db);
      const a = (db.game_assignments || []).find((v) => v.id === assignmentId && v.teacher_id === x.teacher.id && v.school_id === x.school.id && v.class_id === x.student.class_id && v.published === true && v.enabled !== false);
      const g = a && (db.games || []).find((v) => v.id === a.game_id && v.teacher_id === x.teacher.id && v.school_id === x.school.id && v.status === 'PUBLISHED');
      if (!a || !g) throw new DbError('Game tidak tersedia untuk akun dan kelas Anda.', '42501');
      const questions = (db.game_questions || []).filter((q) => q.game_id === g.id && q.teacher_id === x.teacher.id && q.school_id === x.school.id).sort((u,v) => u.position-v.position);
      const subject = db.subjects.find((s) => s.id === g.subject_id && s.teacher_id === x.teacher.id && s.school_id === x.school.id);
      const attempts = (db.game_attempts || []).filter((r) => r.assignment_id === a.id && r.student_id === x.student.id && r.teacher_id === x.teacher.id && r.school_id === x.school.id);
      return { assignment: { id: a.id, class_id: a.class_id, start_at: a.start_at, end_at: a.end_at, max_attempts: a.max_attempts, modes: a.modes || g.settings.modes || ['individual'] }, game: { id: g.id, title: g.title, description: g.description, template: g.template, subject: subject ? subject.name : '—', chapter: g.chapter, material: g.material, difficulty: g.difficulty, settings: g.settings }, questions: questions.map((q) => { const { correct_answer, answer_key, pair_map, ...safe } = q; return safe; }), attempts: attempts.map((v) => ({ id: v.id, status: v.status, started_at: v.started_at, completed_at: v.completed_at })) };
    },
    async startGameAttempt({ assignment_id, mode = 'individual', session_id = null } = {}) {
      await wait(70); const db = load(); const x = meStudent(db); const nowMs = Date.now();
      const a = (db.game_assignments || []).find((v) => v.id === assignment_id && v.teacher_id === x.teacher.id && v.school_id === x.school.id && v.class_id === x.student.class_id && v.published === true && v.enabled !== false);
      const g = a && db.games.find((v) => v.id === a.game_id && v.teacher_id === x.teacher.id && v.school_id === x.school.id && v.status === 'PUBLISHED');
      if (!a || !g || !(a.modes || g.settings.modes || []).includes(mode)) throw new DbError('Mode permainan atau penugasan tidak tersedia.');
      if (a.start_at && Date.parse(a.start_at) > nowMs) throw new DbError('Jadwal game belum dimulai.');
      if (a.end_at && Date.parse(a.end_at) < nowMs) throw new DbError('Jadwal penugasan game telah berakhir.');
      let room = null;
      if (mode === 'live') {
        room = (db.live_game_rooms || []).find((r) => r.id === session_id && r.assignment_id === a.id && r.game_id === g.id && r.teacher_id === x.teacher.id && r.school_id === x.school.id && r.class_id === x.student.class_id);
        const joined = room && (db.live_game_participants || []).some((p) => p.room_id === room.id && p.student_id === x.student.id && p.account_id === x.account.id && p.status === 'JOINED');
        if (!room || !joined || room.status !== 'IN_PROGRESS') throw new DbError('Sesi belum berjalan atau akun Anda bukan peserta yang terdaftar.');
      } else if (mode !== 'individual') throw new DbError('Mode tidak valid.');
      const active = (db.game_attempts || []).find((v) => v.student_id === x.student.id && v.assignment_id === a.id && v.session_id === (session_id || null) && v.status === 'IN_PROGRESS');
      if (active) return { attempt_id: active.id, mode, started_at: active.started_at, deadline_at: active.deadline_at, current_index: active.current_index || 0, memory_moves: active.memory_moves || 0, last_feedback: active.last_feedback || null, matched_card_ids: active.matched_card_ids || [], game: { id: g.id, title: g.title, template: g.template, settings: g.settings }, questions: active.question_snapshot, answers: active.answers || {} };
      const completed = (db.game_attempts || []).filter((v) => v.student_id === x.student.id && v.assignment_id === a.id && v.mode === mode && (mode !== 'live' || v.session_id === session_id) && v.status === 'COMPLETED').length;
      if (mode === 'live' && completed > 0) throw new DbError('Akun Anda sudah menyelesaikan game pada sesi ini.');
      const limit = Number(a.max_attempts ?? g.settings.max_attempts ?? 0);
      if (mode === 'individual' && limit > 0 && completed >= limit) throw new DbError('Batas percobaan untuk game ini sudah habis.');
      const attemptNumber = (db.game_attempts || []).filter((v) => v.student_id === x.student.id && v.assignment_id === a.id && v.mode === mode && (mode !== 'live' || v.session_id === session_id)).length + 1;
      let qs = (db.game_questions || []).filter((q) => q.game_id === g.id && q.teacher_id === x.teacher.id && q.school_id === x.school.id).sort((u,v) => u.position-v.position);
      if (!qs.length) throw new DbError('Game belum memiliki soal.');
      const count = Math.max(1, Number(g.settings.question_count) || qs.length); if (qs.length < count) throw new DbError(`Konfigurasi meminta ${count} soal, tetapi baru tersedia ${qs.length}.`);
      if (g.settings.shuffle_questions) qs = qs.slice().sort(() => Math.random() - .5); qs = qs.slice(0, count);
      const safe = qs.map((q) => { const { correct_answer, answer_key, pair_map, ...publicQ } = q; if (g.settings.shuffle_options && Array.isArray(publicQ.options) && publicQ.options.length > 1) publicQ.options = publicQ.options.slice().sort(()=>Math.random()-.5); return publicQ; });
      const attempt = { id: uid(), attempt_number: attemptNumber, student_id: x.student.id, account_id: x.account.id, teacher_id: x.teacher.id, school_id: x.school.id, class_id: x.student.class_id, game_id: g.id, assignment_id: a.id, session_id: room ? room.id : null, mode, status: 'IN_PROGRESS', memory_moves: 0, speed_bonus: g.settings.speed_bonus === true, allotted_seconds: Math.max(0, Number(g.settings.duration_seconds) || 0) / Math.max(1, qs.length), question_snapshot: safe, answer_snapshot: qs.map((q) => ({ id: q.id, correct_answer: q.correct_answer ?? q.answer_key, pair_map: q.pair_map, points: q.points, wrong_points: Number(g.settings.wrong_points) || 0 })), answers: {}, response_times: {}, current_index: 0, matched_card_ids: [], started_at: now(), deadline_at: Number(g.settings.duration_seconds) > 0 ? new Date(nowMs + Number(g.settings.duration_seconds) * 1000).toISOString() : null };
      if (!db.game_attempts) db.game_attempts = []; db.game_attempts.push(attempt); save(db);
      return { attempt_id: attempt.id, mode, started_at: attempt.started_at, deadline_at: attempt.deadline_at, game: { id: g.id, title: g.title, template: g.template, settings: g.settings }, questions: safe, answers: {} };
    },
    async saveGameAnswer({ attempt_id, question_id, answer } = {}) {
      const db = load(); const x = meStudent(db); const a = (db.game_attempts || []).find((v) => v.id === attempt_id && v.student_id === x.student.id && v.account_id === x.account.id && v.teacher_id === x.teacher.id && v.school_id === x.school.id && v.status === 'IN_PROGRESS');
      if (!a) throw new DbError('Percobaan aktif tidak ditemukan.'); if (!a.question_snapshot.some((q) => q.id === question_id)) throw new DbError('Soal tidak termasuk percobaan ini.');
      if (a.deadline_at && Date.parse(a.deadline_at) <= Date.now()) throw new DbError('Waktu permainan sudah habis.');
      if (a.mode === 'live') { const room=db.live_game_rooms.find((r)=>r.id===a.session_id&&r.teacher_id===x.teacher.id&&r.school_id===x.school.id); if(!room||room.status!=='IN_PROGRESS') throw new DbError('Sesi Live sedang dijeda atau sudah ditutup.'); }
      const q = a.question_snapshot.find((item) => item.id === question_id); const key = a.answer_snapshot.find((item) => item.id === question_id);
      let correct = false;
      if (key.pair_map) correct = !!(answer && String(answer[key.pair_map && Object.keys(key.pair_map)[0]]) === String(key.pair_map[Object.keys(key.pair_map)[0]]));
      else if (Array.isArray(key.correct_answer)) correct = Array.isArray(answer) && key.correct_answer.length === answer.length && key.correct_answer.every((v,i)=>String(v).normalize('NFC').trim()===String(answer[i]).normalize('NFC').trim());
      else correct = String(answer ?? '').normalize('NFC').trim() === String(key.correct_answer ?? '').normalize('NFC').trim();
      a.answers[question_id] = answer; a.response_times = a.response_times || {}; a.response_times[question_id] = now(); if(key.pair_map) a.memory_moves = (a.memory_moves||0)+1; a.current_index = Math.max(a.current_index || 0, a.question_snapshot.findIndex((item)=>item.id===question_id));
      const game = db.games.find((g)=>g.id===a.game_id&&g.teacher_id===x.teacher.id&&g.school_id===x.school.id); const explanation = game && game.settings && game.settings.show_explanation !== false ? (q && q.explanation || '') : '';
      a.last_feedback = { question_id, answer, correct, explanation };
      if (key.pair_map && correct) a.matched_card_ids = [...new Set([...(a.matched_card_ids||[]), ...Object.keys(key.pair_map), ...Object.values(key.pair_map)])];
      a.updated_at = now(); save(db); return { correct, explanation, memory_moves: a.memory_moves || 0 };
    },
    async advanceGameAttempt(attemptId, index) {
      const db = load(); const x = meStudent(db); const a = (db.game_attempts || []).find((v) => v.id === attemptId && v.student_id === x.student.id && v.account_id === x.account.id && v.teacher_id === x.teacher.id && v.school_id === x.school.id && v.status === 'IN_PROGRESS');
      if (!a) throw new DbError('Percobaan aktif tidak ditemukan.');
      if (!Number.isInteger(index) || index < 0 || index >= a.question_snapshot.length) throw new DbError('Progres soal tidak valid.');
      a.current_index = index; a.updated_at = now(); save(db); return true;
    },
    async completeGameAttempt(attemptId) {
      await wait(60); const db = load(); const x = meStudent(db); const attempt = (db.game_attempts || []).find((v) => v.id === attemptId && v.student_id === x.student.id && v.account_id === x.account.id && v.teacher_id === x.teacher.id && v.school_id === x.school.id);
      if (!attempt) throw new DbError('Percobaan tidak ditemukan atau bukan milik akun Anda.', '42501');
      if (attempt.result_id) return db.game_results.find((r) => r.id === attempt.result_id);
      if (attempt.status !== 'IN_PROGRESS') throw new DbError('Percobaan sudah ditutup.');
      if (attempt.deadline_at && Date.parse(attempt.deadline_at) > Date.now() && Object.keys(attempt.answers || {}).length < attempt.question_snapshot.length) throw new DbError('Selesaikan semua soal sebelum mengakhiri permainan.');
      if (attempt.mode === 'live') { const room = db.live_game_rooms.find((r) => r.id === attempt.session_id && r.teacher_id === x.teacher.id && r.school_id === x.school.id); if (!room || !['IN_PROGRESS','PAUSED'].includes(room.status)) throw new DbError('Sesi Live Game sudah tidak aktif.'); }
      const game = db.games.find((g) => g.id === attempt.game_id && g.teacher_id === x.teacher.id && g.school_id === x.school.id); const settings = game.settings || {};
      let correct = 0; let raw = 0; const details = attempt.answer_snapshot.map((q) => {
        const submitted = attempt.answers[q.id]; const expected = q.correct_answer; let ok = false;
        if (Array.isArray(expected)) ok = Array.isArray(submitted) && expected.length === submitted.length && expected.every((v,i) => String(v).normalize('NFC').trim() === String(submitted[i]).normalize('NFC').trim());
        else if (q.pair_map) ok = submitted && typeof submitted === 'object' && Object.entries(q.pair_map).every(([k,v]) => String(submitted[k]) === String(v));
        else ok = String(submitted ?? '').normalize('NFC').trim() === String(expected ?? '').normalize('NFC').trim();
        const earned = ok ? Number(q.points) : Number(q.wrong_points || 0); if (ok) correct++; raw += earned;
        return { question_id: q.id, answer: submitted ?? null, correct: ok, earned_points: earned };
      });
      const max = attempt.answer_snapshot.reduce((s,q)=>s+Number(q.points||0),0); const fastCount=attempt.speed_bonus?details.filter((d)=>d.correct&&attempt.response_times&&attempt.response_times[d.question_id]&&Date.parse(attempt.response_times[d.question_id])-Date.parse(attempt.started_at)<=Math.max(5,attempt.allotted_seconds*.25)).length:0; const bonus_points=fastCount?Math.min(10,fastCount*2):0; const score = max ? Math.max(0, Math.min(100, Math.round(raw / max * 100 + bonus_points))) : 0;
      const completedAt = now(); const result = { id: uid(), attempt_id: attempt.id, attempt_number: attempt.attempt_number, student_id: x.student.id, account_id: x.account.id, teacher_id: x.teacher.id, school_id: x.school.id, class_id: attempt.class_id, game_id: attempt.game_id, assignment_id: attempt.assignment_id, session_id: attempt.session_id, mode: attempt.mode, score, bonus_points, memory_moves: attempt.memory_moves || 0, correct_count: correct, wrong_count: details.length-correct, total_questions: details.length, details, started_at: attempt.started_at, completed_at: completedAt, duration_seconds: Math.max(0, Math.round((Date.parse(completedAt)-Date.parse(attempt.started_at))/1000)), status: 'COMPLETED' };
      if (!db.game_results) db.game_results=[]; db.game_results.push(result); attempt.status='COMPLETED'; attempt.completed_at=completedAt; attempt.result_id=result.id; attempt.updated_at=completedAt;
      save(db); return result;
    },
    async getLiveGameResults(roomId) {
      const db = load(); const t = me(db); findOwnedLiveRoom(db, roomId, t);
      return (db.game_results || []).filter((r) => r.session_id === roomId && r.teacher_id === t.id && r.school_id === t.school_id).map((r) => Object.assign({}, r, { student_name: (db.students.find((s) => s.id === r.student_id && s.teacher_id === t.id && s.school_id === t.school_id) || {}).full_name || 'Siswa' })).sort((a,b)=>b.score-a.score || a.duration_seconds-b.duration_seconds);
    },
    // Live Game backend contract: listLiveGameSources, createLiveGameRoom,
    // createLiveGameCode, joinLiveGameRoom, removeLiveGameParticipant,
    // setLiveGameRoomStatus, startLiveGameRoom, getLiveGameParticipants,
    // getLiveGameRoom, recoverLiveGameSession. A production
    // adapter should enforce writes in Edge Functions and publish state via Realtime.
    async listLiveGameSources() {
      await wait(100); const db = load(); const t = me(db);
      const classes = new Map(db.classes.filter((c) => c.teacher_id === t.id && c.school_id === t.school_id).map((c) => [c.id, c]));
      const subjects = new Map(db.subjects.filter((s) => s.teacher_id === t.id && s.school_id === t.school_id).map((s) => [s.id, s]));
      return (db.game_assignments || []).filter((a) => a.teacher_id === t.id && a.school_id === t.school_id && a.published === true && a.enabled !== false && classes.has(a.class_id)).map((a) => {
        const game = (db.games || []).find((g) => g.id === a.game_id && g.teacher_id === t.id && g.school_id === t.school_id && g.status === 'PUBLISHED' && ((g.settings || {}).modes || []).includes('live'));
        if (!game || !(a.modes || game.settings.modes || []).includes('live') || !(db.game_questions || []).some((q) => q.game_id === game.id && q.teacher_id === t.id && q.school_id === t.school_id)) return null;
        const cls = classes.get(a.class_id); const subject = subjects.get(game.subject_id);
        return { assignment_id: a.id, game_id: game.id, title: game.title || game.name || 'Game', class_id: cls.id, class_name: cls.name, subject: subject ? subject.name : '—', chapter: game.chapter || '', material: game.material || '', teacher: t.full_name };
      }).filter(Boolean);
    },
    async listLiveGameRooms() {
      await wait(100); const db = load(); const t = me(db);
      const rooms = (db.live_game_rooms || []).filter((r) => r.teacher_id === t.id && r.school_id === t.school_id);
      let changed = false; rooms.forEach((r) => { if (expireLiveGameRoom(r)) changed = true; }); if (changed) save(db);
      return rooms.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map((r) => liveRoomView(db, r, true));
    },
    async createLiveGameRoom({ assignment_id, min_participants = 2, max_participants = 30, allow_late_join = false } = {}) {
      await wait(120); const db = load(); const t = me(db);
      const assignment = (db.game_assignments || []).find((a) => a.id === assignment_id && a.teacher_id === t.id && a.school_id === t.school_id && a.published === true && a.enabled !== false && (a.modes || []).includes('live'));
      const game = assignment && (db.games || []).find((g) => g.id === assignment.game_id && g.teacher_id === t.id && g.school_id === t.school_id && g.status === 'PUBLISHED' && ((g.settings || {}).modes || []).includes('live'));
      const cls = assignment && db.classes.find((c) => c.id === assignment.class_id && c.teacher_id === t.id && c.school_id === t.school_id);
      if (!assignment || !game || !cls || !(db.game_questions || []).some((q) => q.game_id === game.id && q.teacher_id === t.id && q.school_id === t.school_id)) throw new DbError('Pilih penugasan game terbit milik Anda dengan soal, mode Live, dan kelas yang valid.', '42501');
      const min = Number(min_participants); const max = Number(max_participants);
      if (!Number.isInteger(min) || min < 1 || min > 100 || !Number.isInteger(max) || max < min || max > 100) throw new DbError('Jumlah peserta harus 1–100 dan batas maksimum tidak boleh lebih kecil dari minimum.');
      const code = newLiveGameCode(db);
      const room = { id: uid(), code, game_id: game.id, assignment_id: assignment.id, class_id: cls.id, school_id: t.school_id, teacher_id: t.id, status: 'WAITING', min_participants: min, max_participants: max, allow_late_join: !!allow_late_join, created_at: now(), updated_at: now(), expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), countdown_ends_at: null, started_at: null, completed_at: null };
      db.live_game_rooms.push(room); db.audit_logs.unshift({ id: uid(), actor: t.id, school_id: t.school_id, action: 'live_game_room_create', entity: 'live_game_rooms', entity_id: room.id, detail: { code, game_id: game.id, class_id: cls.id }, created_at: now() }); save(db);
      return liveRoomView(db, room, true);
    },
    async createLiveGameCode() {
      await wait(60); const db = load(); me(db); return newLiveGameCode(db);
    },
    async joinLiveGameRoom(code) {
      await wait(120); const db = load(); const x = meStudent(db); const normalized = String(code || '').trim().toUpperCase();
      if (!/^[A-HJ-NP-Z2-9]{6}$/.test(normalized)) throw new DbError('Masukkan kode permainan 6 karakter yang valid.');
      const room = (db.live_game_rooms || []).find((r) => r.code === normalized);
      if (!room) throw new DbError('Ruang permainan tidak ditemukan. Periksa kembali kodenya.');
      if (room.expires_at && Date.parse(room.expires_at) <= Date.now() && !['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(room.status)) { room.status = 'EXPIRED'; room.updated_at = now(); save(db); throw new DbError('Kode permainan sudah kedaluwarsa.'); }
      const assignment = (db.game_assignments || []).find((a) => a.id === room.assignment_id && a.game_id === room.game_id && a.teacher_id === room.teacher_id && a.school_id === room.school_id && a.class_id === room.class_id && a.published === true && a.enabled !== false && (a.modes || []).includes('live'));
      const game = (db.games || []).find((g) => g.id === room.game_id && g.teacher_id === room.teacher_id && g.school_id === room.school_id && g.status === 'PUBLISHED' && ((g.settings || {}).modes || []).includes('live'));
      const cls = db.classes.find((c) => c.id === room.class_id && c.teacher_id === room.teacher_id && c.school_id === room.school_id);
      if (!assignment || !game || !cls || !(db.game_questions || []).some((q) => q.game_id === game.id && q.teacher_id === room.teacher_id && q.school_id === room.school_id) || x.student.teacher_id !== room.teacher_id || x.student.school_id !== room.school_id || x.student.class_id !== room.class_id) throw new DbError('Akun Anda tidak termasuk kelas atau game yang ditugaskan untuk ruang ini.', '42501');
      const existing = (db.live_game_participants || []).find((p) => p.room_id === room.id && p.student_id === x.student.id);
      if (existing && existing.status === 'REMOVED') throw new DbError('Host telah mengeluarkan Anda dari ruang ini.');
      if (!['WAITING', 'LOCKED', 'COUNTDOWN', 'IN_PROGRESS', 'PAUSED'].includes(room.status)) throw new DbError('Ruang permainan tidak lagi menerima peserta.');
      if (room.status !== 'WAITING' && !(room.allow_late_join && ['COUNTDOWN', 'IN_PROGRESS', 'PAUSED'].includes(room.status))) throw new DbError('Ruang permainan sudah dikunci atau dimulai dan tidak menerima peserta terlambat.');
      const active = (db.live_game_participants || []).filter((p) => p.room_id === room.id && p.status === 'JOINED');
      if (!existing && active.length >= room.max_participants) throw new DbError('Ruang permainan sudah penuh.');
      if (existing) { existing.status = 'JOINED'; existing.joined_at = now(); existing.last_seen_at = now(); }
      else db.live_game_participants.push({ id: uid(), room_id: room.id, school_id: room.school_id, teacher_id: room.teacher_id, class_id: room.class_id, student_id: x.student.id, account_id: x.account.id, student_name: x.student.full_name, status: 'JOINED', joined_at: now(), last_seen_at: now(), removed_at: null });
      room.updated_at = now(); save(db);
      return liveRoomView(db, room, false);
    },
    async removeLiveGameParticipant(roomId, participantId) {
      await wait(100); const db = load(); const t = me(db); const room = findOwnedLiveRoom(db, roomId, t);
      if (!['WAITING', 'LOCKED'].includes(room.status)) throw new DbError('Peserta hanya dapat dikeluarkan sebelum hitung mundur dimulai.');
      const p = (db.live_game_participants || []).find((x) => x.id === participantId && x.room_id === room.id && x.teacher_id === t.id && x.school_id === t.school_id);
      if (!p) throw new DbError('Peserta tidak ditemukan.');
      p.status = 'REMOVED'; p.removed_at = now(); room.updated_at = now();
      db.audit_logs.unshift({ id: uid(), actor: t.id, school_id: t.school_id, action: 'live_game_participant_remove', entity: 'live_game_participants', entity_id: p.id, detail: { room_id: room.id, student_id: p.student_id }, created_at: now() }); save(db);
      return liveRoomView(db, room, true);
    },
    async setLiveGameRoomStatus(roomId, status) {
      await wait(100); const db = load(); const t = me(db); const room = findOwnedLiveRoom(db, roomId, t);
      const transitions = { WAITING: ['LOCKED', 'CANCELLED', 'EXPIRED'], LOCKED: ['WAITING', 'CANCELLED', 'EXPIRED'], COUNTDOWN: ['IN_PROGRESS', 'CANCELLED'], IN_PROGRESS: ['PAUSED', 'COMPLETED', 'CANCELLED'], PAUSED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'] };
      if (!['WAITING', 'LOCKED', 'COUNTDOWN', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED', 'EXPIRED'].includes(status) || !(transitions[room.status] || []).includes(status)) throw new DbError('Perubahan status ruang tidak diizinkan.');
      if (status === 'IN_PROGRESS' && room.status === 'COUNTDOWN') {
        if (Date.parse(room.countdown_ends_at || 0) > Date.now()) throw new DbError('Tunggu hingga hitung mundur selesai sebelum menandai sesi berjalan.');
        if ((db.live_game_participants || []).filter((p) => p.room_id === room.id && p.status === 'JOINED').length < room.min_participants) throw new DbError('Jumlah peserta aktif belum mencapai batas minimum.');
      }
      room.status = status; room.updated_at = now();
      if (status === 'COMPLETED') room.completed_at = now();
      if (status === 'COUNTDOWN') room.countdown_ends_at = new Date(Date.now() + 5000).toISOString();
      if (status === 'IN_PROGRESS' && !room.started_at) room.started_at = now();
      db.audit_logs.unshift({ id: uid(), actor: t.id, school_id: t.school_id, action: 'live_game_room_status', entity: 'live_game_rooms', entity_id: room.id, detail: { status }, created_at: now() }); save(db);
      return liveRoomView(db, room, true);
    },
    async startLiveGameRoom(roomId) {
      await wait(100); const db = load(); const t = me(db); const room = findOwnedLiveRoom(db, roomId, t);
      if (!['WAITING', 'LOCKED'].includes(room.status)) throw new DbError('Sesi hanya dapat dimulai oleh host dari ruang tunggu.');
      const count = (db.live_game_participants || []).filter((p) => p.room_id === room.id && p.status === 'JOINED').length;
      if (count < room.min_participants) throw new DbError(`Diperlukan minimal ${room.min_participants} peserta aktif untuk memulai.`);
      if (room.expires_at && Date.parse(room.expires_at) <= Date.now()) { room.status = 'EXPIRED'; room.updated_at = now(); save(db); throw new DbError('Ruang sudah kedaluwarsa.'); }
      room.status = 'COUNTDOWN'; room.countdown_ends_at = new Date(Date.now() + 5000).toISOString(); room.updated_at = now();
      db.audit_logs.unshift({ id: uid(), actor: t.id, school_id: t.school_id, action: 'live_game_room_start', entity: 'live_game_rooms', entity_id: room.id, detail: { participants: count }, created_at: now() }); save(db);
      return liveRoomView(db, room, true);
    },
    async getLiveGameRoom(roomId) {
      await wait(80); const db = load(); const active = localStorage.getItem(ACTIVE_SESSION_KEY);
      if (active === 'student') {
        const x = meStudent(db); const room = (db.live_game_rooms || []).find((r) => r.id === roomId);
        const p = room && (db.live_game_participants || []).find((z) => z.room_id === room.id && z.student_id === x.student.id && z.account_id === x.account.id && z.status === 'JOINED');
        if (!room || !p || room.school_id !== x.school.id || room.teacher_id !== x.teacher.id || room.class_id !== x.student.class_id) throw new DbError('Anda tidak memiliki akses ke ruang ini.', '42501');
        if (expireLiveGameRoom(room)) save(db);
        return liveRoomView(db, room, false);
      }
      const t = me(db); const room = findOwnedLiveRoom(db, roomId, t); if (expireLiveGameRoom(room)) save(db); return liveRoomView(db, room, true);
    },
    async getLiveGameParticipants(roomId) {
      const room = await DemoBackend.getLiveGameRoom(roomId); return room.participants;
    },
    async recoverLiveGameSession() {
      await wait(100); const db = load(); const active = localStorage.getItem(ACTIVE_SESSION_KEY);
      if (active === 'student') {
        const x = meStudent(db); const joined = new Set((db.live_game_participants || []).filter((p) => p.account_id === x.account.id && p.student_id === x.student.id && p.school_id === x.school.id && p.teacher_id === x.teacher.id && p.status === 'JOINED').map((p) => p.room_id));
        const rooms = (db.live_game_rooms || []).filter((r) => joined.has(r.id)); let changed = false; rooms.forEach((r) => { if (expireLiveGameRoom(r)) changed = true; }); if (changed) save(db);
        return rooms.filter((r) => ['WAITING', 'LOCKED', 'COUNTDOWN', 'IN_PROGRESS', 'PAUSED'].includes(r.status)).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map((r) => liveRoomView(db, r, false));
      }
      const t = me(db); const rooms = (db.live_game_rooms || []).filter((r) => r.teacher_id === t.id && r.school_id === t.school_id); let changed = false; rooms.forEach((r) => { if (expireLiveGameRoom(r)) changed = true; }); if (changed) save(db);
      return rooms.filter((r) => ['WAITING', 'LOCKED', 'COUNTDOWN', 'IN_PROGRESS', 'PAUSED'].includes(r.status)).map((r) => liveRoomView(db, r, true));
    },
    async signIn() { throw new DbError('Supabase belum dikonfigurasi oleh administrator. Gunakan akun DEMO di bawah untuk mencoba.'); },
    demoAccounts() { return load().profiles.map((p) => ({ id: p.id, full_name: p.full_name, email: p.email, role: p.role, active: p.active })); },
    async signInDemo(userId) {
      await wait(350);
      const db = load(); const p = db.profiles.find((x) => x.id === userId);
      if (!p) throw new DbError('Akun tidak ditemukan');
      if (!p.active) throw new DbError('Akun ini dinonaktifkan oleh administrator.');
      if (!['teacher', 'admin'].includes(p.role)) throw new DbError('Akun ini belum disetujui sebagai guru. Hubungi administrator.');
      const s = { user: { id: p.id, email: p.email }, demo: true, at: now() };
      localStorage.setItem(SKEY, JSON.stringify(s)); localStorage.setItem(ACTIVE_SESSION_KEY, 'teacher'); return s;
    },
    async signInStudent(username, password) {
      await wait(250);
      const db = load(); const normalized = String(username || '').trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(normalized) || !password) throw new DbError('Username atau password salah.');
      const cutoff = Date.now() - 15 * 60 * 1000;
      const recentFailures = db.student_auth_events.filter((e) => e.event === 'login_failed' && e.username === normalized && Date.parse(e.created_at) >= cutoff).length;
      if (recentFailures >= 5) {
        db.student_auth_events.unshift({ id: uid(), event: 'login_rate_limited', username: normalized, created_at: now() }); db.student_auth_events = db.student_auth_events.slice(0, 1000); save(db);
        throw new DbError('Terlalu banyak percobaan login. Coba lagi dalam 15 menit atau minta guru mereset password.');
      }
      const account = db.student_accounts.find((a) => a.username === normalized);
      if (!account || account.account_status !== 'ACTIVE') {
        db.student_auth_events.unshift({ id: uid(), event: 'login_failed', username: normalized, account_id: account ? account.id : null, school_id: account ? account.school_id : null, created_at: now() }); db.student_auth_events = db.student_auth_events.slice(0, 1000); save(db);
        throw new DbError('Username atau password salah, atau akun belum aktif.');
      }
      const student = db.students.find((x) => x.id === account.student_id && x.teacher_id === account.teacher_id && x.school_id === account.school_id && x.status === 'aktif');
      const teacher = db.profiles.find((p) => p.id === account.teacher_id && p.active && p.school_id === account.school_id);
      const school = db.schools.find((p) => p.id === account.school_id && p.status === 'ACTIVE');
      if (!student || !teacher || !school || !(await passwordMatches(account, password))) {
        db.student_auth_events.unshift({ id: uid(), event: 'login_failed', username: normalized, account_id: account.id, student_id: account.student_id, teacher_id: account.teacher_id, school_id: account.school_id, created_at: now() }); db.student_auth_events = db.student_auth_events.slice(0, 1000); save(db);
        throw new DbError('Username atau password salah, atau akun belum aktif.');
      }
      account.last_login = now(); save(db);
      db.student_auth_events.unshift({ id: uid(), event: 'login_success', account_id: account.id, student_id: student.id, teacher_id: account.teacher_id, school_id: account.school_id, created_at: now() }); db.student_auth_events = db.student_auth_events.slice(0, 1000); save(db);
      const s = { account_id: account.id, kind: 'student', at: now() };
      localStorage.setItem(STUDENT_SKEY, JSON.stringify(s)); localStorage.setItem(ACTIVE_SESSION_KEY, 'student');
      return { user: { id: account.id }, student: { id: student.id, full_name: student.full_name }, account: { id: account.id, username: account.username, must_change_password: account.must_change_password } };
    },
    async signOutStudent() { await wait(80); localStorage.removeItem(STUDENT_SKEY); if (localStorage.getItem(ACTIVE_SESSION_KEY) === 'student') localStorage.setItem(ACTIVE_SESSION_KEY, 'none'); },
    async signOut() { await wait(120); localStorage.removeItem(SKEY); if (localStorage.getItem(ACTIVE_SESSION_KEY) === 'teacher') localStorage.setItem(ACTIVE_SESSION_KEY, 'none'); },
    async changeStudentPassword(currentPassword, newPassword) {
      await wait(120); const db = load(); const x = meStudent(db, true);
      if (!(await passwordMatches(x.account, currentPassword))) throw new DbError('Password saat ini salah.');
      if (typeof newPassword !== 'string' || newPassword.length < 10 || newPassword.length > 128) throw new DbError('Password baru harus berisi 10–128 karakter.');
      if (newPassword === currentPassword) throw new DbError('Gunakan password baru yang berbeda dari password sementara.');
      const hp = await passwordHash(newPassword);
      Object.assign(x.account, { password_hash: hp.hash, password_salt: hp.salt, password_iterations: hp.iterations, must_change_password: false, updated_at: now() });
      save(db); return true;
    },
    async resetPassword() { throw new DbError('Reset password memerlukan Supabase Auth. Supabase belum dikonfigurasi.'); },
    onAuthChange() { return () => {}; },

    /* ---------- data milik guru yang login (RLS) ---------- */
    async list(table, { order } = {}) {
      await wait(150);
      const db = load(); const t = me(db);
      let rows;
      if (OWNED.includes(table)) rows = (db[table] || []).filter((r) => r.teacher_id === t.id && r.school_id === t.school_id);
      else if (table === 'schools') rows = (db.schools || []).filter((r) => t.platform_admin || r.id === t.school_id);
      else if (table === 'audit_logs') rows = (db.audit_logs || []).filter((r) => r.actor === t.id && r.school_id === t.school_id);
      else throw new DbError('Tabel ini tidak tersedia melalui daftar umum.', '42501');
      if (table === 'student_accounts') rows = rows.map(safeAccount);
      if (order) { const [k, dir] = order; rows.sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (dir === 'desc' ? -1 : 1)); }
      return rows;
    },
    async get(table, id) { await wait(100); if (table === 'student_accounts') throw new DbError('Gunakan fungsi khusus akun siswa.'); return mine(load(), table, id); },
    async insert(table, row) {
      await wait(220);
      if (GAME_TABLES.includes(table)) throw new DbError('Gunakan kontrak Manajemen Game agar relasi, status publikasi, dan hak akses tervalidasi.');
      if (table === 'student_accounts' || table === 'schools') throw new DbError('Gunakan fungsi khusus untuk membuat akun atau sekolah.');
      const db = load(); const t = me(db);
      const rec = Object.assign({ id: uid(), created_at: now(), updated_at: now() }, row, { teacher_id: t.id, school_id: t.school_id });
      checkUnique(db, table, rec); checkFK(db, table, rec);
      db[table].push(rec); save(db); return rec;
    },
    async insertMany(table, rows) {
      await wait(350);
      if (GAME_TABLES.includes(table)) throw new DbError('Gunakan kontrak Manajemen Game untuk perubahan game.');
      const db = load(); const t = me(db); const ok = []; const fail = [];
      rows.forEach((row, i) => {
        try { const rec = Object.assign({ id: uid(), created_at: now(), updated_at: now() }, row, { teacher_id: t.id, school_id: t.school_id }); checkUnique(db, table, rec); checkFK(db, table, rec); db[table].push(rec); ok.push(rec); }
        catch (e) { fail.push({ index: i, message: e.message }); }
      });
      save(db); return { ok, fail };
    },
    async update(table, id, patch) {
      await wait(200);
      if (GAME_TABLES.includes(table)) throw new DbError('Gunakan kontrak Manajemen Game agar relasi dan status tetap tervalidasi.');
      if (table === 'student_accounts' || table === 'schools') throw new DbError('Gunakan fungsi khusus untuk mengubah akun atau sekolah.');
      const db = load(); const cur = mine(db, table, id);
      const rec = Object.assign({}, cur, patch, { teacher_id: cur.teacher_id, school_id: cur.school_id, updated_at: now() });
      checkUnique(db, table, rec, id); checkFK(db, table, rec);
      db[table] = db[table].map((r) => (r.id === id ? rec : r)); save(db); return rec;
    },
    async updateMany(table, ids, patch) {
      await wait(250);
      if (GAME_TABLES.includes(table)) throw new DbError('Gunakan kontrak Manajemen Game untuk perubahan game.');
      if (table === 'student_accounts' || table === 'schools') throw new DbError('Gunakan fungsi khusus untuk mengubah akun atau sekolah.');
      const db = load(); const t = me(db);
        ids.forEach((id) => { const r = db[table].find((x) => x.id === id && x.teacher_id === t.id && x.school_id === t.school_id); if (r) { const rec = Object.assign({}, r, patch, { teacher_id: t.id, school_id: t.school_id }); checkFK(db, table, rec); Object.assign(r, patch, { teacher_id: t.id, school_id: t.school_id, updated_at: now() }); } });
      save(db); return true;
    },
    async remove(table, id) {
      await wait(200);
      if (GAME_TABLES.includes(table)) throw new DbError('Data game memiliki riwayat. Nonaktifkan atau ubah melalui pengelolaan game.');
      if (table === 'student_accounts' || table === 'schools') throw new DbError('Gunakan fungsi khusus untuk mengubah akun atau sekolah.');
      const db = load(); mine(db, table, id);
      if (table === 'classes') {
        if (db.students.some((s) => s.class_id === id)) throw new DbError('Kelas masih memiliki siswa. Pindahkan siswa terlebih dahulu.', '23503');
        if (db.exams.some((s) => s.class_id === id)) throw new DbError('Kelas masih dipakai oleh ujian/tugas/penilaian.', '23503');
      }
      if (table === 'subjects' && db.exams.some((e) => e.subject_id === id)) throw new DbError('Mata pelajaran masih dipakai.', '23503');
      if (table === 'students' && db.grades.some((g) => g.student_id === id)) throw new DbError('Siswa sudah memiliki nilai. Ubah status menjadi nonaktif, atau hapus nilainya terlebih dahulu.', '23503');
      if (table === 'students' && db.student_accounts.some((a) => a.student_id === id)) throw new DbError('Siswa sudah memiliki akun. Nonaktifkan data siswa atau akunnya agar riwayat tetap terhubung.', '23503');
      if (table === 'exams') ['exam_questions', 'grades', 'exam_responses', 'publication_settings'].forEach((t) => { db[t] = db[t].filter((q) => q.exam_id !== id); });
      db[table] = db[table].filter((r) => r.id !== id); save(db); return true;
    },
    async replaceQuestions(examId, questions) {
      await wait(300);
      const db = load(); const ex = mine(db, 'exams', examId);
      db.exam_questions = db.exam_questions.filter((q) => q.exam_id !== examId).concat(questions.map((q) => Object.assign({ id: uid(), exam_id: examId, teacher_id: ex.teacher_id, school_id: ex.school_id, created_at: now(), qtype: 'mc', required: true }, q)));
      ex.question_count = questions.length; ex.updated_at = now();
      save(db); return true;
    },
    async upsertGrade({ exam_id, student_id, score, source, raw_score, note, mc_score, essay_score }) {
      await wait(230);
      const db = load(); const t = me(db);
      checkFK(db, 'grades', { exam_id, student_id, teacher_id: t.id, school_id: t.school_id });
      if (score === null || score === undefined || isNaN(score) || score < 0 || score > 100) throw new DbError('Nilai harus 0–100', '23514');
      let g = db.grades.find((x) => x.exam_id === exam_id && x.student_id === student_id && x.teacher_id === t.id);
      const patch = { score, source, updated_at: now() };
      if (raw_score !== undefined) patch.raw_score = raw_score; if (note !== undefined) patch.note = note;
      if (mc_score !== undefined) patch.mc_score = mc_score; if (essay_score !== undefined) patch.essay_score = essay_score;
      if (g) Object.assign(g, patch);
      else { g = Object.assign({ id: uid(), exam_id, student_id, teacher_id: t.id, school_id: t.school_id, created_at: now() }, patch); db.grades.push(g); }
      save(db); return g;
    },
    async setGradeNote(exam_id, student_id, note) {
      await wait(200);
      const db = load(); const t = me(db);
      const g = db.grades.find((x) => x.exam_id === exam_id && x.student_id === student_id && x.teacher_id === t.id);
      if (!g) throw new DbError('Isi nilai terlebih dahulu sebelum menambahkan keterangan.');
      g.note = note; g.updated_at = now(); save(db); return g;
    },
    async deleteGrade(exam_id, student_id) {
      await wait(200);
      const db = load(); const t = me(db); db.grades = db.grades.filter((x) => !(x.exam_id === exam_id && x.student_id === student_id && x.teacher_id === t.id)); save(db); return true;
    },
    async saveResponses(examId, responses) {
      await wait(250);
      const db = load(); const ex = mine(db, 'exams', examId);
      responses.forEach((r) => {
        const old = db.exam_responses.find((x) => x.exam_id === examId && x.response_id === r.response_id);
        // meniru trigger keep_review_decision (0005): keputusan guru tidak ditimpa sinkronisasi ulang
        if (old && ['dipilih', 'ditolak'].includes(old.review_status) && !['dipilih', 'ditolak'].includes(r.review_status)) { r = Object.assign({}, r, { review_status: old.review_status, reviewed_at: old.reviewed_at }); }
        if (old) Object.assign(old, r); else db.exam_responses.push(Object.assign({ id: uid(), exam_id: examId, teacher_id: ex.teacher_id, school_id: ex.school_id, created_at: now() }, r));
      });
      save(db); return true;
    },
    async setResponseReview(examId, responseIds, status) {
      await wait(200);
      if (!['dipilih', 'ditolak'].includes(status)) throw new DbError('Status keputusan tidak valid');
      const db = load(); mine(db, 'exams', examId);
      db.exam_responses.forEach((r) => { if (r.exam_id === examId && responseIds.includes(r.response_id)) { r.review_status = status; r.reviewed_at = now(); } });
      save(db); return true;
    },
    /** DEMO saja: meniru respons yang akan dikembalikan Apps Script v1.3.0 (tidak ada di produksi) */
    async demoFormResponses(examId) {
      await wait(150); const db = load(); const ex = mine(db, 'exams', examId);
      return { ok: true, responses: (db.demo_form_inbox || {})[examId] || [] };
    },
    async setPublication(examId, isPublished) {
      await wait(250);
      const db = load(); const ex = mine(db, 'exams', examId);
      let p = db.publication_settings.find((x) => x.exam_id === examId);
      if (!p) { p = { id: uid(), exam_id: examId, teacher_id: ex.teacher_id, school_id: ex.school_id }; db.publication_settings.push(p); }
      Object.assign(p, { is_published: isPublished, published_at: isPublished ? now() : null, updated_at: now() });
      save(db); return p;
    },
    async listStudentAccounts() {
      await wait(120); const db = load(); const t = me(db);
      const accounts = db.student_accounts.filter((a) => a.teacher_id === t.id && a.school_id === t.school_id);
      return accounts.map((a) => {
        const s = db.students.find((x) => x.id === a.student_id && x.teacher_id === t.id && x.school_id === t.school_id);
        const c = s && db.classes.find((x) => x.id === s.class_id && x.teacher_id === t.id && x.school_id === t.school_id);
        return s ? Object.assign(safeAccount(a), { student: { id: s.id, full_name: s.full_name, status: s.status }, class: c ? { id: c.id, name: c.name, academic_year: c.academic_year } : null }) : null;
      }).filter(Boolean);
    },
    async createStudentAccounts(studentIds) {
      await wait(150); const db = load(); const t = me(db);
      const ids = [...new Set((studentIds || []).map(String))];
      if (!ids.length) throw new DbError('Pilih minimal satu siswa.');
      const created = []; const skipped = [];
      for (const studentId of ids) {
        const student = db.students.find((s) => s.id === studentId && s.teacher_id === t.id && s.school_id === t.school_id && s.status === 'aktif');
        if (!student) { skipped.push({ student_id: studentId, reason: 'Siswa tidak ditemukan, tidak aktif, atau bukan milik guru/sekolah ini.' }); continue; }
        if (db.student_accounts.some((a) => a.student_id === student.id)) { skipped.push({ student_id: studentId, reason: 'Akun siswa sudah ada.' }); continue; }
        let username = ''; let attempts = 0;
        do { username = 's' + randomChars(9, 'abcdefghjkmnpqrstuvwxyz23456789'); attempts++; }
        while (db.student_accounts.some((a) => a.username === username) && attempts < 20);
        if (db.student_accounts.some((a) => a.username === username)) throw new DbError('Gagal membuat username unik. Coba lagi.');
        const password = 'S-' + randomChars(15, 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789');
        const hp = await passwordHash(password);
        const account = { id: uid(), student_id: student.id, school_id: t.school_id, teacher_id: t.id, username, password_hash: hp.hash, password_salt: hp.salt, password_iterations: hp.iterations, account_status: 'ACTIVE', must_change_password: true, created_at: now(), updated_at: now(), created_by: t.id, last_login: null };
        checkFK(db, 'student_accounts', account);
        db.student_accounts.push(account);
        created.push({ student_id: student.id, student_name: student.full_name, class_name: (db.classes.find((c) => c.id === student.class_id) || {}).name || '', username, temporary_password: password });
      }
      if (created.length) {
      db.audit_logs.unshift({ id: uid(), actor: t.id, school_id: t.school_id, action: 'student_accounts_create', entity: 'student_accounts', entity_id: null, detail: { count: created.length }, created_at: now() });
        save(db);
      }
      return { created, skipped };
    },
    async resetStudentPassword(accountId) {
      await wait(120); const db = load(); const t = me(db);
      const account = db.student_accounts.find((a) => a.id === accountId && a.teacher_id === t.id && a.school_id === t.school_id);
      if (!account) throw new DbError('Akun siswa tidak ditemukan.', 'PGRST116');
      const student = db.students.find((s) => s.id === account.student_id && s.teacher_id === t.id && s.school_id === t.school_id);
      if (!student) throw new DbError('Relasi siswa dan akun tidak valid.', '42501');
      const password = 'S-' + randomChars(15, 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789');
      const hp = await passwordHash(password);
      Object.assign(account, { password_hash: hp.hash, password_salt: hp.salt, password_iterations: hp.iterations, must_change_password: true, updated_at: now(), reset_by: t.id });
      db.audit_logs.unshift({ id: uid(), actor: t.id, school_id: t.school_id, action: 'student_account_password_reset', entity: 'student_accounts', entity_id: account.id, detail: { student_id: student.id }, created_at: now() });
      save(db);
      return { student_id: student.id, student_name: student.full_name, username: account.username, temporary_password: password };
    },
    async setStudentAccountStatus(accountId, status) {
      await wait(100); const db = load(); const t = me(db);
      if (!['ACTIVE', 'DISABLED', 'REJECTED', 'PENDING_APPROVAL'].includes(status)) throw new DbError('Status akun tidak valid.');
      const account = db.student_accounts.find((a) => a.id === accountId && a.teacher_id === t.id && a.school_id === t.school_id);
      if (!account) throw new DbError('Akun siswa tidak ditemukan.', 'PGRST116');
      const student = db.students.find((s) => s.id === account.student_id && s.teacher_id === t.id && s.school_id === t.school_id);
      if (!student) throw new DbError('Relasi siswa dan akun tidak valid.', '42501');
      if (status === 'ACTIVE' && student.status !== 'aktif') throw new DbError('Data siswa tidak aktif. Aktifkan atau verifikasi data siswa terlebih dahulu.');
      const previous = account.account_status;
      Object.assign(account, { account_status: status, updated_at: now(), status_changed_by: t.id });
      db.audit_logs.unshift({ id: uid(), actor: t.id, school_id: t.school_id, action: 'student_account_status', entity: 'student_accounts', entity_id: account.id, detail: { student_id: student.id, from: previous, to: status }, created_at: now() });
      save(db); return safeAccount(account);
    },
    async listSchools() {
      await wait(60); const db = load(); const t = me(db);
      return db.schools.filter((s) => t.platform_admin || s.id === t.school_id).map((s) => Object.assign({}, s));
    },
    async createSchool({ school_name, school_code }) {
      await wait(100); const db = load(); const t = me(db);
      if (!t.platform_admin) throw new DbError('Hanya administrator platform yang dapat menambahkan sekolah.', '42501');
      const name = String(school_name || '').trim(); const code = String(school_code || '').trim().toUpperCase();
      if (name.length < 3 || name.length > 120) throw new DbError('Nama sekolah harus berisi 3–120 karakter.');
      if (!/^[A-Z0-9_-]{3,20}$/.test(code)) throw new DbError('Kode sekolah harus 3–20 karakter: huruf, angka, - atau _.');
      const school = { id: uid(), school_name: name, school_code: code, status: 'ACTIVE', created_at: now(), created_by: t.id };
      checkUnique(db, 'schools', school); db.schools.push(school);
      db.audit_logs.unshift({ id: uid(), actor: t.id, school_id: school.id, action: 'school_create', entity: 'schools', entity_id: school.id, detail: { school_code: code }, created_at: now() });
      save(db); return school;
    },
    async getSettings() {
      await wait(120); const db = load(); const t = me(db);
      let ps = db.portal_settings.find((x) => x.teacher_id === t.id);
      if (!ps) { ps = defSettings(t.id, t.school_name, t.school_id); db.portal_settings.push(ps); save(db); }
      const open = openTeachers(db);
      return { profile: Object.assign({}, t), portal: ps, app: { portal_master: masterOn(db), public_open: open.length > 0, open_teachers: open.length } };
    },
    async setPortalMaster(on) {
      await wait(250); const db = load(); const t = me(db);
      if (t.role !== 'admin') throw new DbError('Hanya administrator yang dapat membuka/menutup Portal Siswa sekolah.', '42501');
      db.app_settings = Object.assign({}, db.app_settings, { portal_master: !!on, updated_at: now() }); save(db); return db.app_settings;
    },
    async saveProfile(patch) {
      await wait(220); const db = load(); const t = me(db);
      const safe = Object.assign({}, patch); delete safe.role; delete safe.active; delete safe.email; delete safe.id; delete safe.school_id; delete safe.platform_admin; // protected columns
      Object.assign(t, safe, { updated_at: now() }); save(db); return t;
    },
    async savePortalSettings(patch) {
      await wait(220); const db = load(); const t = me(db);
      const ps = db.portal_settings.find((x) => x.teacher_id === t.id && x.school_id === t.school_id); Object.assign(ps, patch, { teacher_id: t.id, school_id: t.school_id, updated_at: now() }); save(db); return ps;
    },
    async audit(action, entity, entity_id, detail) { try { const db = load(); const t = me(db); db.audit_logs.unshift({ id: uid(), action, entity, entity_id, detail, created_at: now(), actor: t.id, school_id: t.school_id }); db.audit_logs = db.audit_logs.slice(0, 500); save(db); } catch (e) {} },

    /* ---------- MANAJEMEN AKUN GURU (hanya admin) ---------- */
    async listTeachers() {
      await wait(200); const db = load(); const t = me(db);
      if (t.role !== 'admin') throw new DbError('Hanya administrator yang dapat mengelola akun guru.', '42501');
      return db.profiles.filter((p) => t.platform_admin || p.school_id === t.school_id).map((p) => ({ id: p.id, email: p.email, full_name: p.full_name, role: p.role, active: p.active, school_id: p.school_id, school_name: (db.schools.find((s) => s.id === p.school_id) || {}).school_name || p.school_name, created_at: p.created_at,
        counts: { classes: db.classes.filter((x) => x.teacher_id === p.id).length, students: db.students.filter((x) => x.teacher_id === p.id).length, exams: db.exams.filter((x) => x.teacher_id === p.id).length } }));
    },
    async createTeacher({ email, full_name, role, password, school_id }) {
      await wait(400); const db = load(); const t = me(db);
      if (t.role !== 'admin') throw new DbError('Hanya administrator.', '42501');
      if (db.profiles.some((p) => p.email.toLowerCase() === email.toLowerCase())) throw new DbError('Email sudah terdaftar.', '23505');
      const schoolId = t.platform_admin ? (school_id || t.school_id) : t.school_id;
      const school = db.schools.find((s) => s.id === schoolId && s.status === 'ACTIVE');
      if (!school) throw new DbError('Sekolah tidak ditemukan atau tidak aktif.', '42501');
      const p = { id: uid(), email, full_name, role: role === 'admin' ? 'admin' : 'teacher', active: true, school_id: school.id, school_name: school.school_name, subject: '', created_at: now(), sign_enabled: false, sign_title: 'Guru Mata Pelajaran', sign_place: '', sign_nip: '' };
      db.profiles.push(p); db.portal_settings.push(defSettings(p.id, p.school_name, p.school_id)); save(db); return p;
    },
    async updateTeacher(id, patch) {
      await wait(300); const db = load(); const t = me(db);
      if (t.role !== 'admin') throw new DbError('Hanya administrator.', '42501');
      if (id === t.id && (patch.role === 'teacher' || patch.active === false)) throw new DbError('Anda tidak dapat menurunkan role atau menonaktifkan akun Anda sendiri.');
      const p = db.profiles.find((x) => x.id === id && (t.platform_admin || x.school_id === t.school_id)); if (!p) throw new DbError('Akun tidak ditemukan atau berada di sekolah lain.');
      ['full_name', 'role', 'active'].forEach((k) => { if (patch[k] !== undefined) p[k] = patch[k]; });
      save(db); return p;
    },
    async deleteTeacher(id) {
      await wait(300); const db = load(); const t = me(db);
      if (t.role !== 'admin') throw new DbError('Hanya administrator.', '42501');
      if (id === t.id) throw new DbError('Anda tidak dapat menghapus akun Anda sendiri.');
      if (!t.platform_admin && !db.profiles.some((x) => x.id === id && x.school_id === t.school_id)) throw new DbError('Akun tidak ditemukan atau berada di sekolah lain.', '42501');
      const n = OWNED.reduce((a, k) => a + db[k].filter((x) => x.teacher_id === id).length, 0);
      if (n > 0) throw new DbError(`Akun ini masih memiliki ${n} data (kelas, siswa, nilai, dll). Nonaktifkan akun saja agar data tetap aman.`);
      db.profiles = db.profiles.filter((x) => x.id !== id); db.portal_settings = db.portal_settings.filter((x) => x.teacher_id !== id); save(db); return true;
    },

    /* ---------- PUBLIC (tanpa login) — meniru get_portal_status & portal_lookup 0003 ---------- */
    async getPortalStatus() {
      await wait(180); const db = load();
      const open = openTeachers(db);
      const openSchoolIds = [...new Set(db.profiles.filter((p) => open.includes(p.id)).map((p) => p.school_id))];
      const schools = db.schools.filter((s) => openSchoolIds.includes(s.id) && s.status === 'ACTIVE').map((s) => ({ id: s.id, school_name: s.school_name, school_code: s.school_code }));
      const classes = db.classes.filter((c) => open.includes(c.teacher_id) && openSchoolIds.includes(c.school_id)).map((c) => ({ id: c.id, school_id: c.school_id, name: c.name, academic_year: c.academic_year })).sort((a, b) => a.name.localeCompare(b.name, 'id', { numeric: true }));
      const school = schools.length === 1 ? schools[0].school_name : schools.length > 1 ? 'Beberapa sekolah' : '';
      const message = [...new Set(db.portal_settings.filter((ps) => open.includes(ps.teacher_id) && ps.message).map((ps) => ps.message))].join(' • ');
      const ref = db.portal_settings.find((ps) => open.includes(ps.teacher_id)) || {};
      return { enabled: open.length > 0, master: masterOn(db), message: masterOn(db) ? message : '', school_name: school, schools, classes, academic_year: ref.academic_year || '', semester: ref.semester || '' };
    },
    async portalLookup(classIdOrName, name, schoolId) {
      await wait(400);
      const db = load();
      const open = openTeachers(db);
      if (!open.length) return { ok: false, reason: 'closed' };
      const nn = normName(name); const selected = String(classIdOrName || ''); const nc = normName(selected);
      if (!nc || nn.length < 2) return { ok: false, reason: 'not_found' };
      const matches = db.students.filter((s) => s.status === 'aktif' && open.includes(s.teacher_id) && (!schoolId || s.school_id === schoolId) && normName(s.full_name) === nn && (() => { const c = db.classes.find((x) => x.id === s.class_id && x.teacher_id === s.teacher_id && x.school_id === s.school_id); return c && (c.id === selected || normName(c.name) === nc) && (!schoolId || c.school_id === schoolId); })());
      if (!matches.length) return { ok: false, reason: 'not_found' };
      const dupBy = {}; matches.forEach((s) => { dupBy[s.teacher_id] = (dupBy[s.teacher_id] || 0) + 1; });
      const students = matches.map((s) => {
        const cls = db.classes.find((c) => c.id === s.class_id && c.teacher_id === s.teacher_id && c.school_id === s.school_id); const tch = db.profiles.find((p) => p.id === s.teacher_id && p.school_id === s.school_id);
        const pub = new Set(db.publication_settings.filter((x) => x.is_published && x.teacher_id === s.teacher_id).map((x) => x.exam_id));
        const results = db.grades.filter((g) => g.student_id === s.id && g.teacher_id === s.teacher_id && pub.has(g.exam_id)).map((g) => {
          const e = db.exams.find((x) => x.id === g.exam_id); const sub = db.subjects.find((x) => x.id === e.subject_id);
          return { exam_name: e.name, kind: e.kind || 'ujian', exam_type: e.category || e.task_type || e.exam_type, subject: sub ? sub.name : '-', teacher: tch ? tch.full_name : '', score: g.score, kktp: e.kktp, passed: g.score >= e.kktp, academic_year: e.academic_year, semester: e.semester, date: e.date };
        }).sort(sortResults);
        return { full_name: s.full_name, class_name: cls.name, hint: dupBy[s.teacher_id] > 1 ? (s.nis ? 'NIS •••' + String(s.nis).slice(-2) : 'Kode •••' + String(s.student_code).slice(-2)) : '', results };
      });
      return { ok: true, students };
    },

    /* ---------- DEMO helpers ---------- */
    async resetDemo() { await wait(200); const db = load(); const t = me(db); if (t.id !== 'demo-admin') throw new DbError('Hanya Admin Platform DEMO yang dapat mereset data contoh.', '42501'); localStorage.setItem('sm_demo_db_v3_backup_before_reset_' + Date.now(), JSON.stringify(db)); localStorage.removeItem(KEY); localStorage.removeItem(SKEY); localStorage.removeItem(STUDENT_SKEY); localStorage.setItem(ACTIVE_SESSION_KEY, 'none'); localStorage.setItem(MIGRATION_KEY, '1'); },
    async seedDemo() {
      await wait(400);
      const db = load(); const t = me(db); if (t.id !== 'demo-admin') throw new DbError('Hanya Admin Platform DEMO yang dapat mengisi data contoh.', '42501');
      const A = 'demo-guru-a', B = 'demo-guru-b';
      const existing = OWNED.some((table) => db[table].some((row) => [A, B].includes(row.teacher_id)));
      if (existing) throw new DbError('Data Guru A/B sudah ada. Pengisian contoh dihentikan agar data yang tersimpan tidak tertimpa.');
      const mk = (tid, o) => Object.assign({ id: uid(), teacher_id: tid, school_id: ((db.profiles || []).find((p) => p.id === tid) || {}).school_id || t.school_id, created_at: now(), updated_at: now() }, o);
      db.portal_settings.forEach((ps) => { if (ps.teacher_id === A || ps.teacher_id === B) Object.assign(ps, { enabled: true, school_name: 'SMP Contoh (DEMO)' }); });
      // ===== Guru A: Bahasa Arab =====
      const c81 = mk(A, { name: 'VIII.1', grade: '8', academic_year: '2026/2027' });
      const c7a = mk(A, { name: 'VII-A', grade: '7', academic_year: '2026/2027' });
      db.classes.push(c81, c7a);
      const sAr = mk(A, { name: 'Bahasa Arab', code: 'BAR' }); db.subjects.push(sAr);
      const namesA = ['Ahmad Fauzi', 'Balqis Zahra', 'Bilal Ramadhan', 'Fatimah Azzahra', 'Hasan Hidayat', 'Khadijah Putri', 'Umar Firmansyah', 'Zainab Lestari', 'Yusuf Saputra', 'Maryam Wulandari'];
      const stA = namesA.map((n, i) => mk(A, { nisn: null, nis: String(2601 + i), full_name: n, class_id: c81.id, student_code: 'A' + String(i + 1).padStart(3, '0'), status: 'aktif' }));
      const st7 = ['Ali Pratama', 'Salma Nurhaliza', 'Hamzah Ramadhan', 'Nadia Azzahra', 'Ilyas Hidayat', 'Rania Putri'].map((n, i) => mk(A, { nis: String(2701 + i), full_name: n, class_id: c7a.id, student_code: 'A7' + String(i + 1).padStart(2, '0'), status: 'aktif' }));
      db.students.push(...stA, ...st7);
      const base = { subject_id: sAr.id, class_id: c81.id, semester: 'Ganjil', academic_year: '2026/2027', kktp: 75, max_score: 100, question_count: 0 };
      const acts = [
        mk(A, Object.assign({}, base, { kind: 'tugas', delivery: 'manual', name: 'Tugas 1 — Menulis Mufradat', task_type: 'Tugas menulis', exam_type: 'Tugas', date: '2026-08-05', start_date: '2026-08-05', due_date: '2026-08-12', status: 'selesai', description: 'Menulis 20 mufradat bab 1 beserta artinya.', instructions: 'Tulis di buku tulis, foto, dan kumpulkan ke guru.' })),
        mk(A, Object.assign({}, base, { kind: 'manual', delivery: 'manual', name: 'Hafalan Surah Al-Mulk 1–10', category: 'Hafalan', exam_type: 'Hafalan', date: '2026-08-20', status: 'selesai' })),
        mk(A, Object.assign({}, base, { kind: 'tugas', delivery: 'manual', name: 'Tugas 2 — Membaca Teks', task_type: 'Tugas membaca', exam_type: 'Tugas', date: '2026-09-02', start_date: '2026-09-02', due_date: '2026-09-09', status: 'selesai' })),
        mk(A, Object.assign({}, base, { kind: 'ujian', delivery: 'google_form', name: 'Ujian Harian Bab 1', exam_type: 'Penilaian Harian', date: '2026-09-10', status: 'selesai' })),
        mk(A, Object.assign({}, base, { kind: 'manual', delivery: 'manual', name: 'Praktik Muhadatsah', category: 'Praktik', exam_type: 'Praktik', date: '2026-09-25', status: 'selesai' })),
        mk(A, Object.assign({}, base, { kind: 'ujian', delivery: 'google_form', name: 'Sumatif Bahasa Arab', exam_type: 'Asesmen Sumatif', date: '2026-10-20', status: 'selesai' })),
        mk(A, Object.assign({}, base, { kind: 'tugas', delivery: 'google_form', name: 'Tugas 3 — Kuis Qawaid (PG + Essay)', task_type: 'Tugas individu', exam_type: 'Tugas', date: '2026-11-03', start_date: '2026-11-03', due_date: '2026-11-14', status: 'aktif', description: 'Kuis daring: 3 soal pilihan ganda dan 1 essay.' })),
      ];
      db.exams.push(...acts);
      // nilai deterministik: tren naik untuk Ahmad Fauzi (70, 78, 80, 75, 88, 85)
      const trend = { 'Ahmad Fauzi': [70, 78, 80, 75, 88, 85], 'Balqis Zahra': [65, 72, 68, 70, 74, 70] };
      let seed = 11; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      acts.slice(0, 6).forEach((e, ei) => stA.forEach((s, si) => {
        if (ei === 2 && si === 9) return; // belum mengumpulkan
        const sc = trend[s.full_name] ? trend[s.full_name][ei] : Math.round(60 + rnd() * 38 + ei * 1.5);
        db.grades.push(mk(A, { exam_id: e.id, student_id: s.id, score: Math.min(100, sc), raw_score: Math.min(100, sc), source: e.delivery === 'google_form' ? 'google_forms' : 'manual', note: si === 3 && ei === 1 ? 'Lancar, tajwid baik' : null }));
      }));
      // soal tugas 3 (PG + essay)
      const t3 = acts[6];
      [['ما معنى «مَدْرَسَةٌ»؟', { A: 'Sekolah', B: 'Rumah', C: 'Masjid', D: 'Pasar' }, 'A', 20], ['Jamak dari «كِتَابٌ» adalah…', { A: 'كُتُبٌ', B: 'كَاتِبٌ', C: 'مَكْتَبٌ', D: 'كِتَابَةٌ' }, 'A', 20], ['«أَنَا طَالِبٌ» artinya…', { A: 'Saya guru', B: 'Saya siswa', C: 'Dia siswa', D: 'Kamu siswa' }, 'B', 20]]
        .forEach((q, i) => db.exam_questions.push(mk(A, { exam_id: t3.id, number: i + 1, question: q[0], qtype: 'mc', options: q[1], answer_key: q[2], points: q[3], required: true })));
      db.exam_questions.push(mk(A, { exam_id: t3.id, number: 4, question: 'Tuliskan perkenalan diri dalam bahasa Arab minimal 3 kalimat.', qtype: 'essay', options: null, answer_key: null, points: 40, required: true }));
      t3.question_count = 4; t3.google_form_id = null;
      // respons contoh tugas 3 (seolah dari sinkronisasi) — essay belum dinilai
      stA.slice(0, 4).forEach((s, i) => db.exam_responses.push(mk(A, { exam_id: t3.id, response_id: 'demo-resp-' + i, student_id: s.id, identifier: s.full_name + ' (' + s.student_code + ')', submitted_at: '2026-11-0' + (4 + i) + 'T08:00:00Z', mc_score: [60, 40, 60, 20][i], mc_max: 60, essay_max: 40, raw_score: [60, 40, 60, 20][i], max_score: 100, answers: { 4: ['اِسْمِي أَحْمَدُ. أَنَا طَالِبٌ. أَسْكُنُ فِي بَانْدُونْج.', 'اِسْمِي بَلْقِيس. أَنَا طَالِبَةٌ.', 'اِسْمِي بِلَال...', 'أَنَا...'][i] } })));
      // satu essay sudah dinilai → nilai akhir tersimpan
      db.grades.push(mk(A, { exam_id: t3.id, student_id: stA[0].id, score: 92, raw_score: 92, mc_score: 60, essay_score: 32, source: 'google_forms', note: 'Kalimat sudah tepat, perbaiki harakat.' }));
      // ===== Simulasi Google Form v1.3.0 (DEMO) untuk menguji deteksi konflik =====
      // Ujian Harian Bab 1 (acts[3]) sudah punya nilai → kirimannya disimpan sebagai respons lama (v1.2.0, tanpa email)
      // Kuis Tajwid baru (PG saja) dengan form terkunci + kiriman bermasalah di "inbox" form
      const kz = mk(A, Object.assign({}, base, { kind: 'ujian', delivery: 'google_form', name: 'Kuis Tajwid (Form v1.3.0)', exam_type: 'Penilaian Harian', date: '2026-11-06', status: 'aktif', question_count: 2,
        google_form_id: 'demo-form-kuis', google_form_url: 'https://docs.google.com/forms/d/e/DEMO-tidak-nyata/viewform', google_form_created_at: now(),
        google_form_security: { requireLogin: false, limitOne: true, emailCollected: true, emailType: 'VERIFIED', loginEnforced: true, restrictDomainRequested: false, errors: [] } }));
      db.exams.push(kz);
      [['Hukum nun mati bertemu ب adalah…', { A: 'Iqlab', B: 'Idgham', C: 'Izhar', D: 'Ikhfa' }, 'A'], ['Mad thabi\'i panjangnya…', { A: '1 harakat', B: '2 harakat', C: '4 harakat', D: '6 harakat' }, 'B']]
        .forEach((q, i) => db.exam_questions.push(mk(A, { exam_id: kz.id, number: i + 1, question: q[0], qtype: 'mc', options: q[1], answer_key: q[2], points: 50, required: true })));
      const lbl = (s) => s.full_name + ' (' + s.student_code + ')';
      const R = (id, s, email, t, sc) => ({ response_id: id, submitted_at: '2026-11-06T0' + t + ':00:00.000Z', identifier: lbl(s), name: '', email, score: sc, mc_score: sc, mc_max: 100, essay_max: 0, max_score: 100, answers: {} });
      // Hasan sudah dinilai manual sebelumnya → kiriman baru = konflik_nilai_lama
      db.grades.push(mk(A, { exam_id: kz.id, student_id: stA[4].id, score: 60, raw_score: 60, source: 'manual', note: 'Susulan lisan' }));
      db.demo_form_inbox = { [kz.id]: [
        R('dr-1', stA[0], 'ahmad.fauzi@gmail.com', 1, 100),           // ok
        R('dr-2', stA[1], 'balqis.z@smpcontoh.sch.id', 1, 50),       // nama_ganda (Balqis dipilih dua akun)
        R('dr-3', stA[1], 'temanjail123@gmail.com', 2, 100),         // nama_ganda — dikirim BELAKANGAN tapi skor lebih tinggi
        R('dr-4', stA[2], 'bilal.r@gmail.com', 2, 50),               // akun_multi_nama (akun sama memilih Bilal & Fatimah)
        R('dr-5', stA[3], 'bilal.r@gmail.com', 3, 100),              // akun_multi_nama
        R('dr-6', stA[4], 'hasan.h@gmail.com', 3, 100),              // konflik_nilai_lama
        R('dr-7', stA[5], 'khadijah.p@gmail.com', 4, 50),            // ok
      ] };
      // publikasi
      [acts[5], acts[3], acts[1]].forEach((e) => db.publication_settings.push(mk(A, { exam_id: e.id, is_published: true, published_at: now() })));
      acts.forEach((e) => { if (!db.publication_settings.some((p) => p.exam_id === e.id)) db.publication_settings.push(mk(A, { exam_id: e.id, is_published: false })); });
      // ===== Guru B: Matematika — punya kelas bernama SAMA "VIII.1" dan siswa bernama sama =====
      const b81 = mk(B, { name: 'VIII.1', grade: '8', academic_year: '2026/2027' }); db.classes.push(b81);
      const sMt = mk(B, { name: 'Matematika', code: 'MTK' }); db.subjects.push(sMt);
      const bAhmad = mk(B, { nis: '9001', full_name: 'Ahmad Fauzi', class_id: b81.id, student_code: 'B001', status: 'aktif' });
      const bDewi = mk(B, { nis: '9002', full_name: 'Dewi Kartika', class_id: b81.id, student_code: 'B002', status: 'aktif' });
      db.students.push(bAhmad, bDewi);
      const bEx = mk(B, { kind: 'ujian', delivery: 'manual', name: 'PTS Matematika', subject_id: sMt.id, class_id: b81.id, semester: 'Ganjil', academic_year: '2026/2027', exam_type: 'PTS', date: '2026-10-08', kktp: 70, max_score: 100, status: 'selesai', question_count: 0 });
      const bEx2 = mk(B, { kind: 'manual', delivery: 'manual', name: 'Keaktifan Kelas', category: 'Keaktifan', subject_id: sMt.id, class_id: b81.id, semester: 'Ganjil', academic_year: '2026/2027', exam_type: 'Keaktifan', date: '2026-10-15', kktp: 70, max_score: 100, status: 'selesai', question_count: 0 });
      db.exams.push(bEx, bEx2);
      db.grades.push(mk(B, { exam_id: bEx.id, student_id: bAhmad.id, score: 78, raw_score: 78, source: 'manual' }), mk(B, { exam_id: bEx.id, student_id: bDewi.id, score: 66, raw_score: 66, source: 'manual' }), mk(B, { exam_id: bEx2.id, student_id: bAhmad.id, score: 90, raw_score: 90, source: 'manual' }));
      db.publication_settings.push(mk(B, { exam_id: bEx.id, is_published: true, published_at: now() }), mk(B, { exam_id: bEx2.id, is_published: false }));
      save(db);
    },
  };

  window.DemoBackend = DemoBackend;
  window.DbError = DbError;
})();
