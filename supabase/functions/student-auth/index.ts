import { corsHeaders, currentUser, decodeJwtPayload, hasCurrentStudentSession, json, logAuthEvent, normalizeUsername, publicClient, serviceClient, validPassword, validUsername } from "../_shared/student-auth.ts";

const genericLoginError = "Username atau password salah, atau akun tidak aktif.";

async function findAccount(db: ReturnType<typeof serviceClient>, authUserId: string) {
  const { data, error } = await db.from("student_accounts")
    .select("id,auth_user_id,auth_email,session_version,student_id,teacher_id,school_id,username,account_status,must_change_password,last_login,credentials_updated_at")
    .eq("auth_user_id", authUserId).maybeSingle();
  if (error) throw new Error("account_lookup_failed");
  return data;
}

async function safePortal(db: ReturnType<typeof serviceClient>, account: any, token: string) {
  if (account.account_status !== "ACTIVE") return null;
  if (!hasCurrentStudentSession(token, account)) return null;
  const { data: student, error: studentError } = await db.from("students")
    .select("id,full_name,nis,nisn,student_code,class_id,status")
    .eq("id", account.student_id).eq("teacher_id", account.teacher_id).eq("school_id", account.school_id).maybeSingle();
  if (studentError || !student) return null;
  const [schoolResult, classResult] = await Promise.all([
    db.from("schools").select("id,school_name,status").eq("id", account.school_id).maybeSingle(),
    db.from("classes").select("id,name,grade,academic_year").eq("id", student.class_id).eq("teacher_id", account.teacher_id).eq("school_id", account.school_id).maybeSingle(),
  ]);
  if (schoolResult.error || !schoolResult.data || schoolResult.data.status !== "ACTIVE") return null;
  const profile = {
    student: { id:student.id, full_name:student.full_name, nis:student.nis || "", nisn:student.nisn || "", student_code:student.student_code, status:student.status },
    class: classResult.data ? { id:classResult.data.id, name:classResult.data.name, grade:classResult.data.grade, academic_year:classResult.data.academic_year } : null,
    school: { id:schoolResult.data.id, school_name:schoolResult.data.school_name },
    account: { id:account.id, username:account.username, account_status:account.account_status, must_change_password:account.must_change_password, last_login:account.last_login },
  };
  return { user: { id: account.auth_user_id }, student: profile.student, account: profile.account, profile,
    summary:{ published_grades:0, pending_tasks:0, tasks:0, games:0 }, grades:[], tasks:[], games:[], history:[], materials:[] };
}

async function passwordGrant(email: string, password: string) {
  const url = Deno.env.get("SUPABASE_URL"); const key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) throw new Error("auth_configuration_missing");
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method:"POST", headers:{ apikey:key, "Content-Type":"application/json" },
    body:JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => null);
  return response.ok ? body : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Metode tidak didukung." }, 405);
  try {
    const body = await req.json(); const action = String(body?.action || "");
    const db = serviceClient();

    if (action === "login") {
      const username = normalizeUsername(body.username);
      const password = typeof body.password === "string" ? body.password : "";
      if (!validUsername(username) || !password || password.length > 72) return json({ error: genericLoginError }, 401);
      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { count } = await db.from("student_auth_events").select("id", { count:"exact", head:true })
        .eq("username", username).in("event", ["login_failed", "login_rate_limited"]).gt("created_at", since);
      if ((count || 0) >= 10) {
        const { data: limited } = await db.from("student_accounts").select("id,student_id,teacher_id,school_id,username")
          .eq("username", username).maybeSingle();
        await logAuthEvent(db, { event:"login_rate_limited", username, account_id:limited?.id || null, student_id:limited?.student_id || null, teacher_id:limited?.teacher_id || null, school_id:limited?.school_id || null });
        return json({ error:"Terlalu banyak percobaan login. Coba lagi beberapa menit." }, 429);
      }
      const { data: account } = await db.from("student_accounts").select("id,auth_user_id,auth_email,session_version,student_id,teacher_id,school_id,username,account_status,must_change_password")
        .eq("username", username).maybeSingle();
      const auth = account?.account_status === "ACTIVE" ? await passwordGrant(account.auth_email, password) : null;
      if (!auth?.access_token || !auth?.refresh_token || auth.user?.id !== account?.auth_user_id) {
        await logAuthEvent(db, { event:"login_failed", username, account_id:account?.id || null, student_id:account?.student_id || null, teacher_id:account?.teacher_id || null, school_id:account?.school_id || null });
        return json({ error:genericLoginError }, 401);
      }
      const payload = decodeJwtPayload(auth.access_token);
      const appMeta = payload?.app_metadata as Record<string, unknown> | undefined;
      if (appMeta?.account_type !== "student" || appMeta.session_version !== account.session_version) return json({ error:genericLoginError }, 401);
      if (!await safePortal(db, account, auth.access_token)) {
        await db.auth.admin.signOut(auth.access_token, "local");
        await logAuthEvent(db, { event:"login_failed", username, account_id:account.id, student_id:account.student_id, teacher_id:account.teacher_id, school_id:account.school_id });
        return json({ error:genericLoginError }, 401);
      }
      const now = new Date().toISOString();
      await db.from("student_accounts").update({ last_login:now }).eq("id", account.id);
      await logAuthEvent(db, { event:"login_success", username, account_id:account.id, student_id:account.student_id, teacher_id:account.teacher_id, school_id:account.school_id });
      return json({ session:auth, student:{ id:account.auth_user_id }, account:{ username, must_change_password:account.must_change_password } });
    }

    const user = await currentUser(req);
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!user || !token) return json({ error:"Sesi siswa tidak valid atau sudah berakhir." }, 401);
    const account = await findAccount(db, user.id);
    if (!account || account.account_status !== "ACTIVE") return json({ error:"Akun siswa tidak aktif." }, 403);
    if (!hasCurrentStudentSession(token, account)) return json({ error:"Sesi siswa sudah tidak berlaku. Silakan login kembali." }, 401);

    if (action === "session" || action === "portal") {
      const result = await safePortal(db, account, token);
      if (!result) return json({ error:"Sesi tidak aktif. Silakan login kembali." }, 401);
      return json(result);
    }

    if (action === "logout") {
      const { data: oldUser, error: lookupError } = await db.auth.admin.getUserById(user.id);
      if (lookupError || !oldUser.user) return json({ error:"Sesi tidak dapat dicabut." }, 500);
      const version = crypto.randomUUID();
      const { data: changed, error: versionError } = await db.from("student_accounts")
        .update({ session_version:version }).eq("id", account.id).eq("session_version", account.session_version)
        .select("id").maybeSingle();
      if (versionError || !changed) return json({ error:"Sesi sudah berubah. Login kembali." }, 409);
      const { error: metadataError } = await db.auth.admin.updateUserById(user.id, {
        app_metadata:{ ...oldUser.user.app_metadata, account_type:"student", session_version:version },
      });
      if (metadataError) {
        await db.from("student_accounts").update({ session_version:account.session_version }).eq("id", account.id).eq("session_version", version);
        return json({ error:"Sesi server tidak dapat dicabut." }, 500);
      }
      const { error: revokeError } = await db.auth.admin.signOut(token, "local");
      if (revokeError) return json({ error:"Token lama ditolak, tetapi refresh session belum dapat dicabut." }, 500);
      return json({ ok:true });
    }

    if (action === "change_password") {
      const currentPassword = typeof body.current_password === "string" ? body.current_password : "";
      const newPassword = typeof body.new_password === "string" ? body.new_password : "";
      if (!validPassword(newPassword)) return json({ error:"Password baru harus 10–72 karakter." }, 400);
      if (newPassword === currentPassword) return json({ error:"Gunakan password baru yang berbeda dari password saat ini." }, 400);
      const verified = await passwordGrant(account.auth_email, currentPassword);
      if (!verified?.user || verified.user.id !== account.auth_user_id) return json({ error:"Password saat ini salah." }, 400);
      const { data: oldUser } = await db.auth.admin.getUserById(account.auth_user_id);
      const version = crypto.randomUUID();
      const { error: changeError } = await db.auth.admin.updateUserById(account.auth_user_id, {
        password:newPassword, app_metadata:{ ...oldUser.user?.app_metadata, account_type:"student", session_version:version },
      });
      if (changeError) return json({ error:"Password baru tidak dapat disimpan." }, 500);
      const { error: saveError } = await db.from("student_accounts").update({ session_version:version, credentials_updated_at:new Date().toISOString(), must_change_password:false })
        .eq("id", account.id).eq("auth_user_id", user.id);
      if (saveError) return json({ error:"Password berubah, tetapi sesi belum tersinkron. Silakan login kembali." }, 500);
      const freshSession = await passwordGrant(account.auth_email, newPassword);
      if (!freshSession?.access_token || freshSession.user?.id !== user.id) return json({ error:"Password berhasil diubah. Silakan login kembali." }, 200);
      const { error: revokeError } = await db.auth.admin.signOut(freshSession.access_token, "global");
      if (revokeError) return json({ error:"Password berhasil diubah, tetapi sesi lama belum dapat dicabut. Silakan login kembali." }, 500);
      const finalVersion = crypto.randomUUID();
      const { data: rotated } = await db.auth.admin.getUserById(user.id);
      const { error: metadataError } = await db.auth.admin.updateUserById(user.id, { app_metadata:{ ...rotated.user?.app_metadata, account_type:"student", session_version:finalVersion } });
      if (metadataError) return json({ error:"Password berhasil diubah, tetapi sesi perlu disinkronkan. Login kembali." }, 500);
      const { error: finalVersionError } = await db.from("student_accounts").update({ session_version:finalVersion }).eq("id", account.id).eq("auth_user_id", user.id);
      if (finalVersionError) return json({ error:"Password berhasil diubah, tetapi sesi perlu disinkronkan. Login kembali." }, 500);
      const finalSession = await passwordGrant(account.auth_email, newPassword);
      if (!finalSession?.access_token || finalSession.user?.id !== user.id) return json({ error:"Password berhasil diubah. Silakan login kembali." }, 200);
      await logAuthEvent(db, { event:"password_changed", username:account.username, account_id:account.id, student_id:account.student_id, teacher_id:account.teacher_id, school_id:account.school_id });
      return json({ session:finalSession, account:{ username:account.username, must_change_password:false } });
    }

    return json({ error:"Operasi tidak dikenali." }, 400);
  } catch {
    return json({ error:"Permintaan autentikasi tidak dapat diproses." }, 500);
  }
});
