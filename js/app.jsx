/* Root: pilih backend, sesi, pengaturan, routing */

function pickBackend() {
  const c = window.APP_CONFIG || {};
  // Konfigurasi SATU KALI oleh administrator di config.js / environment deploy.
  // Tidak ada konfigurasi per guru dan tidak dibaca dari localStorage.
  let cfg = null;
  if (c.SUPABASE_URL && c.SUPABASE_ANON_KEY) cfg = { url: c.SUPABASE_URL, key: c.SUPABASE_ANON_KEY, source: 'config' };
  try { localStorage.removeItem('sm_supabase_cfg'); } catch (e) {}
  window.__SB_CFG = cfg || {};
  if (cfg) { try { return makeSupabaseBackend(cfg.url, cfg.key); } catch (e) { console.error(e); window.__SB_ERR = e.message; } }
  if (cfg) return makeBackendError(window.__SB_ERR || 'Konfigurasi Supabase tidak dapat dimuat.');
  return DemoBackend;
}

function makeBackendError(message) {
  const unavailable = async () => { throw new Error(message); };
  return {
    mode:'error', label:'Supabase tidak tersedia',
    async getSession(){ return null; }, async getStudentSession(){ return null; },
    onAuthChange(){ return () => {}; },
    signIn:unavailable, resetPassword:unavailable, signInStudent:unavailable,
    getStudentPortalData:unavailable, portalLookup:unavailable, ping:unavailable,
    async signOut(){}, async signOutStudent(){},
  };
}

function DemoDataCard() {
  const { backend, reloadSettings } = useApp(); const toast = useToast(); const confirm = useConfirm();
  if (backend.mode !== 'demo') return null;
  const seed = () => confirm({ title: 'Isi data contoh DEMO?', confirmText: 'Isi data DEMO', message: 'Data demo di browser ini diganti dengan data contoh untuk DUA guru (Guru A: Bahasa Arab — ujian, tugas PG+essay, nilai manual; Guru B: Matematika). Keduanya punya kelas "VIII.1" dan siswa "Ahmad Fauzi" untuk menguji pemisahan data. Data ini bukan data nyata.', onConfirm: async () => { await backend.seedDemo(); await reloadSettings(); toast.success('Data contoh DEMO dimuat'); setTimeout(() => location.reload(), 300); } });
  const reset = () => confirm({ title: 'Kosongkan data DEMO?', danger: true, confirmText: 'Kosongkan', message: 'Semua data demo di browser ini akan dihapus.', onConfirm: async () => { await backend.resetDemo(); await reloadSettings(); toast.success('Data demo dikosongkan'); setTimeout(() => location.reload(), 300); } });
  return (
    <div className="card card-pad row gap-16" style={{ flexWrap: 'wrap', borderColor: 'var(--amber-100)', background: 'var(--amber-50)' }}>
      <Icon name="FlaskConical" style={{ color: 'var(--amber)' }} />
      <div className="grow"><div className="semibold">Data DEMO</div><div className="small muted">Mode demo menyimpan data di browser ini. Coba login sebagai Guru A lalu Guru B untuk melihat bahwa data tiap guru terpisah.</div></div>
      <button className="btn btn-outline btn-sm" onClick={reset}>Kosongkan</button><button className="btn btn-primary btn-sm" onClick={seed}><Icon name="Sparkles" size={15} />Isi data contoh</button>
    </div>
  );
}

const ADMIN_TITLES = { '': 'Dashboard', siswa: 'Data Siswa', 'akun-siswa': 'Akun Siswa', kelas: 'Data Kelas', ujian: 'Manajemen Ujian & Tugas', nilai: 'Input Nilai', rekap: 'Rekap Nilai', publikasi: 'Publikasi Nilai', game: 'Manajemen Game', 'ruang-game': 'Live Game Room', portal: 'Portal Siswa', pengaturan: 'Pengaturan', akun: 'Akun Guru' };

function App() {
  const backend = useMemo(pickBackend, []);
  const route = useRoute();
  const [session, setSession] = useState(undefined); // undefined = memeriksa
  const [studentSession, setStudentSession] = useState(undefined);
  const [settings, setSettings] = useState(null);
  useEffect(() => {
    const refreshSessions = () => {
      backend.getSession().then((s) => setSession(s || null)).catch(() => setSession(null));
      backend.getStudentSession().then((s) => setStudentSession(s || null)).catch(() => setStudentSession(null));
    };
    refreshSessions();
    const unsubscribe = backend.onAuthChange((s) => {
      setSession(s || null);
      backend.getStudentSession().then((student) => setStudentSession(student || null)).catch(() => setStudentSession(null));
    });
    const onStorage = (e) => { if (!e.key || e.key === 'sm_demo_active_session_v1' || e.key === 'sm_demo_session_v2' || e.key === 'sm_demo_student_session_v1') refreshSessions(); };
    window.addEventListener('storage', onStorage);
    return () => { if (unsubscribe) unsubscribe(); window.removeEventListener('storage', onStorage); };
  }, [backend]);
  const reloadSettings = useCallback(async () => { try { setSettings(await backend.getSettings()); } catch (e) { console.error(e); setSettings({ profile: {}, portal: {}, error: e.message }); } }, [backend]);
  useEffect(() => { if (session) reloadSettings(); else setSettings(null); }, [session && session.user && session.user.id]);
  const google = useMemo(() => ({ google_script_url: settings && settings.profile && settings.profile.google_script_url, google_token: settings && settings.profile && settings.profile.google_token }), [settings]);
  const ctx = { backend, session, setSession, studentSession, setStudentSession, settings, reloadSettings, google };

  const { path, query } = route;
  let page;
  if (path.startsWith('/admin')) {
    if (session === undefined) page = <div className="state" style={{ minHeight: '100vh' }}><Spinner lg /><p>Memeriksa sesi…</p></div>;
    else if (!session) { setTimeout(() => navigate('/login'), 0); page = null; }
    else {
      const parts = path.split('/').filter(Boolean); const sec = parts[1] || ''; const id = parts[2];
      let body;
      switch (sec) {
        case '': body = <>{settings && settings.profile && settings.profile.role === 'admin' && <DemoDataCard />}<DashboardPage /></>; break;
        case 'siswa': body = id ? <StudentDetailPage id={id} key={id} /> : <StudentsPage query={query} />; break;
        case 'akun-siswa': body = <AdminStudentAccountsPage />; break;
        case 'kelas': body = id ? <ClassDetailPage id={id} key={id} /> : <ClassesPage />; break;
        case 'ujian': body = id ? <ExamDetailPage id={id} key={id} /> : <ExamsPage query={query} />; break;
        case 'nilai': body = <GradesPage query={query} />; break;
        case 'rekap': body = <RecapPage query={query} />; break;
        case 'publikasi': body = <PublicationPage query={query} />; break;
        case 'game': body = <AdminGamePage />; break;
        case 'ruang-game': body = <AdminLiveGamePage />; break;
        case 'portal': body = <PortalAdminPage />; break;
        case 'akun': body = <AccountsPage />; break;
        case 'pengaturan': body = <>{query.tab === 'supabase' && <DemoDataCard />}<SettingsPage query={query} /></>; break;
        default: body = <div className="card"><EmptyState icon="MapPinOff" title="Halaman tidak ditemukan" action={<Link className="btn btn-primary" to="/admin">Ke Dashboard</Link>} /></div>;
      }
      page = <AdminLayout path={path} title={ADMIN_TITLES[sec] || 'Halaman'}>{settings && settings.error && <Alert tone="err" title="Pengaturan gagal dimuat">{settings.error}</Alert>}{body}</AdminLayout>;
    }
  } else if (path.startsWith('/siswa')) {
    if (path === '/siswa/login') page = <StudentLoginPage />;
    else if (studentSession === undefined) page = <div className="state" style={{ minHeight: '100vh' }}><Spinner lg /><p>Memeriksa sesi siswa…</p></div>;
    else if (!studentSession) { setTimeout(() => navigate('/siswa/login'), 0); page = null; }
    else if (studentSession.account.must_change_password && path !== '/siswa/ganti-password') { setTimeout(() => navigate('/siswa/ganti-password'), 0); page = null; }
    else if (path === '/siswa/ganti-password') page = <StudentChangePasswordPage />;
    else if (path === '/siswa/profil') page = <StudentProfilePage />;
    else if (path === '/siswa/game/play') page = <StudentGamePlayPage assignmentId={query.assignment} />;
    else if (path.startsWith('/siswa/game/play/')) page = <StudentGamePlayPage assignmentId={path.split('/')[4]} />;
    else if (path.startsWith('/siswa/game/live/')) page = <StudentGamePlayPage roomId={path.split('/')[4]} />;
    else if (path === '/siswa/game') page = <StudentGamesPage />;
    else if (path === '/siswa/nilai') page = <StudentGradesPage />;
    else if (path === '/siswa/tugas') page = <StudentTasksPage />;
    else if (path === '/siswa/materi') page = <StudentMaterialsPage />;
    else if (path === '/siswa/riwayat') page = <StudentHistoryPage />;
    else if (path === '/siswa') page = <StudentDashboardPage />;
    else { setTimeout(() => navigate('/siswa'), 0); page = null; }
  } else if (path === '/login') page = <LoginPage />;
  else if (path === '/cek-nilai') page = <PortalPage />;
  else if (path === '/panduan') page = <GuidePage />;
  else if (path === '/') page = <HomePage />;
  else page = <><PublicHeader /><div className="pub-main"><EmptyState icon="MapPinOff" title="Halaman tidak ditemukan" action={<Link className="btn btn-primary" to="/">Ke Beranda</Link>} /></div></>;

  useEffect(() => {
    const studentTitles = { '/siswa': 'Beranda', '/siswa/game': 'Game Pembelajaran', '/siswa/nilai': 'Nilai Saya', '/siswa/tugas': 'Tugas', '/siswa/materi': 'Materi', '/siswa/riwayat': 'Riwayat Pembelajaran', '/siswa/profil': 'Profil Saya', '/siswa/ganti-password': 'Ganti Password' };
    const title = path.startsWith('/admin') ? (ADMIN_TITLES[path.split('/')[2] || ''] || 'Admin') : studentTitles[path];
    document.title = (title ? title + ' · ' : '') + 'Sistem Manajemen Ujian & Nilai';
  }, [path]);

  return (
    <AppCtx.Provider value={ctx}>
      <ToastProvider><ConfirmProvider>
        {window.__SB_ERR && <div className="demo-ribbon" style={{ background: '#7f1d1d' }}>Gagal memuat Supabase: {window.__SB_ERR}. Backend Supabase dinonaktifkan; data DEMO tidak akan digunakan.</div>}
        {page}
      </ConfirmProvider></ToastProvider>
    </AppCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
