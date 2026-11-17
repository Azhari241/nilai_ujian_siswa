/* Akun siswa — versi demo (lokal) dan versi Supabase (produksi). Operasi selalu lewat backend dan mengikuti kepemilikan guru/sekolah. */

function DemoAdminStudentAccountsPage() {
  const { backend } = useApp(); const toast = useToast(); const confirm = useConfirm();
  const q = useTables(['students', 'classes', 'student_accounts']);
  const [search, setSearch] = useState(''); const [classId, setClassId] = useState(''); const [status, setStatus] = useState(''); const [selected, setSelected] = useState([]); const [busy, setBusy] = useState(false); const [credentials, setCredentials] = useState([]); const [error, setError] = useState('');
  const d = q.data || { students: [], classes: [], student_accounts: [] };
  if (backend.mode !== 'demo') return <><PageHead title="Akun Siswa" desc="Kelola akun belajar yang terhubung dengan data siswa." /><Alert tone="warn" title="Akun siswa produksi belum diaktifkan">Phase ini mengimplementasikan simulasi DEMO saja. Backend Supabase belum dihubungkan.</Alert></>;
  const accounts = Object.fromEntries(d.student_accounts.map((a) => [a.student_id, a]));
  const classMap = Object.fromEntries(d.classes.map((c) => [c.id, c]));
  const students = d.students.filter((s) => s.status === 'aktif' && (!classId || s.class_id === classId) && (!status || (accounts[s.id] ? accounts[s.id].account_status : 'BELUM_ADA') === status) && (!search || U.norm(s.full_name).includes(U.norm(search)) || U.norm(s.student_code).includes(U.norm(search)))).sort((a, b) => a.full_name.localeCompare(b.full_name));
  const selectedStudents = students.filter((s) => selected.includes(s.id));
  const selectOne = (id) => setSelected((x) => x.includes(id) ? x.filter((n) => n !== id) : [...x, id]);
  const allVisible = students.length > 0 && students.every((s) => selected.includes(s.id));
  const toggleAll = () => setSelected(allVisible ? selected.filter((id) => !students.some((s) => s.id === id)) : [...new Set([...selected, ...students.map((s) => s.id)])]);
  const refresh = () => { setSelected([]); q.reload(true); };
  const createFor = async (ids) => {
    setBusy(true); setError(''); setCredentials([]);
    try { const result = await backend.createStudentAccounts(ids); setCredentials(result.created); refresh(); if (result.created.length) toast.success(`${result.created.length} akun dibuat. Simpan kredensial sementara sekarang.`); if (result.skipped.length) toast.info(`${result.skipped.length} siswa dilewati karena akun sudah ada atau data tidak memenuhi syarat.`); }
    catch (x) { setError(x.message); } finally { setBusy(false); }
  };
  const resetSelected = async () => {
    const rows = selectedStudents.filter((s) => accounts[s.id]); if (!rows.length) return;
    const ok = await confirm({ title: 'Reset password akun terpilih?', confirmText: `Reset ${rows.length} akun`, message: <>Password sementara untuk <b>{rows.length} akun</b> akan diganti. Password lama langsung tidak berlaku. Simpan kredensial yang ditampilkan setelah proses selesai.</> });
    if (!ok) return;
    setBusy(true); setError(''); setCredentials([]);
    const out = []; let failure = null;
    try { for (const s of rows) { try { out.push(await backend.resetStudentPassword(accounts[s.id].id)); } catch (x) { failure = x; break; } } setCredentials(out); refresh(); if (failure) setError(`${out.length} password direset sebelum proses berhenti: ${failure.message}`); else toast.success(`${out.length} password berhasil direset.`); }
    finally { setBusy(false); }
  };
  const printCredentials = () => {
    document.body.classList.add('print-student-credentials');
    const cleanup = () => { document.body.classList.remove('print-student-credentials'); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup); window.print(); setTimeout(cleanup, 1500);
  };
  const setStatusFor = async (s) => {
    const a = accounts[s.id]; if (!a) return;
    const next = a.account_status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    if (next === 'DISABLED') { const ok = await confirm({ title: 'Nonaktifkan akun siswa?', confirmText: 'Nonaktifkan akun', danger: true, message: <>Akun <b>{s.full_name}</b> tidak dapat login sampai diaktifkan kembali.</> }); if (!ok) return; }
    setBusy(true); try { await backend.setStudentAccountStatus(a.id, next); refresh(); toast.success(next === 'ACTIVE' ? 'Akun diaktifkan.' : 'Akun dinonaktifkan.'); } catch (x) { setError(x.message); } finally { setBusy(false); }
  };
  return <>
    <PageHead title="Akun Siswa" desc="Buat dan kelola akun belajar yang terhubung ke data siswa milik Anda." actions={<><button className="btn btn-outline" onClick={resetSelected} disabled={busy || !selectedStudents.some((s) => accounts[s.id])}><Icon name="KeyRound" size={16} />Reset terpilih</button><button className="btn btn-primary" onClick={() => createFor(selectedStudents.filter((s) => !accounts[s.id]).map((s) => s.id))} disabled={busy || !selectedStudents.some((s) => !accounts[s.id])}><Icon name="UserRoundPlus" size={16} />Buat akun terpilih</button></>} />
    <Alert tone="warn" title="Simulasi lokal DEMO">Akun disimpan di browser ini dan bukan autentikasi produksi. Password disimpan dalam bentuk PBKDF2 hash untuk demonstrasi; gunakan akun dan data palsu saja. Password sementara hanya tampil setelah dibuat atau direset.</Alert>
    {error && <Alert tone="err">{error}</Alert>}
    {credentials.length > 0 && <div className="card credential-card">
      <div className="card-head"><div><div className="card-title">Kredensial sementara</div><div className="card-sub">Salin atau cetak sekarang. Password tidak disimpan untuk ditampilkan kembali.</div></div><button className="btn btn-outline" onClick={printCredentials}><Icon name="Printer" size={16} />Cetak</button></div>
      <div className="table-wrap"><table className="table credential-table"><thead><tr><th>Nama siswa</th><th>Kelas</th><th>Username</th><th>Password sementara</th></tr></thead><tbody>{credentials.map((c) => <tr key={c.student_id}><td>{c.student_name}</td><td>{c.class_name || '—'}</td><td className="mono">{c.username}</td><td className="mono">{c.temporary_password}</td></tr>)}</tbody></table></div>
      <div className="card-pad"><button className="btn btn-soft btn-sm" onClick={() => setCredentials([])}>Tutup kredensial</button></div>
    </div>}
    <div className="card">
      <div className="toolbar"><SearchInput value={search} onChange={setSearch} placeholder="Cari nama atau kode siswa…" /><select className="select" value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Filter kelas"><option value="">Semua kelas</option>{d.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status akun"><option value="">Semua status akun</option><option value="BELUM_ADA">Belum dibuat</option><option value="ACTIVE">Aktif</option><option value="DISABLED">Nonaktif</option><option value="PENDING_APPROVAL">Menunggu persetujuan</option><option value="REJECTED">Ditolak</option></select><span className="small muted">{selected.length} dipilih</span></div>
      {q.loading && !q.data ? <TableSkeleton cols={7} /> : q.error && !q.data ? <ErrorState error={q.error} onRetry={q.reload} /> : !students.length ? <EmptyState icon="UserRoundSearch" title="Siswa tidak ditemukan" text="Periksa filter atau tambahkan siswa melalui Data Siswa." /> : <div className="table-wrap"><table className="table"><thead><tr><th><input type="checkbox" checked={allVisible} onChange={toggleAll} aria-label="Pilih semua siswa yang tampil" /></th><th>Nama siswa</th><th>Kelas</th><th>Username</th><th>Status akun</th><th>Ganti password</th><th className="actions">Aksi</th></tr></thead><tbody>{students.map((s) => { const a = accounts[s.id]; return <tr key={s.id}>
        <td><input type="checkbox" checked={selected.includes(s.id)} onChange={() => selectOne(s.id)} aria-label={`Pilih ${s.full_name}`} /></td><td><div className="semibold">{s.full_name}</div><div className="xs muted">{s.student_code || s.id.slice(0, 8)}</div></td><td>{classMap[s.class_id] ? classMap[s.class_id].name : '—'}</td><td className="mono">{a ? a.username : <span className="faint">—</span>}</td><td>{!a ? <Badge>Belum dibuat</Badge> : <Badge tone={a.account_status === 'ACTIVE' ? 'green' : a.account_status === 'DISABLED' ? 'red' : 'amber'} dot>{a.account_status}</Badge>}</td><td>{a ? (a.must_change_password ? <Badge tone="amber">Wajib ganti</Badge> : <Badge tone="green">Sudah diganti</Badge>) : '—'}</td><td className="actions">{!a ? <button className="btn btn-soft btn-sm" disabled={busy} onClick={() => createFor([s.id])}><Icon name="UserRoundPlus" size={15} />Buat akun</button> : <div className="row gap-4"><button className="btn btn-ghost btn-sm" disabled={busy} onClick={async () => { setBusy(true); setError(''); setCredentials([]); try { setCredentials([await backend.resetStudentPassword(a.id)]); refresh(); toast.success('Password sementara dibuat.'); } catch (x) { setError(x.message); } finally { setBusy(false); } }}><Icon name="KeyRound" size={15} />Reset</button><button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setStatusFor(s)}><Icon name={a.account_status === 'ACTIVE' ? 'UserX' : 'UserCheck'} size={15} />{a.account_status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'}</button></div>}</td>
      </tr>; })}</tbody></table></div>}
    </div>
  </>;
}

function SupabaseAdminStudentAccountsPage() {
  const { backend } = useApp(); const toast = useToast(); const confirm = useConfirm();
  const [students, setStudents] = useState([]); const [classes, setClasses] = useState([]); const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [search, setSearch] = useState(''); const [classId, setClassId] = useState(''); const [status, setStatus] = useState(''); const [selected, setSelected] = useState([]);
  const [draft, setDraft] = useState(null); const [usernames, setUsernames] = useState({}); const [mustChange, setMustChange] = useState(true); const [credentials, setCredentials] = useState([]); const [events, setEvents] = useState(null);
  const refresh = async () => {
    setLoading(true); setError('');
    try { const [s, c, a] = await Promise.all([backend.list('students'), backend.list('classes'), backend.listStudentAccounts()]); setStudents(s); setClasses(c); setAccounts(a); }
    catch (e) { setError(e.message || 'Data akun siswa gagal dimuat.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, [backend]);
  const accountByStudent = Object.fromEntries(accounts.map(a => [a.student_id, a]));
  const classMap = Object.fromEntries(classes.map(c => [c.id, c]));
  const visible = students.filter(s => s.status === 'aktif' && (!classId || s.class_id === classId) && (!status || (accountByStudent[s.id]?.account_status || 'BELUM_ADA') === status) && (!search || U.norm(s.full_name).includes(U.norm(search)) || U.norm(s.student_code || '').includes(U.norm(search)))).sort((a,b) => a.full_name.localeCompare(b.full_name));
  const createTargets = visible.filter(s => selected.includes(s.id) && !accountByStudent[s.id]);
  const startCreate = () => {
    const rows = createTargets;
    if (!rows.length) return;
    const initial = {};
    rows.forEach(s => { initial[s.id] = String(s.student_code || s.full_name || 'siswa').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 30); });
    setUsernames(initial); setDraft(rows); setMustChange(true); setCredentials([]); setEvents(null);
  };
  const createAccounts = async () => {
    if (!draft?.length) return;
    if (draft.some(s => !/^[a-z0-9._-]{3,30}$/.test(String(usernames[s.id] || '').trim().toLowerCase()))) { setError('Username harus 3–30 karakter: huruf kecil, angka, titik, garis bawah, atau tanda hubung.'); return; }
    setBusy(true); setError('');
    try {
      let result;
      if (backend.mode === 'demo') result = await backend.createStudentAccounts(draft.map(s => s.id));
      else result = await backend.createStudentAccounts(draft.map(s => s.id), Object.fromEntries(Object.entries(usernames).map(([id, u]) => [id, u.trim().toLowerCase()])), mustChange);
      setCredentials(result.created || []); setDraft(null); setSelected([]); await refresh();
      if (result.created?.length) toast.success(`${result.created.length} akun berhasil dibuat.`);
      if (result.skipped?.length) toast.info(`${result.skipped.length} siswa dilewati karena akun sudah ada.`);
      if (result.failures?.length) setError(`${result.failures.length} akun gagal dibuat. Periksa hasil dan coba lagi.`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const resetOne = async (account) => {
    const ok = await confirm({ title:'Reset password siswa?', confirmText:'Reset password', message:<>Password lama untuk akun <b>{account.username}</b> diganti. Password baru hanya tampil sekali.</> });
    if (!ok) return;
    setBusy(true); setError(''); setCredentials([]);
    try { const row = await backend.resetStudentPassword(account.id); setCredentials([row]); await refresh(); toast.success('Password berhasil direset.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const setAccountStatus = async (account) => {
    const next = account.account_status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    if (next === 'DISABLED' && !await confirm({ title:'Nonaktifkan akun siswa?', confirmText:'Nonaktifkan akun', danger:true, message:'Siswa tidak bisa login, tetapi data siswa dan hasil belajarnya tetap tersimpan.' })) return;
    setBusy(true); setError('');
    try { await backend.setStudentAccountStatus(account.id, next); await refresh(); toast.success(next === 'ACTIVE' ? 'Akun diaktifkan.' : 'Akun dinonaktifkan.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const showEvents = async (account) => { setBusy(true); setEvents({ username:account.username, items:[] }); setError(''); try { setEvents({ username:account.username, items:await backend.getStudentAuthEvents(account.id) }); } catch(e) { setError(e.message); setEvents(null); } finally { setBusy(false); } };
  const printCredentials = () => { document.body.classList.add('print-student-credentials'); const cleanup=()=>{document.body.classList.remove('print-student-credentials');window.removeEventListener('afterprint',cleanup);};window.addEventListener('afterprint',cleanup);window.print();setTimeout(cleanup,1500); };
  const toggle = id => setSelected(v => v.includes(id) ? v.filter(x=>x!==id) : [...v,id]);
  const toggleAll = () => setSelected(v => {
    const ids = visible.map(s => s.id);
    return ids.length && ids.every(id => v.includes(id)) ? v.filter(id => !ids.includes(id)) : [...new Set([...v, ...ids])];
  });
  // Hapus akun: terpilih = akun dari baris yang dicentang; semua = semua akun pada daftar yang tampil (sesuai filter).
  const deleteTargets = visible.filter(s => selected.includes(s.id) && accountByStudent[s.id]).map(s => accountByStudent[s.id]);
  const deleteAllTargets = visible.filter(s => accountByStudent[s.id]).map(s => accountByStudent[s.id]);
  const deleteAccounts = async (list) => {
    if (busy || !list.length) return;
    const nameOf = (a) => (students.find(s => s.id === a.student_id) || {}).full_name || a.username;
    const shown = list.slice(0, 3).map(nameOf).join(', ') + (list.length > 3 ? ` dan ${list.length - 3} lainnya` : '');
    const ok = await confirm({ title: list.length === 1 ? 'Hapus akun siswa?' : `Hapus ${list.length} akun siswa?`, confirmText: list.length === 1 ? 'Hapus akun' : `Hapus ${list.length} akun`, danger: true,
      message: <>Akun login <b>{shown}</b> akan dihapus permanen dan siswa tidak bisa login lagi. Riwayat game dari akun ini juga ikut terhapus. Data siswa dan nilai di Rekap Nilai tetap tersimpan, dan Anda bisa membuat akun baru kapan saja. Tindakan ini tidak dapat dibatalkan.</> });
    if (!ok) return;
    if (list.length > 10 && !await confirm({ title: 'Yakin menghapus banyak akun?', confirmText: `Ya, hapus ${list.length} akun`, danger: true, message: <>Anda akan menghapus <b>{list.length} akun siswa</b> sekaligus. Pastikan ini memang yang Anda maksud.</> })) return;
    setBusy(true); setError(''); setCredentials([]);
    try {
      const r = await backend.deleteStudentAccounts(list.map(a => a.id));
      const gone = new Set(list.map(a => a.student_id)); setSelected(v => v.filter(id => !gone.has(id)));
      await refresh(); toast.success(`${r.deleted} akun siswa dihapus.`);
    } catch (e) { setError(e.message || 'Akun gagal dihapus.'); }
    finally { setBusy(false); }
  };

  return <>
    <PageHead title="Manajemen Akun Siswa" desc="Kelola akun login siswa yang terhubung permanen ke data siswa." actions={<><button className="btn btn-outline" onClick={refresh} disabled={loading||busy}><Icon name="RefreshCw" size={15}/>Muat ulang</button><button className="btn btn-primary" onClick={startCreate} disabled={busy||!createTargets.length}><Icon name="UserRoundPlus" size={15}/>Buat akun terpilih ({createTargets.length})</button></>} />
    <Alert tone="info" title="Akun autentikasi Supabase">Password disimpan dan diverifikasi oleh Supabase Auth. Username internal memakai alamat alias yang tidak ditampilkan. Password sementara hanya ditampilkan sekali setelah pembuatan atau reset.</Alert>
    {error && <Alert tone="err">{error}</Alert>}
    {draft && <section className="card card-pad col gap-12"><div><h2>Siapkan akun</h2><p className="small muted">Periksa atau ubah username sebelum disimpan. Password awal dibuat acak oleh server.</p></div><div className="table-wrap"><table className="table"><thead><tr><th>Siswa</th><th>Kelas</th><th>Username</th></tr></thead><tbody>{draft.map(s=><tr key={s.id}><td>{s.full_name}</td><td>{classMap[s.class_id]?.name||'—'}</td><td><input className="input" autoComplete="off" value={usernames[s.id]||''} onChange={e=>setUsernames(v=>({...v,[s.id]:e.target.value}))}/></td></tr>)}</tbody></table></div><label className="row gap-8"><input type="checkbox" checked={mustChange} onChange={e=>setMustChange(e.target.checked)}/>Wajib ganti password saat login pertama</label><div className="row-wrap"><button className="btn btn-primary" disabled={busy} onClick={createAccounts}>{busy&&<Spinner/>}Buat {draft.length} akun</button><button className="btn btn-soft" disabled={busy} onClick={()=>setDraft(null)}>Batal</button></div></section>}
    {credentials.length>0 && <section className="card credential-card"><div className="card-head"><div><div className="card-title">Password sementara · tampil sekali</div><div className="card-sub">Simpan atau cetak sekarang. Nilai ini tidak dapat dilihat kembali.</div></div><button className="btn btn-outline" onClick={printCredentials}><Icon name="Printer" size={15}/>Cetak</button></div><div className="table-wrap"><table className="table credential-table"><thead><tr><th>Nama siswa</th><th>Kelas</th><th>Username</th><th>Password awal</th></tr></thead><tbody>{credentials.map((r,i)=><tr key={r.account?.id||r.student_id||i}><td>{r.student_name}</td><td>{r.class_name||'—'}</td><td className="mono">{r.account?.username||r.username}</td><td className="mono">{r.temporary_password}</td></tr>)}</tbody></table></div><div className="card-pad"><button className="btn btn-soft btn-sm" onClick={()=>setCredentials([])}>Tutup dan hapus dari tampilan</button></div></section>}
    {events && <section className="card card-pad"><div className="student-section-head"><div><h2>Riwayat autentikasi {events.username}</h2><p>Peristiwa aman tanpa password atau token.</p></div><button className="btn btn-soft btn-sm" onClick={()=>setEvents(null)}>Tutup</button></div>{events.items.length?<div className="student-timeline">{events.items.map((e,i)=><div className="student-timeline-item" key={i}><b>{e.event}</b><time className="small muted">{studentFormatDate(e.created_at)}</time></div>)}</div>:<div className="small muted">Belum ada riwayat autentikasi.</div>}</section>}
    <div className="card"><div className="toolbar"><SearchInput value={search} onChange={setSearch} placeholder="Cari nama atau kode siswa…"/><select className="select" value={classId} onChange={e=>setClassId(e.target.value)}><option value="">Semua kelas</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select className="select" value={status} onChange={e=>setStatus(e.target.value)}><option value="">Semua status akun</option><option value="BELUM_ADA">Belum dibuat</option><option value="ACTIVE">Aktif</option><option value="DISABLED">Nonaktif</option></select><span className="small muted">{selected.length} dipilih</span><button className="btn btn-outline btn-sm" type="button" style={{ color: 'var(--red)' }} disabled={busy||!deleteTargets.length} onClick={()=>deleteAccounts(deleteTargets)} title="Hapus akun siswa yang dicentang"><Icon name="Trash2" size={15}/>Hapus terpilih ({deleteTargets.length})</button><button className="btn btn-outline btn-sm" type="button" style={{ color: 'var(--red)' }} disabled={busy||!deleteAllTargets.length} onClick={()=>deleteAccounts(deleteAllTargets)} title="Hapus semua akun pada daftar yang tampil (sesuai filter kelas dan status)"><Icon name="Trash2" size={15}/>Hapus semua ({deleteAllTargets.length})</button></div>
      {loading?<TableSkeleton cols={7}/>:visible.length===0?<EmptyState icon="UserRoundSearch" title="Siswa tidak ditemukan" text="Tambahkan siswa atau ubah filter kelas."/>:<div className="table-wrap"><table className="table"><thead><tr><th><input type="checkbox" aria-label="Pilih semua siswa yang tampil" checked={visible.length>0&&visible.every(s=>selected.includes(s.id))} onChange={toggleAll}/></th><th>Nama siswa</th><th>NIS / NISN</th><th>Kelas</th><th>Username</th><th>Status</th><th>Terakhir login</th><th>Aksi</th></tr></thead><tbody>{visible.map((s,i)=>{const a=accountByStudent[s.id];const c=classMap[s.class_id];return <tr key={s.id}><td><input type="checkbox" checked={selected.includes(s.id)} onChange={()=>toggle(s.id)}/></td><td><span className="small muted">{i+1}. </span><b>{s.full_name}</b><div className="xs muted">{s.student_code}</div></td><td>{s.nis||'—'}{s.nisn&&<div className="xs muted">{s.nisn}</div>}</td><td>{c?.name||'—'}</td><td className="mono">{a?.username||'—'}</td><td>{a?<Badge tone={a.account_status==='ACTIVE'?'green':'red'} dot>{a.account_status}</Badge>:<Badge>Belum dibuat</Badge>}</td><td>{a?.last_login?studentFormatDate(a.last_login):'—'}</td><td className="actions">{a&&<div className="row gap-4"><button className="btn btn-ghost btn-sm" disabled={busy} onClick={()=>resetOne(a)} title="Reset password"><Icon name="KeyRound" size={15}/>Reset</button><button className="btn btn-ghost btn-sm" disabled={busy} onClick={()=>setAccountStatus(a)} title={a.account_status==='ACTIVE'?'Nonaktifkan akun':'Aktifkan akun'}><Icon name={a.account_status==='ACTIVE'?'UserX':'UserCheck'} size={15}/>{a.account_status==='ACTIVE'?'Nonaktifkan':'Aktifkan'}</button><button className="btn btn-ghost btn-sm" disabled={busy} onClick={()=>showEvents(a)} title="Detail dan riwayat akun"><Icon name="History" size={15}/>Detail</button><button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} disabled={busy} onClick={()=>deleteAccounts([a])} title="Hapus akun siswa ini"><Icon name="Trash2" size={15}/>Hapus</button></div>}</td></tr>;})}</tbody></table></div>}
    </div>
  </>;
}

function AdminStudentAccountsPage() {
  const { backend } = useApp();
  return backend.mode === 'demo' ? <DemoAdminStudentAccountsPage /> : <SupabaseAdminStudentAccountsPage />;
}

Object.assign(window, { AdminStudentAccountsPage });
