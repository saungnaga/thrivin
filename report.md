# I1 — Laporan Integrasi Staging RC batch 2026-10-15

**Kartu:** `t_c0be1764` (root `t_fdba2939`) · **Pelaksana:** Forge (Fullstack Engineer)
**Dibuat:** 2026-10-18 · **Status:** RC TERBENTUK, **22/22 suite HIJAU, 0 gate merah**
(B-1 ditutup di kartu `t_91b4f733`) — menunggu QC Atlas + audit Sentinel.
**NO PRODUCTION DEPLOY.**

**Branch:** `release/rc-integration-2026-10-15`
**Head saat RC dirakit:** `f19f52339b006c61be927d5a0024795532ade765` ·
**tip sekarang:** HEAD setelah B-1 (3 commit di atas `f19f523`: `e0ca6dd` test guard copy, `fdbc793` docs legal draft, lalu commit laporan ini — sha-nya `git rev-parse HEAD`)
**Base:** `9392cdd0f6ad62ce73f22c129fbcbb55c28f0cde` (= `release/rc-integration-2026-10-13`, ancestor langsung HEAD)
**Worktree:** `/home/ubuntu/workspaces/thrivin/batch-2026-10-15/i1-staging-rc`

Batas yang dipegang sepanjang kartu ini: nol data customer, nol kredensial produksi,
nol panggilan Scalev/Cloud/OTP/email nyata (semua transport mock lokal), nol apply ke
staging/produksi, nol deploy. Semua suite berjalan di atas Postgres lokal + PostgREST
lokal + mock Scalev lokal dengan DB throwaway per-worktree.

---

## 1. Ringkasan

Satu RC terisolasi dirakit dari base kanonik `9392cdd` dengan **merge commit** (bukan
rebase/cherry-pick), sehingga tiap head yang di-review tetap bisa diaudit sebagai
ancestor HEAD. Delapan head di-review dari 6 stream digabung; konflik integrasi
diselesaikan tanpa menimpa temuan keamanan mana pun dari sisi mana pun (rincian §4).

Hasil verifikasi: `npm run lint` (tsc) exit 0, `npm run build` exit 0, dan 22 langkah
suite lokal dijalankan **satu per satu** (serial, satu proses pada satu waktu):
pada rakitan awal **21 hijau, 1 merah** (guard copy W1 vs kalimat garansi yang
dipublikasikan W4) — merah itu kini **ditutup test-only + docs** di kartu
`t_91b4f733`, dan `SKIP_BUILD=1 bash tests/run-all.sh` berakhir
**`ALL SUITES PASSED`, exit 0, 0 baris FAIL** (§6.1).

---

## 2. Silsilah (ancestry) yang dirakit

Base `9392cdd` → 8 merge commit → HEAD `f19f523` (106 commit di atas base).

| # | Merge commit | Head yang di-merge | Stream | Head di-review oleh |
|---|---|---|---|---|
| 1 | `4b30f49` | `e01a27a` | W3 WA-first identity/status/renewal | `t_a498a912` · RX `t_ee4d66c7` · delta `t_03564952` |
| 2 | `0d7ce2a` | `53e73b3` | W1 copy harga/promo/garansi | `t_fc3c466a` (26029cc) · `t_813df8b2` (b484e2c) · `t_899aa888` (53e73b3) |
| 3 | `2997e12` | `ad92fb3` | W5 halaman kritik & saran | `t_63b7eb66` · RX `t_51e47cf0` · delta `t_49e7e2a6` |
| 4 | `1f8d09d` | `9e4e2ec` | W4 checkout consent gate | `t_07db887d` · `t_7f3a1042` · `t_91a898d7` · `t_3f91103d` · `t_e7d479c5` · `t_19cf9c8f` · `t_a812c669` · `t_fe0513f6` |
| 5 | `8d6b1f1` | `84837e5` | W4 C-6 ACL `purge_expired_webhook_data()` | `t_51e1abd4` |
| 6 | `f7a1cb1` (+`b1866f5` bukti) | `161ba7e` | W4 T3 `order_id` kosong ≠ order | `t_11c66b52` (delta 3) · `t_ab1a3363` (T3 awal) |
| 7 | `1ae755a` | `e56724c` | W4 RX2-4 follow-up (kepemilikan listener, artefak `/tmp` privat) | `t_4c220415` |
| 8 | `f19f523` | `69b920d` | W2 draft terms/privacy/consent (paket approval) | approval owner via `t_e8d57ab3` (ACC 16/10, 19 keputusan) |

Verifikasi silsilah (dijalankan di RC): `git merge-base --is-ancestor <head> HEAD`
= **YA untuk kesembilan head** di atas (8 head + `e56724c` sudah termasuk di dalamnya;
`9e4e2ec`,`84837e5`,`161ba7e`,`e56724c` saling tidak memuat, jadi keempatnya di-merge
eksplisit). Base `9392cdd` sendiri sudah RC 13/10 (hardened webhook/promo + port welcome).

Catatan higiene: `b1866f5` adalah commit biasa (satu parent) yang membawa berkas bukti
T3; subjeknya ikut berawalan `merge(161ba7e)` sehingga `git log` menampilkan dua entri
senada. Isi pohon tidak terpengaruh (koreksi subjek = rewrite sejarah, sengaja tidak
dilakukan karena seluruh bukti di bawah mereferensikan SHA `f19f523`).

---

## 3. Rekonsiliasi welcome-message (diff, bukan timpa)

Dua garis welcome pernah hidup paralel: `2062b6e` (branch intake `feat/welcome-message`)
dan garis hardened `d0528f7` → `472b90c` ("port welcome message") → `9392cdd`.

Bukti diff (berkas mentah di `~/t_c0be1764-evidence/`):

- `welcome-ancestry-src-staging.stat` — `2062b6e..9392cdd` hanya menyentuh
  `src/` (webhook route, onboarding-store, welcome-message, + helper baru `phone.ts`,
  `plans.ts`, `rate-limit.ts`, `validate-onboarding.ts`) dan `staging/`.
- `welcome-ancestry-welcome-message.diff` — isi `src/lib/welcome-message.ts` di
  `9392cdd` adalah **superset hardened** dari `2062b6e`: normalisasi JID pindah ke
  validator bersama `normalizePhone` (M-5), masking `maskedPhone` diperketat
  (`>= 4` digit ⇒ `***<last4>`, W-6), `clip()` + echo body bridge dihapus
  (W-8/redact), marker disk dimatikan di `NODE_ENV=production` (H-3, dedup lewat
  klaim DB). Alur/isi sapaan dan `splitBubbles()` tidak berubah.
- Satu-satunya berkas yang **hilang** dari garis lama: `tests/e2e-welcome-outbound.cjs`
  (skrip e2e standalone). Cakupannya sudah pindah ke `tests/test-webhook-e2e.mts`
  (61/61 hijau), termasuk `welcomeSent` + `welcomeMessageId`, replay idempotent,
  dedup `eventId`, dan nol nomor/nama di log (M-4).

**Kesimpulan:** tidak ada fitur welcome yang hilang; yang tersisa hanyalah pemindahan
berkas uji. RC memakai garis hardened dan **tidak** menggabungkan `2062b6e` kembali
(menggabungkannya justru akan menurunkan hardening).

---

## 4. Konflik integrasi & cara penyelesaian (nol clobber)

1. **`tests/run-all.sh` (W3/W1/W5/W4)** — tiap stream menomori ulang driver.
   Hasil akhir = driver kanonik W4 (`isolate.mts` env + flock per-worktree, RX2-4 R4)
   dengan **union seluruh suite**: 12 langkah `1/12..12/12` + sub-langkah `2b/12`,`2c/12`.
   Tiap suite yang dipanggil salah satu sisi tetap dipanggil di RC (diverifikasi
   dengan mencocokkan daftar `node --experimental-strip-types` di akhir).
2. **`tests/harness/seed.sh`** — union `cp` skema: `004-promo-codes`, `005-wa-identity`,
   `006-consent-gate`, `007-fw41c-cancel`.
3. **Tabrakan nomor migrasi** — W5 memakai `004-feedback-kritiksaran.sql` dan
   `005-harness-feedback-anon-grant.sql`, nomor yang sudah dipakai jalur W4
   (promo/WA) dan `006/007` (consent/cancel). Urutan apply = urutan leksikal, jadi
   nomor kembar = bahaya urutan senyap ⇒ **di-rename ke `008`/`009`** (isi byte-identik,
   hanya nama + baris `cp` di `seed.sh` yang berubah, didokumentasikan di header `seed.sh`).
4. **`tests/mock-scalev.mjs`** — ini pertemuan dua perbaikan yang berbeda kelas, bukan
   pilihan salah satu: B2 (`e56724c`) = dir artefak privat 0700 +
   `writePrivateFile` (O_CREAT|O_EXCL|O_NOFOLLOW, cek uid); D3 (`161ba7e`) = tulis
   atomik supaya pembaca tak menangkap JSON separuh. RC memakai **keduanya**: helper
   baru `persistPrivate()` = `writePrivateFile(tmp)` + `rename`. Kalau menerima sisi
   `e56724c` apa adanya, properti D3 hilang tanpa suara. Default `ORDER_MODE_FILE`
   (tambahan T3) juga dipindah ke `ARTIFACT_DIR` (sebelumnya path `os.tmpdir()` yang
   predictable **dan** memakai `os` tanpa import → ReferenceError laten bila env tak
   diset; kini `os` tidak dipakai lagi).
5. **`tests/test-legal-draft-shape.mts` (add/add)** — diselesaikan ke versi W4
   `e56724c` karena versi itu adalah penerus yang terdokumentasi: W2 mengunci
   "belum dipublikasikan" (belum ada route `/terms`, belum ada link, `src == base`),
   sedangkan setelah ACC owner 16/10 W4 mempublikasikannya, jadi asersinya justru
   kebalikannya. Dua set asersi itu tidak bisa hidup bersama. Berkas draft
   `docs/legal/*` sendiri byte-identik di kedua sisi (`04355e95`, `275b36ac`, `4636aa44`).
6. **`report.md`/`evidence.json` root tiap stream** — W3/W5/W4 (dan follow-up-nya)
   masing-masing meng-commit laporan di root tree, sehingga saling bentrok. Bukti
   per-stream dipindah ke `evidence/<stream>/` dengan isi byte-identik (diverifikasi
   sha256 terhadap `git show <head>:report.md`), plus `evidence/README.md` sebagai peta.
   Tidak ada versi yang dibuang.

---

## 5. Verifikasi (semua dijalankan di RC, serial, satu per satu)

| Langkah | Perintah | Exit | Hasil |
|---|---|---|---|
| lint/typecheck | `npm run lint` (= `tsc --noEmit`) | 0 | bersih |
| build | `npm run build` (`next build`) | 0 | compiled, route list utuh |
| suite | 22 langkah `tests/run-all.sh` dijalankan satu per satu | 21×0, 1×1 | lihat tabel di bawah |

| # | Suite | Hasil |
|---|---|---|
| 1 | `harness/seed.sh` | DB throwaway dibuat + 9 migrasi apply, OK |
| 2 | `test-remediation-units.mts` | 27/27 |
| 3 | `test-wa-first-units.mts` | 16/16 |
| 4 | `test-consent-gate-units.mts` | 44 PASS / 0 FAIL |
| 5 | `test-cancel-ttl-units.mts` | 27 PASS / 0 FAIL |
| 6 | `harness/fw41c-v7-alert-probe.mts` | 5 PASS / 0 FAIL |
| 7 | `test-harness-isolation.mts` | 25 PASS / 0 FAIL |
| 8 | `test-legal-draft-shape.mts` | 121/121 |
| 9 | `test-feedback-units.mts` | 84/84 |
| 10 | `test-web-copy-units.mts` | 15/15 |
| 11 | `test-web-copy-copy.mts` | **19/20 — FAIL** (§6.1) |
| 12 | `test-web-copy-treewide.mts` | PASS (83 berkas dipindai, 0 klaim pensiun) |
| 13 | `test-webhook-guards.mts` | ALL GUARD CHECKS PASSED |
| 14 | `test-promo-sql.mts` | 44/44 |
| 15 | `test-consent-gate-sql.mts` | 170 PASS / 0 FAIL |
| 16 | `test-webhook-e2e.mts` | 61/61 (server HTTP lokal → PostgREST → Postgres dummy) |
| 17 | `test-promo-e2e.mts` | 118/118 |
| 18 | `test-wa-first-e2e.mts` | 136/136 (OTP + email mock) |
| 19 | `test-consent-gate-e2e.mts` | 178 PASS / 0 FAIL |
| 20 | `test-cancel-ttl-e2e.mts` | 112 PASS / 0 FAIL |
| 21 | `test-webhook-purge-acl.mts` | ACL C-6: 8 PASS / 0 FAIL (apply 1 & re-apply) |
| 22 | `test-feedback-e2e.mts` | 90/90 |

Negatif yang sudah tercakup di dalam suite (bukan klaim kosong, semuanya punya
assertion yang gagal bila penjaganya dilepas): auth/OTP (`test-wa-first-e2e`),
konsen & harga/order (`test-consent-gate-*`), replay/race/dedup webhook
(`test-webhook-e2e` + `test-rx25-*`), promo (`test-promo-*`), feedback
(`test-feedback-*`), forgery tanda tangan + allowlist (`test-webhook-guards`),
aksesibilitas (`aria-describedby`, `aria-live`, accessible name opsi 1 bulan,
keyboard/mobile) di suite consent/feedback/wa-first/copy.

Catatan resource: `next build` dijalankan saat `free -h` ≈ 487 Mi dan suite
dijalankan pada 648–710 Mi (kartu meminta ≥ 800 Mi). Semua tetap serial, satu proses
pada satu waktu, tanpa OOM; angka mentah ada di `~/t_c0be1764-evidence/logs/free-*.txt`
dan kolom `free_mb_after` pada `suites-summary.tsv`. Ini deviasi dari ambang kartu —
dilaporkan, bukan disembunyikan.

---

## 6. Bukti negatif (pra-fix harus MERAH)

1. **Copy W1 vs tree pra-fix `2e10f56`** (`COPY_ROOT=<export 2e10f56>`):
   `test-web-copy-copy.mts` → **1/20 lolos, exit 1**; `test-web-copy-treewide.mts` →
   **11 pelanggaran, exit 1**. (Suite unit murni tetap hijau 15/15 — memang tidak
   menegakkan isi tree.)
2. **Mutasi pembalik di tree RC** (tiap mutasi mengembalikan satu penjaga ke bentuk
   pra-fix, lalu menuntut suite MERAH; sumber dipulihkan lewat `trap`):

| Leg | Skrip | Hasil |
|---|---|---|
| W4 F-W4-1c V-1..V-4, V-7 | `tests/harness/fw41c-v-mutation.sh all` | exit 0 — kelima mutasi tertangkap (V-1 `retired`→`created`, V-2 `cancel_failed` hilang, V-3 lease 15 s < lantai 16.25 s, V-4 backoff diabaikan, V-7 streak ditelan ⇒ probe 3 PASS / 2 FAIL) |
| W4 T3 C-3/C-4 | `tests/harness/w4t3c3-mutation.sh` | exit 0 — leg 1: SQL 3 FAIL + e2e 3 FAIL (order kedua nyata tercetak); leg 2: SQL 5 FAIL; pulih ⇒ SQL 170/0 + e2e 178/0 |
| W5 feedback M1..M6 | `tests/test-feedback-negatives.sh` | exit 0 — `MUTATION PROOF OK`, mis. M6 (duplikat tak membandingkan teks) ⇒ 4 FAIL (201 alih-alih 409) |
| RX2-1b purge audit | `tests/harness/rx21b-mutation.sh` | exit 0 — varian asersi lama buta (exit 0), asersi baru menangkap (exit 1) |
| RX2-5 index per-nomor | `tests/harness/rx25-index-mutation.sh` + `test-rx25-race-probe.mts` | **tidak merah di tree RC** — §6.3 |
| W4RX4 T1 F-2 regrant | `tests/harness/w4t1-regrant-mutation.sh` | **TIDAK BISA dijalankan di tree RC** — §6.2 |

Setelah semua mutasi: `git status --short` di RC **kosong** (pohon pulih byte-for-byte).

### 6.1 RESOLVED — guard copy W1 vs kalimat garansi terpublikasi W4 (B-1, kartu `t_91b4f733`)

**Merah aslinya:** `test-web-copy-copy.mts` A4 menuntut literal `"3 hari pertama"` ada di
`src/app/privacy/page.tsx`, sementara halaman yang dipublikasikan W4 (`1c4178f`) berbunyi
"Dalam 72 jam sejak pembayaran kami terima … 100% tanpa potongan".

**Keputusan (Koron, mandat ACC owner 18/10):** definisi kanonik = **72 jam (3×24 jam) sejak
pembayaran diterima**, ekuivalen "3 hari pertama". Teks publik **tidak** diubah (sejalan
audit Sentinel `t_59f08d02`: "jangan ubah teks publik") ⇒ sisi yang basi adalah assertion.

**Fix (test + docs, nol perubahan `src/`):**

- `tests/test-web-copy-copy.mts` — A4 menerima `"3 hari pertama"` **atau** `"72 jam"`
  (`GUARANTEE_TIMEFRAMES` + `hasGuaranteeWindow()`), dan tetap menuntut **jendela + `100%`**
  baik di `/privacy` maupun di konstanta bersama ⇒ yang ditegakkan substansi, bukan literal
  tunggal. Ekuivalensi + dasar keputusan dicatat di komentar test.
- `docs/legal/terms-draft-2026-10-15.md` — §T6 judul/isi jadi "72 jam (3×24 jam)", asumsi
  **A4** menyebut satuan kanonik, registry **GARANSI-1** ditandai DITUTUP (GARANSI-2/3 tetap
  terbuka + placeholder utuh), provenance diarahkan ke teks yang sudah dipublikasikan.

**Bukti** (mentah: `~/t_91b4f733-evidence/`):

| Bukti | Perintah | Hasil |
|---|---|---|
| MERAH pra-fix | berkas test dari HEAD, `node --experimental-strip-types tests/test-web-copy-copy.mts` | **19/20, exit 1** — `FAIL A4: guarantee text matches the approved policy on /privacy` (`logs/01-prefix-red.log`) |
| HIJAU pasca-fix | test entri yang sama | **20/20, exit 0** (`logs/02b-postfix-green.log`) |
| Tetangga | units · treewide · legal-draft-shape | 15/15 · 44 berkas exit 0 · **122/122** (`logs/03..06`) |
| **Gigi asersi (kontrol)** | `bash b1-teeth-control.sh` — `COPY_ROOT` ke klon throwaway `src/`, satu bahan garansi dicabut per kasus | **4/4 mutasi tertangkap** (jendela dicabut di `/privacy`; `100%` dicabut di `/privacy`; jendela dicabut di `pricing-copy.ts`; `100%` dicabut di `pricing-copy.ts`), kontrol positif hijau, exit 0 (`logs/07-teeth-control.log`) |
| Suite penuh RC | `SKIP_BUILD=1 bash tests/run-all.sh` | **`ALL SUITES PASSED`, exit 0, 0 baris FAIL**, 12/12 langkah + sub-langkah 2b/2c (`logs/08-run-all.log`) |

**Batas yang jujur disebut:** assertion diperlebar **hanya** ke dua literal itu (bukan "jendela
apa pun") dan `100%` tetap wajib — itulah yang dibuktikan tabel gigi di atas. Karena berkas
draft berubah, `docs/legal/terms-draft-2026-10-15.md` **tidak lagi byte-identik** dengan
branch `docs/legal-draft-terms-privacy-2026-10-15` (§4.5 mencatat kesamaan itu saat merge);
`src/` tetap tidak tersentuh.

**Drift yang SENGAJA tidak saya sentuh** (dilaporkan, bukan diimprovisasi — di luar §T6/A4):

1. `src/lib/pricing-copy.ts:100-104` masih "3 hari pertama" + judul "Garansi Uang Kembali 3 Hari",
   dan komentar doc-nya masih menunjuk `/privacy` §3 versi pra-W4. Substansinya jendela yang sama
   (72 jam) ⇒ nol risiko janji, tapi tetap **drift satuan** (Sentinel `t_59f08d02`, temuan LOW).
   Menyeragamkannya = perubahan **teks publik** ⇒ butuh keputusan Atlas/Sentinel, bukan Forge.
2. `docs/legal/privacy-delta-2026-10-15.md:16` masih menulis "Jendela/kanal/potongan belum
   diputuskan: GARANSI-1..3" — jendela sudah diputuskan sekarang.
3. Header `docs/legal/terms-draft-2026-10-15.md` masih "Tidak ada route `/terms` … BELUM
   DIPUBLIKASIKAN" — basi sejak W4 mempublikasikannya (pra-eksisting, bukan efek fix ini).

### 6.2 MERAH (harness) — `w4t1-regrant-mutation.sh` stale terhadap skema gabungan

Skrip menghitung blok `EXCEPTION` di langkah 2 `complete_checkout_claim`
(precondition "harus 1"). Di tree gabungan jumlahnya 3 (T3 `161ba7e` menambahkan
penanganan `unique_violation`/order kosong), sehingga skrip berhenti sebelum
bermutasi dan melaporkan `BUKTI NEGATIF GAGAL: pra-fix exit=0 (harap != 0)`.
Artinya: **bukti negatif F-2 belum tervalidasi di RC ini** (bukan berarti penjaganya
bobol — asersinya ada, namun teeth-nya tidak dieksekusi). Butuh follow-up test-only
untuk memaku mutasinya ke anchor, bukan ke jumlah blok.

### 6.3 `rx25-index-mutation.sh` — DB-name guard false-positive **dan** leg yang tidak lagi menggigit

Skrip menolak nama DB yang mengandung `staging` (`*staging*|*prod*|*production*`)
sebagai pengaman. Slug worktree kartu ini (`i1-staging-rc`) ikut tertangkap ⇒
default DB ditolak. Untuk tetap mencoba buktinya, urutan dijalankan dengan DB
throwaway bernama `thrivin_rc_i1_86fb49_test`:

1. probe race dengan index penuh (bentuk ber-fix, `200/200 bersih, 0 anomali`, exit 0);
2. `rx25-index-mutation.sh narrow` (predikat dikembalikan ke `status='in_flight'`,
   bentuk pra-`7d8389d`) → probe ulang: **`200/200 bersih, 0 anomali`, exit 0**;
3. `rx25-index-mutation.sh restore` → probe ulang: `200/200 bersih, 0 anomali`, exit 0.

**Hasilnya: leg negatif ini TIDAK merah di tree RC.** Interpretasinya bukan "penjaga
bobol", tetapi "satu mutasi tidak lagi cukup": setelah T3 `161ba7e` (penjaga tulis
C-4 di `complete_checkout_claim`) dan gerbang route ikut tergabung, melebarkan
predikat index saja tidak lagi mereproduksi kebocoran "dua order satu nomor" —
probe melihat nol anomali di ketiga keadaan. Jadi bukti negatif RX2-5 belum
tervalidasi di **tree gabungan ini**; kartunya (`t_370981ec`/`t_a812c669`) sudah
membuktikan merah di tree W4 pra-merge. Tindak lanjut: pakukan leg ke penjaga yang
benar-benar dipakai probe (atau deklarasikan kombinasi mutasi yang diperlukan) —
test-only, kelas yang sama dengan §6.2.

Bukti mentah: `~/t_c0be1764-evidence/logs/neg-rx25-*.log`.

---

## 7. Nina (N1+N2) — bukti terpisah, repo terpisah

Engine Nina bukan bagian dari repo Next.js (repo terpisah `nina_proactive`,
origin lokal `n1-proactive`), jadi **tidak di-merge** ke RC; yang dilakukan adalah
menjalankan suite di **head yang di-review** pada salinan bersih:

- Head: `5f3c9fe90410b6f3f3f393899bc97ae80a8d6525` (`nova/n2-nina-controls`),
  salinan `git archive` di `~/t_c0be1764-evidence/nina-rc/`.
- `python3 -m pytest` → **139 passed** (N1 86 + N2 53), exit 0.
- Cakupan: schedule/slot/quiet-hours, ladder, template & payload Cloud eksak
  (quick_reply per index), tombol BERHENTI + lifecycle konfirmasi opt-out
  (scoped/expiring/replay-safe), error & log, status callback (auth/dedup/
  out-of-order), laporan & checklist go-live, plus 31 varian pra-fix bergigi.
- **Batas yang harus jujur disebut:** transport Cloud di suite ini adalah mock
  in-process (deterministik, tanpa jaringan) dan state di SQLite dummy — **bukan**
  server HTTP nyata. Persyaratan "real local HTTP/server → dummy DB readback" kartu
  ini terpenuhi di sisi Next.js (webhook/checkout/WA/feedback, §5), tidak di sisi
  engine Nina. Catatan pre-live N2 (S-1/S-2/S-3) tetap terbuka dan tidak ditutup
  oleh laporan ini.

---

## 8. Sweep (proses, rahasia, data mirip-nomor) & higiene artefak

- **Rahasia:** pola `sk_live|sk_test|service_role_key|eyJhbGciOi|BEGIN … PRIVATE KEY|
  xox…|ghp_…` di seluruh berkas terlacak → hanya nilai dummy/fixture uji
  (`"sk_test_key"`, contoh redaksi `«redacted:sk_live_…»`). `.env` yang ada di tree
  hanya `.env.example`; tidak ada berkas `.env` nyata dan tidak ada berkas tak
  terlacak di tree RC.
- **Data mirip-nomor:** `src/`, `staging/`, `docs/` bersih dari literal nomor.
  Nomor di `tests/` semuanya fixture dummy (`6281234567890`, `62812xxxxxxx`, dst.).
  Satu nomor pra-eksisting dari baseline (`6281383341841` di
  `tests/test-welcome-message.mts`, warisan base 9392cdd) hanya dipakai untuk
  asersi normalisasi/masking format — bukan record pelanggan, tidak ada nama/email
  di sebelahnya. Ditingkahi apa adanya, tidak diubah (bukan scope kartu).
- **Nol outbound nyata:** semua suite menunjuk `SCALEV_API_BASE_URL`/bridge ke mock
  lokal (port per-worktree); tidak ada panggilan ke `api.scalev.com`/Cloud API.
- **Proses:** setelah semua run, tidak ada `next-server`/`postgrest`/`mock-scalev`
  sisa dari RC (satu-satunya `next-server` yang hidup milik 9router, cwd
  `/usr/lib/node_modules/9router/app` — tidak disentuh).
- **Artefak:** log/bukti di `~/t_c0be1764-evidence/` dan `~/w4v-evidence/mutation/`
  (log mutasi V-1..V-7). Dibersihkan setelah bukti dikunci: direktori
  `/tmp/thrivin-i1_staging_rc_86fb49`, 23 dir `/tmp/thrivin-mock-*` milik run ini,
  log `/tmp/thrivin-feedback-*.log`, dan DB throwaway
  `thrivin_test_i1_staging_rc_86fb49`, `thrivin_promo_i1_staging_rc_86fb49`,
  `thrivin_rc_i1_86fb49_test` (ketiganya sudah di-`DROP`).
  **Tidak disentuh:** 447 entri `/tmp/thrivin-*` lama (build log, mock-order json,
  conf postgrest) warisan kartu lain — itu artefak kartu mereka, bukan milik RC ini;
  dibiarkan apa adanya dan hanya dicatat di sini untuk housekeeping.
- **Verifikasi pasca-semua-run:** `git status --short` di RC hanya berisi
  `?? report.md` + `?? evidence.json` (artefak kartu); nol proses
  `next-server`/`postgrest`/`mock-scalev` sisa RC. Setelah kartu `t_91b4f733`,
  laporan ini ikut di-commit di branch RC (tip `release/rc-integration-2026-10-15`).

---

## 9. Temuan terbuka / pemblokir (ringkas)

| ID | Temuan | Kelas | Siapa yang memutuskan |
|---|---|---|---|
| B-1 | **RESOLVED** (`t_91b4f733`): guard copy A4 vs kalimat `/privacy` "72 jam" (§6.1) — assertion diperlebar ke "3 hari pertama" **atau** "72 jam" (jendela **dan** `100%` tetap wajib), terms draft §T6/A4 selaras ke 72 jam (3×24 jam); teks publik tidak disentuh | test + docs | Forge (keputusan kanonik = Koron atas mandat ACC owner 18/10); QC Atlas/Sentinel tetap berlaku |
| B-2 | `w4t1-regrant-mutation.sh` stale ⇒ teeth F-2 belum tervalidasi di RC (§6.2) | test-only | Forge (follow-up kartu) |
| B-3 | Dua jalur harness (F-* vs w4/RX2) masih divergen; mitigasi F-5 (`Connection: close`) **tidak ada** di tree kanonik ⇒ kelas flake `UND_ERR_SOCKET` masih berlaku saat kotak berbeban | test-only | kartu `t_f0de3b47` (ready) — belum dikerjakan, jadi RC ini dijalankan tanpa pagar itu |
| B-4 | `rate-limit.ts` hardening (W5-F2 `t_c8389787`) = **VETO, nol berkas berubah** ⇒ spoofable `x-forwarded-for`, pertumbuhan bucket, key IPv6 `/64` belum ditutup. Sentinel `t_b68c89af` menuntut H-1..H-3 sebelum apply | keamanan | Atlas/Sentinel (keputusan lanjut atau defer dengan catatan) |
| B-5 | W4 C-5 (kunci `order_id` vs `id` tak konsisten) masih parkir di triage `t_0f2e8222` | jalur uang, pra-eksisting | Atlas |
| B-6 | Higiene bukti: `fw41c-v-prefix-negative.sh` tidak memaku ref pra-fix (temuan `t_fe0513f6`) → kartu `t_8992bc55` ready; `C-6` tindak lanjut (`t_f1378674`) ready | test-only + docs | Forge (follow-up) |
| B-7 | `rx25-index-mutation.sh` menolak slug worktree ber-`staging` (§6.3) **dan** leg negatif RX2-5 tidak lagi merah di tree gabungan | test-only | Forge (follow-up kecil) |
| B-8 | Nina: transport Cloud masih mock (§7); S-1/S-2/S-3 pre-live terbuka | desain/aktivasi | Nova + Atlas (gerbang aktivasi terpisah) |

**Koreksi B-4 dari audit Sentinel (`t_59f08d02`, komentar di kartu `t_c0be1764`):** yang
ada di RC **bukan** versi base `src/lib/rate-limit.ts` — RC memuat **C-1** (`4677d12`: hanya
entri paling kanan `X-Forwarded-For` dipercaya, `TRUSTED_PROXY_HOPS` default 1) dari `e6dff09`
via garis promo, sudah di-review di `review-promo-r2-2026-10-14`. Yang di-VETO (`t_c8389787`)
adalah rencana **lain** yang memang nol berkas. Residual nyata (probe Sentinel): app tanpa
proxy ⇒ spoof tetap jalan; fallback `x-real-ip` = nilai klien; config invalid senyap; nol
batas pertumbuhan key; IPv6 `/64` tak diagregasi; multi-rule = quota burn parsial ⇒
**defer-dengan-syarat**, bukan blokir. Perubahan `clientIp` ini tidak muncul di §4 ⇒
wajib masuk rilis note (dicatat di sini supaya tidak hilang).

Di luar scope kartu ini (sengaja **tidak** dimasukkan ke RC): `feat/channel-aware-sender`
`d7b5527`, `fix/onboarding-memory-bridge` `709d502`, `feat/cloud-api-product-plan-2026-10-13`
`83cb77e`, jalur F-* (`c519599`/`2417823`, klon lain `forge-t_97867422`), dan patch promo
r4c (`t_e5bf027d` masih **blocked** menunggu lanjutan owner). Semuanya masih hidup di
branch masing-masing; tidak ada yang ditimpa.

---

## 10. Reproduksi

```bash
RC=/home/ubuntu/workspaces/thrivin/batch-2026-10-15/i1-staging-rc
cd $RC && git log --oneline --first-parent -12      # rantai merge
git merge-base --is-ancestor 9392cdd HEAD && echo base-ok
npm run lint && npm run build
bash tests/run-all.sh                                # pasca-B-1: ALL SUITES PASSED, exit 0
# B-1 (kartu t_91b4f733): merah dulu → hijau → gigi asersi → suite penuh
cd $RC && git show f19f523:tests/test-web-copy-copy.mts > /tmp/pre-b1-web-copy-copy.mts
git stash push -- tests/test-web-copy-copy.mts
node --experimental-strip-types tests/test-web-copy-copy.mts   # MERAH 19/20 exit 1 (A4)
git stash pop
node --experimental-strip-types tests/test-web-copy-copy.mts   # HIJAU 20/20 exit 0
bash ~/t_91b4f733-evidence/b1-teeth-control.sh                   # 4/4 mutasi tertangkap
node --experimental-strip-types tests/test-legal-draft-shape.mts # 122/122
# tiap suite satu per satu, tetap lanjut sesudah gagal:
bash ~/t_c0be1764-evidence/run-suites-serial.sh
bash ~/t_c0be1764-evidence/run-negatives.sh
```

Bukti mentah (log per suite, per mutasi, free -h, sweep) ada di
`~/t_c0be1764-evidence/logs/` dan disalin ke lampiran kartu
`~/.hermes/kanban/boards/thrivin/attachments/t_c0be1764/`.

## 11. Handoff

- RC siap di-QC Atlas dan di-audit Sentinel **sebagai RC staging**, bukan rilis.
- **Tip branch sekarang:** HEAD (tiga commit B-1 di atas `f19f523`) — `e0ca6dd`
  (test guard copy) + `fdbc793` (docs legal draft) + commit laporan ini.
  Nol push, nol apply, nol deploy.
- Yang paling perlu dilihat reviewer: resolusi 6 konflik (§4), perbedaan
  `test-legal-draft-shape.mts` (supersession terdokumentasi), kombinasi B2+D3 di
  `mock-scalev.mjs` (perubahan kecil di luar sekadar merge-resolution), **B-1 yang baru
  ditutup** (perlebaran assertion + gigi-nya di §6.1 — apakah "3 hari pertama" ATAU "72 jam"
  cukup kuat sebagai penjaga), dan sisa B-2/B-3/B-6/B-7.
- **Untuk Atlas/Sentinel — 3 keputusan yang saya tinggalkan terbuka** (§6.1, drift):
  satuan `src/lib/pricing-copy.ts` (masih "3 hari pertama", substansi sama), baris
  `privacy-delta:16` yang masih menyebut GARANSI-1 terbuka, dan header draft terms yang
  masih bilang "belum dipublikasikan".
- **Nol production deploy, nol apply staging, nol aktivasi outbound** dari kartu ini.
  Gerbang berikutnya (`t_065f8671`, Q1) memutuskan GO/NO-GO bersama owner.
