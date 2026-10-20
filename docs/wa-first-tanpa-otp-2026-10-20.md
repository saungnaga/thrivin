# WA-first TANPA OTP — lookup status nomor (2026-10-20)

**Dibuat:** 2026-10-20
**Tags:** #thrivin #wa-first #checkout #privasi
**Links:** [[../../index]] · [[../security/README]]

## Keputusan owner (verbatim, 20/10)

> "Gausah pake otp an. WA di awal cuma buat cek di database aja ntar, itu no baru, apa pengguna
> aktif, apa pengguna non-aktif."

Kartu OTP (`t_f940cc27`, branch `feat/otp-cloud-2026-10-20`) **dibatalkan**, tidak di-merge.
`wa_otp_challenges` masih ada di produksi tapi **tidak dipakai**; tidak di-drop (nol migrasi
destruktif).

## Alur baru

```
[UI /companion/nina/status]
   nomor WhatsApp
        │  POST /api/wa/session/request { phone }
        ▼
[route] normalizePhone → rate limit (20/IP, 5/nomor per menit)
        │
        ├─ invalid → 400
        ├─ limit   → 429
        ▼
[RPC subscription_status_for_owner(p_phone)]   (service_role, server-side)
        │
        ▼  {state, expires_at, last_plan_key}
[lib/wa-status.ts buildWaLookupPayload]
        │
        ├─ state=none     → {ok, status:"new"}
        ├─ state=active   → {ok, status:"active",   planName:null, daysLeft}
        └─ state=expired  → {ok, status:"inactive", daysSinceExpiry, renewalPromo}
        │
        └─ + cookie `thrivin_wa_session` (HMAC, httpOnly, 60 menit)
```

`renewalPromo` = `now - expires_at > 7×24 jam` (tepat 7×24 jam = **belum** promo → TEMENANLAGI
diskon 20% baru muncul setelahnya).

UI: tiga cabang — baru → onboarding; aktif → "sisa N hari" + CTA perpanjang; non-aktif →
"berakhir N hari lalu" (+ penawaran TEMENANLAGI kalau `renewalPromo`). Input kode OTP, hitung
mundur, dan "kode sudah dikirim" dihapus.

Gate checkout **tidak berubah**: `POST /api/scalev/create-order` tetap butuh cookie sesi
(`SESSION_REQUIRED` 401) dan `cleanPhone === sessionPhone` (`PHONE_SESSION_MISMATCH` 403).

## Yang berubah (file)

| File | Perubahan |
|------|-----------|
| `src/app/api/wa/session/request/route.ts` | OTP issuance → lookup status + terbitkan sesi |
| `src/lib/wa-status.ts` | **baru** — pemetaan RPC → payload publik (murni, unit-tested) |
| `src/app/api/wa/session/verify/route.ts` | **dihapus** (route + alurnya) |
| `src/app/companion/nina/status/page.tsx` | UI tiga cabang, tanpa input kode |
| `src/app/api/scalev/create-order/route.ts` | komentar + pesan sesi: lookup, bukan OTP |
| `.env.example` | `WA_OTP_*` ditandai DEPRECATED |
| `tests/test-wa-first-units.mts` | + pemetaan tiga status, batas 7 hari, rate limit |
| `tests/test-wa-first-e2e.mts` | ditulis ulang: lookup, privasi, sesi, fail-closed |

`planName` selalu `null`: RPC hanya mengembalikan `last_plan_key` (month/quarter/half/year),
bukan nama tampilan. Jangan diisi tebakan — tunggu katalog resmi.

## Risiko yang DITERIMA (harus dibaca Sentinel)

1. **Enumerasi nomor.** Tanpa OTP, siapa pun bisa mengetik nomor dan tahu apakah nomor itu
   terdaftar, aktif, atau sudah berakhir — plus sisa/umur masa aktifnya. Ini kebocoran
   *keberadaan* akun, bukan isi profil. Mitigasi yang sudah ada: payload minimal (nol nama,
   profil, `subscription_id`, `token_limit`, nomor terformat), `Cache-Control: no-store`, rate
   limit 5/nomor + 20/IP per menit.
2. **Sesi bukan bukti kepemilikan.** Cookie `thrivin_wa_session` hanya membuktikan "nomor ini
   pernah dicari dari browser ini". Gate checkout mengikat satu order ke nomor yang baru
   diketik, bukan ke pemilik nomor. Konsekuensi: orang yang tahu nomor korban bisa membuat order
   atas nomor itu (tanpa bisa membaca profilnya).
3. **Rate limit per-proses.** In-memory; kalau app dijalankan >1 instance, batas jadi per
   instance. Naikkan ke Redis sebelum scale-out.

## Kalau owner berubah pikiran (mitigasi, urut biaya)

1. **Balas seragam untuk nomor tidak dikenal** — sudah begitu (`new`), tapi status aktif/nonaktif
   tetap berbeda; menutup celah ini berarti membuang fitur yang diminta owner.
2. **Tambah OTP lagi hanya untuk aksi berisiko** (perpanjang/klaim promo), bukan untuk cek
   status. Route `verify` bisa dihidupkan kembali dari branch OTP lama (`f29eb7b`) — tapi jangan
   merge branch itu apa adanya (isinya juga transport Cloud API yang belum di-review).
3. **CAPTCHA / proof-of-work** di endpoint lookup kalau ada pola enumerasi (log 429 sudah jadi
   sinyal).
4. **Batas per-IP lebih ketat + alert** kalau satu IP menyapu banyak nomor berbeda.
5. **Hapus/expire cookie sesi lebih cepat** (mis. 15 menit) untuk mempersempit jendela order atas
   nomor orang lain.

## Verifikasi

```
node --experimental-strip-types tests/test-wa-first-units.mts
bash tests/run-all.sh
```

Bukti gigi: hapus `phoneLimit` di route (atau `buildWaLookupPayload` → selalu `new`) ⇒ unit/e2e
FAIL. Suite e2e lama yang menguji OTP sudah tidak ada (route-nya dihapus).
