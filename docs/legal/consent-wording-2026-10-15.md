# DRAFT wording consent checkout (A7) — T&C wajib + opt-in pengingat opsional

**Status:** DRAFT approval-only. Belum ada checkbox di UI. Penerapan = W4 (`t_f5ec336c`).
**Base:** `9392cdd`. **Titik pemasangan:** langkah 9 onboarding, tepat di atas tombol
"Ambil Paket & Bayar Sekarang" — `src/app/companion/nina/onboarding/[step]/page.tsx:1888-1905`.
Hari ini tidak ada checkbox apa pun di alur itu (`grep checkbox|consent|opt_in` = 0 hit; `:1889-1905`).

Konvensi marker: `S=` sumber, `A=` asumsi (registry di `terms-draft-2026-10-15.md`), `O=` pertanyaan owner.

---

## C1. Checkbox 1 — persetujuan T&C (WAJIB untuk transaksi)

Label (kandidat):

> Saya sudah membaca dan menyetujui **Syarat & Ketentuan** dan **Kebijakan Privasi** Thrivin.

- Tautan `/terms` + `/privacy` dibuka di tab baru; teks versi yang ditampilkan = versi yang dicatat.
- **Default: tidak tercentang.** Tombol bayar nonaktif sampai dicentang.
- Label harus di dalam elemen `<label>` yang mengikat ke input (klik teks = klik box) — aksesibilitas
  keyboard/focus wajib, bukan pointer-only.

**Provenance:** S=`t_fdba2939 brief A7`, `S0 kontrak §3`, `src/app/companion/nina/onboarding/[step]/page.tsx:1888-1905` · A=A1 · O=CONSENT-1, TERMS-1

## C2. Checkbox 2 — pengingat Nina (OPSIONAL, terpisah)

Label (kandidat):

> Saya bersedia menerima **pesan pengingat dari Nina** di WhatsApp (opsional).

Teks bantu di bawah kotak:

> Menolak pengingat tidak menghalangi pembelianmu. Kamu bisa berhenti kapan saja: tekan tombol berhenti
> pada pesan pengingat, atau balas `BERHENTI`/`STOP`.

- **Default: tidak tercentang.** Tidak boleh di-precheck, tidak boleh digabung ke checkbox T&C.
- `false` **tetap disimpan** sebagai nilai persetujuan (bukan "tidak ada data").
- Checkbox ini **tidak** memengaruhi tombol bayar.

**Provenance:** S=`spec proaktif tambahan owner §3`, `t_fdba2939 brief A7`, `S0 kontrak §3` · A=A2 · O=CONSENT-1, OPTOUT-1

## C3. Yang disimpan saat tombol "bayar" ditekan (sebelum popup pembayaran)

| Field | Nilai | Sumber |
|---|---|---|
| identitas | nomor WhatsApp terverifikasi (hasil normalisasi server) | `src/lib/phone.ts:12-18` |
| `consent_type` | `terms` \| `reminder_whatsapp` | S0 kontrak §3 |
| `value` | `true`/`false` per checkbox (dua baris terpisah) | S0 kontrak §3 |
| `text_version` | versi teks yang benar-benar ditampilkan (mis. `«terms-…-v1»`) | S0 kontrak §3 · O=CONSENT-2 |
| `occurred_at` | timestamp server (bukan jam browser) | S0 kontrak §3 |
| `source` | halaman/titik UI asal persetujuan (mis. `checkout_step9`) | S0 kontrak §3 |

Aturan yang mengikat (dari kontrak, jangan disimpangkan):

1. Simpan **sebelum** popup pembayaran. Gagal simpan ⇒ tidak ada sukses palsu dan **tidak** lanjut bayar.
2. Retry lama (`occurred_at` lebih kecil) **tidak boleh menurunkan** status; `opt_out` yang lebih baru menang.
3. Membayar / pesan masuk / tap tombol / webhook **tidak pernah** menyalakan `opt_in`, dan **tidak**
   menghapus `opted_out`.
4. Nyalakan lagi hanya lewat event eksplisit yang lebih baru.
5. Nina membaca `opt_in=true AND opted_out=false` tepat sebelum kirim.

**Provenance:** S=`S0 kontrak §3,§8` · A=A1 · O=CONSENT-2

**Prasyarat belum ada:** kolom `users.opt_in`/`users.opted_out` + tabel `consent_events` **tidak eksis**
di skema mana pun (S0 B-2). Draft wording ini tidak boleh dipasang sebagai UI yang menjanjikan penyimpanan
sebelum migration consent lewat delta-review Sentinel.

## C4. Wording berhenti / penarikan kembali (withdrawal)

> **Berhenti dari pengingat.** Tekan tombol berhenti di pesan pengingat (langsung berhenti), atau balas
> `BERHENTI`/`STOP` — kami akan minta kamu mengetik `IYA` untuk konfirmasi, lalu berhenti.
> Setelah berhenti: tidak ada lagi pesan pengingat; kamu tetap bisa memakai layanan dan chat Nina kapan
> saja. Mau mulai lagi? Hubungi Customer Service.

**Provenance:** S=`spec proaktif §E`, `spec proaktif tambahan owner §1`, `S0 kontrak §8` · A=A2 · O=OPTOUT-1

## C5. Kontak & permintaan data (placeholder)

> Pertanyaan soal syarat, privasi, atau permintaan **hapus data**: Customer Service WhatsApp
> `wa.me/6287788141388` («JAM LAYANAN», «SLA»).

**Provenance:** S=`src/app/privacy/page.tsx:91-101` · A=— · O=KONTAK-1, DATA-2

## C6. Pola yang DILARANG (helper, sengaja ditulis eksplisit)

- Checkbox prepopulated/tercentang default — dilarang untuk dua-duanya.
- Satu checkbox gabungan ("saya setuju T&C **dan** menerima pengingat") — dilarang.
- "Dengan melanjutkan/membeli kamu dianggap setuju pengingat" — dilarang (implied consent).
- Menonaktifkan tombol bayar karena pengingat tidak dicentang — dilarang.
- Menyimpan nilai `false` sebagai "tidak ada baris" — dilarang (harus tersimpan).
- Menyalakan `opt_in` dari efek samping pembayaran/pesan masuk — dilarang.
- Dark pattern: menyembunyikan teks versi, atau tidak menautkan dokumen yang disetujui — dilarang.

**Provenance:** S=`S0 kontrak §3`, `t_fdba2939 brief A7` · A=— · O=CONSENT-1
