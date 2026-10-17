import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { createPromo, listPromos, validatePromoInput } from "@/lib/promo";
import { redactError } from "@/lib/onboarding-store";

/** 401 for anything without a valid admin session — the only gate on the API. */
async function requireAdmin(): Promise<string | NextResponse> {
  const username = await getAdminSession();
  if (!username) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  return username;
}

export async function GET() {
  const admin = await requireAdmin();
  if (typeof admin !== "string") return admin;
  try {
    return NextResponse.json({ promos: await listPromos() });
  } catch (err) {
    console.error("[AdminPromo] list failed:", redactError(err));
    return NextResponse.json({ error: "Gagal memuat daftar promo." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (typeof admin !== "string") return admin;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body harus JSON." }, { status: 400 });
  }

  // Validasi server-side: form browser bukan kontrol.
  const validated = validatePromoInput(body);
  if (!validated.ok) {
    return NextResponse.json(
      { error: "Data promo tidak valid.", details: validated.errors },
      { status: 400 }
    );
  }

  try {
    const rows = await createPromo(validated.value, admin);
    return NextResponse.json({ ok: true, promo: rows[0] ?? null });
  } catch (err) {
    console.error("[AdminPromo] create failed:", redactError(err));
    return NextResponse.json({ error: "Gagal menyimpan promo." }, { status: 500 });
  }
}