import { createClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("server_configuration_missing");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function publicClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) throw new Error("server_configuration_missing");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function currentUser(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await publicClient().auth.getUser(token);
  return error ? null : data.user;
}

export function normalizeUsername(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function validUsername(value: string) {
  return /^[a-z0-9._-]{3,30}$/.test(value);
}

export function validPassword(value: unknown) {
  if (typeof value !== "string" || Array.from(value).length < 10 || /[\u0000-\u001f\u007f]/.test(value)) return false;
  return new TextEncoder().encode(value).length <= 72;
}

export function generatedPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%";
  const alphabet = upper + lower + digits + special;
  const pick = (chars: string) => chars[crypto.getRandomValues(new Uint8Array(1))[0] % chars.length];
  const result = [pick(upper), pick(lower), pick(digits), pick(special)];
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  for (const n of bytes) result.push(alphabet[n % alphabet.length]);
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result.join("");
}

export async function internalEmail(username: string) {
  const pepper = Deno.env.get("STUDENT_LOGIN_PEPPER");
  if (!pepper || pepper.length < 64) throw new Error("student_login_secret_missing");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(username)));
  const digest = Array.from(sig.slice(0, 24), (n) => n.toString(16).padStart(2, "0")).join("");
  return `s-${digest}@student.invalid`;
}

export async function teacherContext(req: Request) {
  const user = await currentUser(req);
  if (!user) return { error: "Sesi guru tidak valid atau sudah berakhir." } as const;
  const db = serviceClient();
  const { data: profile, error } = await db.from("profiles")
    .select("id, role, active, school_id, full_name")
    .eq("id", user.id).maybeSingle();
  if (error || !profile || profile.active !== true || !["teacher", "admin"].includes(profile.role) || !profile.school_id) {
    return { error: "Akses hanya tersedia untuk guru aktif." } as const;
  }
  const { data: school, error: schoolError } = await db.from("schools")
    .select("id, school_name, status").eq("id", profile.school_id).maybeSingle();
  if (schoolError || !school || school.status !== "ACTIVE") return { error: "Sekolah tidak aktif." } as const;
  return { db, user, profile, school } as const;
}

export async function logAuthEvent(db: ReturnType<typeof serviceClient>, row: Record<string, unknown>) {
  // Never include a password, token, or request body in auth telemetry.
  await db.from("student_auth_events").insert(row);
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
  } catch { return null; }
}

export function hasCurrentStudentSession(token: string, account: Record<string, unknown>) {
  const claims = decodeJwtPayload(token);
  const appMeta = claims?.app_metadata as Record<string, unknown> | undefined;
  return claims?.sub === account.auth_user_id && appMeta?.account_type === "student" && appMeta.session_version === account.session_version;
}
