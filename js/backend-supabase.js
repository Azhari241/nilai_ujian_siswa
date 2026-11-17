/* =========================================================================
 * SUPABASE BACKEND — produksi. Menggunakan supabase-js v2 (anon/publishable key).
 * Seluruh akses dilindungi RLS (lihat supabase/migrations/0001_init.sql).
 * Portal siswa memanggil fungsi SECURITY DEFINER `portal_lookup` sehingga
 * browser tidak pernah membaca tabel students/grades secara langsung.
 * ========================================================================= */
(function () {
  function makeSupabaseBackend(url, key) {
    if (!window.supabase || !window.supabase.createClient) throw new Error('Library supabase-js gagal dimuat.');
    const sb = window.supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
    const fail = (error) => {
      if (!error) return;
      let msg = error.message || 'Terjadi kesalahan database';
      if (error.code === '23505') {
        if (/nisn/i.test(msg)) msg = 'NISN sudah digunakan siswa lain';
        else if (/student_code/i.test(msg)) msg = 'Kode siswa sudah digunakan';
        else if (/nis/i.test(msg)) msg = 'NIS sudah digunakan siswa lain';
        else if (/classes/i.test(msg)) msg = 'Kelas dengan nama dan tahun pelajaran yang sama sudah ada';
        else msg = 'Data duplikat: ' + msg;
      }
      if (error.code === '23503') msg = 'Data masih direferensikan oleh data lain (misal: siswa, ujian, atau nilai). ' + (error.details || '');
      if (error.code === '42501') msg = 'Akses ditolak oleh Row Level Security. Pastikan akun Anda terdaftar sebagai guru.';
      const e = new Error(msg); e.code = error.code; throw e;
    };

    return {
      mode: 'supabase',
      label: 'Supabase',
      client: sb,
      async ping() {
        const t = performance.now();
        const { error } = await sb.from('profiles').select('id').limit(1);
        if (error) fail(error);
        return Math.round(performance.now() - t);
      },
      async getSession() {
        const { data, error } = await sb.auth.getSession(); if (error) fail(error);
        const session = data.session; if (!session) return null;
        const { data: profile, error: profileError } = await sb.from('profiles').select('role, active').eq('id', session.user.id).maybeSingle();
        if (profileError || !profile || profile.active === false || !['teacher', 'admin'].includes(profile.role)) return null;
        return session;
      },
      async signIn(email, password) {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) {
          const m = /invalid login/i.test(error.message) ? 'Email atau password salah.' : /email not confirmed/i.test(error.message) ? 'Email belum dikonfirmasi. Periksa kotak masuk Anda.' : error.message;
          throw new Error(m);
        }
        // pastikan akun ini guru (ada baris di profiles dengan role teacher)
        const { data: prof } = await sb.from('profiles').select('id, role, active').eq('id', data.user.id).maybeSingle();
        if (!prof) { await sb.auth.signOut(); throw new Error('Profil guru untuk akun ini belum ada di database. Hubungi administrator.'); }
        if (prof.active === false) { await sb.auth.signOut(); throw new Error('Akun ini dinonaktifkan oleh administrator.'); }
        if (!['teacher', 'admin'].includes(prof.role)) { await sb.auth.signOut(); throw new Error('Akun ini belum disetujui sebagai guru. Hubungi administrator.'); }
        return data.session;
      },
      async signOut() { await sb.auth.signOut(); },
      async resetPassword(email) {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + '#/login' });
        if (error) fail(error); return true;
      },
      onAuthChange(cb) {
        const { data } = sb.auth.onAuthStateChange((_e, s) => {
          if (!s) { cb(null); return; }
          // Student users also have a Supabase Auth session; never expose that
          // session to the teacher route state.
          setTimeout(async () => {
            const { data: profile, error } = await sb.from('profiles').select('role, active').eq('id', s.user.id).maybeSingle();
            cb(!error && profile && profile.active !== false && ['teacher', 'admin'].includes(profile.role) ? s : null);
          }, 0);
        });
        return () => data.subscription.unsubscribe();
      },

      async _studentFunction(name, action, payload) {
        const { data, error } = await sb.functions.invoke(name, { body: Object.assign({ action }, payload || {}) });
        if (error) {
          let message = error.message || 'Permintaan akun siswa gagal.';
          try { const body = await error.context.json(); if (body && body.error) message = body.error; } catch (_) {}
          if (/not found|404/i.test(message)) message = `Edge Function "${name}" belum tersedia di project Supabase.`;
          throw new Error(message);
        }
        if (data && data.error) throw new Error(data.error);
        return data;
      },
      async signInStudent(username, password) {
        const result = await this._studentFunction('student-auth', 'login', { username, password });
        const { error } = await sb.auth.setSession({ access_token:result.session.access_token, refresh_token:result.session.refresh_token });
        if (error) throw new Error('Login siswa gagal. Periksa username dan password.');
        const student = await this.getStudentSession();
        if (!student) { await sb.auth.signOut({ scope:'local' }); throw new Error('Akun siswa tidak aktif atau sesi tidak valid.'); }
        return student;
      },
      async getStudentSession() {
        const { data, error } = await sb.auth.getSession(); if (error) fail(error);
        if (!data.session) return null;
        try { return await this._studentFunction('student-auth', 'session'); } catch (_) { return null; }
      },
      async getStudentPortalData() {
        const data = await this._studentFunction('student-auth', 'portal');
        try {
          const x = await this._game('student_extras');
          data.games = x.games || [];
          data.history = [].concat(data.history || [], x.history || []).sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
          if (data.summary) { data.summary.games = data.games.length; data.summary.activities = data.history.length; }
        } catch (_) { /* portal tetap tampil tanpa game bila game-engine belum tersedia */ }
        return data;
      },
      async getStudentProfile() { return (await this._studentFunction('student-auth', 'portal')).profile; },
      async signOutStudent() {
        let revokeError = null;
        try { await this._studentFunction('student-auth', 'logout'); } catch (e) { revokeError = e; }
        const { error } = await sb.auth.signOut({ scope:'local' }); if (error) fail(error);
        if (revokeError) throw new Error('Sesi lokal sudah dibersihkan, tetapi pencabutan sesi server gagal: ' + revokeError.message);
      },
      async changeStudentPassword(currentPassword, newPassword) {
        const result = await this._studentFunction('student-auth', 'change_password', { current_password:currentPassword, new_password:newPassword });
        if (result.session && result.session.access_token && result.session.refresh_token) {
          const { error } = await sb.auth.setSession({ access_token:result.session.access_token, refresh_token:result.session.refresh_token });
          if (error) throw new Error('Password telah diubah. Login kembali untuk meneruskan.');
        }
        return true;
      },
      async listStudentAccounts() { return (await this._studentFunction('student-accounts', 'list')).accounts || []; },
      async createStudentAccounts(studentIds, usernames, mustChange) {
        return this._studentFunction('student-accounts', 'create_many', { student_ids:studentIds, usernames:usernames || {}, must_change_password:mustChange !== false });
      },
      async resetStudentPassword(accountId) { return this._studentFunction('student-accounts', 'reset', { account_id:accountId }); },
      // Hapus akun login siswa (maks. 500 per panggilan ke database; dibagi otomatis bila lebih).
      async deleteStudentAccounts(accountIds) {
        const ids = Array.from(new Set(accountIds || [])); let deleted = 0;
        for (let i = 0; i < ids.length; i += 500) {
          const { data, error } = await sb.rpc('delete_teacher_student_accounts', { p_account_ids: ids.slice(i, i + 500) });
          if (error) fail(error); deleted += (data && data.deleted) || 0;
        }
        return { deleted };
      },
      async setStudentAccountStatus(accountId, status) { return this._studentFunction('student-accounts', 'set_status', { account_id:accountId, status }); },
      async getStudentAuthEvents(accountId) { return (await this._studentFunction('student-accounts', 'events', { account_id:accountId })).events || []; },

      async list(table, { order } = {}) {
        let q = sb.from(table).select('*');
        if (order) q = q.order(order[0], { ascending: order[1] !== 'desc' });
        const { data, error } = await q.limit(5000); if (error) fail(error); return data;
      },
      async get(table, id) { const { data, error } = await sb.from(table).select('*').eq('id', id).single(); if (error) fail(error); return data; },
      async insert(table, row) { const { data, error } = await sb.from(table).insert(row).select().single(); if (error) fail(error); return data; },
      async insertMany(table, rows) {
        const ok = []; const fails = [];
        for (let i = 0; i < rows.length; i += 200) {
          const chunk = rows.slice(i, i + 200);
          const { data, error } = await sb.from(table).insert(chunk).select();
          if (!error) { ok.push(...data); continue; }
          // fallback baris per baris agar tahu baris mana yang gagal
          for (let j = 0; j < chunk.length; j++) {
            const r = await sb.from(table).insert(chunk[j]).select().single();
            if (r.error) { try { fail(r.error); } catch (e) { fails.push({ index: i + j, message: e.message }); } }
            else ok.push(r.data);
          }
        }
        return { ok, fail: fails };
      },
      async update(table, id, patch) { const { data, error } = await sb.from(table).update(patch).eq('id', id).select().single(); if (error) fail(error); return data; },
      async updateMany(table, ids, patch) { const { error } = await sb.from(table).update(patch).in('id', ids); if (error) fail(error); return true; },
      async remove(table, id) { const { error } = await sb.from(table).delete().eq('id', id); if (error) fail(error); return true; },
      async replaceQuestions(examId, questions) {
        const { error } = await sb.rpc('replace_exam_questions', { p_exam_id: examId, p_questions: questions });
        if (error) fail(error); return true;
      },
      async upsertGrade({ exam_id, student_id, score, source, raw_score, note, mc_score, essay_score }) {
        const row = { exam_id, student_id, score, source };
        if (raw_score !== undefined) row.raw_score = raw_score; if (note !== undefined) row.note = note;
        if (mc_score !== undefined) row.mc_score = mc_score; if (essay_score !== undefined) row.essay_score = essay_score;
        const { data, error } = await sb.from('grades').upsert(row, { onConflict: 'exam_id,student_id' }).select().single();
        if (error) fail(error); return data;
      },
      async setGradeNote(exam_id, student_id, note) {
        const { data, error } = await sb.from('grades').update({ note }).eq('exam_id', exam_id).eq('student_id', student_id).select().maybeSingle();
        if (error) fail(error); if (!data) throw new Error('Isi nilai terlebih dahulu sebelum menambahkan keterangan.'); return data;
      },
      async deleteGrade(exam_id, student_id) { const { error } = await sb.from('grades').delete().eq('exam_id', exam_id).eq('student_id', student_id); if (error) fail(error); return true; },
      async saveResponses(examId, responses) {
        if (!responses.length) return true;
        const { error } = await sb.from('exam_responses').upsert(responses.map((r) => Object.assign({ exam_id: examId }, r)), { onConflict: 'exam_id,response_id' });
        if (error) fail(error); return true; // keputusan guru dilindungi trigger keep_review_decision (0005)
      },
      async setResponseReview(examId, responseIds, status) {
        if (!['dipilih', 'ditolak'].includes(status)) throw new Error('Status keputusan tidak valid');
        if (!responseIds.length) return true;
        const { error } = await sb.from('exam_responses').update({ review_status: status, reviewed_at: new Date().toISOString() }).eq('exam_id', examId).in('response_id', responseIds);
        if (error) fail(error); return true;
      },
      async setPublication(examId, isPublished) {
        const { data, error } = await sb.from('publication_settings').upsert({ exam_id: examId, is_published: isPublished, published_at: isPublished ? new Date().toISOString() : null }, { onConflict: 'exam_id' }).select().single();
        if (error) fail(error); return data;
      },
      async getSettings() {
        const { data: s } = await sb.auth.getSession();
        const [p, ps, as] = await Promise.all([
          sb.from('profiles').select('*').eq('id', s.session.user.id).single(),
          sb.from('portal_settings').select('*').eq('teacher_id', s.session.user.id).maybeSingle(),
          sb.from('app_settings').select('portal_master').maybeSingle(),
        ]);
        if (p.error) fail(p.error); if (ps.error) fail(ps.error);
        if (!ps.data) throw new Error('Pengaturan guru belum dibuat. Minta administrator menjalankan migrasi 0003.');
        const st = await sb.rpc('get_portal_status');
        const app = { portal_master: as.data ? as.data.portal_master !== false : true, public_open: !!(st.data && st.data.enabled), open_teachers: st.data ? st.data.open_teachers || 0 : 0 };
        return { profile: Object.assign({ email: s.session.user.email }, p.data), portal: ps.data, app };
      },
      async saveProfile(patch) {
        const { data: s } = await sb.auth.getSession();
        const { data, error } = await sb.from('profiles').update(patch).eq('id', s.session.user.id).select().single(); if (error) fail(error); return data;
      },
      async savePortalSettings(patch) {
        const { data: s } = await sb.auth.getSession();
        const { data, error } = await sb.from('portal_settings').update(patch).eq('teacher_id', s.session.user.id).select().single(); if (error) fail(error); return data;
      },
      async setPortalMaster(on) {
        const { data: s } = await sb.auth.getSession();
        const { data: prof, error: pe } = await sb.from('profiles').select('school_id').eq('id', s.session.user.id).single();
        if (pe) fail(pe);
        const { data, error } = await sb.from('app_settings').update({ portal_master: !!on, updated_at: new Date().toISOString() }).eq('school_id', prof.school_id).select().maybeSingle();
        if (error) fail(error); if (!data) throw new Error('Hanya administrator yang dapat membuka/menutup Portal Siswa sekolah.'); return data;
      },
      // ---- Manajemen akun guru: lewat Edge Function "admin-teachers" (service role HANYA di server) ----
      async _admin(action, payload) {
        const { data, error } = await sb.functions.invoke('admin-teachers', { body: Object.assign({ action }, payload || {}) });
        if (error) { let m = error.message; try { const j = await error.context.json(); m = j.error || m; } catch (e) {} throw new Error(/not found|404/i.test(m) ? 'Edge Function "admin-teachers" belum di-deploy. Lihat panduan di README.' : m); }
        if (data && data.error) throw new Error(data.error); return data;
      },
      async listTeachers() { return (await this._admin('list')).teachers; },
      async createTeacher(p) { return (await this._admin('create', p)).teacher; },
      async updateTeacher(id, patch) { return (await this._admin('update', { id, patch })).teacher; },
      async deleteTeacher(id) { return (await this._admin('delete', { id })).ok; },
      async listSchools() { return (await this._admin('list_schools')).schools || []; },
      async createSchool(p) { return (await this._admin('create_school', p)).school; },

      // ---- Game & Live Game Room: lewat Edge Function "game-engine" (kunci jawaban & skor dihitung di server) ----
      async _game(action, payload) {
        const { data, error } = await sb.functions.invoke('game-engine', { body: Object.assign({ action }, payload || {}) });
        if (error) {
          let m = error.message || 'Permintaan game gagal.';
          try { const j = await error.context.json(); if (j && j.error) m = j.error; } catch (_) {}
          throw new Error(/not found|404/i.test(m) ? 'Edge Function "game-engine" belum tersedia di project Supabase.' : m);
        }
        if (data && data.error) throw new Error(data.error);
        return data ? data.data : null;
      },
      async listTeacherGames() { return this._game('list_games'); },
      async getTeacherGameEditor(gameId) { return this._game('get_game_editor', { game_id: gameId }); },
      async saveGameDefinition(p) { const a = p || {}; return this._game('save_game', { game_id: a.game_id, game: a.game, questions: a.questions }); },
      async createGameAssignment(p) { return this._game('create_assignment', p || {}); },
      async listLiveGameSources() { return this._game('live_sources'); },
      async listLiveGameRooms() { return this._game('list_rooms'); },
      async createLiveGameRoom(p) { return this._game('create_room', p || {}); },
      async createLiveGameCode() { return this._game('create_code'); },
      async removeLiveGameParticipant(roomId, participantId) { return this._game('remove_participant', { room_id: roomId, participant_id: participantId }); },
      async setLiveGameRoomStatus(roomId, status) { return this._game('set_room_status', { room_id: roomId, status }); },
      async startLiveGameRoom(roomId) { return this._game('start_room', { room_id: roomId }); },
      async getLiveGameResults(roomId) { return this._game('room_results', { room_id: roomId }); },
      async getLiveGameRoom(roomId) { return this._game('get_room', { room_id: roomId }); },
      async getLiveGameParticipants(roomId) { return (await this._game('get_room', { room_id: roomId })).participants; },
      async recoverLiveGameSession() { return this._game('recover'); },
      async joinLiveGameRoom(code) { return this._game('join_room', { code }); },
      async listStudentGameHistory() { return this._game('history'); },
      async getStudentGameDetail(assignmentId) { return this._game('game_detail', { assignment_id: assignmentId }); },
      async startGameAttempt(p) { return this._game('start_attempt', p || {}); },
      async saveGameAnswer(p) { return this._game('save_answer', p || {}); },
      async advanceGameAttempt(attemptId, index) { return this._game('advance_attempt', { attempt_id: attemptId, index }); },
      async completeGameAttempt(attemptId) { return this._game('complete_attempt', { attempt_id: attemptId }); },
      // Hapus game / ruang live: fungsi database SECURITY DEFINER (hanya guru pemilik data).
      async deleteTeacherGame(gameId) { const { data, error } = await sb.rpc('delete_teacher_game', { p_game_id: gameId }); if (error) fail(error); return data; },
      async deleteLiveGameRoom(roomId) { const { data, error } = await sb.rpc('delete_teacher_live_room', { p_room_id: roomId }); if (error) fail(error); return data; },
      async audit(action, entity, entity_id, detail) { await sb.from('audit_logs').insert({ action, entity, entity_id: entity_id ? String(entity_id) : null, detail }); },

      async getPortalStatus() { const { data, error } = await sb.rpc('get_portal_status'); if (error) fail(error); return data; },
      async portalLookup(classIdOrName, name, schoolId) {
        const { data, error } = await sb.rpc('portal_lookup', { p_class: String(classIdOrName || ''), p_name: String(name || ''), p_school_id: schoolId || null });
        if (error) fail(error); return data;
      },
    };
  }
  window.makeSupabaseBackend = makeSupabaseBackend;
})();
