import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { updatePromo } from "@/lib/promo";
import { validatePromoPatch } from "@/lib/promo";
import { redactError } from "@/lib/onboarding-store";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!UUID_PATTERN.test(String(id))) {
    return NextResponse.json({ error: "ID promo tidak valid." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body harus JSON." }, { status: 400 });
  }

  // `code` tidak bisa diubah lewat dashboard -> ditolak terang-terangan.
  const validated = validatePromoPatch(body);
  if (!validated.ok) {
    return NextResponse.json(
      { error: "Data promo tidak valid.", details: validated.errors },
      { status: 400 }
    );
  }

  try {
    const updated = await updatePromo(id, validated.value, admin);
    if (!updated) {
      return NextResponse.json({ error: "Promo tidak ditemukan." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[AdminPromo] update failed:", redactError(err));
    return NextResponse.json({ error: "Gagal memperbarui promo." }, { status: 500 });
  }
}