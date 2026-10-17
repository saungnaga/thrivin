import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_COOKIE,
  createSessionToken,
  getAdminConfig,
  getAdminSession,
  safeEqual,
  sessionCookieOptions,
} from "@/lib/admin-auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

/** GET = status sesi (dipakai dashboard untuk memutuskan tampil form login). */
export async function GET() {
  const username = await getAdminSession();
  return NextResponse.json({ authenticated: Boolean(username), username });
}

export async function POST(req: Request) {
  // Cek dulu, baru kredensial: brute force tidak dapat oracle "config kosong".
  const limited = checkRateLimit({
    key: `admin-login:ip:${clientIp(req)}`,
    limit: 10,
    windowMs: 5 * 60_000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan login. Coba lagi nanti." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  const config = getAdminConfig();
  if (!config) {
    return NextResponse.json(
      {
        error:
          "Dashboard promo belum dikonfigurasi (ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_SESSION_SECRET).",
      },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body harus JSON." }, { status: 400 });
  }

  const username = String(body.username ?? "");
  const password = String(body.password ?? "");
  const ok = safeEqual(username, config.username) && safeEqual(password, config.password);
  if (!ok) {
    // Satu pesan untuk dua kemungkinan: jangan bocorkan mana yang salah.
    return NextResponse.json({ error: "Username atau password salah." }, { status: 401 });
  }

  const token = createSessionToken(config.username);
  if (!token) {
    return NextResponse.json({ error: "Sesi tidak bisa dibuat." }, { status: 500 });
  }
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, sessionCookieOptions());
  return NextResponse.json({ authenticated: true, username: config.username });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  return NextResponse.json({ authenticated: false });
}