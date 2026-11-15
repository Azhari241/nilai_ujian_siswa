import { corsHeaders, generatedPassword, internalEmail, json, logAuthEvent, normalizeUsername, serviceClient, teacherContext, validPassword, validUsername } from "../_shared/student-auth.ts";

const accountFields = "id, student_id, username, account_status, must_change_password, last_login, created_at, updated_at";
const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";

function newVersion() { return crypto.randomUUID(); }
function generatedUsername(student: Record<string, unknown>) {
  const base = String(student.student_code || student.full_name || "siswa").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 20) || "siswa";
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(5)), n => alphabet[n % alphabet.length]).join("");
  return `${base.slice(0, 24)}-${suffix}`;
}

async function ownedStudent(db: ReturnType<typeof serviceClient>, id: string, teacherId: string, schoolId: string) {
  const { data, error } = await db.from("students")
    .select("id, teacher_id, school_id, full_name, nis, nisn, student_code, class_id, status")
    .eq("id", id).eq("teacher_id", teacherId).eq("school_id", schoolId).eq("status", "aktif").maybeSingle();
  if (error) throw new Error("Gagal memeriksa kepemilikan siswa.");
  if (!data) throw new Error("Siswa tidak ditemukan atau bukan milik guru ini.");
  return data;
}

async function createOne(db: ReturnType<typeof serviceClient>, actor: any, student: any, usernameInput: unknown, passwordInput: unknown, mustChange: boolean) {
  const username = normalizeUsername(usernameInput || generatedUsername(student));
  if (!validUsername(username)) throw new Error("Username harus 3–30 karakter: huruf kecil, angka, titik, garis bawah, atau tanda hubung.");
  const { data: existingUser } = await db.from("student_accounts").select("id").eq("username", username).maybeSingle();
  if (existingUser) throw new Error("Username sudah digunakan.");
  const { data: existingStudent } = await db.from("student_accounts").select("id").eq("student_id", student.id).maybeSingle();
  if (existingStudent) throw new Error("Siswa ini sudah memiliki akun.");

  const password = passwordInput === undefined || passwordInput === null || passwordInput === "" ? generatedPassword() : String(passwordInput);
  if (!validPassword(password)) throw new Error("Password harus 10–72 karakter dan tidak memuat karakter kontrol.");
  const email = await internalEmail(username);
  const version = newVersion();
  const { data: authData, error: authError } = await db.auth.admin.createUser({
    email, password, email_confirm: true,
    app_metadata: { account_type: "student", session_version: version },
  });
  if (authError || !authData.user) throw new Error("Akun tidak dapat dibuat. Periksa username dan coba lagi.");

  const { data: account, error: insertError } = await db.from("student_accounts").insert({
    auth_user_id: authData.user.id, auth_email: email, session_version: version,
    credentials_updated_at: new Date().toISOString(), teacher_id: actor.profile.id,
    school_id: actor.profile.school_id, student_id: student.id, username,
    account_status: "ACTIVE", must_change_password: mustChange, created_by: actor.user.id,
    password_hash: null, password_salt: null, password_iterations: null,
  }).select(accountFields).single();
  if (insertError || !account) {
    await db.auth.admin.deleteUser(authData.user.id);
    if (insertError?.code === "23505") throw new Error("Username atau akun siswa sudah digunakan.");
    throw new Error("Akun tidak dapat disimpan. Silakan coba lagi.");
  }
  await logAuthEvent(db, { event: "account_created", username, account_id: account.id, student_id: student.id, teacher_id: actor.profile.id, school_id: actor.profile.school_id });
  const { data: cls } = await db.from("classes").select("name").eq("id", student.class_id).maybeSingle();
  return { account, student_name: student.full_name, class_name: cls?.name || "", temporary_password: password };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Metode tidak didukung." }, 405);
  try {
    const actor = await teacherContext(req);
    if ("error" in actor) return json({ error: actor.error }, 401);
    const body = await req.json();
    const action = String(body?.action || "");
    const db = actor.db;

    if (action === "list") {
      const { data: rows, error } = await db.from("student_accounts").select(accountFields)
        .eq("teacher_id", actor.profile.id).eq("school_id", actor.profile.school_id).order("created_at", { ascending: false });
      if (error) return json({ error: "Daftar akun tidak dapat dimuat." }, 500);
      const ids = (rows || []).map((r: any) => r.student_id);
      const { data: students } = ids.length ? await db.from("students").select("id,full_name,nis,nisn,student_code,class_id,status").in("id", ids).eq("teacher_id", actor.profile.id).eq("school_id", actor.profile.school_id) : { data: [] };
      const classIds = [...new Set((students || []).map((s: any) => s.class_id))];
      const { data: classes } = classIds.length ? await db.from("classes").select("id,name,academic_year").in("id", classIds).eq("teacher_id", actor.profile.id).eq("school_id", actor.profile.school_id) : { data: [] };
      const studentMap = new Map((students || []).map((s: any) => [s.id, s]));
      const classMap = new Map((classes || []).map((c: any) => [c.id, c]));
      return json({ accounts: (rows || []).map((a: any) => {
        const s: any = studentMap.get(a.student_id); const c: any = s && classMap.get(s.class_id);
        return { ...a, student: s ? { id:s.id, full_name:s.full_name, nis:s.nis, nisn:s.nisn, student_code:s.student_code, status:s.status } : null,
          class: c ? { id:c.id, name:c.name, academic_year:c.academic_year } : null };
      }) });
    }

    if (action === "create" || action === "create_many") {
      const ids = action === "create" ? [body.student_id] : body.student_ids;
      if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some((x: unknown) => typeof x !== "string")) return json({ error: "Pilih antara 1 sampai 100 siswa." }, 400);
      const uniqueIds = [...new Set(ids)];
      const created = []; const skipped = []; const failures = [];
      for (const id of uniqueIds) {
        try {
          const student = await ownedStudent(db, id, actor.profile.id, actor.profile.school_id);
          const requestedUsername = action === "create" ? body.username : (body.usernames && body.usernames[id]);
          const row = await createOne(db, actor, student, requestedUsername,
            action === "create" ? body.password : undefined, body.must_change_password !== false);
          created.push(row);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Akun tidak dapat dibuat.";
          if (/sudah memiliki akun|Username sudah digunakan/i.test(message)) skipped.push({ student_id: id, reason: message });
          else failures.push({ student_id: id, reason: message });
        }
      }
      return json({ created, skipped, failures });
    }

    if (action === "reset") {
      const { data: account, error } = await db.from("student_accounts").select("id,auth_user_id,session_version,username,student_id,teacher_id,school_id,account_status")
        .eq("id", body.account_id).eq("teacher_id", actor.profile.id).eq("school_id", actor.profile.school_id).maybeSingle();
      if (error || !account) return json({ error: "Akun tidak ditemukan atau bukan milik Anda." }, 404);
      const student = await ownedStudent(db, account.student_id, actor.profile.id, actor.profile.school_id);
      if (!["ACTIVE", "DISABLED"].includes(account.account_status)) return json({ error:"Password hanya dapat direset untuk akun aktif atau nonaktif." }, 409);
      const password = body.password ? String(body.password) : generatedPassword();
      if (!validPassword(password)) return json({ error: "Password harus 10–72 karakter dan tidak memuat karakter kontrol." }, 400);
      const version = newVersion();
      const { data: oldUser, error: userLookupError } = await db.auth.admin.getUserById(account.auth_user_id);
      if (userLookupError || !oldUser.user) return json({ error: "Identitas autentikasi siswa tidak ditemukan." }, 404);
      const { error: authError } = await db.auth.admin.updateUserById(account.auth_user_id, {
        password, app_metadata: { ...oldUser.user.app_metadata, account_type: "student", session_version: version },
      });
      if (authError) return json({ error: "Password belum dapat direset." }, 500);
      const { error: updateError } = await db.from("student_accounts").update({ session_version: version, credentials_updated_at: new Date().toISOString(), must_change_password: true })
        .eq("id", account.id).eq("teacher_id", actor.profile.id).eq("school_id", actor.profile.school_id);
      if (updateError) return json({ error: "Password berubah tetapi status akun belum tersinkron. Hubungi administrator." }, 500);
      // Disabled users are already banned at Supabase Auth. Avoid attempting a
      // password grant for them; the session version change revokes old app tokens.
      if (account.account_status === "DISABLED") {
        await logAuthEvent(db, { event: "account_password_reset", username: account.username, account_id: account.id, student_id: student.id, teacher_id: actor.profile.id, school_id: actor.profile.school_id });
        const { data: cls } = await db.from("classes").select("name").eq("id", student.class_id).maybeSingle();
        return json({ account: { id: account.id, student_id: student.id, username: account.username }, student_name: student.full_name, class_name: cls?.name || "", temporary_password: password });
      }
      const fresh = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/token?grant_type=password`, {
        method:"POST", headers:{ apikey:Deno.env.get("SUPABASE_ANON_KEY") || "", "Content-Type":"application/json" },
        body:JSON.stringify({ email:account.auth_email, password }),
      }).then(r => r.ok ? r.json() : null).catch(() => null);
      if (!fresh?.access_token) return json({ error:"Password direset, tetapi pencabutan sesi lama perlu diperiksa administrator." }, 500);
      const { error: revokeError } = await db.auth.admin.signOut(fresh.access_token, "global");
      if (revokeError) return json({ error:"Password direset, tetapi sesi lama belum dapat dicabut. Coba login kembali setelah sesi kedaluwarsa." }, 500);
      const finalVersion = newVersion();
      const { data: rotated } = await db.auth.admin.getUserById(account.auth_user_id);
      const { error: metadataError } = await db.auth.admin.updateUserById(account.auth_user_id, { app_metadata:{ ...rotated.user?.app_metadata, account_type:"student", session_version:finalVersion } });
      if (metadataError) return json({ error:"Password direset, tetapi sesi akun belum tersinkron. Hubungi administrator." }, 500);
      const { error: versionError } = await db.from("student_accounts").update({ session_version:finalVersion }).eq("id", account.id);
      if (versionError) return json({ error:"Password direset, tetapi sesi akun belum tersinkron. Hubungi administrator." }, 500);
      await logAuthEvent(db, { event: "account_password_reset", username: account.username, account_id: account.id, student_id: student.id, teacher_id: actor.profile.id, school_id: actor.profile.school_id });
      const { data: cls } = await db.from("classes").select("name").eq("id", student.class_id).maybeSingle();
      return json({ account: { id: account.id, student_id: student.id, username: account.username }, student_name: student.full_name, class_name: cls?.name || "", temporary_password: password });
    }

    if (action === "set_status") {
      if (!['ACTIVE', 'DISABLED'].includes(body.status)) return json({ error: "Status akun tidak valid." }, 400);
      const { data: account, error } = await db.from("student_accounts").select("id,auth_user_id,username,student_id")
        .eq("id", body.account_id).eq("teacher_id", actor.profile.id).eq("school_id", actor.profile.school_id).maybeSingle();
      if (error || !account) return json({ error: "Akun tidak ditemukan atau bukan milik Anda." }, 404);
      const student = await ownedStudent(db, account.student_id, actor.profile.id, actor.profile.school_id);
      // Also block direct Auth password grants while disabled; relying on the
      // app's login function alone would be bypassable through /auth/v1/token.
      if (body.status === "DISABLED") {
        const { error: banError } = await db.auth.admin.updateUserById(account.auth_user_id, { ban_duration:"876000h" });
        if (banError) return json({ error:"Status autentikasi tidak dapat diperbarui." }, 500);
      }
      const { error: updateError } = await db.from("student_accounts").update({ account_status: body.status }).eq("id", account.id)
        .eq("teacher_id", actor.profile.id).eq("school_id", actor.profile.school_id);
      if (updateError) return json({ error: "Status akun tidak dapat diperbarui." }, 500);
      if (body.status === "ACTIVE") {
        const { error: unbanError } = await db.auth.admin.updateUserById(account.auth_user_id, { ban_duration:"0s" });
        if (unbanError) {
          await db.from("student_accounts").update({ account_status:"DISABLED" }).eq("id", account.id);
          return json({ error:"Akun tetap dinonaktifkan karena autentikasi belum dapat dipulihkan." }, 500);
        }
      }
      await logAuthEvent(db, { event: body.status === "ACTIVE" ? "account_enabled" : "account_disabled", username: account.username, account_id: account.id, student_id: student.id, teacher_id: actor.profile.id, school_id: actor.profile.school_id });
      return json({ ok: true });
    }

    if (action === "events") {
      const { data: account } = await db.from("student_accounts").select("id,student_id,username")
        .eq("id", body.account_id).eq("teacher_id", actor.profile.id).eq("school_id", actor.profile.school_id).maybeSingle();
      if (!account) return json({ error: "Akun tidak ditemukan atau bukan milik Anda." }, 404);
      const { data: events, error } = await db.from("student_auth_events").select("event,created_at")
        .eq("account_id", account.id).order("created_at", { ascending: false }).limit(100);
      if (error) return json({ error: "Riwayat autentikasi tidak dapat dimuat." }, 500);
      return json({ events: events || [] });
    }

    return json({ error: "Operasi tidak dikenali." }, 400);
  } catch {
    return json({ error: "Permintaan tidak dapat diproses." }, 500);
  }
});
