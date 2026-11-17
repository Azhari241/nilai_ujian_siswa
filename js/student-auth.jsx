/* Portal akun siswa. Mendukung mode demo (data di browser) dan mode Supabase (lintas perangkat). */

const STUDENT_NAV = [
  { to: '/siswa', label: 'Beranda', icon: 'House' }, { to: '/siswa/game', label: 'Game', icon: 'Gamepad2' },
  { to: '/siswa/nilai', label: 'Nilai Saya', icon: 'BarChart3' }, { to: '/siswa/tugas', label: 'Tugas', icon: 'ClipboardList' },
  { to: '/siswa/materi', label: 'Materi', icon: 'Library' }, { to: '/siswa/riwayat', label: 'Riwayat', icon: 'History' },
  { to: '/siswa/profil', label: 'Profil', icon: 'ContactRound' },
];

/* Menu yang ditampilkan saat backend memakai Supabase (mode produksi).
   Tambahkan rute lain di sini setelah fiturnya terhubung ke Supabase. */
const SUPABASE_STUDENT_ROUTES = ['/siswa', '/siswa/game', '/siswa/profil'];

function StudentPortalFrame({ title, children }) {
  const { backend, studentSession, setStudentSession } = useApp(); const path = parseHash().path; const toast = useToast();
  const [busy, setBusy] = useState(false);
  const logout = async () => { if (busy) return; setBusy(true); try { await backend.signOutStudent(); } catch (e) { toast.error(e.message || 'Pencabutan sesi server gagal.'); } finally { setStudentSession(null); navigate('/siswa/login'); setBusy(false); } };
  return (
    <div className="student-portal">
      <header className="student-topbar">
        <Link to="/siswa" className="brand"><span className="brand-mark"><Icon name="GraduationCap" size={20} /></span><span>Portal Siswa<small>Ujian & Nilai</small></span></Link>
        <div className="row gap-10"><span className="student-welcome">{studentSession && studentSession.student.full_name}</span><Link to="/siswa/profil" className="student-top-avatar" aria-label="Buka profil siswa">{U.initials(studentSession && studentSession.student.full_name || 'Siswa')}</Link><button type="button" className="btn btn-outline btn-sm" onClick={logout} disabled={busy}><Icon name="LogOut" size={15} />{busy ? 'Keluar…' : 'Keluar'}</button></div>
      </header>
      <div className="student-wrap">
        <div className="student-page-head"><div><div className="eyebrow">PORTAL SISWA</div><h1>{title}</h1></div></div>
        <nav className="student-main-nav" aria-label="Navigasi Portal Siswa">{(backend.mode === 'demo' ? STUDENT_NAV : STUDENT_NAV.filter(item => SUPABASE_STUDENT_ROUTES.includes(item.to))).map((item) => <Link key={item.to} to={item.to} className={'student-nav-link' + (path === item.to ? ' active' : '')} aria-current={path === item.to ? 'page' : undefined}><Icon name={item.icon} size={16} /><span>{item.label}</span></Link>)}</nav>
        {backend.mode === 'demo' && <Alert tone="warn" title="Mode DEMO">Data belajar tersimpan di browser ini. Akun DEMO bukan untuk data sekolah nyata.</Alert>}
        <div className="student-content">{children}</div>
      </div>
    </div>
  );
}

function useStudentPortalData() {
  const { backend } = useApp(); const [data, setData] = useState(null); const [error, setError] = useState(''); const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => { let on = true; setData(null); setError(''); backend.getStudentPortalData().then((x) => { if (on) setData(x); }).catch((e) => { if (on) setError(e.message || 'Data portal gagal dimuat.'); }); return () => { on = false; }; }, [backend, reloadKey]);
  return { data, error, retry: () => setReloadKey((v) => v + 1) };
}

function StudentPortalState({ title, error, onRetry, children }) {
  if (error) return <StudentPortalFrame title={title}><div className="card card-pad"><ErrorState error={error} onRetry={onRetry} /></div></StudentPortalFrame>;
  if (!children) return <StudentPortalFrame title={title}><div className="card card-pad"><LoadingState /></div></StudentPortalFrame>;
  return <StudentPortalFrame title={title}>{children}</StudentPortalFrame>;
}

function StudentEmpty({ icon, title, children, action }) {
  return <div className="student-empty"><span className="student-empty-icon"><Icon name={icon || 'Inbox'} size={22} /></span><div><b>{title}</b><p>{children}</p>{action}</div></div>;
}

function StudentGradeCards({ grades }) {
  if (!grades.length) return <StudentEmpty icon="BarChart3" title="Belum ada nilai yang dipublikasikan">Nilai akan tampil setelah guru mempublikasikannya.</StudentEmpty>;
  return <div className="student-card-list">{grades.map((g) => <article className="card card-pad student-record" key={g.id}><div className="student-record-top"><div><div className="eyebrow">{g.subject} · {g.semester} · {g.academic_year}</div><h3>{g.exam_name}</h3></div><strong className="student-score">{g.score ?? '—'}</strong></div><div className="row-wrap mt-8"><Badge tone="green">Dipublikasikan</Badge><span className="small muted">{g.kind === 'tugas' ? 'Tugas' : 'Penilaian'}{g.date ? ' · ' + studentFormatDate(g.date) : ''}</span></div></article>)}</div>;
}

function studentFormatDate(value) {
  if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value) : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

function StudentLoginPage() {
  const { backend, setSession, studentSession, setStudentSession } = useApp();
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [fieldError, setFieldError] = useState({});
  useEffect(() => { if (studentSession) navigate(studentSession.account.must_change_password ? '/siswa/ganti-password' : '/siswa'); }, [studentSession]);
  const submit = async (e) => {
    e.preventDefault(); if (busy) return;
    const f = {}; if (!username.trim()) f.username = 'Masukkan username'; if (!password) f.password = 'Masukkan password';
    setFieldError(f); setError(''); if (Object.keys(f).length) return;
    setBusy(true);
    try { const s = await backend.signInStudent(username, password); setPassword(''); setSession(null); setStudentSession(s); navigate(s.account.must_change_password ? '/siswa/ganti-password' : '/siswa'); }
    catch (x) { setError(x.message || 'Login gagal.'); } finally { setBusy(false); }
  };
  return (
    <>
      <PublicHeader />
      <div className="auth-wrap student-login-wrap"><div className="card auth-card">
        <form className="col gap-16" onSubmit={submit} noValidate>
          <div><div className="brand-mark" style={{ width: 44, height: 44 }}><Icon name="GraduationCap" size={22} /></div><h2 className="mt-16" style={{ fontSize: 24, fontWeight: 800 }}>Login Siswa</h2><p className="muted mt-4">Masuk ke akun belajar Anda.</p></div>
          {backend.mode === 'demo' && <Alert tone="warn" title="Mode DEMO">Login siswa hanya simulasi lokal. Akun dibuat oleh guru melalui menu Akun Siswa.</Alert>}
          {error && <Alert tone="err">{error}</Alert>}
          <Field label="Username" required error={fieldError.username}><input className={'input' + (fieldError.username ? ' err' : '')} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} disabled={busy} autoFocus /></Field>
          <Field label="Password" required error={fieldError.password}><div className="input-wrap"><input className={'input' + (fieldError.password ? ' err' : '')} style={{ paddingRight: 44 }} type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} /><span className="trail"><button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setShow(!show)} aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'}><Icon name={show ? 'EyeOff' : 'Eye'} size={16} /></button></span></div></Field>
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy && <Spinner />}Masuk ke Portal Siswa</button>
          <div className="row between small"><Link to="/cek-nilai" className="link-text">Cek nilai publik</Link><Link to="/login" className="link-text">Login Guru</Link></div>
        </form>
      </div></div>
    </>
  );
}

function StudentDashboardPage() {
  const { backend } = useApp(); const { data, error, retry } = useStudentPortalData();
  if (error || !data) return <StudentPortalState title="Beranda" error={error} onRetry={retry} />;
  if (backend.mode === 'supabase') return <StudentPortalState title="Beranda"><section className="card card-pad col gap-12"><div className="row gap-12"><div className="avatar" style={{ width:60, height:60, fontSize:21 }}>{U.initials(data.profile.student.full_name)}</div><div><div className="eyebrow">SELAMAT DATANG</div><h2>{data.profile.student.full_name}</h2><div className="muted">{data.profile.class?.name || 'Kelas belum tersedia'} · {data.profile.school.school_name}</div></div></div><div className="student-profile-grid"><div><span>Username</span><b>{data.profile.account.username}</b></div><div><span>Status akun</span><b>{data.profile.account.account_status}</b></div><div><span>Login terakhir</span><b>{studentFormatDate(data.profile.account.last_login)}</b></div></div><Alert tone="info" title="Akun siswa aktif">Identitas siswa sudah terhubung ke akun Supabase Auth. Menu Game sudah tersedia. Halaman nilai, tugas, dan pembelajaran akan diintegrasikan pada fase berikutnya.</Alert><div className="row-wrap"><Link to="/siswa/game" className="btn btn-primary"><Icon name="Gamepad2" size={15}/>Main game</Link><Link to="/siswa/profil" className="btn btn-outline"><Icon name="ContactRound" size={15}/>Profil saya</Link><Link to="/siswa/ganti-password" className="btn btn-outline"><Icon name="KeyRound" size={15}/>Ganti password</Link></div></section></StudentPortalState>;
  const { profile, summary, grades, tasks, games, history } = data; const cls = profile.class;
  return <StudentPortalState title="Beranda">
    <div className="student-hero card card-pad"><div className="avatar" style={{ width: 60, height: 60, fontSize: 21 }}>{U.initials(profile.student.full_name)}</div><div className="grow"><div className="eyebrow">SELAMAT DATANG</div><h2>{profile.student.full_name}</h2><div className="muted">{profile.account.username} · {cls ? `${cls.name} · ${cls.academic_year || '—'}` : 'Kelas belum tersedia'} · {profile.school.school_name}</div></div><Badge tone="green" dot>Akun aktif</Badge></div>
    <div className="grid g3 student-summary">
      <div className="card stat"><div className="s-top">Nilai dipublikasikan<span className="s-ico ico-indigo"><Icon name="BarChart3" size={17} /></span></div><div className="s-val student-stat-text">{summary.published_grades}</div><div className="s-sub">Nilai yang dapat dilihat</div></div>
      <div className="card stat"><div className="s-top">Tugas belum selesai<span className="s-ico ico-amber"><Icon name="ClipboardList" size={17} /></span></div><div className="s-val student-stat-text">{summary.pending_tasks}</div><div className="s-sub">Dari {summary.tasks} tugas kelas</div></div>
      <div className="card stat"><div className="s-top">Game ditugaskan<span className="s-ico ico-green"><Icon name="Gamepad2" size={17} /></span></div><div className="s-val student-stat-text">{summary.games}</div><div className="s-sub">Game yang tersedia untuk kelas</div></div>
    </div>
    <div className="grid g2 student-dashboard-grid">
      <section className="card card-pad"><div className="student-section-head"><div><h2>Nilai terbaru</h2><p>Hanya nilai yang sudah dipublikasikan.</p></div><Link to="/siswa/nilai" className="link-text">Semua nilai</Link></div>{grades.length ? <StudentGradeCards grades={grades.slice(0, 3)} /> : <StudentEmpty icon="BarChart3" title="Belum ada nilai terbaru">Nilai muncul di sini setelah guru memublikasikannya.</StudentEmpty>}</section>
      <section className="card card-pad"><div className="student-section-head"><div><h2>Tugas</h2><p>Tugas untuk kelas {cls ? cls.name : 'saat ini'}.</p></div><Link to="/siswa/tugas" className="link-text">Semua tugas</Link></div>{tasks.length ? <StudentTaskList tasks={tasks.slice(0, 3)} /> : <StudentEmpty icon="ClipboardList" title="Belum ada tugas">Belum ada tugas yang terhubung dengan kelas Anda.</StudentEmpty>}</section>
      <section className="card card-pad"><div className="student-section-head"><div><h2>Game pembelajaran</h2><p>Penugasan game untuk Anda.</p></div><Link to="/siswa/game" className="link-text">Lihat katalog</Link></div>{games.length ? <StudentGameList games={games.slice(0, 2)} /> : <StudentEmpty icon="Gamepad2" title="Belum ada game ditugaskan">Guru belum menugaskan game ke kelas Anda.</StudentEmpty>}</section>
      <section className="card card-pad"><div className="student-section-head"><div><h2>Aktivitas terakhir</h2><p>Aktivitas yang tercatat di akun belajar Anda.</p></div><Link to="/siswa/riwayat" className="link-text">Riwayat lengkap</Link></div>{history.length ? <StudentHistoryList items={history.slice(0, 4)} /> : <StudentEmpty icon="History" title="Belum ada aktivitas">Aktivitas belajar akan tercatat di sini.</StudentEmpty>}</section>
    </div>
  </StudentPortalState>;
}

function StudentTaskList({ tasks }) {
  return <div className="student-card-list">{tasks.map((t) => <article className="student-list-record" key={t.id}><div className="student-list-icon"><Icon name="ClipboardList" size={17} /></div><div className="grow"><b>{t.title}</b><div className="small muted">{t.subject} · {t.teacher}</div>{t.description && <div className="small muted student-task-description">{t.description}</div>}<div className="small muted">Tenggat: {t.due_date ? studentFormatDate(t.due_date) : 'Belum ditentukan'}</div></div><Badge tone={t.status.startsWith('Sudah') ? 'green' : t.status.startsWith('Tenggat') ? 'amber' : 'blue'}>{t.status}</Badge></article>)}</div>;
}

function StudentGameList({ games }) {
  return <div className="student-card-list">{games.map((g) => { const modes=g.modes||[]; const remaining=g.max_attempts===0?'Tanpa batas':`${Math.max(0,(g.max_attempts||0)-(g.attempts_used||0))} percobaan tersisa`; const unavailable=g.status!=='Belum dimainkan'; return <article className="card card-pad student-record" key={g.id}><div className="student-record-top"><div><div className="eyebrow">{g.subject} · {g.class_name}</div><h3>{g.title}</h3></div><Badge>{g.difficulty}</Badge></div><p>{g.description || 'Belum ada deskripsi.'}</p><div className="small muted">{g.chapter || 'Materi belum ditentukan'}{g.material ? ' · ' + g.material : ''} · Guru {g.teacher}</div>{(g.start_at || g.end_at) && <div className="small muted">Jadwal: {g.start_at ? studentFormatDate(g.start_at) : '—'} – {g.end_at ? studentFormatDate(g.end_at) : '—'}</div>}<div className="row-wrap mt-8"><Badge tone={unavailable?'amber':'blue'}>{g.status}</Badge><span className="small muted">{remaining}</span>{modes.includes('individual')&&<button className="btn btn-primary btn-sm" type="button" onClick={()=>navigate('/siswa/game/play/'+g.id)} disabled={unavailable}>Mulai Individu</button>}{modes.includes('live')&&<span className="small muted">Live: masukkan kode ruang di bawah</span>}</div></article>;})}</div>;
}

function StudentHistoryList({ items }) {
  return <div className="student-timeline">{items.map((item) => <div className="student-timeline-item" key={item.id}><span className="student-timeline-dot"><Icon name={item.kind === 'login' ? 'LogIn' : item.kind === 'grade' ? 'BarChart3' : item.kind === 'game' ? 'Gamepad2' : 'ClipboardList'} size={14} /></span><div className="grow"><b>{item.title}</b><div className="small muted">{item.description}</div></div><time className="small muted" dateTime={item.at || undefined}>{studentFormatDate(item.at)}</time></div>)}</div>;
}

function StudentGamesPage() {
  const { data, error, retry } = useStudentPortalData(); if (error || !data) return <StudentPortalState title="Game Pembelajaran" error={error} onRetry={retry} />;
  return <StudentPortalState title="Game Pembelajaran"><StudentRoomJoinPanel />{data.games.length ? <StudentGameList games={data.games} /> : <div className="card card-pad"><StudentEmpty icon="Gamepad2" title="Belum ada game ditugaskan">Game terbit dan penugasan kelas dari guru akan tampil di sini.</StudentEmpty></div>}</StudentPortalState>;
}

function StudentRoomJoinPanel() {
  const { backend } = useApp(); const [code, setCode] = useState(''); const [room, setRoom] = useState(null); const [rooms, setRooms] = useState([]); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const recover = async () => { setLoading(true); setError(''); try { const sessions = await backend.recoverLiveGameSession(); setRooms(sessions); setRoom((current) => sessions.find((s) => s.id === (current && current.id)) || sessions[0] || null); } catch (e) { setError(e.message || 'Ruang aktif tidak dapat dipulihkan.'); } finally { setLoading(false); } };
  useEffect(() => { recover(); }, [backend]);
  /* Auto-refresh status ruang tiap 3 detik agar siswa melihat peserta baru dan tombol "Masuk ke permainan" tanpa menekan Perbarui. */
  useEffect(() => {
    if (!room || ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(room.status)) return;
    const t = setInterval(async () => {
      try {
        const u = await backend.getLiveGameRoom(room.id);
        setRoom(u);
        setRooms((cur) => cur.map((r) => r.id === u.id ? u : r));
      } catch (e) { /* abaikan, coba lagi di putaran berikutnya */ }
    }, 3000);
    return () => clearInterval(t);
  }, [backend, room && room.id, room && room.status]);
  const join = async (e) => { e.preventDefault(); if (busy) return; setBusy(true); setError(''); setNotice(''); try { const joined = await backend.joinLiveGameRoom(code); setRoom(joined); setRooms((current) => [joined, ...current.filter((r) => r.id !== joined.id)]); setCode(''); setNotice('Anda bergabung. Status ruang diperbarui otomatis setiap beberapa detik.'); } catch (x) { setError(x.message || 'Gagal bergabung ke ruang.'); } finally { setBusy(false); } };
  const refreshRoom = async () => { if (!room) return recover(); setBusy(true); setError(''); try { const updated = await backend.getLiveGameRoom(room.id); setRoom(updated); setRooms((current) => current.map((r) => r.id === updated.id ? updated : r)); setNotice('Status ruang diperbarui.'); } catch (x) { setError(x.message || 'Ruang gagal dimuat.'); } finally { setBusy(false); } };
  return <section className="card card-pad live-student-room">
    <div className="student-section-head"><div><h2>Gabung Live Game Room</h2><p>Masukkan kode dari guru atau pulihkan ruang yang sudah Anda ikuti.</p></div><button className="btn btn-outline btn-sm" type="button" onClick={refreshRoom} disabled={loading || busy}><Icon name="RefreshCw" size={15} />Perbarui</button></div>
    {backend.mode === 'demo' && <Alert tone="warn" title="Mode DEMO tanpa sinkronisasi real-time">Status peserta hanya berubah saat halaman diperbarui. Live Game lintas perangkat belum aktif.</Alert>}
    {error && <Alert tone="err">{error}</Alert>}{notice && <Alert tone="ok">{notice}</Alert>}
    {room ? <div className="live-student-room-details">{rooms.length > 1 && <Field label="Ruang aktif"><select className="input" value={room.id} onChange={(e) => setRoom(rooms.find((r) => r.id === e.target.value) || null)} disabled={busy}><option value="">Pilih ruang</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.game_title} · {r.class_name} · {r.code} · {r.status}</option>)}</select></Field>}<div className="live-room-head"><div className="grow"><div className="eyebrow">{room.class_name} · {room.teacher_name}</div><h3>{room.game_title}</h3><div className="small muted">Kode {room.code} · ruang tersimpan sampai {studentFormatDate(room.expires_at)}</div></div><Badge tone={studentRoomStatusTone(room.status)} dot>{room.status}</Badge></div><div className="live-room-roster"><div className="semibold small mb-8">Peserta ({room.participant_count})</div>{room.participants.length ? room.participants.map((p) => <div className="live-room-person" key={p.id}><span>{p.student_name}</span><Badge tone="green">Bergabung</Badge></div>) : <div className="small muted">Menunggu peserta lain.</div>}</div>{room.status==='IN_PROGRESS'&&<button className="btn btn-primary mt-12" onClick={()=>navigate('/siswa/game/live/'+room.id)}>Masuk ke permainan</button>}<div className="small muted mt-8">Host mengendalikan kunci dan mulai sesi. Siswa tidak dapat memulai permainan.</div></div> : <form className="live-student-join-form" onSubmit={join}><label className="field grow"><span className="label">Kode permainan</span><input className="input live-room-code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 6))} placeholder="6 karakter" autoCapitalize="characters" autoComplete="off" maxLength={6} disabled={busy || loading} /></label><button className="btn btn-primary" disabled={busy || loading || code.length !== 6}>{busy && <Spinner />}Gabung ruang</button></form>}
    {loading && !room && <div className="small muted mt-8">Memeriksa ruang yang sudah diikuti…</div>}
  </section>;
}
function studentRoomStatusTone(status) { return ({ WAITING: 'blue', LOCKED: 'amber', COUNTDOWN: 'amber', IN_PROGRESS: 'green', PAUSED: 'amber', COMPLETED: 'green', CANCELLED: 'red', EXPIRED: 'red' })[status] || 'blue'; }

function StudentGradesPage() {
  const { data, error, retry } = useStudentPortalData(); if (error || !data) return <StudentPortalState title="Nilai Saya" error={error} onRetry={retry} />;
  return <StudentPortalState title="Nilai Saya"><div className="student-info-line"><Icon name="ShieldCheck" size={17} /> Nilai yang tampil sudah dipublikasikan dan terhubung dengan akun Anda.</div><StudentGradeCards grades={data.grades} /></StudentPortalState>;
}

function StudentTasksPage() {
  const { data, error, retry } = useStudentPortalData(); if (error || !data) return <StudentPortalState title="Tugas" error={error} onRetry={retry} />;
  return <StudentPortalState title="Tugas">{data.tasks.length ? <StudentTaskList tasks={data.tasks} /> : <div className="card card-pad"><StudentEmpty icon="ClipboardList" title="Belum ada tugas untuk kelas Anda">Tugas yang dibuat guru untuk kelas Anda akan tampil di sini. Pengumpulan tugas belum tersedia pada fase ini.</StudentEmpty></div>}</StudentPortalState>;
}

function StudentMaterialsPage() {
  const { data, error, retry } = useStudentPortalData(); const [filter, setFilter] = useState({ subject: '', class_name: '', semester: '', chapter: '' });
  if (error || !data) return <StudentPortalState title="Materi" error={error} onRetry={retry} />;
  const materials = data.materials || []; const fields = [['subject', 'Mata pelajaran'], ['class_name', 'Kelas'], ['semester', 'Semester'], ['chapter', 'BAB']];
  const filtered = materials.filter((m) => fields.every(([key]) => !filter[key] || String(m[key] || '') === filter[key]));
  return <StudentPortalState title="Materi"><section className="card card-pad"><div className="student-filter-grid">{fields.map(([key, label]) => <label key={key} className="student-filter"><span>{label}</span><select className="input" value={filter[key]} onChange={(e) => setFilter((v) => Object.assign({}, v, { [key]: e.target.value }))} disabled={!materials.length}><option value="">Semua</option>{[...new Set(materials.map((m) => m[key]).filter(Boolean))].sort().map((v) => <option key={v} value={v}>{v}</option>)}</select></label>)}</div></section>
    {filtered.length ? <div className="student-card-list">{filtered.map((m) => <article className="card card-pad student-record" key={m.id}><div className="eyebrow">{m.subject} · {m.class_name} · {m.semester}</div><h3>{m.title}</h3><div className="small muted">{m.chapter || 'BAB belum ditentukan'} · Guru {m.teacher}</div>{m.description && <p>{m.description}</p>}{m.content && <div className="student-material-body" dir="auto">{m.content}</div>}</article>)}</div> : <div className="card card-pad"><StudentEmpty icon="Library" title="Belum ada materi tersedia">Materi terbit dari guru akan muncul di sini. Filter akan aktif setelah materi tersedia.</StudentEmpty></div>}
  </StudentPortalState>;
}

function StudentHistoryPage() {
  const { data, error, retry } = useStudentPortalData(); if (error || !data) return <StudentPortalState title="Riwayat Pembelajaran" error={error} onRetry={retry} />;
  return <StudentPortalState title="Riwayat Pembelajaran"><div className="card card-pad">{data.history.length ? <StudentHistoryList items={data.history} /> : <StudentEmpty icon="History" title="Belum ada riwayat pembelajaran">Login dan aktivitas belajar yang tercatat akan muncul di sini.</StudentEmpty>}</div></StudentPortalState>;
}

function StudentChangePasswordPage() {
  const { backend, studentSession, setStudentSession, setSession } = useApp();
  const [current, setCurrent] = useState(''); const [next, setNext] = useState(''); const [confirm, setConfirm] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState(false);
  const mustChange = !!(studentSession && studentSession.account.must_change_password);
  const submit = async (e) => {
    e.preventDefault(); setError('');
    if (next.length < 10) { setError('Password baru minimal 10 karakter.'); return; }
    if (next !== confirm) { setError('Konfirmasi password belum sama.'); return; }
    setBusy(true); try { await backend.changeStudentPassword(current, next); setStudentSession(await backend.getStudentSession()); setDone(true); setCurrent(''); setNext(''); setConfirm(''); }
    catch (x) { setError(x.message); } finally { setBusy(false); }
  };
  return <StudentPortalFrame title="Ganti password"><div className="card card-pad"><form className="col gap-16" onSubmit={submit}>
    {mustChange && <Alert tone="warn" title="Password sementara">Ganti password sebelum membuka Portal Siswa.</Alert>}
    {done && <Alert tone="ok">Password berhasil diganti.</Alert>}{error && <Alert tone="err">{error}</Alert>}
    <Field label="Password saat ini" required><input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} disabled={busy} /></Field>
    <Field label="Password baru" required hint="Minimal 10 karakter"><input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} disabled={busy} /></Field>
    <Field label="Konfirmasi password baru" required><input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={busy} /></Field>
    <div className="row-wrap"><button className="btn btn-primary" disabled={busy}>{busy && <Spinner />}Simpan password baru</button>{done && <button type="button" className="btn btn-outline" onClick={() => navigate('/siswa')}>Lanjut ke beranda</button>}</div>
  </form></div></StudentPortalFrame>;
}

function StudentProfilePage() {
  const { data, error, retry } = useStudentPortalData(); const profile = data && data.profile;
  return <StudentPortalState title="Profil saya" error={error} onRetry={retry}>{profile && <div className="card card-pad col gap-10">
    <div className="row gap-12"><span className="avatar" style={{ width: 48, height: 48, fontSize: 18 }}>{U.initials(profile.student.full_name)}</span><div><div className="bold" style={{ fontSize: 18 }}>{profile.student.full_name}</div><div className="small muted">Profil akademik hanya dapat diubah melalui administrasi sekolah.</div></div></div>
    <div className="student-profile-grid"><div><span>Username</span><b>{profile.account.username}</b></div><div><span>Kelas saat ini</span><b>{profile.class ? profile.class.name : '—'}</b></div><div><span>Sekolah</span><b>{profile.school.school_name}</b></div><div><span>Status akun</span><b>{profile.account.account_status}</b></div><div><span>Status siswa</span><b>{profile.student.status}</b></div><div><span>ID siswa</span><b className="mono">{profile.student.id}</b></div></div>
    <div className="row-wrap mt-12"><Link to="/siswa/ganti-password" className="btn btn-outline"><Icon name="KeyRound" size={16} />Ganti password</Link></div>
  </div>}</StudentPortalState>;
}

Object.assign(window, { StudentLoginPage, StudentDashboardPage, StudentGamesPage, StudentChangePasswordPage, StudentProfilePage });
