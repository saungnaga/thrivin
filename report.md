# W4 — Gate completion checkout server-side + consent T&C/opt-in + publish `/terms`

**Kartu:** `t_f5ec336c` (root `t_fdba2939`) · **Assignee:** Forge · **Tanggal:** 2026-10-16
**Status:** ✅ implementasi + suite lokal hijau · ⛔ **review-required (Sentinel)** ·
**belum merge / belum apply SQL / belum deploy** · base kerja **`9392cdd`** (RC) + W3 head `e01a27a`

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

Tidak ada data pelanggan yang disentuh, tidak ada SQL yang di-apply, tidak ada Scalev
nyata (mock lokal), tidak ada outbound WhatsApp, tidak ada push/merge ke `main`.

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
| `staging/schema-consent.sql` | **DRAFT, belum di-apply**: kolom `users.opt_in`/`opted_out`, tabel `consent_events` (append-only via trigger; unique idempotensi; status efektif = event terbaru; opt-out menang saat seri), `onboarding_progress`, `checkout_claims` (+ unique parsial in-flight per nomor), RPC `record_consent_event`, `record_checkout_consent`, `save_onboarding_step`, `claim_checkout_order`, `complete_checkout_claim`, `release_checkout_claim`. Semua `SECURITY INVOKER`, `REVOKE` dari `PUBLIC, anon, authenticated`, `GRANT` hanya `service_role`. Idempotent. |

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

| Suite | Hasil |
|---|---|
| unit remediation | 27/27 |
| unit WA-first | 16/16 |
| **unit consent/checkout** | **44/44** |
| **legal draft shape** | **121/121** (kini assert persis 1 placeholder alamat di legal.ts, 0 di templates) |
| promo SQL (redeem atomik/kuota/race) | 44/44 |
| **consent/checkout SQL** | **44/44** (tambah probe anon INSERT/UPDATE, F-S1 key_conflict, F-S7 tie-break, F-S4 purge) |
| webhook e2e | 58/58 |
| promo e2e | 115/115 (F-S2 invariant race diperbaiki) |
| WA-first e2e | 136/136 |
| **consent/checkout e2e** | **110/110** (tambah F-S1 cross-phone replay 409 + F-S3 /privacy placeholder) |

Log: stabil ≥3× berturut-turut di salinan bersih via `bash tests/run-all.sh`.

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

## 7. Temuan untuk Sentinel / keputusan pemilik

- **F-W4-1 (kunci idempotensi baru tidak pernah ditolak).** Selama tidak ada klaim
  in-flight untuk nomor itu, kunci baru = percobaan beli baru. Reload halaman checkout
  (kunci dibuat per page-load) bisa mencetak **order kedua yang belum dibayar**; kedua
  link bisa dibayar ⇒ potensi pembayaran ganda yang disengaja pengguna. Yang tetap dijamin:
  satu kunci = satu order (replay), dan dua order tidak bisa tercetak **bersamaan** untuk
  satu nomor. Opsi (butuh keputusan): (a) kunci baru dari nomor sama mengembalikan order
  belum dibayar yang sama; (b) blokir kunci baru selama ada order belum dibayar + TTL;
  (c) biarkan seperti sekarang. Opsi (a)/(b) mengubah perilaku "pembelian ulang dengan
  kunci baru ⇒ 200" yang saat ini diuji di suite promo e2e (perlu diubah bersama + review
  jalur uang). **Tidak diubah sendiri di kartu ini.**
- **F-W4-2** — `checkout_claims` + `onboarding_progress` tumbuh tanpa purge; butuh retensi
  terjadwal saat apply (dicatat sebagai komentar di `staging/schema-consent.sql`).
- **F-W4-3** — sesi WA berumur 60 menit. Kalau token kedaluwarsa setelah consent tersimpan
  tapi sebelum gate: 401 dan pengguna diminta verifikasi ulang (fail-closed, tidak ada order).
- **F-W4-4** — `terms` masih memuat satu placeholder: alamat entitas
  («alamat lengkap menyusul dari pemilik»). Diuji: hanya SATU placeholder tersisa di `/terms`.

## 8. Blocker & yang SENGAJA belum dikerjakan

1. **Delta-review Sentinel sebelum apply** `staging/schema-consent.sql` (permukaan baru:
   4 tabel + 1 kolom-set + 6 RPC + policy). Belum di-apply ke staging maupun produksi;
   hanya dijalankan di DB harness lokal (dummy, sekali pakai).
2. **Kolom consent belum ada di skema mana pun** (S0 B-2). Sampai apply, endpoint consent
   di staging akan gagal-tertutup (503/400) — itu perilaku yang diinginkan, bukan bug.
3. `whatsapp_channel_bindings` (S0 B-3) tetap belum ada DDL; jalur pengingat outbound belum
   boleh hidup. `opt_in=true` **tidak** memicu pesan apa pun dari kartu ini.
4. Jalur uang (`create-order`) → **setiap diff wajib review**; kartu ini berhenti di
   `review-required`.
5. Tidak ada merge/push ke `main`, tidak ada deploy, tidak ada aktivasi promo.

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
