# DRAFT delta /privacy — Kebijakan Privasi Thrivin (KANDIDAT, BELUM DIPUBLIKASI)

**Status:** DRAFT approval-only. **Tidak ada perubahan** pada `src/app/privacy/page.tsx` di branch ini.
Penerapan = pekerjaan W4 (`t_f5ec336c`) setelah Raihan menyetujui dan setelah S0 B-2/B-3 selesai.
**Base:** `9392cdd`. **Berkas:** `src/app/privacy/page.tsx` (109 baris, 4 pasal).

Konvensi marker sama dengan `terms-draft-2026-10-15.md` (`S=` sumber, `A=` asumsi, `O=` pertanyaan owner).
Registry asumsi & pertanyaan owner ada di dokumen T&C; dokumen ini hanya memakai id-nya.

## Kondisi sekarang (fakta + akibatnya)

| # | Yang tertulis hari ini | Baris | Masalah |
|---|---|---|---|
| 1 | §1 data: nomor WhatsApp, profil fisik/target, media (foto makanan, screenshot Strava) | `src/app/privacy/page.tsx:51-61` | Tidak menyebut nama panggilan (nickname), status persetujuan, catatan kanal WhatsApp/binding, atau status pengingat — padahal kontrak S0 §3 mewajibkannya sebagai data yang disimpan. |
| 2 | Banner: data "**100% aman, dienkripsi**, tidak pernah dijual atau disebarkan ke pengiklan pihak ketiga" | `:39-45` | Klaim absolut tanpa bukti yang bisa ditunjukkan dari repo (mana yang terenkripsi? in-transit saja?). Belum dijawab: LEGAL-2. |
| 3 | §3 Garansi uang kembali 3 hari | `:78-85` | Satu-satunya sumber bunyi garansi; teks UI lain harus ≤ ini. Jendela/kanal/potongan belum diputuskan: GARANSI-1..3. |
| 4 | §4 Kontak (`wa.me/6287788141388`) | `:91-101` | Satu-satunya kanal. Tidak ada janji SLA, tidak ada alamat/entitas hukum: KONTAK-1, LEGAL-5. |
| 5 | — | — | Tidak ada pasal pengingat, cara berhenti, retensi, hak akses/hapus, atau daftar pihak ketiga. |

Catatan kejujuran: klaim media (§1 poin "foto makanan / screenshot Strava") **tidak punya bukti kode di
repo web ini** (A10). Retensi & penyimpanan media tidak bisa diverifikasi dari sini → DATA-3.

---

## D1. Sisipan untuk §1 "Data Apa Saja yang Kami Kumpulkan"

> - **Preferensi Panggilan:** nama panggilan (nickname) yang kamu isi, dipakai Nina untuk menyapamu.
> - **Status Persetujuan:** catatan kapan dan dari mana kamu menyetujui Syarat & Ketentuan serta
>   pengingat WhatsApp, termasuk versi teks yang kamu lihat. Catatan ini bersifat *append-only*: kami
>   menambah baris baru, tidak menimpa riwayat.
> - **Kanal WhatsApp & Catatan Kanal:** jenis kanal yang kamu pakai (WhatsApp Business/Cloud API atau
>   kanal WhatsApp tidak resmi), ID nomor pengirim untuk kanal Cloud, serta waktu pesan masuk terakhir.
>   Data ini dipakai untuk menentukan apakah Nina boleh mengirim pesan bebas di luar template resmi.
> - **Status Pengingat:** ikut/tidak ikut pengingat proaktif (opsional, terpisah dari persetujuan transaksi).

**Provenance:** S=`S0 kontrak §3`, `S0 kontrak §7`, `w1 head 26029cc report §5.1`, `obsidian features/channel-aware-sender-2026-10-13.md` · A=A1, A9 · O=CONSENT-2

**Prasyarat:** tiga dari empat butir ini menyebut data yang **belum ada tabelnya** (consent, binding).
Jangan dipublikasikan sebagai "sudah kami simpan" sebelum W4 membangunnya. Selama belum ada, tulis
dalam bentuk rencana, bukan janji.

## D2. Pasal baru: "Pengingat WhatsApp & Cara Berhenti" (setelah §2)

> Pengingat proaktif bersifat opsional dan hanya dikirim kalau kamu mengaktifkannya sendiri; menolak
> pengingat tidak menghalangi pembelian. Pengingat hanya dikirim pada 07.00–21.00 waktu lokal, dengan
> jeda minimal 20 jam antar pengingat. Kamu bisa berhenti kapan saja dengan menekan tombol berhenti pada
> pesan pengingat (berlaku langsung) atau membalas `BERHENTI`/`STOP` (kami minta konfirmasi singkat).
> Setelah berhenti, kamu tetap bisa memakai layanan dan bisa mengaktifkan kembali lewat Customer Service.

**Provenance:** S=`spec proaktif §A/§E/§H`, `S0 kontrak §8` · A=A2, A3 · O=OPTOUT-1, CONSENT-1

## D3. Perbaikan klaim absolut di banner (§ pembuka)

Teks sekarang: "Data nomor WhatsApp, foto makanan, riwayat olahraga, dan percakapan pribadimu dengan AI
Companion 100% aman, dienkripsi, dan tidak pernah dijual atau disebarkan ke pengiklan pihak ketiga mana
pun." — `src/app/privacy/page.tsx:42-44`.

Usulan pengganti (menunggu LEGAL-2; **jangan terapkan** sebelum dijawab):

> Kami melindungi datamu dengan kontrol akses server-side dan koneksi terenkripsi (HTTPS/TLS). Kami tidak
> menjual datamu dan tidak membagikannya ke pengiklan. Data hanya diteruskan ke pihak yang diperlukan
> untuk menjalankan layanan («DAFTAR PIHAK KETIGA»).

**Provenance:** S=`src/app/privacy/page.tsx:39-45`, `securing-agent-data-access` (kontrol akses server-side) · A=— · O=LEGAL-2, LEGAL-3

Alasan: "100% aman" + "dienkripsi" tanpa kualifikasi adalah klaim yang tidak bisa dibuktikan dari artefak
mana pun; klaim berlebih = risiko. Tidak ada perubahan dilakukan di branch ini.

## D4. Pasal baru: "Berapa Lama Kami Menyimpan Data" (placeholder)

> Kami menyimpan data akunmu selama langganan aktif dan «RETENSI SETELAH BERAKHIR». Kamu bisa meminta
> akses, salinan, atau penghapusan data lewat «KANAL & SLA HAK DATA».

**Provenance:** S=`S0 kontrak §6` · A=— · O=DATA-1, DATA-2

## D5. Pasal baru: "Pihak Ketiga yang Kami Pakai"

> Untuk memproses pembelian kami memakai penyedia pembayaran («PENYEDIA PEMBAYARAN»); untuk mengirim
> pesan WhatsApp kami memakai kanal WhatsApp Business («PENYEDIA PESAN»). Data minimum yang diperlukan
> (nama, nomor WhatsApp, rincian paket) diteruskan ke penyedia tersebut. Syarat & kebijakan privasi
> mereka berlaku pada layanan mereka.

**Provenance:** S=`src/app/api/scalev/create-order/route.ts:206-214`, `obsidian features/whatsapp-cloud-api.md` · A=A9 · O=LEGAL-3

Dilarang: menuliskan isi syarat/kebijakan pihak ketiga dari ingatan, atau menyebut nama merek tanpa izin owner.

## D6. Pasal baru: "Perubahan Kebijakan & Versi"

> Kalau kebijakan ini berubah secara material, kami memberitahukan lewat «KANAL PEMBERITAHUAN» sebelum
> berlaku. Versi teks yang kamu setujui tersimpan bersama bukti persetujuanmu.

**Provenance:** S=`S0 kontrak §3` · A=A1 · O=TERMS-2

## D7. Data kesehatan (media & aktivitas)

Belum diputuskan apakah screenshot Strava/smartwatch dan catatan cedera diperlakukan sebagai data
kesehatan dengan perlakuan khusus. Jangan menambahkan janji perlakuan khusus sebelum DATA-3 dijawab.

**Provenance:** S=`src/app/privacy/page.tsx:59`, `:74` · A=A10 · O=DATA-3

---

## Urutan penerapan yang diusulkan untuk W4

1. Tunggu approval owner atas `terms-draft` + delta ini (TERMS-1 menentukan bentuk).
2. Tunggu S0 B-2 (kolom consent) & B-3 (binding) selesai — D1 tidak boleh jadi janji sebelum datanya ada.
3. Baru: tambah `src/app/terms/` + link footer/checkout + privasi §baru, dalam satu diff yang direview
   Sentinel (jalur pelanggan + klaim legal).
4. Update `src/app/sitemap.ts` (`/terms`, priority rendah) hanya setelah route disetujui. Bentuk
   `robots.ts` tidak perlu berubah (`/terms` tidak masuk daftar disallow).
