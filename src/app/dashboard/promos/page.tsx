"use client";

/**
 * Promo management (item 4). Satu halaman client, tanpa library tambahan:
 * login -> daftar promo + kuota terpakai/sisa -> bikin / ubah / aktif-nonaktif.
 *
 * Semua kontrol sebenarnya ada di server (API /api/admin/promos + RPC atomik);
 * halaman ini hanya UI. Kalau JS dimatikan, promo tetap tidak bisa dikarang
 * karena validasi + auth ada di server.
 */
import { useCallback, useEffect, useState } from "react";

const PLAN_LABELS: Record<string, string> = {
  month: "1 Bulan",
  quarter: "3 Bulan",
  half: "6 Bulan",
  year: "1 Tahun",
};

const TYPE_LABELS: Record<string, string> = {
  percentage: "Persen (%)",
  fixed: "Potongan (Rp)",
  flat_price: "Harga jadi (Rp)",
};

interface Promo {
  id: string;
  code: string;
  discount_type: keyof typeof TYPE_LABELS;
  amount: number;
  plan_keys: string[];
  max_redemptions: number | null;
  expires_at: string | null;
  is_active: boolean;
  used_count: number;
  remaining: number | null;
}

interface FormState {
  code: string;
  discount_type: string;
  amount: string;
  plan_keys: string[];
  max_redemptions: string;
  expires_at: string;
}

const EMPTY_FORM: FormState = {
  code: "",
  discount_type: "percentage",
  amount: "",
  plan_keys: [],
  max_redemptions: "",
  expires_at: "",
};

function rupiah(value: number) {
  return `Rp ${Number(value).toLocaleString("id-ID")}`;
}

function describeAmount(promo: Promo) {
  if (promo.discount_type === "percentage") return `${promo.amount}%`;
  return rupiah(promo.amount);
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export default function PromoDashboardPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [promos, setPromos] = useState<Promo[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const loadPromos = useCallback(async () => {
    const res = await fetch("/api/admin/promos", { cache: "no-store" });
    if (res.status === 401) {
      setAuthed(false);
      return;
    }
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error || "Gagal memuat promo.");
      return;
    }
    setError("");
    setPromos(data.promos || []);
  }, []);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/session", { cache: "no-store" });
      const data = await res.json();
      setAuthed(Boolean(data?.authenticated));
      if (data?.authenticated) await loadPromos();
    })();
  }, [loadPromos]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setLoginError("");
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data?.error || "Login gagal.");
        return;
      }
      setPassword("");
      setAuthed(true);
      await loadPromos();
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch("/api/admin/session", { method: "DELETE" });
    setAuthed(false);
    setPromos([]);
  };

  const flash = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(""), 4000);
  };

  const createPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/promos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          discount_type: form.discount_type,
          amount: form.amount,
          plan_keys: form.plan_keys,
          max_redemptions: form.max_redemptions,
          expires_at: form.expires_at,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError([data?.error, ...(data?.details || [])].filter(Boolean).join(" "));
        return;
      }
      setForm(EMPTY_FORM);
      flash("Promo tersimpan.");
      await loadPromos();
    } finally {
      setBusy(false);
    }
  };

  const patchPromo = async (id: string, patch: Record<string, unknown>, message: string) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/promos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        setError([data?.error, ...(data?.details || [])].filter(Boolean).join(" "));
        return;
      }
      flash(message);
      await loadPromos();
    } finally {
      setBusy(false);
    }
  };

  const editQuota = async (promo: Promo) => {
    const input = window.prompt(
      `Kuota baru untuk ${promo.code} (kosongkan untuk tanpa kuota):`,
      promo.max_redemptions === null ? "" : String(promo.max_redemptions)
    );
    if (input === null) return;
    await patchPromo(promo.id, { max_redemptions: input }, `Kuota ${promo.code} diperbarui.`);
  };

  const editExpiry = async (promo: Promo) => {
    const input = window.prompt(
      `Kedaluwarsa ${promo.code} (format YYYY-MM-DDTHH:MM, kosongkan untuk tanpa kedaluwarsa):`,
      toLocalInput(promo.expires_at)
    );
    if (input === null) return;
    await patchPromo(
      promo.id,
      { expires_at: input === "" ? null : new Date(input).toISOString() },
      `Kedaluwarsa ${promo.code} diperbarui.`
    );
  };

  if (authed === null) {
    return <main className="p-8 font-sans text-sm text-brand-950">Memuat…</main>;
  }

  if (!authed) {
    return (
      <main className="min-h-screen bg-surface flex items-center justify-center p-6 font-sans">
        <form
          onSubmit={login}
          className="w-full max-w-sm space-y-4 rounded-2xl border border-surface-border bg-white p-6"
        >
          <h1 className="text-lg font-bold text-brand-950">Dashboard Promo</h1>
          <p className="text-xs text-text-secondary">
            Halaman internal Thrivin. Butuh akun admin.
          </p>
          <input
            className="w-full rounded-xl border border-surface-border px-3 py-2 text-sm"
            placeholder="Username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="w-full rounded-xl border border-surface-border px-3 py-2 text-sm"
            placeholder="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {loginError && <p className="text-xs font-bold text-red-600">{loginError}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-brand-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "Memeriksa…" : "Masuk"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface p-4 sm:p-8 font-sans text-brand-950 space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Promo Code</h1>
          <p className="text-xs text-text-secondary">
            Bikin, ubah kuota, dan matikan kode promo — langsung berlaku di checkout.
          </p>
        </div>
        <button
          onClick={logout}
          className="rounded-xl border border-surface-border px-3 py-1.5 text-xs font-bold"
        >
          Keluar
        </button>
      </header>

      {notice && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
          {error}
        </p>
      )}

      <section className="overflow-x-auto rounded-2xl border border-surface-border bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-muted text-[11px] uppercase tracking-wide text-text-secondary">
            <tr>
              <th className="p-3">Kode</th>
              <th className="p-3">Diskon</th>
              <th className="p-3">Paket</th>
              <th className="p-3">Kuota</th>
              <th className="p-3">Terpakai</th>
              <th className="p-3">Sisa</th>
              <th className="p-3">Kedaluwarsa</th>
              <th className="p-3">Status</th>
              <th className="p-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {promos.length === 0 && (
              <tr>
                <td className="p-3 text-text-secondary" colSpan={9}>
                  Belum ada promo.
                </td>
              </tr>
            )}
            {promos.map((promo) => {
              const expired =
                promo.expires_at !== null && new Date(promo.expires_at).getTime() <= Date.now();
              const exhausted = promo.remaining === 0;
              return (
                <tr key={promo.id} className="border-t border-surface-border">
                  <td className="p-3 font-mono font-bold">{promo.code}</td>
                  <td className="p-3">
                    {describeAmount(promo)}
                    <span className="block text-[10px] text-text-muted">
                      {TYPE_LABELS[promo.discount_type]}
                    </span>
                  </td>
                  <td className="p-3">
                    {promo.plan_keys.length === 0
                      ? "Semua paket"
                      : promo.plan_keys.map((p) => PLAN_LABELS[p] || p).join(", ")}
                  </td>
                  <td className="p-3">{promo.max_redemptions ?? "Tanpa batas"}</td>
                  <td className="p-3">{promo.used_count}</td>
                  <td className="p-3 font-bold">
                    {promo.remaining === null ? "∞" : promo.remaining}
                  </td>
                  <td className="p-3">
                    {promo.expires_at
                      ? new Date(promo.expires_at).toLocaleString("id-ID")
                      : "Tanpa batas"}
                  </td>
                  <td className="p-3">
                    {!promo.is_active ? (
                      <span className="font-bold text-red-600">Non-aktif</span>
                    ) : expired ? (
                      <span className="font-bold text-amber-600">Kedaluwarsa</span>
                    ) : exhausted ? (
                      <span className="font-bold text-amber-600">Habis</span>
                    ) : (
                      <span className="font-bold text-emerald-700">Aktif</span>
                    )}
                  </td>
                  <td className="p-3 space-x-2 whitespace-nowrap">
                    <button
                      disabled={busy}
                      onClick={() => editQuota(promo)}
                      className="rounded-lg border border-surface-border px-2 py-1 font-bold"
                    >
                      Kuota
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => editExpiry(promo)}
                      className="rounded-lg border border-surface-border px-2 py-1 font-bold"
                    >
                      Tanggal
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        patchPromo(
                          promo.id,
                          { is_active: !promo.is_active },
                          `${promo.code} ${promo.is_active ? "dimatikan" : "diaktifkan"}.`
                        )
                      }
                      className="rounded-lg border border-surface-border px-2 py-1 font-bold"
                    >
                      {promo.is_active ? "Matikan" : "Aktifkan"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border border-surface-border bg-white p-4 space-y-3">
        <h2 className="text-sm font-bold">Buat promo baru</h2>
        <form onSubmit={createPromo} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-bold space-y-1">
            Kode
            <input
              className="w-full rounded-xl border border-surface-border px-3 py-2 font-mono uppercase"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="PROMOBARU"
              required
            />
          </label>
          <label className="text-xs font-bold space-y-1">
            Tipe diskon
            <select
              className="w-full rounded-xl border border-surface-border px-3 py-2"
              value={form.discount_type}
              onChange={(e) => setForm({ ...form, discount_type: e.target.value })}
            >
              <option value="percentage">Persen (%)</option>
              <option value="fixed">Potongan (Rp)</option>
              <option value="flat_price">Harga jadi (Rp)</option>
            </select>
          </label>
          <label className="text-xs font-bold space-y-1">
            Nilai
            <input
              className="w-full rounded-xl border border-surface-border px-3 py-2"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder={form.discount_type === "percentage" ? "20" : "10000"}
              required
            />
          </label>
          <label className="text-xs font-bold space-y-1">
            Kuota total (kosong = tanpa batas)
            <input
              className="w-full rounded-xl border border-surface-border px-3 py-2"
              value={form.max_redemptions}
              onChange={(e) => setForm({ ...form, max_redemptions: e.target.value })}
              placeholder="100"
            />
          </label>
          <label className="text-xs font-bold space-y-1">
            Kedaluwarsa (kosong = tanpa batas)
            <input
              type="datetime-local"
              className="w-full rounded-xl border border-surface-border px-3 py-2"
              value={form.expires_at}
              onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
            />
          </label>
          <fieldset className="text-xs font-bold space-y-1">
            <legend>Berlaku untuk paket (kosong = semua)</legend>
            <div className="flex flex-wrap gap-3 pt-1">
              {Object.entries(PLAN_LABELS).map(([key, label]) => (
                <label key={key} className="flex items-center gap-1.5 font-normal">
                  <input
                    type="checkbox"
                    checked={form.plan_keys.includes(key)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        plan_keys: e.target.checked
                          ? [...form.plan_keys, key]
                          : form.plan_keys.filter((p) => p !== key),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-brand-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 sm:col-span-2 lg:col-span-1"
          >
            Simpan promo
          </button>
        </form>
        <p className="text-[11px] text-text-muted">
          Kode satu kali per nomor WhatsApp selalu aktif. Untuk promo harga-jadi
          (mis. Rp 10.000), kuota wajib diisi kecuali memang mau tanpa batas.
        </p>
      </section>
    </main>
  );
}