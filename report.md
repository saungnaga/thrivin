# W5 — Kritik & Saran (A8): `/companion/nina/kritiksaran` + `POST /api/feedback`

**Kartu:** `t_1e5ab196` (assignee `forge`) · **Root:** `t_fdba2939` · **Parent gate:** S0 `t_788d7064`
**Tanggal:** 2026-10-15 · **Branch:** `feat/feedback-kritiksaran-2026-10-15`
**Base:** `9392cdd` (`release/rc-integration-2026-10-13`) — **bukan** `origin/main` (pra-remediasi VETO, S0 B-1)
**Commit implementasi:** `15afd4d`
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
| M1 | kegagalan insert dijawab `201 {"ok":true}` (sukses palsu) | suite **GAGAL** di `unreachable DB -> 503`, `503 body makes no success claim`, `missing Supabase config -> 503 (no disk fallback)` |
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
