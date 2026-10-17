/**
 * DELETE /api/wa/session — akhiri sesi pelanggan (buang cookie).
 *
 * ponytail: token-nya stateless, jadi ini membuang cookie di sisi client saja —
 * prosedur mencabut SEMUA sesi pelanggan sekaligus: naikkan `WA_SESSION_EPOCH`
 * (sama seperti jalur admin). Tabel sesi per-perangkat baru perlu kalau nanti
 * butuh logout satu perangkat.
 */
import { NextResponse } from "next/server";
import { WA_SESSION_COOKIE } from "@/lib/wa-session";

export async function DELETE() {
  const res = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
  res.cookies.set(WA_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
