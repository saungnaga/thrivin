# W3 — WA-first: identitas, status langganan, eligibility perpanjangan

**Kartu:** `t_86bf9739` (root `t_fdba2939`) · **Assignee:** Forge · **Tanggal:** 2026-10-15
**Status:** ✅ implementasi + suite lokal hijau · ⛔ **blocked-live** (mock/staging saja) ·
**gerbang:** audit Sentinel `t_a498a912` sudah keluar (**AMAN DENGAN CATATAN**, 0 veto, belum boleh apply);
temuan F-1/F-2/F-4 diremediasi di `t_ee4d66c7` (§9) → **menunggu re-check Sentinel**

---

## 1. Ringkas

Slice vertikal WA-first: pengguna memasukkan nomor WhatsApp → kode verifikasi (OTP) →
sesi server terikat nomor → **hanya setelah terbukti** baru status langganan dibaca dan
ditampilkan (`none` / `active` / `expired`), lengkap dengan sisa masa aktif + CTA
perpanjangan, dan kandidat promo reaktivasi untuk yang non-aktif > 7×24 jam.

Tidak ada data pelanggan yang disentuh, tidak ada DB staging/produksi yang ditulis, tidak
ada outbound WhatsApp, tidak ada deploy/push ke `main`. OTP dikirim lewat **provider mock**
yang hanya menulis ke file sink lokal untuk keperluan tes.

## 2. Titik berangkat (base kerja)

| Hal | Nilai |
|---|---|
| Base wajib (kontrak S0) | `9392cdd` (`release/rc-integration-2026-10-13`) — **bukan** `origin/main` (`1d54a36`) |
| Promo existing | `promo-ws` @ `f456d0f` (`feat/promo-management`) di-*fetch* sebagai **base branch** (descendant bersih dari `9392cdd`); memberi `admin-auth.ts`, `promo.ts`, `promo_codes` + RPC `redeem_promo`, dashboard admin |
| Branch kerja | `feat/wa-first-2026-10-15` |
| Worktree | `/home/ubuntu/workspaces/thrivin/batch-2026-10-15/w3-wa-first` (worktree bersama `repo` tidak diubah) |
| Kontrak | `batch-2026-10-15/s0-security/integration-contract.md` (§1, §4, §5, §9, §11) |

## 3. Yang dibangun

### Server (baru)
| Berkas | Isi |
|---|---|
| `staging/schema-wa-identity.sql` | **DRAFT** (belum di-apply ke mana pun): tabel `wa_otp_challenges` (RLS deny + grant eksplisit) + 3 RPC: `create_wa_otp_challenge`, `verify_wa_otp_challenge`, `subscription_status_for_owner`. Semua `SECURITY INVOKER`, `REVOKE … FROM PUBLIC, anon, authenticated`, `GRANT` hanya `service_role`. |
| `src/lib/wa-session.ts` | Sesi pelanggan HMAC (pola `admin-auth.ts`): cookie `thrivin_wa_session`, env `WA_SESSION_SECRET`/`WA_SESSION_EPOCH`, TTL 60 menit, `httpOnly` + `sameSite=strict` + `secure` di produksi. **Terpisah** dari secret & cookie admin. |
| `src/lib/otp.ts` | Kode 6 digit dari `crypto.randomInt`; yang disimpan hanya `HMAC-SHA256(phone:code, WA_OTP_SECRET)`; TTL/batas percobaan/batas resend ditegakkan di RPC atomik; gagal-tertutup tanpa secret. |
| `src/lib/otp-provider.ts` | Transport OTP **satu pintu**, sekarang hanya `mock` (`WA_OTP_PROVIDER=mock`). Provider lain → `null` → endpoint menjawab 503 generik. Tidak ada panggilan Graph/Baileys. **Mock DITOLAK saat `NODE_ENV=production`** (F-2) kecuali pintu darurat eksplisit `WA_OTP_MOCK_ALLOW_IN_PRODUCTION=1` yang hanya dipakai harness; file sink ditulis mode 0600. |
| `src/lib/subscription-lookup.ts` | Panggil RPC sempit; error upstream **melempar** (pemanggil tidak boleh menganggap "nomor baru"). |
| `src/lib/renewal.ts` | Eligibility dari `expires_at` (`now - expires_at > 168 jam`, strictly greater ⇒ **tepat 7 hari = tidak eligible**); kandidat dibaca dari `promo_codes` (satu-satunya sumber); katalog harga dari `PLAN_CATALOG`. |
| `src/lib/session-secret.ts` | `isWeakSecret`/`safeEqual` dipindah dari `admin-auth.ts` supaya bisa dipakai bersama tanpa menyeret runtime Next. **Tanpa perubahan perilaku**; `admin-auth.ts` mengimpor + re-export dari sini. |
| `src/app/api/wa/session/request/route.ts` | Normalisasi server-side (`62…`), invalid → 400, jawaban **generik identik** untuk semua nomor, throttle IP+nomor (`limitRequest`), jawaban 503 generik kalau transport/DB mati. |
| `src/app/api/wa/session/verify/route.ts` | Verifikasi single-use server-side → cookie sesi; semua kegagalan memakai satu pesan. |
| `src/app/api/wa/session/route.ts` | `DELETE` = akhiri sesi (buang cookie). |
| `src/app/api/wa/subscription/route.ts` | Sesi → RPC sempit → `{state, expiresAt, remainingMs, lastPlanKey, maskedPhone, renewal, renewalActivationEnabled:false}`. Nomor **hanya** dari sesi; query/body tidak pernah dipakai untuk memilih nomor. Upstream error → 503 **tanpa** field `state`. |
| `src/app/companion/nina/status/{page,layout}.tsx` | UI 3 langkah (nomor → kode → status); label eksplisit, `inputMode=numeric`, `type=tel`, `autocomplete=one-time-code`, `aria-live`, target sentuh ≥ 44px, responsif; CTA perpanjangan hanya muncul di layar status. |

### Test (baru)
| Berkas | Isi |
|---|---|
| `tests/test-wa-first-units.mts` | 15 check murni: batas eligibility (±1 ms di 168 jam), normalisasi nomor, hash OTP, sesi (epoch/kedaluwarsa/secret lemah), katalog. |
| `tests/test-wa-first-e2e.mts` | 118 check: Next.js produksi → HTTP → PostgREST → Postgres lokal + provider OTP mock (12 seksi, lihat §5). |
| `tests/harness/seed.sh` | + `005-wa-identity.sql` (disalin otomatis dari `staging/`) |
| `tests/run-all.sh` | + unit WA-first (langkah 2) + `test-wa-first-e2e.mts` (langkah 7/7) |

## 4. Kepatuhan ke kontrak S0 (yang paling mudah dilanggar)

| Aturan | Implementasi | Bukti |
|---|---|---|
| Normalisasi server-side, tanpa substitusi nomor default | `normalizePhone()`, invalid → 400 | `privasi: nomor tidak valid -> 400` |
| Respons generik sebelum bukti kepemilikan | satu literal `GENERIC_OK` untuk semua nomor | `privasi: bentuk body IDENTIK untuk nomor ada vs tidak ada` |
| Challenge server-side: hashed-at-rest, single-use, TTL, batas percobaan/resend | RPC atomik + `FOR UPDATE`; kuota/jam dihitung dari baris tercatat + `pg_advisory_xact_lock` per nomor | `otp: kode yang sama TIDAK bisa dipakai dua kali`, `otp: percobaan habis -> 429`, `kuota-http: HANYA 5 kode dalam satu jam (default app), bukan 6 — dan bukan 60` (lihat §9 F-1) |
| Binding sesi ke nomor terverifikasi | payload = nomor; lookup hanya dari cookie | `swap: data … tetap milik nomor SESI`, `swap: kode milik nomor lain tidak bisa ditukar` |
| Secret & cookie terpisah dari admin | `WA_SESSION_SECRET` + `thrivin_wa_session` | `sesi: cookie ADMIN tidak diterima di endpoint pelanggan` |
| **Tidak** memakai `check_subscription()` | RPC sempit baru | `rpc: jawaban hanya 3 field`, `rpc: jalur BACA tidak mengubah status di DB` |
| Least privilege RPC | `REVOKE` anon/authenticated, `GRANT` service_role; harness meniru default privilege Supabase | `rpc: anon DITOLAK (401/403)` |
| Fail closed saat upstream mati | 503 tanpa `state` | `fail-closed: DB mati -> 503`, `… tanpa field state` |
| Promo: mekanisme existing, tanpa ledger/endpoint kedua, tanpa aktivasi | kandidat dibaca dari `promo_codes`; `renewalActivationEnabled:false` | `promo: NOL baris redemption`, `promo: aktivasi reaktivasi ditahan` |
| Tepat 7×24 jam tidak eligible | `> 168 jam` (strict) | `boundary: TEPAT 7 hari = TIDAK eligible`, `boundary: 7 hari + 30 detik -> eligible` |
| Nomor allowlist admin tidak mem-bypass | gate langganan tidak pernah melihat `NINA_ADMIN_PHONES` | `admin: nomor di NINA_ADMIN_PHONES tetap dievaluasi normal` |
| Harga tidak pernah dari client | katalog server | `promo: harga tetap katalog server walau client mengirim amount/promo_code` |

## 5. Hasil suite (dijalankan nyata, bukan klaim)

```
bash tests/run-all.sh
  → 16/16 unit WA-first
  → 136/136 WA-first e2e
```
(lengkap dengan suite existing: unit, guards, promo SQL, webhook e2e, promo e2e — exit 0 / ALL SUITES PASSED)

Seksi e2e: (1) privasi nomor telanjang & batas laju · (2) race 3 permintaan paralel =
1 challenge hidup · (3) OTP abuse (salah, bentuk ngawur, habis percobaan, rotasi kode,
replay, 3 verifikasi paralel = 1 lolos, kedaluwarsa) · (4) resend/cooldown server-side ·
(5) binding/swap/pemalsuan token/epoch/pemisahan dari admin · (6) batas aktif/none/
expired/kandidat · (7) promo tamper & nol aktivasi · (8) admin vs non-admin ·
(9) RPC sempit (anon ditolak, jalur baca tidak menulis) · (10) gagal-tertutup (DB mati,
transport tidak diotorisasi, **mock ditolak di produksi**) · (10b) **kuota per jam lewat
jalur HTTP dengan default app** (menunggu 61 s jendela batas laju) · (11) markup UI
keyboard/mobile · (12) log bebas kode OTP & nomor mentah · (6b) **format nomor `users`
(`+62…`/`0812…`/berspasi)**.

## 6. Blocker & yang SENGAJA belum dikerjakan (blocked-live)

1. **Provider OTP nyata belum ada.** `WA_OTP_PROVIDER` selain `mock` → 503 (gagal-tertutup).
   Transport resmi satu pintu `sendWhatsApp()` ada di worktree `channel-sender-ws`
   (`d7b5527`, belum di RC); allowlist/transport OTP masih `open_decisions` owner.
   Menyambungkannya = keputusan owner + review.
2. **`staging/schema-wa-identity.sql` belum di-apply** ke staging maupun produksi.
   Hanya dijalankan di DB harness lokal (data dummy, sekali pakai) agar jalur nyata teruji.
   Wajib **delta-review Sentinel** (permukaan API baru: tabel + 3 RPC).
3. **TEMENANLAGI tidak dibuat dan tidak diaktifkan** (`t_7bcb4487` masih blocked).
   Endpoint status menyatakan `renewalActivationEnabled: false`; kalau baris promo-nya
   belum ada, UI **tidak** menampilkan angka apa pun (tidak mengarang persentase).
4. **Lookup langganan live belum diverifikasi** — RPC diuji terhadap skema harness yang
   meniru `db-tables.sql`/`db-functions.sql`; runtime Nina produksi tidak dapat dijangkau
   dari host kantor (`blocked-live`, verifikasi read-only menyusul di N1/N2/Q1).
5. **Batas yang jujur ditulis**: `limitRequest` in-process per instance (bukan pengaman
   multi-instance); sesi stateless (cabut semua = naikkan `WA_SESSION_EPOCH`); UI diuji di
   level markup — harness tidak punya browser headless, jadi "keyboard/mobile" dibuktikan
   lewat atribut aksesibilitas + alur form, bukan simulasi ketukan di perangkat.
6. **Tidak menyentuh jalur uang**: tidak ada perubahan `create-order`/webhook/`promo.ts`;
   tidak ada aktivasi langganan dari slice ini (itu `t_f5ec336c`).

## 7. Perubahan pada kode existing (perlu ikut dibaca reviewer)

- `src/lib/admin-auth.ts`: `isWeakSecret` + `safeEqual` dipindah ke `src/lib/session-secret.ts`
  (dipakai bersama sesi pelanggan) dan di-*re-export* dari sini — API publik tidak berubah,
  logika tidak berubah. Perubahan ini perlu karena `admin-auth.ts` mengimpor `next/headers`
  sehingga tidak bisa dimuat tes node murni.
- `tests/harness/seed.sh`, `tests/run-all.sh`: menambah migrasi 005 + suite WA-first.

## 8. Bukti & link

- Commit: `25050ec` di branch `feat/wa-first-2026-10-15` (worktree `batch-2026-10-15/w3-wa-first`)
- Kontrak: `~/workspaces/thrivin/batch-2026-10-15/s0-security/integration-contract.md`
- Review S0: `~/workspaces/thrivin/batch-2026-10-15/s0-security/report.md`
- Laporan ini + `evidence.json`: `~/workspaces/thrivin/batch-2026-10-15/w3-wa-first/`
- Catatan vault: `~/obsidian/kantor-ai/projects/thrivin/features/wa-first-2026-10-15.md`

### Hasil gate penuh (`bash tests/run-all.sh`, exit 0 — ALL SUITES PASSED)

| Suite | Hasil |
|---|---|
| unit remediation | 27/27 |
| unit WA-first (baru) | 16/16 |
| guard checks (redaksi/replay) | pass |
| promo SQL (redeem atomik, kuota, race) | 44/44 |
| webhook e2e | 57/57 |
| promo e2e (dashboard/checkout/webhook) | 113/113 |
| **WA-first e2e (baru)** | **136/136** |

## 9. Tindak lanjut audit W3 (RX) — `t_ee4d66c7`

Audit Sentinel `t_a498a912`: **AMAN DENGAN CATATAN**, 0 veto, belum boleh apply. Temuan yang
dikerjakan di sini: **F-1, F-2, F-4** + refresh klaim `resend_limit`. (F-3 & F-5 tetap item
pasca-apply.) Tidak ada fitur baru, tidak ada apply SQL, tidak ada push/deploy.

### F-1 — kuota OTP per jam mati di jalur app (MEDIUM)
Akar masalah: kuota dihitung dari baris hidup (`consumed_at IS NULL`) sementara jalur tulis
memakai UPSERT → baris hidup selalu 1 → `resend_limit` hanya bisa tercapai bila
`p_max_per_hour ≤ 1`. Batas nyata = cooldown 60 s (sampai **60 OTP/jam/nomor**, 12× niat 5/jam).

Fix di `staging/schema-wa-identity.sql` (`create_wa_otp_challenge`):
1. kuota dihitung dari **setiap baris** dalam 1 jam terakhir (status apa pun);
2. baris hidup lama **ditutup** (`consumed_at = now()`), lalu baris **baru** dicatat — tiap
   penerbitan terhitung, dan invariant "satu challenge hidup per nomor" tetap dijaga oleh
   unique partial index;
3. `pg_advisory_xact_lock(hashtext(tenant:phone))` men-serialisasi permintaan paralel
   (sebelumnya serialisasi kebetulan datang dari `ON CONFLICT` yang kini tidak dipakai).

Uji baru lewat **jalur HTTP** (bukan RPC langsung), instance **tanpa** `WA_OTP_MAX_PER_HOUR`
→ nilai **default app = 5**: 6 permintaan ke `POST /api/wa/session/request` (3, tunggu jendela
batas laju 61 s, 3 lagi) → tepat **5 kode**, 5 baris tercatat, 1 challenge hidup, ke-6 tetap
dijawab 200 generik (batas tidak dibocorkan).

Bukti uji **GAGAL di kode pra-fix** (`git stash push staging/schema-wa-identity.sql` +
`seed.sh --fresh` → `node --experimental-strip-types tests/test-wa-first-e2e.mts`):
**130/136, exit 1** — `expected 5, got 6` (kode terkirim) dan `expected 5, got 1` (baris
tercatat) ⇒ kontrol memang tidak efektif sebelum fix. Log `/tmp/w3rx-prefix-e2e.log`.

### F-2 — mock lolos di produksi (LOW)
`getOtpProvider()` sekarang **menolak mock saat `NODE_ENV=production`** (log error keras,
gagal-tertutup) kecuali pintu darurat eksplisit `WA_OTP_MOCK_ALLOW_IN_PRODUCTION=1` yang
**hanya** dipakai harness yang menjalankan build produksi. `.env.example` tidak lagi mengirim
`WA_OTP_PROVIDER=mock` sebagai nilai aktif (jadi komentar + larangan didokumentasikan), dan
file sink mock ditulis mode `0600`.

Uji: unit (gerbang `NODE_ENV`) + e2e instance produksi **tanpa** pintu darurat → 503 generik,
**file sink tidak dibuat sama sekali** (nol kode OTP/nomor mentah ke disk), nol challenge
diterbitkan. Pra-fix: unit FAIL (`mock lolos di produksi tanpa pintu darurat`) dan e2e
`expected 503, got 200` dengan body "kode verifikasi sudah dikirim" + sink tertulis
(log `/tmp/w3rx-prefix-units.log`, `/tmp/w3rx-prefix2-e2e.log`).

### F-4 — format `users.phone` (LOW, pra-apply)
Query **READ-ONLY** ke **staging** (Supabase Management API, token scoped staging — `GET
/v1/projects` hanya menampilkan `thrivin-staging`), hanya `SELECT` agregat tanpa nilai mentah:

| Metrik | Nilai |
|---|---|
| `total_users` | 5 |
| `phone_null` | 0 |
| `fmt_62_ok` (`^62[0-9]{8,13}$`) | **0** |
| `fmt_plus62` (`^\+62`) | **5** |
| `fmt_leading_zero` / non-digit / butuh trim | 0 / 0 / 0 |

Sample termask: `+628****01 … +628****05` (len 13). **Kesimpulan: 5/5 baris staging
tersimpan `+62…`** — predikat lama `phone = '628…'` tidak pernah cocok, jadi pelanggan lama
akan terbaca `none` (layar "Belum ada langganan" padahal aktif). Format **campuran** bila
dibandingkan konvensi app (`62…`) ⇒ normalisasi ditambahkan.

Fix di RPC (tanpa menyentuh data): bandingkan **digit saja** —
`regexp_replace(phone,'[^0-9]','','g') IN (p_phone, '0' || substring(p_phone from 3))` →
`+62…`, `62…`, `0812…`, spasi/dash semuanya cocok. Uji menambah baris dummy `+62…`, `0812…`,
dan berspasi → ketiganya terbaca `active` lewat sesi `62…`; pra-fix ketiganya `none`.
Catatan performa: predikat ini **seq scan** (tidak memakai `users_phone_key`) — ganti ke
index ekspresi/normalisasi data saat `users` membesar (dicatat sebagai `ponytail` di SQL).

### Evidence `resend_limit` (refresh)
Klaim lama ("`resend: … resend_limit`") hanya benar untuk pemanggilan RPC dengan
`p_max_per_hour = 1`. Klaim yang berlaku sekarang: **kuota per jam ditegakkan lewat jalur HTTP
dengan default app (5) → maksimal 5 kode/jam/nomor**, dan batas tetap tidak dibocorkan ke klien.

### Batas klaim baru (jujur)
- Pintu darurat `WA_OTP_MOCK_ALLOW_IN_PRODUCTION=1` **wajib tidak ada** di env staging/produksi
  saat apply (default = mock ditolak).
- Baris `wa_otp_challenges` kini menumpuk (satu baris per penerbitan) → butuh **purge terjadwal**
  saat apply (dicatat di SQL + `evidence.json`).
- F-3 (regex nomor lebih ketat di 3 tempat) & F-5 (INFO) **tidak** dikerjakan di sini — item
  pasca-apply sesuai keputusan audit.

