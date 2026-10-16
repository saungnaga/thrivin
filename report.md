# W4 — Gate completion checkout server-side + consent T&C/opt-in + publish `/terms`

**Kartu:** `t_f5ec336c` (root `t_fdba2939`) · **Assignee:** Forge · **Tanggal:** 2026-10-16 (r3 2026-10-17)
**Status:** ✅ implementasi + suite hijau (`run-all.sh` 3× berturut) · ✅ migrasi consent
**di-apply ke STAGING** (batch, bukan produksi) + readback · ✅ **F-W4-1 opsi (a)** diimplementasi ·
⛔ **review-required (delta-review 3, Sentinel)** · **belum merge / belum deploy produksi** ·
base kerja **`9392cdd`** (RC) + W3 head `e01a27a`

---

## 1. Ringkas

Tiga hal dikerjakan di kartu ini:

- **A2 — completion punya rumah di server.** Sebelum ini "selesai" hanya berarti
  `localStorage` di browser dan `create-order` menerima `onboarding` / `amount` /
  `planName` / `customerName` dari body (S0 B-5, B-2). Sekarang langkah 2–8 disimpan
  server-side per nomor sesi, dan `create-order` memutuskan kelengkapan **sebelum**
  efek samping eksternal apa pun. Gate gagal ⇒ nol panggilan Scalev, nol order, nol
  sukses palsu.
- **A7 — dua persetujuan terpisah, disimpan sebelum popup bayar.** T&C wajib, opt-in
  pengingat opsional; dua checkbox mulai tidak tercentang; gagal simpan ⇒ tidak lanjut
  bayar. Status efektif di `users.*`, bukti append-only di `consent_events`.
- **A6 — publikasi teks yang sudah disetujui owner (ACC 16/10).** `/terms` + delta
  `/privacy` + link dari footer, halaman checkout, dan sitemap.

Tidak ada data pelanggan yang disentuh, tidak ada Scalev nyata (mock lokal), tidak ada
outbound WhatsApp, tidak ada push/merge ke `main`, tidak ada deploy produksi. Migrasi consent
**sudah di-apply ke staging** (batch, readback §6c) atas perintah operator batch.

## 2. Base kerja & workspace

| Hal | Nilai |
|---|---|
| Base wajib (kontrak S0) | `9392cdd` (`release/rc-integration-2026-10-13`) — **bukan** `origin/main` |
| Ditumpuk di atas | W3 head `e01a27a` (`feat/wa-first-2026-10-15`) — sesi WA HMAC yang dipakai gate |
| Branch | `feat/checkout-consent-gate-2026-10-15` |
| Worktree | `/home/ubuntu/workspaces/thrivin/batch-2026-10-15/w4-consent-gate` (worktree bersama tidak diubah) |
| Kontrak | `batch-2026-10-15/s0-security/integration-contract.md` §2 (completion) + §3 (consent) |

## 3. Yang dibangun

### Server (baru)

| Berkas | Isi |
|---|---|
| `src/lib/onboarding-steps.ts` | Definisi langkah wajib 2–8 + validasi per langkah + perakitan profil dari data tersimpan. Validasi memakai konstanta `validate-onboarding.ts` (satu sumber aturan). |
| `src/lib/checkout-gate.ts` | Pembungkus RPC: `save_onboarding_step`, baca `onboarding_progress`, `claim_checkout_order`, `complete_checkout_claim`, `release_checkout_claim`, plus `authoritativeProfile()` (nomor profil wajib = nomor sesi). |
| `src/lib/consent.ts` | Penulisan consent di server: T&C wajib, `reminderOptIn=false` **tetap disimpan**, versi teks tak dikenal ditolak, timestamp dari `now()` RPC. Tanpa store ⇒ **fail closed**. |
| `src/lib/legal.ts` | Fakta + versi dokumen (owner ACC 16/10): entitas, CS WA `6287788141388` 09.00–21.00 WIB, yurisdiksi Indonesia, retensi, `TERMS_VERSION=terms-2026-10-15-v1`. Tanpa impor Node supaya bisa dipakai komponen klien. |
| `src/app/api/onboarding/progress/route.ts` | Simpan SATU langkah per nomor sesi; langkah 8 dengan nomor ≠ sesi ⇒ 409 `SESSION_PHONE_MISMATCH`; isi langkah tidak valid ⇒ 400 `INVALID_STEP_DATA`. |
| `src/app/api/consent/route.ts` | Simpan consent (identitas dari cookie sesi, nomor body diabaikan); `termsAccepted !== true` ⇒ 400; tanpa sesi ⇒ 401. |
| `staging/schema-consent.sql` | **Draft → ✅ di-apply ke staging (batch) ronde 3**: kolom `users.opt_in`/`opted_out`, tabel `consent_events` (append-only via trigger; unique idempotensi; status efektif = event terbaru; opt-out menang saat seri), `onboarding_progress`, `checkout_claims` (+ `paid_at`, unique parsial in-flight per nomor, reuse/blokir F-W4-1), RPC `record_consent_event`, `record_checkout_consent`, `save_onboarding_step`, `claim_checkout_order`, `complete_checkout_claim`, `release_checkout_claim`, `mark_checkout_claim_paid`, `purge_expired_onboarding_progress`. Semua `SECURITY INVOKER`, `REVOKE` dari `PUBLIC, anon, authenticated`, `GRANT` hanya `service_role`. Idempotent. |

### Server (diubah)

`src/app/api/scalev/create-order/route.ts` — urutan baru, semuanya **sebelum** Scalev:

1. kunci idempotensi wajib (≥8 char) ⇒ 400 `IDEMPOTENCY_KEY_REQUIRED`;
2. sesi WA wajib ⇒ 401 `SESSION_REQUIRED`; nomor body ≠ nomor sesi ⇒ 403 `PHONE_SESSION_MISMATCH`;
3. `claim_checkout_order` (atomik) ⇒ `incomplete_onboarding` 400 · `consent_required` 400 ·
   `in_flight` 409 · `error` 503 `GATE_UNAVAILABLE` · `already_created` ⇒ **200 replay**
   (order yang sama, tanpa panggilan Scalev kedua);
4. profil otoritatif dirakit dari langkah tersimpan + divalidasi ulang (400 `INVALID_ONBOARDING`);
5. harga/paket dari katalog & variant server (`resolvePlanPrice`, `lookupVariant`);
   `body.amount` / `body.planName` / `body.onboarding` / `body.customerName` **diabaikan**.

### UI

`src/app/companion/nina/onboarding/[step]/page.tsx` — dua checkbox terpisah
(`consent-terms`, `consent-reminder`) mulai **tidak** tercentang, label eksplisit +
`aria-describedby` + focus ring, tombol bayar `disabled` sampai T&C dicentang;
`/api/consent` dikirim **sebelum** `/api/scalev/create-order`; langkah 2–8 dikirim ke
`/api/onboarding/progress` (peringatan bila gagal — gate server tetap yang menentukan);
`checkoutKeyRef` = satu kunci per halaman supaya klik ganda = replay.

Publikasi A6: `src/app/terms/page.tsx` (baru), `src/app/privacy/page.tsx` (delta
disetujui), `src/components/Footer.tsx` + `src/app/sitemap.ts` (link `/terms`).

## 4. Kepatuhan ke kontrak S0 (yang paling mudah dilanggar)

| Aturan §2/§3 | Implementasi | Bukti uji |
|---|---|---|
| Completion dari data server, bukan body | kelengkapan dibaca dari `onboarding_progress`; `body.onboarding` tidak pernah dibaca | `langkah belum lengkap ⇒ 400`, `data tersimpan tidak valid ⇒ 400`, `nol panggilan order ke Scalev pada semua kegagalan gate` |
| Harga/paket tidak dari client | `PLAN_CATALOG` + variant server | `total yang akan ditagih = harga katalog server (bukan angka klien)`, `body klien tidak bocor ke Scalev` |
| Race & replay | klaim single-flight per kunci; replay mengembalikan order SAMA | `tiga permintaan paralel dengan kunci sama ⇒ satu order`, `replay mengembalikan order_id SAMA`, `replay TIDAK membuat order baru` |
| Versi/expiry/session binding | T&C versi wajib tersimpan; sesi HMAC (cookie & secret terpisah dari admin) | `belum ada consent T&C ⇒ 400`, `sesi kedaluwarsa ⇒ 401`, `sesi dipalsukan ⇒ 401 (fail closed)` |
| Allowlist admin tidak mem-bypass | gate tidak pernah melihat `NINA_ADMIN_PHONES` | `nomor allowlist admin tetap kena gate` |
| Dua consent terpisah, awal kosong | `useState(false)` ×2, `htmlFor`/`aria-describedby` | 13 check markup + `tidak ada checkbox yang di-precheck` |
| `opt_in=false` tetap tersimpan & tidak menghalangi bayar | `p_reminder_value=false` ditulis; checkout pada nomor itu tetap 200 | `pengingat ditolak ⇒ opt_in false`, `menolak pengingat BUKAN opt-out`, `nilai false tetap disimpan sebagai baris`, `checkout sah ⇒ 200` |
| Opt-out menang; retry lama tidak menyalakan ulang | trigger + status dari event terbaru | `setelah BERHENTI ⇒ opted_out true`, `retry lama (occurred_at lebih tua) tidak menyalakan opt_in`, `opt-out tetap menang`, `replay kunci lama (idempotent) tidak menghapus opt-out` |
| Gagal simpan ⇒ tidak ada sukses palsu | `/api/consent` non-200 ⇒ UI berhenti sebelum order | `store consent tak tersedia ⇒ 503`, `gate tidak bisa diverifikasi ⇒ 5xx (tidak lanjut)`, `T&C tidak dicentang ⇒ 400 (bukan cuma tombol mati)`, `consent tanpa sesi ⇒ 401` |
| Bukti append-only | trigger menolak UPDATE/DELETE | `append-only: UPDATE/DELETE ditolak trigger` |
| Least privilege | `REVOKE` anon/authenticated + `GRANT` service_role; harness meniru default privilege Supabase | `anon/authenticated ditolak` (SQL suite) |

## 5. Regresi yang ditemukan & diperbaiki di kartu ini (jalur uang)

1. **Klaim gate tidak dilepas saat promo ditolak (BUG, ditemukan oleh suite).**
   `/api/scalev/create-order` jalur `PROMO_*` (kuota habis / kode sudah dipakai / nomor
   sudah pakai) mengembalikan 400 **tanpa** melepas klaim `in_flight` → nomor pelanggan
   terkunci `TTL` 10 menit: checkout ulang dijawab 409 `ORDER_IN_FLIGHT` padahal tidak ada
   order apa pun. Akar: klaim diambil sebelum klaim kuota promo, dan jalur tolak itu lupa
   melepas. Fix + 2 asersi regresi di `tests/test-promo-e2e.mts`.
2. **Scalev 200 tanpa `order_id`** meninggalkan klaim `in_flight` selamanya (nomor terkunci).
   Sekarang: klaim **dilepas** + log error (bukan diam-diam mengunci).
3. **Asersi race lama flaky.** "Dua kunci berbeda paralel untuk satu nomor ⇒ satu order"
   kadang 1, kadang 2 order: klaim in-flight hanya menahan permintaan yang benar-benar
   bersamaan, sedangkan kunci **baru** memang percobaan beli baru (perilaku itu diuji
   eksplisit di kasus "pembelian ulang" di suite yang sama). Diganti asersi invariant yang
   benar-benar dijamin (≥1 × 409 dari klaim in-flight; tidak semua permintaan mencetak
   order) pada 4 permintaan paralel, dan celahnya ditulis sebagai temuan **F-W4-1**.

## 6. Hasil suite (dijalankan nyata) + bukti negatif

### Gate penuh, `bash tests/run-all.sh` → **ALL SUITES PASSED** (exit 0)

| Suite | Hasil (ronde 3) |
|---|---|
| unit remediation | 27/27 |
| unit WA-first | 16/16 |
| **unit consent/checkout** | **44/44** |
| **legal draft shape** | **121/121** (kini assert persis 1 placeholder alamat di legal.ts, 0 di templates) |
| promo SQL (redeem atomik/kuota/race) | 44/44 |
| **consent/checkout SQL** | **64/64** (+20 asersi F-W4-1; sudah termasuk anon INSERT/UPDATE, key_conflict, tie-break, purge) |
| webhook e2e | 61/61 (+3: webhook → `paid_at`) |
| promo e2e | 116/116 (F-S2 invariant race diperbaiki + asersi F-W4-1 pada retry) |
| WA-first e2e | 136/136 |
| **consent/checkout e2e** | **128/128** (+18: F-W4-1(a) reuse/409/TTL/pembelian ulang setelah lunas) |

Log: `bash tests/run-all.sh` **ALL SUITES PASSED 3× berturut-turut** di salinan bersih
(`/tmp/w4f1-runall-1..3.log`, ringkasan `/tmp/w4f1-runall3.out`), DB & port terisolasi per run
(`HARNESS_PG_DB=thrivin_w4f1`, postgrest 54641/54642, app/mock unik) — sesuai catatan
operasional Sentinel (RX2-2) supaya run paralel tidak saling mengontaminasi.

## 6b. Remediasi Delta-Review Sentinel Ronde 1 (t_07db887d / F-S1–S8)

1. **F-S1 — SYARAT WAJIB (Jalur Uang, ditutup):**
   - Lookup replay dan reuse baris failed pada `claim_checkout_order` kini di-scope ketat: jika kunci ditemukan tetapi `phone <> p_phone`, RPC mengembalikan status `key_conflict`.
   - Di `src/app/api/scalev/create-order/route.ts`, status `key_conflict` menghasilkan respons HTTP **409 `IDEMPOTENCY_KEY_CONFLICT`** tanpa mengembalikan `orderId` atau `paymentUrl`.
   - Bukti repro disediakan di `tests/test-probe-cross-phone.mts`: Pelanggan A buat order -> 200; Pelanggan B (sesi valid milik B) kirim kunci A -> 409 `IDEMPOTENCY_KEY_CONFLICT` (0 data bocor); Kontrol B dengan kunci baru -> 400 `INCOMPLETE_ONBOARDING`.
   - Diuji juga di level SQL (`test-consent-gate-sql.mts`) dan e2e route (`test-consent-gate-e2e.mts`).
2. **F-S2 — Invariant Test Promo E2E:**
   - Asersi `tests/test-promo-e2e.mts:835` diubah dari asumsi timing race kaku (`409 ORDER_IN_FLIGHT`) menjadi invariant yang benar-benar dijamin: tepat 1 pemenang, tepat 1 order, penolak tanpa orderId/paymentUrl, dan kode ∈ {`ORDER_IN_FLIGHT` (409), `PROMO_PENDING_ORDER` (400)}.
   - Terbukti lulus stabil di seluruh run promo e2e.
3. **F-S3 — Guard Placeholder Halaman Legal:**
   - `tests/test-legal-draft-shape.mts` kini memeriksa bahwa template `page.tsx` bersih dari literal `«`, dan konstanta di `src/lib/legal.ts` memiliki tepat satu placeholder (yaitu `LEGAL_ADDRESS` yang menunggu keputusan owner sesuai ACC 16/10).
   - `tests/test-consent-gate-e2e.mts` menguji HTML ter-render baik di `/terms` maupun `/privacy`, memastikan placeholder count ter-render tepat 1.
4. **F-S4 — Retensi PII Onboarding ≤ 30 Hari & Purge:**
   - Fungsi `purge_expired_onboarding_progress(p_retention_days INTEGER DEFAULT 30)` ditambahkan ke `staging/schema-consent.sql` dan `tests/harness/migrations/006-consent-gate.sql`.
   - Menghapus data `onboarding_progress` dan `checkout_claims` lama (>30 hari) sesuai klausul 5 Kebijakan Privasi (/privacy).
   - Didaftarkan ke `pg_cron` (bila ekstensi ada) dan dipanggil di `staging/purge-cron.sh`.
   - Diuji fungsionalitasnya di `test-consent-gate-sql.mts`.
5. **F-S5 — Hardening Grants & REVOKE Eksplisit:**
   - Ditambahkan `REVOKE ALL ON TABLE consent_events, onboarding_progress, checkout_claims FROM PUBLIC, anon, authenticated;` di `staging/schema-consent.sql`.
   - Ditambahkan probe negatif anon INSERT ke `consent_events`, anon INSERT ke `onboarding_progress`, dan anon UPDATE ke `checkout_claims` di `tests/test-consent-gate-sql.mts` (semua terbukti melempar permission denied).
6. **F-S7 — Konsistensi Tie-Break T&C Gate (`false` Menang):**
   - Query T&C gate di `claim_checkout_order` diubah dari `bool_or` menjadi `ORDER BY occurred_at DESC, (value = false) DESC, created_at DESC, id DESC LIMIT 1`. Jika ada dua event di timestamp identik (true & false), nilai `false` yang diambil (fail-closed, `consent_required`).
   - Diuji kasus seri T&C di `tests/test-consent-gate-sql.mts`.
7. **F-S8 — Isolasi & Harness Teardown:**
   - `tests/test-consent-gate-sql.mts` kini secara otomatis memanggil `seed.sh` di awal run.
   - `tests/harness/stack.mts` memastikan `startPostgrest()` hanya menganggap running bila status HTTP 200 (bukan 502/orphaned proxy).
   - `tests/test-consent-gate-e2e.mts` menambahkan trap signal SIGINT/SIGTERM untuk memastikan mock Scalev dan server selalu di-kill saat exit.
8. **F-W4-1 — Status Temuan Kunci Baru:**
   - Menunggu keputusan pemilik (sedang diproses via Koron). Tidak diubah sepihak. Tetap fail-closed per satu kunci = satu order dan satu nomor tidak bisa cetak order bersamaan.

### Bukti negatif (pra-fix GAGAL) — bukan klaim, ada log-nya

| Mutasi | Suite | Hasil | Log |
|---|---|---|---|
| `create-order` dikembalikan ke versi pra-W4 (tanpa gate) | consent e2e | **74 PASS / 31 FAIL** (order tercetak tanpa sesi, tanpa consent, tanpa langkah) | `/tmp/w4-prefix-consent.log` |
| Fix sendiri dimatikan (pelepasan klaim pada penolakan promo dihapus) | promo e2e | **113/115** — tepat 2 asersi baru GAGAL: `expected 200, got 409` dan `expected 0, got 1` (klaim in-flight tertinggal) | `/tmp/w4-prefix2-promo.log` |
| Asersi race lama (timing) dijalankan 2× | consent e2e | 1× lulus, 1× GAGAL (`expected 1, got 2`) → dibuktikan flaky, lalu diganti | `/tmp/w4-runall3.log` §C |

## 6c. Ronde 3 — F-W4-1 opsi (a) + apply migrasi consent ke STAGING (2026-10-17)

**Keputusan owner (16/10, via Koron):** opsi (a) — *"iya kasih link bayar yang sama"*.
Paket sama + masih ada order belum dibayar ⇒ kunci baru **dikembalikan ke order/link yang sama**;
paket beda ⇒ blokir eksplisit; kunci sama dari nomor beda ⇒ tetap 409 `IDEMPOTENCY_KEY_CONFLICT`.

### Perubahan DB (`staging/schema-consent.sql`, draft → di-apply ke staging)

- Kolom baru `checkout_claims.paid_at TIMESTAMPTZ` — **satu-satunya** pembeda "order belum dibayar
  yang masih hidup" dari riwayat lunas (pembelian ulang sah). Diisi jalur uang, tidak pernah klien.
- `claim_checkout_order` (signature & grant **tidak berubah** ⇒ tidak ada overload PostgREST baru):
  - langkah **3b**: klaim `created` yang belum dibayar & lebih tua dari **TTL 60 menit** dianggap
    ditinggalkan (`status='failed'`) — supaya link yang ditinggalkan tidak menahan nomor selamanya;
  - langkah **6**: nomor yang masih punya order belum dibayar ⇒ **paket sama** `reuse_unpaid`
    (`order_id` + `payment_url` yang sama), **paket beda** `unpaid_conflict`;
  - urutan gate TIDAK berubah: kunci/nomor (F-S1 `key_conflict`) → expire → langkah wajib → T&C →
    **baru** reuse. Reuse tidak pernah melewati gate (diuji eksplisit: langkah wajib dihapus ⇒
    tetap `incomplete_onboarding`).
- RPC baru `mark_checkout_claim_paid(p_order_id, p_paid_at, p_tenant_id)` — idempotent
  (`COALESCE(paid_at, …)`, retry webhook tidak menggeser timestamp pertama), `SECURITY INVOKER`,
  `REVOKE` dari `PUBLIC, anon, authenticated`, `GRANT EXECUTE` hanya `service_role`.

### Perubahan app

- `src/lib/checkout-gate.ts` — `ClaimOutcome` + `reuse_unpaid` / `unpaid_conflict`;
  tambahan `markCheckoutClaimPaid(orderId, paidAt?)` (best effort, tidak pernah melempar).
- `src/app/api/scalev/create-order/route.ts` (jalur uang) — `reuse_unpaid` ⇒ **200**
  `{orderId, paymentUrl, replay:true, unpaidOrderReused:true}` **tanpa panggilan Scalev**;
  `unpaid_conflict` ⇒ **409 `UNPAID_ORDER_EXISTS`** tanpa `orderId`/`paymentUrl`
  (tidak ada data order yang dibocorkan). Nomor != nomor body tetap 403, kunci milik nomor lain
  tetap 409 `IDEMPOTENCY_KEY_CONFLICT`.
- `src/app/api/scalev/webhook/route.ts` (jalur uang) — pada `payment.received`/`order.paid`
  yang sudah lolos validasi status pembayaran & klaim inbox: `markCheckoutClaimPaid(orderUniqueId)`
  (pola sama dengan `consume_promo_for_order`, tidak pernah melempar ke jalur webhook).

### Suite yang berubah/tambah

| Suite | Tambahan |
|---|---|
| `test-consent-gate-sql.mts` | bagian 10: `reuse_unpaid` (order/link sama, **tidak** ada baris klaim kedua), `unpaid_conflict` + tanpa `order_id`, F-S1 tetap `key_conflict`, `mark_checkout_claim_paid` idempotent + `not_found`, TTL 61 menit ⇒ boleh checkout baru + baris lama `failed`, reuse tidak mendahului gate, anon dilarang memanggil `mark_checkout_claim_paid` |
| `test-consent-gate-e2e.mts` | bagian C2 (HTTP): reuse ⇒ 200 order/link SAMA & 0 order baru, paket beda ⇒ 409 `UNPAID_ORDER_EXISTS` tanpa data order, setelah dibayar ⇒ order baru, order ditinggalkan > TTL ⇒ boleh. Invariant "dua kunci berbeda paralel" diganti: **tepat satu** order, semua jawaban 200 ke order yang sama, sisanya 409 |
| `test-webhook-e2e.mts` | webhook pembayaran mengisi `checkout_claims.paid_at` (bukan tes yang menulis); loop H-5 menandai lunas supaya percobaan berikutnya benar-benar mencetak order baru |
| `test-promo-e2e.mts` | retry setelah pembatalan reservasi promo: kembali ke **order yang sama** (satu order), bukan order kedua |

### Bukti negatif (pra-fix GAGAL, bukan klaim)

| Mutasi | Suite | Hasil | Log |
|---|---|---|---|
| lookup order-belum-dibayar dimatikan (`LIMIT 1` → `LIMIT 0`) | consent/checkout SQL | **55 PASS / 10 FAIL** — reuse jadi `granted`, lahir baris klaim kedua, `unpaid_conflict` tidak pernah muncul | `/tmp/w4f1-neg-sql.log` |
| sama (lewat HTTP) | consent/checkout e2e | **118 PASS / 10 FAIL** — terukur **dua order berbeda yang keduanya bisa dibayar** (`test_5_…` vs `test_6_…`) untuk satu nomor + satu paket | `/tmp/w4f1-neg-e2e.log` |

Pasca-restore: SQL 64/64 · e2e 128/128 · `run-all.sh` **3× ALL SUITES PASSED** (exit 0).

### Apply ke STAGING + readback (bukan produksi, bukan data pelanggan)

- Metode: `POST https://api.supabase.com/v1/projects/<ref>/database/query` dengan token
  **scoped staging** dari rak kredensial (`~/.hermes/secrets/staging/supabase.env`); isi file
  `staging/schema-consent.sql` dikirim apa adanya (idempotent). Tidak ada kredensial yang dicetak.
- **Sebelum apply (readback):** `consent_events` / `onboarding_progress` / `checkout_claims`
  **belum ada** di staging (migrasi memang belum pernah di-apply).
- **Sesudah apply (readback):** 3 tabel ada; `users.opt_in`/`opted_out` (boolean, default false,
  `NOT NULL`); `checkout_claims.paid_at` ada; 8 index termasuk `uq_checkout_claims_idempotency`,
  `uq_checkout_claims_inflight_phone`, `uq_onboarding_progress_phone`,
  `idx_consent_events_phone_type_time`; 10 RPC (`claim_checkout_order` **tepat satu** overload
  7-arg, `mark_checkout_claim_paid` 3-arg, `purge_expired_onboarding_progress`,
  `consent_state_for_phone`, …); `trg_consent_events_append_only` aktif; RLS aktif di 3 tabel +
  policy `deny_client_access_*`; hak akses: `anon` **tidak** boleh EXECUTE RPC mana pun & **tidak**
  boleh SELECT/INSERT tabel, `service_role` boleh — persis hasil F-S5 di staging.
- **Probe fungsional di staging, SATU transaksi lalu `ROLLBACK`** (tidak menulis apa pun):
  `claim` → `granted`, baris klaim = **1**, `complete` → `completed`,
  kunci baru paket sama → **`reuse_unpaid`** dengan `order_id`+`payment_url` yang SAMA,
  paket beda → **`unpaid_conflict`**, `mark_checkout_claim_paid` → `marked` + `paid_at` terisi,
  kunci baru setelah lunas → `granted` (order baru), kunci milik nomor lain → **`key_conflict`**.
  Residu sesudahnya: `checkout_claims=0`, `consent_events=0`, `onboarding_progress=0`,
  `users=5` (seed fiktif staging, tidak bertambah).
- Bukti mentah: `/tmp/w4f1/staging-readback-consent.txt` (dilampirkan ke kartu) ·
  probe yang sama juga dijalankan di **harness lokal** setiap `run-all.sh`.

### Catatan operasional ronde 3

- **`pg_cron` TIDAK terpasang di staging** ⇒ blok penjadwalan purge di `schema-consent.sql`
  ter-guard dan **tidak membuat job**. Fungsi `purge_expired_onboarding_progress` ada & terbukti
  berfungsi, tapi **retensi 30 hari belum terjadwal di staging**. Butuh keputusan ops (dan
  follow-up RX2-1 `t_383959b7` soal audit log purge) sebelum purge dijadwalkan di lingkungan
  berisi data pelanggan riil.
- **Residual F-W4-1:** melewati TTL 60 menit, order lama dianggap ditinggalkan (boleh checkout
  baru) sementara link Scalev lama bisa masih bisa dibayar. Jendela ini disengaja (alternatifnya
  lockout total tanpa jalur keluar) dan dibatasi 60 menit; kalau TTL link Scalev diketahui lebih
  pendek, angkanya bisa diturunkan (satu konstanta di `claim_checkout_order`).
- RX2-2 (harness berbagi DB/port) & RX2-3 (proses yatim saat probe gagal) sudah punya kartu
  follow-up sendiri (`t_c85c2678`); run ronde 3 memakai env terisolasi sehingga tidak terdampak.

## 7. Temuan untuk Sentinel / keputusan pemilik

- **F-W4-1 — ✅ SELESAI (opsi a, ronde 3).** Owner memutuskan 16/10: kunci baru dari nomor yang
  masih punya order belum dibayar **dikembalikan ke order/link yang sama** (paket sama), dan
  **diblokir eksplisit** kalau paketnya beda. Implementasi + bukti negatif ada di §6c. Residual
  satu-satunya: TTL 60 menit (order lama dianggap ditinggalkan) — dicatat di §6c.
- **F-W4-2** — `checkout_claims` + `onboarding_progress` tumbuh tanpa purge; retensi 30 hari
  sudah ada fungsinya, **belum terjadwal di staging** (pg_cron tidak terpasang) — lihat §6c.
  Audit log purge = follow-up RX2-1 `t_383959b7`.
- **F-W4-3** — sesi WA berumur 60 menit. Kalau token kedaluwarsa setelah consent tersimpan
  tapi sebelum gate: 401 dan pengguna diminta verifikasi ulang (fail-closed, tidak ada order).
- **F-W4-4** — `terms` masih memuat satu placeholder: alamat entitas
  («alamat lengkap menyusul dari pemilik»). Diuji: hanya SATU placeholder tersisa di `/terms`.

## 8. Blocker & yang SENGAJA belum dikerjakan

1. **Delta-review 3 (Sentinel) atas diff ronde 3** — permukaan baru: `checkout_claims.paid_at`,
   langkah reuse/blokir di `claim_checkout_order`, RPC `mark_checkout_claim_paid`, jalur uang
   `create-order` + `webhook`. Kartu review terpisah dibuat (assignee Sentinel).
2. **Migrasi consent SUDAH di-apply ke staging** (readback di §6c). **Produksi belum** dan
   **belum merge/push/deploy**. Sampai RC final di-merge, endpoint consent di lingkungan lain
   tetap gagal-tertutup (503/400) — perilaku yang diinginkan, bukan bug.
3. `whatsapp_channel_bindings` (S0 B-3) tetap belum ada DDL; jalur pengingat outbound belum
   boleh hidup. `opt_in=true` **tidak** memicu pesan apa pun dari kartu ini.
4. Purge retensi belum terjadwal di staging (pg_cron tidak ada) + audit log purge (RX2-1).
5. Jalur uang (`create-order`, `webhook`) → **setiap diff wajib review**; kartu ini berhenti di
   `review-required`.
6. Tidak ada merge/push ke `main`, tidak ada deploy produksi, tidak ada aktivasi promo,
   tidak ada outbound WhatsApp/Cloud, tidak ada data pelanggan yang disentuh.

## 9. Perubahan pada kode/suite existing (perlu ikut dibaca reviewer)

- `src/app/api/scalev/create-order/route.ts` — **jalur uang**: gate + klaim + replay +
  pelepasan klaim (3 jalur) + nama/harga dari server.
- `src/app/companion/nina/onboarding/[step]/page.tsx` — body order tidak lagi mengirim
  `amount`/`planName`/`onboarding`/`customerName`; dua checkbox; simpan progress per langkah.
- `src/app/privacy/page.tsx`, `src/components/Footer.tsx`, `src/app/sitemap.ts` — A6.
- `tests/test-promo-e2e.mts` — helper `checkout()` menyiapkan sesi+progress+consent lewat
  HTTP (jalur yang sama dengan UI) sebelum memanggil `create-order`; nama uji ikut masuk
  langkah 2 (kalau tidak, injeksi kegagalan mock Scalev "FAILORDER" tidak lagi sampai ke
  server karena nama diambil dari profil tersimpan); asersi race lama diganti; 2 asersi
  regresi klaim ditambahkan.
- `tests/test-webhook-e2e.mts` — menyiapkan sesi+consent untuk checkout-nya; kasus
  "profil invalid" berubah makna: profil dari body tidak lagi dibaca ⇒ 400
  `INCOMPLETE_ONBOARDING` (bukan 400 karena rentang nilai).
- `src/app/api/scalev/webhook/route.ts` — **jalur uang** (ronde 3): satu panggilan
  `markCheckoutClaimPaid(orderUniqueId)` setelah validasi status pembayaran & klaim inbox.
- `src/lib/checkout-gate.ts` — (ronde 3) `reuse_unpaid` / `unpaid_conflict` + `markCheckoutClaimPaid`.
- `staging/schema-consent.sql` + `tests/harness/migrations/006-consent-gate.sql` (salinan
  otomatis dari `staging/` oleh `seed.sh`) — (ronde 3) `paid_at`, langkah reuse/blokir + TTL,
  RPC `mark_checkout_claim_paid`.
- `tests/test-legal-draft-shape.mts` — W2 memeriksa "belum ada route/link /terms"; setelah
  owner ACC dan publikasi A6, pemeriksaan dibalik: route ada, footer & checkout menaut,
  versi = `terms-2026-10-15-v1`, dan tidak ada placeholder yang bocor ke `/privacy`.
- `tests/harness/seed.sh` (migrasi 006) + `tests/run-all.sh` (step SQL & e2e consent +
  legal shape masuk gate).

## 10. Bukti & link

- Kontrak: `~/workspaces/thrivin/batch-2026-10-15/s0-security/integration-contract.md`
- Review S0: `~/workspaces/thrivin/batch-2026-10-15/s0-security/report.md` §5
- Laporan ini + `evidence.json`: `~/workspaces/thrivin/batch-2026-10-15/w4-consent-gate/`
- Catatan vault: `~/obsidian/kantor-ai/projects/thrivin/features/checkout-consent-gate-2026-10-15.md`
- Draft teks legal yang disetujui: `docs/legal/{terms-draft,privacy-delta,consent-wording}-2026-10-15.md`
