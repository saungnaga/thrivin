# W5 — Kritik & Saran (A8): `/companion/nina/kritiksaran` + `POST /api/feedback`

**Kartu:** `t_1e5ab196` (assignee `forge`) · **Root:** `t_fdba2939` · **Parent gate:** S0 `t_788d7064`
**Tanggal:** 2026-10-15 · **Branch:** `feat/feedback-kritiksaran-2026-10-15`
**Base:** `9392cdd` (`release/rc-integration-2026-10-13`) — **bukan** `origin/main` (pra-remediasi VETO, S0 B-1)
**Commit implementasi:** `15afd4d` · **W5-RX:** `3434176` + `1cab927` (lihat bagian W5-RX di bawah)
**Status:** ✅ kode + suite lokal hijau · ⛔ **BLOCKED-LIVE** — `review-required` ke Sentinel

Kontrak acuan: `batch-2026-10-15/s0-security/integration-contract.md` §6 (feedback), §11 (nama & angka).
Kondisi S0 untuk W5: `s0-security/report.md` §5 baris W5.

---

## 1. Ringkasan

Halaman kritik & saran end-to-end: form SSR + satu route tulis, tanpa jalur baca.
Yang dijaga (dan diuji) adalah empat hal yang biasanya bocor di fitur seperti ini:
**sukses palsu, duplikat, XSS tersimpan, dan kebocoran daftar keluhan.**

Tidak ada SQL yang di-apply, tidak ada deploy, tidak ada push, tidak ada data
customer, tidak ada kredensial produksi yang disentuh. Semua tes berjalan di
Postgres + PostgREST lokal dengan data dummy.

## 2. Yang dibangun

| Berkas | Isi |
|---|---|
| `staging/schema-feedback-kritiksaran.sql` | **DRAFT, belum di-apply.** Tabel `feedback` (+ `request_token`, `review_state`, `expires_at`), unique `(tenant_id, request_token)`, `REVOKE` eksplisit dari `PUBLIC/anon/authenticated`, `GRANT SELECT, INSERT` ke `service_role`, RLS deny + `FORCE`, `purge_expired_feedback()` |
| `src/lib/feedback.ts` | Batas masukan server: sanitasi (kontrol C0/C1 dibuang, CRLF→LF, trim), batas 10–2000, bentuk token, normalisasi kontak; `insertFeedbackOnce()` idempotent + baca-ulang |
| `src/app/api/feedback/route.ts` | `POST` saja; Content-Type JSON wajib (415), body ≤ 8 KiB (413), validasi (400), rate limit (429 + `Retry-After`), gagal simpan (503), sukses `{ok:true}` 201; `GET/PUT/PATCH/DELETE` → 405 |
| `src/app/companion/nina/kritiksaran/page.tsx` | Halaman SSR, `noindex`, `canonical`, Navbar/Footer, label + catatan data yang disimpan |
| `src/app/companion/nina/kritiksaran/FeedbackForm.tsx` | Satu-satunya komponen klien: `request_token` dibuat sekali (ref, dipakai ulang saat retry), layar sukses = teks statis, error `role="alert"` |
| `tests/test-feedback-units.mts` | 64 check: batas masukan + properti kode terkirim (tanpa kunci DB di bundle, tanpa HTML sink, a11y, bentuk route, bentuk SQL) |
| `tests/test-feedback-e2e.mts` | 67 check: HTTP nyata → PostgREST → Postgres (lihat §4) |
| `tests/test-feedback-negatives.sh` | Bukti negatif: rusak dua jaminan → suite **harus** gagal |
| `tests/harness/migrations/{004-feedback-kritiksaran,005-harness-feedback-anon-grant}.sql` | 004 = salinan otomatis dari `staging/`; 005 = harness-only, meniru grant default Supabase untuk objek baru |
| `tests/harness/seed.sh`, `tests/run-all.sh` | 004 ikut di-copy + di-apply; suite feedback masuk `run-all.sh` |

## 3. Kepatuhan ke kondisi S0 (W5)

| Kondisi S0 | Cara dipenuhi | Bukti |
|---|---|---|
| Validasi server | `validateFeedbackPayload()` — panjang, token, kontak; UI hanya cermin | unit + e2e negatif |
| Batas ukuran | 10–2000 karakter; body mentah > 8 KiB → 413 | `too short`/`too long`/`oversized body` |
| Rate limit | `limitRequest()` per IP (15/10 menit) dan per kontak (4/10 menit) | `request 16 from the same IP -> 429`, `5th send for the same contact -> 429` |
| Simpan sebagai teks | `message_text TEXT`; payload markup tersimpan byte-for-byte | `payload stored byte-for-byte as TEXT` |
| Render sebagai teks | 201 = `{ok:true}` tanpa gema; layar sukses statis; `{message}` hanya sebagai `value=` | `response body contains no part of the payload`, check statis `{message}` 1 occurrence |
| Terima kasih hanya setelah insert durable | 503 kalau store gagal; 201 hanya setelah insert + baca-ulang terkonfirmasi | `unreachable DB -> 503`, `missing Supabase config -> 503 (no disk fallback)` |
| Retensi & akses operator ditandai untuk approval legal | `expires_at` + purge = **placeholder** (ditandai di SQL + laporan); tidak ada janji retensi di UI | §7 |

## 4. Bukti test

```
bash tests/run-all.sh        # exit 0 — ALL SUITES PASSED
  1/5 harness            (Postgres + PostgREST lokal, 7 tabel)
  2/5 unit               29/29 remediation + 64/64 feedback
  3/5 guard              ALL GUARD UNIT CHECKS PASSED
  4/5 webhook e2e        57/57
  5/5 feedback e2e       67/67
npm run lint               tsc --noEmit exit 0
npm run build              exit 0; /companion/nina/kritiksaran prerender 5,57 kB
```

Cakupan e2e (67 check):

- **happy** — 201, tepat satu baris, teks tersimpan ter-trim apa adanya, kontak `08…` → `62…`, `review_state='new'`; kiriman **tanpa** kontak → baris `phone NULL`.
- **XSS** — `<script>alert('xss')</script>` diterima sebagai teks, tersimpan utuh di DB, **tidak** muncul di body response.
- **retry & concurrency** — token sama 2× → 201 dua kali, **1 baris**; teks berbeda dengan token sama **tidak** menimpa; 5 POST paralel → **1 baris**, semua 201.
- **negatif validasi** — pendek / panjang / spasi saja / tanpa token / token rusak / nomor ngawur → 400; Content-Type salah → 415; JSON rusak → 400; body 9 KB → 413; **nol** baris tertulis.
- **abuse** — 15 kiriman diterima lalu 429 (+`Retry-After`); per kontak 4 lalu 429.
- **tanpa jalur baca** — `GET/PUT/PATCH/DELETE /api/feedback` → 405, `Allow: POST`.
- **SSR** — HTML memuat `id="message"`, `aria-describedby`, `maxlength=2000`/`minlength=10`, `type="submit"`, label terhubung, `robots noindex`.
- **bundle klien** — setiap chunk JS yang direferensikan halaman diambil lalu digrep: service-role key **tidak ada**.
- **log** — nomor dan token uji tidak muncul di log server; sukses tercatat `[Feedback] stored id=… duplicate=…`.
- **DB mati** — `SUPABASE_URL` tak terjangkau → **503**, body tanpa penanda sukses, **nol** baris.
- **Supabase belum dikonfigurasi** — 503 (gagal-tertutup, **tanpa** fallback disk yang bisa memalsukan sukses).
- **anon-key buta** — 1 baris ditanam sebagai service role; anon membaca **0** baris.

## 5. Bukti negatif (suite harus bisa gagal)

`bash tests/test-feedback-negatives.sh` merusak satu jaminan sekaligus di
`src/app/api/feedback/route.ts`, rebuild, jalankan suite, lalu **memulihkan pohon
dan rebuild lagi**:

| Mutan | Yang dirusak | Hasil suite |
|---|---|---|
| M1 | kegagalan insert dijawab `201 {"ok":true}` (sukses palsu) | suite **GAGAL** di `unreachable DB -> 503`, `503 body carries no success marker`, `missing Supabase config -> 503 (no disk fallback)` |
| M2 | `GET` menjawab 200 berisi baris | suite **GAGAL** di `GET /api/feedback -> 405`, `405 advertises POST only` |

Tambahan di dalam e2e (mutasi RLS): `ALTER TABLE feedback DISABLE ROW LEVEL
SECURITY` → anon **melihat** barisnya; policy dipasang kembali → anon buta lagi.
Artinya check "anon buta" tidak lulus karena kebetulan (grant yang hilang), tapi
karena policy-nya benar-benar bekerja — pelajaran dari kebocoran view promo.

## 6. Temuan selama kerja

1. **Harness harus meniru grant default Supabase, kalau tidak test "anon ditolak"
   lulus palsu.** Tanpa `005-harness-feedback-anon-grant.sql`, anon gagal baca
   karena *tidak ada GRANT*, bukan karena RLS — sama persis dengan pola yang bikin
   kebocoran `v_promo_codes` lolos suite. Ditambah mutasi RLS di dalam e2e.
2. **Server nyasar di port = suite mengukur proses yang salah.** Saat menulis
   script bukti negatif, `next start` yang lama tidak mati (SIGKILL kena wrapper
   `./node_modules/.bin/next`, bukan proses `next-server` anaknya) → build
   berikutnya tidak bisa mengikat port, dan suite diam-diam mengukur server
   **mutan** yang lama: muncul "201 tapi nol baris" yang nyaris saya laporkan
   sebagai bug produk. Perbaikan di suite: spawn `detached` + bunuh **process
   group**, plus preflight yang menolak jalan kalau port sudah terpakai
   (`fuser -k 3991/tcp`). Pelajaran umum: suite e2e harus hermetik di port-nya.
3. **React 19 men-SSR nama atribut camelCase** (`maxLength="2000"`) — assertion
   HTML harus case-insensitive; perilaku browser tidak berubah.
4. `expires_at` default 365 hari **bukan janji**; ditandai `PLACEHOLDER` di SQL dan
   laporan, menunggu keputusan legal/owner bersama W2.
5. **Bukti negatif bisa "hijau" karena label, bukan karena jaminan.** Saat dijalankan
   ulang, `test-feedback-negatives.sh` keluar **1** walaupun suite sudah benar-benar
   merah: script menuntut check bernama `503 body makes no success claim`, sedangkan
   nama check itu di e2e sudah jadi `503 body carries no success marker`. Mutan tetap
   tertangkap (M1 → 3 FAIL, M2 → 2 FAIL, exit 1), tapi gerbang script-nya sendiri
   menolak lulus → label disinkronkan. Pelajaran: daftar check yang diharapkan
   (`expected FAIL`) ikut mati kalau nama check berubah; mutation proof harus
   memverifikasi **perilaku** (suite non-zero), bukan cuma string label. Jalankan
   script tanpa `| tee` — exit code pipeline akan menutupi kegagalan script.

## 7. Blocked-live & keputusan yang dibutuhkan

| # | Butuh | Dari siapa |
|---|---|---|
| 1 | Delta-review `staging/schema-feedback-kritiksaran.sql` lalu apply (tabel + grant/RLS + purge) | **Sentinel** |
| 2 | Angka retensi final (sekarang placeholder 365 hari) | owner + legal (bareng W2) |
| 3 | Siapa yang boleh baca kotak masuk (akses operator; belum dibangun) | owner |
| 4 | Verifikasi tulis di staging setelah apply (smoke test) — sekarang belum mungkin, tabelnya belum ada di staging | Forge, setelah #1 |
| 5 | Anti-abuse multi-instance (`limitRequest` per proses) kalau app jalan >1 instance | Atlas (keputusan infra) |

## 8. Batas klaim (jujur, untuk reviewer)

- **Identitas terverifikasi belum diaktifkan.** Basis `9392cdd` tidak punya modul
  sesi terverifikasi (W3 `feat/wa-first-2026-10-15` belum di RC). Kontak di sini
  **opsional dan belum terverifikasi**; jalur upgrade tanpa ubah tabel: route
  mengisi `phone` dari sesi server-side dan field `contact` dari klien diabaikan.
- `limitRequest` in-process per instance — jujur bukan pengaman multi-instance.
- UI diuji di level markup SSR + alur HTTP. Harness tidak punya browser headless,
  jadi aksesibilitas diperiksa sebagai atribut (`label`, `aria-describedby`,
  `role=alert`, `aria-live`, `inputMode`, `autoComplete`, focus ring, `tabIndex=-1`),
  bukan simulasi ketukan di perangkat.
- Skema diuji terhadap harness yang meniru `staging/schema/*.sql` — **bukan**
  terhadap Supabase staging/produksi.
- Tulis dari halaman ke staging **belum** diverifikasi (tabel belum ada di sana).
- Belum ada klaim retensi/kepatuhan: UI menyebut "kami simpan tulisanmu beserta
  waktu kirim", tanpa durasi.

## 9. Yang TIDAK dilakukan (batas kepatuhan)

- Nol apply SQL/migrasi (staging maupun produksi).
- Nol deploy, nol push, nol perubahan pada `origin/main`, nol perubahan pada Nina produksi.
- Nol outbound (WhatsApp/Cloud/Scalev), nol panggilan jaringan eksternal.
- Nol akses `.env` produksi, log produksi, DB customer, atau kredensial produksi.
- Nol perubahan pada file lain di luar daftar §2 (kecuali `seed.sh`/`run-all.sh`
  yang memang harus ikut agar suite menjalankan tes baru).
- Tidak ada janji retensi/kepatuhan hukum yang ditulis ke UI.

## 10. Cara reviewer mereproduksi

```bash
cd /home/ubuntu/workspaces/thrivin/batch-2026-10-15/w5-feedback
npm run lint                                   # exit 0
bash tests/run-all.sh                          # ALL SUITES PASSED
bash tests/test-feedback-negatives.sh           # MUTATION PROOF OK (harus exit 0)
```

Butuh: Postgres lokal (role `postgres` via `sudo -u postgres`), PostgREST di
`/tmp/postgrest`, node ≥ 22. Tidak butuh kredensial apa pun.

---

# W5-RX — remediasi temuan audit (F-1, F-3, F-4, F-5)

**Kartu:** `t_51e47cf0` · **Audit:** `t_63b7eb66` (`security/review-w5-feedback-2026-10-15.md`)
**Scope:** hanya empat temuan di bawah. F-2 (rate-limit header dari penyerang) ada di kartu
sendiri untuk pemilik `rate-limit.ts`. C-1..C-6 tetap seperti semula (C-4/C-6 bukan scope ini).
**Status:** ✅ hijau lokal + bukti GAGAL pra-fix · ⛔ belum push/deploy/apply.

## RX-1 (F-1) — batas body ditegakkan SEBELUM body dibaca

Dulu: `await req.text()` dulu, `Buffer.byteLength > 8192` belakangan. Sekarang
`readBoundedBody()` (`src/lib/feedback.ts`):

- `content-length` > 8 KiB → tolak **tanpa menyentuh body** (413 bisa dikirim saat klien
  masih mengirim);
- tanpa `content-length` (chunked) → body dibaca per-chunk lewat `getReader()` dan
  **dihentikan** begitu lewat 8 KiB (`reader.cancel()`); tidak ada buffer tak terbatas.

Lapis kedua di tepi: `docs/reverse-proxy-body-limit.md` (nginx `client_max_body_size 16k` /
Caddy `max_size 16KB` untuk `location = /api/feedback`). **Dokumen saja — belum diterapkan**,
pemilik penerapan Atlas; konfigurasi proxy bukan bagian repo ini.

## RX-2 (F-3) — isi tulisan & token tidak bisa masuk log

`upstreamError()` hanya menyimpan `status` + `code` hasil-putih (`^[A-Za-z0-9_]{1,16}$`).
Body PostgREST **tidak pernah** dibaca jadi string lagi (`res.text()` hilang dari
`src/lib/feedback.ts`, ada check statis yang menjaganya). Field `details` (yang memuat baris
gagal, teks pengguna, dan `request_token`) dan `message` (Postgres kadang mengutip nilai yang
salah) keduanya dibuang.

## RX-3 (F-4) — panjang dihitung sebagai karakter, seperti `char_length`

`messageLength()` = `[...s].length` (code point) dipakai di validasi **dan** di penghitung
karakter UI (`FeedbackForm.tsx`). Sekelas itu: **unpaired surrogate** (mis. `\ud800`) bukan
UTF-8 valid dan dulu lolos ke Postgres → 503 yang tidak bisa diperbaiki pengguna; sekarang
dibuang di `sanitizeMessageText()`.

Catatan jujur: atribut HTML `maxLength`/`minLength` tetap dihitung browser dalam unit UTF-16,
jadi batas klien lebih ketat dari batas server untuk teks astral — arahnya aman (server tidak
akan menerima apa yang tidak bisa dikirim UI), tapi angkanya tidak identik. Penghitung yang
dilihat pengguna sudah konsisten.

## RX-4 (F-5) — token sama + teks beda = 409, bukan 201 palsu

Baca-ulang setelah duplikat sekarang mengambil `message_text` dan membandingkannya dengan
teks yang dikirim. Beda → **409** + pesan "tulisan ini sudah tersimpan sebelumnya. Muat ulang
halaman kalau mau mengirim versi baru." Baris lama tetap utuh, teks baru tidak disimpan diam-diam.
Teks **sama** dengan token sama tetap 201 (retry idempoten tidak berubah).

## RX-5 Bukti

```
npm run lint                 exit 0 (tsc --noEmit)          — /tmp/w5rx-lint.log
npm run build                exit 0 (NODE_OPTIONS=--max-old-space-size=1024)
SKIP_BUILD=1 bash tests/run-all.sh
                             exit 0 · ALL SUITES PASSED      — /tmp/w5rx-runall.log
    2/5 unit                 29/29 remediation + 84/84 feedback (sebelumnya 64)
    3/5 guard                ALL GUARD UNIT CHECKS PASSED
    4/5 webhook e2e          57/57
    5/5 feedback e2e         90/90 (sebelumnya 67)
bash tests/test-feedback-negatives.sh
                             exit 0 · MUTATION PROOF OK       — /tmp/w5rx-negatives.log
```

Check baru di e2e (yang membuat temuan bisa dibuktikan):

| Temuan | Check | Pra-fix | Sesudah |
|---|---|---|---|
| F-1 | `declared 100 KiB body -> 413 without any of it being read` | **FAIL** (tak ada jawaban dalam 5000 ms — server masih menunggu body) | PASS |
| F-1 | `chunked body past the ceiling -> 413 before the stream ends` | **FAIL** (idem) | PASS |
| F-1 | `small chunked body still accepted (streamed path intact)` | PASS | PASS |
| F-3 | `submitted emoji never reaches the log` | **FAIL** | PASS |
| F-3 | `request token never reaches the log on the failure path` | **FAIL** | PASS |
| F-3 | ``PostgREST `details` (the failing row) is never logged`` | **FAIL** | PASS |
| F-3 | `the failure is logged as status + code only` | **FAIL** | PASS |
| F-4 | `5 emoji (JS length 10) -> 400, never a 503` | **FAIL** (503) | PASS |
| F-4 | `10 emoji -> 201 (no DB CHECK rejection)` + `char_length = 10` | PASS | PASS |
| F-4 | `text with an unpaired surrogate -> 201, not a 503` | **FAIL** (503) | PASS |
| F-4 | `the unpaired surrogate was stripped` | **FAIL** | PASS |
| F-5 | `same token + different text -> 409 (the edit was NOT stored)` | **FAIL** (201) | PASS |
| F-5 | `409 body carries no success marker` | **FAIL** (body `{"ok":true}`) | PASS |
| F-5 | `one racer wins with 201` / `the other four are 409, not a false 201` | **FAIL** (5×201) | PASS |

### Bukti GAGAL pra-fix (bukan cuma "hijau sesudah")

Cara: `git stash push` **hanya tiga berkas `src/`** (suite tetap versi baru) → build ulang →
jalankan suite → `git stash pop` → verifikasi hash.

```
sha1(fixed)  2507098ddfa8d5f0f6c7b2979bc8b85f5ec07139  src/lib/feedback.ts
             6459ca1e394c5dc4d6c53cd86c27b049c57ac1dc  src/app/api/feedback/route.ts
             700230a667fe90e76b14d2e39620da3bcc272b4b  src/app/companion/nina/kritiksaran/FeedbackForm.tsx
pra-fix      suite exit 1 · FAILED 13 of 90 (semua di tabel di atas)   — /tmp/w5rx-prefix-e2e-final.log
sesudah pop  sha1sum -c → ketiga berkas OK, git status bersih (kecuali perubahan yang dimaksud)
```

Baris log mentah pra-fix (probe terpisah, build pra-fix, `/tmp/w5rx-prefix-server-log.txt`) —
inilah kebocoran yang ditutup RX-2:

```
[Feedback] store failed: Error: [Feedback] insert failed: 400 {"code":"23514","details":"Failing row
contains (2a8f5557-…, thrivin, null, Probe F-3 pre-fix 😀😀 dengan token rahasia di dalam tulisan…,
probeleak0123456789abcdef01234567, new, …)","hint":null,"message":"new row for relation \"feedback\"
violates check constraint \"tmp_w5rx_probe\""}
```

### Mutation proof (behavioral, `exit 0`)

`tests/test-feedback-negatives.sh` sekarang punya enam mutan; tiap mutan merusak **satu** fix,
suite dijalankan ulang (perilaku, bukan cuma label), lalu pohon direstore + build ulang oleh
trap `EXIT`. Jalankan sebagian dengan `MUTANTS="m1 m3"`.

| Mutan | Yang dikembalikan ke perilaku lama | Hasil suite |
|---|---|---|
| M1 (W5) | kegagalan insert dijawab `201 {"ok":true}` | suite **GAGAL** 4 check (false thank-you + 503 checks) |
| M2 (W5) | `GET` menjawab 200 berisi baris | suite **GAGAL** 2 check (405 + `Allow: POST`) |
| M3 (F-1) | body dibaca penuh sebelum batas 8 KiB | suite **GAGAL** 2 check (`declared 100 KiB` / `chunked body` tidak dijawab dalam 5 s) |
| M4 (F-3) | body error PostgREST mentah masuk log | suite **GAGAL** 4 check (emoji, token, `details`, `code=`) |
| M5 (F-4) | `messageText.length` + surrogate utuh | suite **GAGAL** 3 check (5 emoji 503, surrogate 503/tidak dibuang) |
| M6 (F-5) | duplikat diterima tanpa membandingkan teks | suite **GAGAL** 4 check (409 → 201, 5×201 di balapan) |

Integritas pohon pasca-run: `sha1sum -c` ketiga berkas `src/` **OK**, `git status` hanya
menampilkan perubahan yang dimaksud. Log: `/tmp/w5rx-negatives.log`,
`/tmp/thrivin-feedback-negative-{m1..m6}.log`.

### Temuan proses selama W5-RX

1. **Harness beberapa worktree berbagi port, DB, dan `/tmp/thrivin-harness-postgrest.conf`.**
   Run pra-fix pertama saya memberi 503 di happy path — bukan bug produk, tapi proxy PostgREST
   milik worktree lain (W3) yang memegang 54321 saat suite saya jalan. Pelajaran yang sama
   dengan catatan proses audit §2: suite e2e harus hermetik; kalau tidak, hasilnya mengukur
   proses tetangga. Verifikasi W5-RX dijalankan dengan `HARNESS_PG_DB=thrivin_w5rx_prefix`
   + port 54331/54332/3995 supaya tidak tergantung siapa pun yang sedang jalan. Saran ke Atlas:
   default port/DB harness sebaiknya diturunkan dari worktree, bukan konstanta global.
2. Rancangan F-5 mengubah arti uji concurrency lama ("5 kiriman paralel, token sama, teks
   **beda** → semua 201") menjadi salah: dengan F-5, teks berbeda pada token sama memang
   konflik. Uji itu sekarang dikirim dengan teks **sama** (double-tap nyata), plus uji baru
   "satu menang 201, empat 409" untuk kasus teks berbeda.

## RX-6 Batas klaim

- Semua bukti **lokal** (next build/start + PostgREST + Postgres lokal, data dummy). Nol
  staging/produksi, nol apply SQL, nol deploy, nol push, nol kredensial produksi.
- Batas di reverse proxy **belum diterapkan**; dokumen `docs/reverse-proxy-body-limit.md` adalah
  serah-terima untuk Atlas, bukan konfigurasi hidup.
- Yang dibuktikan untuk F-1 adalah **perilaku** (413 datang tanpa menunggu body selesai /
  tanpa membaca sampai akhir) — bukan pengukuran alokasi memori.
- Aksesibilitas & UI tetap diuji sebagai markup/alur HTTP (tidak ada browser headless).
- Retensi: `purge_expired_feedback()` tetap **tidak dijadwalkan** dan `expires_at` 365 hari
  tetap **placeholder** (kondisi C-1 dari audit) — tidak ada klaim retensi berangka di dokumen ini.
