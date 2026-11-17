/* Live Game Room: alur ruang + host. Ruang dikelompokkan per status dan bisa dihapus. */
const LIVE_ROOM_GROUPS = [
  { key: 'menunggu', label: 'Menunggu', statuses: ['WAITING', 'LOCKED'] },
  { key: 'berlangsung', label: 'Sedang berlangsung', statuses: ['COUNTDOWN', 'IN_PROGRESS', 'PAUSED'] },
  { key: 'selesai', label: 'Selesai', statuses: ['COMPLETED'] },
  { key: 'dibatalkan', label: 'Dibatalkan / kedaluwarsa', statuses: ['CANCELLED', 'EXPIRED'] },
];
const LIVE_ROOM_RUNNING = ['COUNTDOWN', 'IN_PROGRESS', 'PAUSED'];
const liveRoomGroupOf = (status) => (LIVE_ROOM_GROUPS.find((g) => g.statuses.includes(status)) || LIVE_ROOM_GROUPS[0]).key;

function liveRoomStatusTone(status) {
  return ({ WAITING: 'blue', LOCKED: 'amber', COUNTDOWN: 'amber', IN_PROGRESS: 'green', PAUSED: 'amber', COMPLETED: 'green', CANCELLED: 'red', EXPIRED: 'red' })[status] || 'blue';
}

function AdminLiveGamePage() {
  const { backend } = useApp(); const toast = useToast(); const confirm = useConfirm();
  const [sources, setSources] = useState([]); const [rooms, setRooms] = useState([]); const [results, setResults] = useState({}); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [clock, setClock] = useState(Date.now()); const [tab, setTab] = useState('');
  const [form, setForm] = useState({ assignment_id: '', min_participants: '2', max_participants: '30', allow_late_join: false });
  const reload = async () => {
    setLoading(true); setError('');
    try { const [s, r] = await Promise.all([backend.listLiveGameSources(), backend.listLiveGameRooms()]); setSources(s); setRooms(r); const pairs=await Promise.all(r.map(async(room)=>[room.id,await backend.getLiveGameResults(room.id)])); setResults(Object.fromEntries(pairs)); }
    catch (e) { setError(e.message || 'Data Live Game Room gagal dimuat.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, [backend]);
  useEffect(() => { if (!rooms.some((r) => r.status === 'COUNTDOWN')) return; const timer = setInterval(() => setClock(Date.now()), 250); return () => clearInterval(timer); }, [rooms]);
  const create = async (e) => {
    e.preventDefault(); if (busy) return; setBusy(true); setError('');
    try { const room = await backend.createLiveGameRoom(form); setForm((v) => Object.assign({}, v, { assignment_id: '' })); await reload(); setTab('menunggu'); toast.success('Ruang dibuat. Kode permainan: ' + room.code); }
    catch (x) { setError(x.message || 'Ruang gagal dibuat.'); }
    finally { setBusy(false); }
  };
  const act = async (room, method, status) => {
    if (busy) return; setBusy(true); setError('');
    try {
      if (method === 'start') await backend.startLiveGameRoom(room.id);
      else await backend.setLiveGameRoomStatus(room.id, status);
      await reload(); setTab(liveRoomGroupOf(method === 'start' ? 'COUNTDOWN' : status)); toast.success('Status ruang diperbarui.');
    } catch (x) { setError(x.message || 'Tindakan ruang gagal.'); }
    finally { setBusy(false); }
  };
  const remove = async (room, participant) => {
    const ok = await confirm({ title: 'Keluarkan peserta?', confirmText: 'Keluarkan', danger: true, message: `Keluarkan ${participant.student_name} dari ruang ${room.code}?` });
    if (!ok) return;
    setBusy(true); setError('');
    try { await backend.removeLiveGameParticipant(room.id, participant.id); await reload(); toast.success('Peserta dikeluarkan dari ruang.'); }
    catch (x) { setError(x.message || 'Peserta gagal dikeluarkan.'); }
    finally { setBusy(false); }
  };
  const removeRoom = async (room) => {
    if (busy) return;
    const hasScores = room.status === 'COMPLETED' || (results[room.id] || []).length > 0;
    const ok = await confirm({ title: 'Hapus ruang?', confirmText: 'Hapus ruang', danger: true,
      message: `Ruang ${room.code} (${room.game_title}) akan dihapus dari daftar beserta daftar pesertanya.` + (hasScores ? ' Nilai siswa yang sudah masuk tetap tersimpan.' : '') });
    if (!ok) return;
    setBusy(true); setError('');
    try { await backend.deleteLiveGameRoom(room.id); await reload(); toast.success('Ruang dihapus.'); }
    catch (x) { setError(x.message || 'Ruang gagal dihapus.'); }
    finally { setBusy(false); }
  };
  const clearTab = async (list, label) => {
    if (busy || !list.length) return;
    const ok = await confirm({ title: 'Hapus semua ruang di tab ini?', confirmText: `Hapus ${list.length} ruang`, danger: true,
      message: `${list.length} ruang pada tab "${label}" akan dihapus beserta daftar pesertanya. Nilai siswa yang sudah masuk tetap tersimpan.` });
    if (!ok) return;
    setBusy(true); setError(''); let failed = 0;
    for (const r of list) { try { await backend.deleteLiveGameRoom(r.id); } catch (x) { failed++; } }
    await reload();
    if (failed) setError(`${failed} ruang gagal dihapus.`); else toast.success('Ruang dihapus.');
    setBusy(false);
  };
  const grouped = Object.fromEntries(LIVE_ROOM_GROUPS.map((g) => [g.key, rooms.filter((r) => g.statuses.includes(r.status))]));
  const current = tab || (['berlangsung', 'menunggu', 'selesai', 'dibatalkan'].find((k) => grouped[k].length) || 'menunggu');
  const shown = grouped[current] || [];
  const currentLabel = (LIVE_ROOM_GROUPS.find((g) => g.key === current) || {}).label;
  const copyCode = async (code) => { try { await navigator.clipboard.writeText(code); toast.success('Kode permainan disalin.'); } catch (e) { toast.error('Clipboard tidak tersedia. Salin kode secara manual.'); } };
  return <>
    <PageHead title="Live Game Room" desc={'Buat ruang terpisah dari penugasan game yang sudah diterbitkan.' + (backend.mode === 'demo' ? ' Sesi DEMO tersimpan lokal dan tidak tersinkron lintas perangkat secara real-time.' : '')} actions={<button type="button" className="btn btn-outline" onClick={reload} disabled={loading}><Icon name="RefreshCw" size={16} />Perbarui</button>} />
    {error && <Alert tone="err" title="Tidak dapat memproses ruang">{error}</Alert>}
    {backend.mode === 'demo' && <Alert tone="warn" title="Batas mode DEMO">Status dan peserta disimpan dalam localStorage browser ini. Peserta di perangkat lain tidak akan menerima pembaruan otomatis; gunakan Perbarui untuk membaca ulang. Supabase Realtime/Edge Functions belum dihubungkan.</Alert>}
    <section className="card card-pad live-room-create">
      <div className="card-title mb-12">Buat ruang dari game terbit</div>
      {!loading && !sources.length && <EmptyState icon="Gamepad2" title="Belum ada game yang dapat dijadikan sesi" text="Ruang hanya dapat dibuat dari penugasan game terbit dengan soal, mode Live, dan kelas yang valid. Buat game dan tugaskan melalui menu Manajemen Game." />}
      {!!sources.length && <form className="col gap-12" onSubmit={create}>
        <Field label="Game dan kelas sasaran" required><select className="input" required value={form.assignment_id} onChange={(e) => setForm((v) => Object.assign({}, v, { assignment_id: e.target.value }))} disabled={busy}><option value="">Pilih penugasan game</option>{sources.map((s) => <option key={s.assignment_id} value={s.assignment_id}>{s.title} · {s.subject} · {s.class_name}</option>)}</select></Field>
        <div className="live-room-form-grid">
          <Field label="Peserta minimum"><input className="input" type="number" min="1" max="100" value={form.min_participants} onChange={(e) => setForm((v) => Object.assign({}, v, { min_participants: e.target.value }))} disabled={busy} /></Field>
          <Field label="Peserta maksimum"><input className="input" type="number" min="1" max="100" value={form.max_participants} onChange={(e) => setForm((v) => Object.assign({}, v, { max_participants: e.target.value }))} disabled={busy} /></Field>
        </div>
        <label className="live-room-check"><input type="checkbox" checked={form.allow_late_join} onChange={(e) => setForm((v) => Object.assign({}, v, { allow_late_join: e.target.checked }))} disabled={busy} /><span>Izinkan peserta terlambat bergabung setelah sesi dimulai</span></label>
        <div><button className="btn btn-primary" disabled={busy || loading}>{busy && <Spinner />}Buat ruang dan kode</button></div>
      </form>}
    </section>
    <div className="card-title mt-16">Ruang permainan</div>
    {loading ? <div className="card card-pad"><LoadingState /></div> : !rooms.length ? <div className="card card-pad"><EmptyState icon="Radio" title="Belum ada ruang permainan" text="Ruang yang dibuat untuk penugasan game Anda akan tercatat di sini." /></div> : <>
      <div className="row-wrap mb-12" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="seg">{LIVE_ROOM_GROUPS.map((g) => <button key={g.key} type="button" className={current === g.key ? 'on' : ''} onClick={() => setTab(g.key)}>{g.label} ({grouped[g.key].length})</button>)}</div>
        {['selesai', 'dibatalkan'].includes(current) && shown.length > 0 && <button className="btn btn-outline btn-sm" type="button" onClick={() => clearTab(shown, currentLabel)} disabled={busy}><Icon name="Trash2" size={15} />Hapus semua di tab ini</button>}
      </div>
      {!shown.length ? <div className="card card-pad"><EmptyState icon="Radio" title="Tidak ada ruang di tab ini" text="Ruang akan pindah ke tab yang sesuai saat statusnya berubah." /></div> : <div className="live-room-list">{shown.map((room) => <article className="card card-pad live-room-card" key={room.id}>
      <div className="live-room-head"><div className="grow"><div className="eyebrow">{room.class_name} · {room.teacher_name}</div><h2>{room.game_title}</h2><div className="small muted">Kode ruang <b className="live-room-code">{room.code}</b> · dibuat {new Date(room.created_at).toLocaleString('id-ID')}</div></div><Badge tone={liveRoomStatusTone(room.status)} dot>{room.status}</Badge></div>
      <div className="live-room-meta"><span>{room.participant_count}/{room.max_participants} peserta</span><span>Minimum {room.min_participants}</span><span>{room.allow_late_join ? 'Peserta terlambat diizinkan' : 'Peserta terlambat ditutup'}</span><span>Kedaluwarsa {new Date(room.expires_at).toLocaleString('id-ID')}</span></div>
      <div className="row-wrap mt-12">
        <button className="btn btn-outline btn-sm" type="button" onClick={() => copyCode(room.code)} disabled={busy}><Icon name="Copy" size={15} />Salin kode</button>
        {room.status === 'WAITING' && <button className="btn btn-outline btn-sm" type="button" onClick={() => act(room, 'status', 'LOCKED')} disabled={busy}>Kunci ruang</button>}
        {room.status === 'LOCKED' && <button className="btn btn-outline btn-sm" type="button" onClick={() => act(room, 'status', 'WAITING')} disabled={busy}>Buka ruang</button>}
        {['WAITING', 'LOCKED'].includes(room.status) && <button className="btn btn-primary btn-sm" type="button" onClick={() => act(room, 'start')} disabled={busy || room.participant_count < room.min_participants}><Icon name="Play" size={15} />Mulai sebagai host</button>}
        {room.status === 'COUNTDOWN' && <><span className="small muted">{Math.max(0, Math.ceil((Date.parse(room.countdown_ends_at || 0) - clock) / 1000)) ? `Hitung mundur ${Math.max(0, Math.ceil((Date.parse(room.countdown_ends_at || 0) - clock) / 1000))} dtk` : 'Hitung mundur selesai'}</span><button className="btn btn-primary btn-sm" type="button" onClick={() => act(room, 'status', 'IN_PROGRESS')} disabled={busy || Date.parse(room.countdown_ends_at || 0) > clock}><Icon name="Play" size={15} />Tandai sesi berjalan</button></>}
        {room.status === 'IN_PROGRESS' && <><button className="btn btn-outline btn-sm" type="button" onClick={() => act(room, 'status', 'PAUSED')} disabled={busy}>Jeda</button><button className="btn btn-outline btn-sm" type="button" onClick={() => act(room, 'status', 'COMPLETED')} disabled={busy}>Selesaikan sesi</button></>}
        {room.status === 'PAUSED' && <><button className="btn btn-primary btn-sm" type="button" onClick={() => act(room, 'status', 'IN_PROGRESS')} disabled={busy}>Lanjutkan</button><button className="btn btn-outline btn-sm" type="button" onClick={() => act(room, 'status', 'COMPLETED')} disabled={busy}>Selesaikan sesi</button></>}
        {['WAITING', 'LOCKED', 'COUNTDOWN', 'IN_PROGRESS', 'PAUSED'].includes(room.status) && <button className="btn btn-outline btn-sm" type="button" onClick={() => act(room, 'status', 'CANCELLED')} disabled={busy}>Batalkan ruang</button>}
        {!LIVE_ROOM_RUNNING.includes(room.status) && <button className="btn btn-outline btn-sm" type="button" style={{ color: 'var(--red)' }} onClick={() => removeRoom(room)} disabled={busy}><Icon name="Trash2" size={15} />Hapus</button>}
      </div>
      <div className="live-room-roster"><div className="semibold small mb-8">Peserta bergabung</div>{room.participants.length ? room.participants.map((p) => <div className="live-room-person" key={p.id}><span>{p.student_name}</span>{['WAITING', 'LOCKED'].includes(room.status) && <button className="btn btn-ghost btn-sm" type="button" onClick={() => remove(room, p)} disabled={busy}>Keluarkan</button>}</div>) : <div className="small muted">Belum ada peserta.</div>}</div>
      {room.host_view && room.game_settings && room.game_settings.show_leaderboard !== false && <div className="game-live-results"><div className="semibold small mb-8">Hasil peserta sesi ini</div>{(results[room.id]||[]).length ? (results[room.id]||[]).map((r,i)=><div className="live-room-person" key={r.id}><span>{i+1}. {r.student_name}</span><Badge tone="green">{r.score}/100 · {r.correct_count}/{r.total_questions}</Badge></div>):<div className="small muted">Hasil akan muncul setelah peserta menyelesaikan permainan.</div>}</div>}
    </article>)}</div>}</>}
  </>;
}

Object.assign(window, { AdminLiveGamePage });
