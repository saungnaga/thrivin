# DRAFT /terms — Syarat & Ketentuan Thrivin (KANDIDAT, BELUM DISETUJUI, BELUM DIPUBLIKASI)

**Status:** DRAFT approval-only. Tidak ada route `/terms`, tidak ada link footer/checkout, tidak ada
klaim kepatuhan hukum. Publish = pekerjaan W4 (`t_f5ec336c`) **setelah** Raihan menyetujui teks.
**Base:** `9392cdd` (`release/rc-integration-2026-10-13`). Branch: `docs/legal-draft-terms-privacy-2026-10-15`.
**Batas:** dokumen legal bukan jaminan kepatuhan hukum. Teks di bawah bukan nasihat hukum.

## Cara baca dokumen ini

Setiap pasal punya blok **teks kandidat** (yang nanti dibaca pelanggan) + baris `**Provenance:**`:

| Token | Arti |
|---|---|
| `S=` | sumber di kode/dokumen (path relatif repo, dengan baris). Klaim hanya boleh sekuat sumbernya. |
| `A=` | asumsi yang dipakai draft ini, terdaftar di §Registry asumsi. |
| `O=` | pertanyaan/​keputusan owner yang BELUM dijawab, terdaftar di §Registry pertanyaan owner. |

Tanda `«…»` = **placeholder**: ada keputusan kebijakan yang belum diambil. Dilarang diisi sendiri oleh engineer.

---

## Registry asumsi (status verifikasi, bukan janji)

- **A1** — Status persetujuan akan disimpan di `users.opt_in` / `users.opted_out` + tabel event append-only `consent_events`, dengan versi teks dan timestamp server. **Belum ada di skema mana pun** (S0 B-2). Selama belum dibangun, draft ini tidak boleh mengklaim "kami mencatat persetujuanmu".
- **A2** — Aturan pengingat: hanya kirim 07.00–21.00 waktu lokal, jeda minimal 20 jam antar pengingat proaktif, tombol OPTOUT berhenti langsung, kata BERHENTI/STOP butuh konfirmasi `IYA`. Sumber: spec proaktif §A/§E/§H + tambahan owner §1. Engine-nya **belum dibangun** (N1/N2).
- **A3** — Zona waktu: tidak ada kolom tz di `users`; draft memakai konstanta `Asia/Jakarta` (WIB) sebagai asumsi teruji.
- **A4** — Bunyi garansi uang kembali mengikuti teks yang **sudah dipublikasikan** di `/privacy` §4 dan `/terms` §6: klaim dalam **72 jam (3×24 jam) sejak pembayaran diterima**, dana 100% tanpa potongan. Satuan kanonik = 72 jam (keputusan 2026-10-18, kartu `t_91b4f733`, mandat ACC owner 18/10); "3 hari pertama" di copy UI lama (`src/lib/pricing-copy.ts`) adalah jendela yang sama, bukan jendela berbeda. Draft tidak boleh lebih kuat dari itu.
- **A5** — Kuota token per paket 100k/500k/2M. Perilaku saat kuota habis sebelum masa aktif berakhir **belum diputuskan**.
- **A6** — Harga yang ditagih berasal dari katalog server (`PLAN_CATALOG`) + harga varian Scalev. Diketahui ada selisih `basePrice` vs `fallbackVariantPrice` pada quarter/half/year (`src/lib/plans.ts:51,61,71` vs `57,67,77`) — kalau lookup varian live gagal, angka tagihan bisa berbeda dari yang dibaca di checkout. Temuan W1 §6.1, belum diperbaiki.
- **A7** — Kuota promo `TEMANBAIKHATI` = 100 dan `TEMANBARU` = 20% hanya ada di `promo-ws/staging/schema-promo-codes.sql` (belum di RC). Angka ini bukan sumber kebenaran untuk teks publik.
- **A8** — Kanal kontak tambahan `https://thrivin.id/companion/nina/kritiksaran` **belum ada** (slice W5, `t_1e5ab196`). Draft menyebutnya hanya sebagai *rencana*.
- **A9** — Pengiriman pesan WhatsApp bisa lewat WhatsApp Business (Cloud API, Meta) atau jalur tidak resmi; kanal resmi **live tapi outbound diblokir Meta** (2026-10-14). Perilaku kanal = asumsi, bukan janji.
- **A10** — Penanganan media (foto makanan, screenshot Strava) **tidak ada bukti kodenya di repo web ini**; penyimpanan/retensi media belum dapat diverifikasi dari sini.

## Registry pertanyaan owner (yang sudah ditutup ditandai **DITUTUP**)

- **GARANSI-1** — **DITUTUP 2026-10-18** (kartu `t_91b4f733`, keputusan Koron atas mandat ACC owner 18/10): jendela garansi = **72 jam (3×24 jam) sejak pembayaran diterima**, bukan 3 hari kalender sampai 23:59 WIB. Teks publik di RC (`/privacy` §4, `/terms` §6) sudah berbunyi 72 jam; "3 hari pertama" di copy UI lama = jendela yang sama. Baris ini tetap terdaftar supaya id `GARANSI-1` tidak menggantung di pasal mana pun.
- **GARANSI-2** — Kanal klaim: hanya CS WhatsApp `wa.me/6287788141388`, atau perlu kanal/form tambahan? Siapa pemroses dan dalam berapa hari dana kembali?
- **GARANSI-3** — "100%" utuh, atau dipotong biaya gateway/admin? Kalau dipotong, copy "100%" di UI harus diubah.
- **PROMO-1** — Wording publik `TEMANBAIKHATI` (Rp 10.000 paket 3 bulan, 1× per nomor, kuota 100) disetujui? Boleh tampil di halaman mana dan sampai kapan?
- **KUOTA-1** — Kuota token habis sebelum masa aktif berakhir: layanan berhenti, ada top-up, atau tetap jalan dengan batas kecepatan?
- **DATA-1** — Retensi data profil & media setelah langganan berakhir (berapa lama sebelum dihapus/dianonimkan)?
- **DATA-2** — Hak pengguna: kanal & SLA untuk permintaan akses/ekspor/hapus data?
- **DATA-3** — Apakah screenshot Strava/smartwatch dianggap data kesehatan (perlakuan khusus), dan bagaimana perlakuan retensinya?
- **LEGAL-1** — Setujui kalimat bahwa estimasi kalori/gizi adalah perkiraan dan **bukan** nasihat/diagnosis/pengobatan medis?
- **LEGAL-2** — Klaim `/privacy:43` "100% aman, dienkripsi" adalah klaim absolut; apa yang benar-benar berlaku (in-transit saja atau juga at-rest)?
- **LEGAL-3** — Bolehkah T&C/privacy menyebut pihak ketiga secara eksplisit (Scalev sebagai pemroses pembayaran, Meta sebagai pengirim pesan WhatsApp)? Nama entitas pemroses + tautan kebijakan mereka = keputusan owner, bukan karangan engineer.
- **LEGAL-4** — Batas usia minimum pemakai (mis. 18+) mengingat data berat/tinggi/gaya hidup yang dikirim?
- **LEGAL-5** — Entitas hukum penyedia (PT/CV/nama usaha), alamat, dan hukum/yurisdiksi yang berlaku? Tidak ada di repo ini.
- **TERMS-1** — Bentuk: halaman `/terms` terpisah (W4) atau satu pasal di `/privacy` sampai teks final ada?
- **TERMS-2** — Nomor versi + tanggal berlaku pertama, dan cara pemberitahuan perubahan material (WA/email/halaman)?
- **CONSENT-1** — Dua checkbox terpisah (T&C wajib, pengingat opsional, keduanya default tidak tercentang) — konfirmasi urutan tampil dan bahwa menolak pengingat tidak menghalangi pembayaran.
- **CONSENT-2** — Format `text_version` yang disetujui (mis. `terms-2026-10-15-v1` + `reminder-optin-2026-10-15-v1`)?
- **OPTOUT-1** — Tombol OPTOUT berhenti langsung tanpa konfirmasi; keyword BERHENTI pakai konfirmasi `IYA`. Setuju untuk keduanya?
- **KONTAK-1** — Nomor CS (sekarang `6287788141388`) + jam layanan yang boleh disebut di dokumen publik?

---

## Pasal

### T1. Penyedia layanan dan kontak

> Layanan Thrivin («NAMA ENTITAS HUKUM») dapat dihubungi lewat Customer Service WhatsApp
> `wa.me/6287788141388` («JAM LAYANAN»). Alamat dan entitas hukum penyedia: «DIPUTUSKAN OWNER».

**Provenance:** S=`src/app/privacy/page.tsx:93-100`, `src/components/Footer.tsx:42-51` · A=— · O=LEGAL-5, KONTAK-1

### T2. Ruang lingkup layanan

> Nina adalah pendamping kebiasaan dan gaya hidup berbasis percakapan WhatsApp. Nina membantu
> mencatat, mengingatkan, dan memberi estimasi (misalnya estimasi kalori dari foto makanan dan
> ringkasan aktivitas). Semua estimasi bersifat **perkiraan** dan **bukan** nasihat, diagnosis, atau
> pengobatan medis. Untuk keluhan kesehatan, konsultasikan ke tenaga medis.

**Provenance:** S=`src/app/privacy/page.tsx:64-76` · A=— · O=LEGAL-1

### T3. Batas usia

> Layanan ini ditujukan untuk pengguna berusia «BATAS USIA» tahun ke atas.

**Provenance:** S=— · A=— · O=LEGAL-4

### T4. Akun dan identitas

> Akunmu diidentifikasi oleh nomor WhatsApp yang kamu daftarkan. Nomor itu dinormalisasi server-side
> dan menjadi kunci akun; nomor yang tidak valid ditolak.

**Provenance:** S=`src/lib/phone.ts:12-18`, `src/app/api/scalev/create-order/route.ts:103-111`, `rc staging/schema/db-tables.sql:5-17` · A=— · O=—

### T5. Pembelian, harga, dan kode promo

> Pembelian dilakukan sekali bayar **tanpa penagihan otomatis berulang**. Harga yang berlaku adalah
> harga yang ditampilkan pada halaman pembelian saat transaksi. Kode promo tunduk pada syarat kode
> masing-masing (masa berlaku, kuota, dan batas satu kali per nomor).

**Provenance:** S=`src/app/companion/nina/onboarding/[step]/page.tsx:1590`, `src/app/api/scalev/create-order/route.ts:183-193`, `promo-ws/staging/schema-promo-codes.sql:50-119` · A=A6, A7 · O=PROMO-1

### T6. Garansi uang kembali 72 jam (3×24 jam)

> Dalam **72 jam (3×24 jam)** sejak pembayaran kami terima, kamu berhak mengajukan klaim pengembalian
> dana 100% kalau merasa pendampingan Nina belum cocok. Klaim diajukan lewat Customer Service WhatsApp
> `wa.me/6287788141388` («KANAL/SLA KLAIM», «POTONGAN»).

**Provenance:** S=`src/app/privacy/page.tsx:124-130`, `src/app/terms/page.tsx:128-135`, `src/lib/pricing-copy.ts:102-104` · A=A4 · O=GARANSI-2, GARANSI-3

### T7. Kuota pemakaian paket

> Setiap paket punya kuota pemakaian bulanan/total yang berbeda. Kalau kuota paket habis sebelum masa
> aktif berakhir: «PERILAKU YANG DISETUJUI».

**Provenance:** S=`src/lib/plans.ts:38-79` · A=A5 · O=KUOTA-1

### T8. Pengingat Nina (opsional) dan cara berhenti

> Pengingat proaktif dari Nina bersifat **opsional**. Kamu memilihnya sendiri lewat checkbox terpisah
> saat checkout; menolak pengingat **tidak menghalangi** pembelianmu, dan pilihanmu tetap kami simpan.
> Pengingat hanya dikirim pada 07.00–21.00 waktu lokal dengan jeda minimal 20 jam antar pengingat.
> Kamu bisa berhenti kapan saja: tekan tombol **berhenti** pada pesan pengingat (berlaku langsung),
> atau balas `BERHENTI`/`STOP` (kami minta konfirmasi singkat dulu). Setelah berhenti, kamu tetap bisa
> memakai layanan dan mengaktifkan kembali pengingat lewat Customer Service.

**Provenance:** S=`spec proaktif §A/§E/§H`, `S0 kontrak §3`, `t_fdba2939 brief A7` · A=A1, A2, A3, A9 · O=CONSENT-1, OPTOUT-1, CONSENT-2

**Catatan implementasi (belum ada, jangan diklaim):** engine pengingat, tabel status persetujuan, dan
dua checkbox checkout = slice W4/N1/N2. Sampai itu dibangun, klausul ini **tidak boleh dipublikasikan
seolah fiturnya sudah berjalan**.

### T9. Penerimaan syarat dan versi dokumen

> Dengan mencentang kotak persetujuan sebelum pembayaran, kamu menyatakan sudah membaca dan menyetujui
> Syarat & Ketentuan versi «VERSI» serta Kebijakan Privasi. Kami menyimpan bukti persetujuan: identitas
> terverifikasi, waktu (timestamp server), versi teks yang kamu lihat, nilai persetujuan, dan sumbernya.
> Persetujuan T&C **bukan** izin pemasaran dan tidak mengaktifkan pengingat.

**Provenance:** S=`S0 kontrak §3`, `t_fdba2939 brief A7` · A=A1 · O=CONSENT-2, TERMS-2

### T10. Perubahan syarat

> Perubahan material pada syarat ini diberitahukan lewat «KANAL PEMBERITAHUAN» sebelum berlaku, dan
> versi yang berlaku saat kamu menyetujui tetap tersimpan.

**Provenance:** S=— · A=A1 · O=TERMS-2

### T11. Data dan privasi

> Data yang kami proses: nomor WhatsApp, profil yang kamu isi saat onboarding (termasuk nama panggilan),
> media yang kamu kirim ke Nina, status persetujuan, dan catatan kanal WhatsApp yang kamu pakai. Rincian
> ada di Kebijakan Privasi `/privacy`. Retensi: «RETENSI» · Hak akses/hapus: «KANAL & SLA HAK DATA».

**Provenance:** S=`src/app/privacy/page.tsx:51-61`, `S0 kontrak §3`, `w1 head 26029cc report §5.1` · A=A1, A10 · O=DATA-1, DATA-2, DATA-3

### T12. Layanan pihak ketiga

> Pembelian diproses lewat penyedia pembayaran «PENYEDIA PEMBAYARAN», dan pengiriman pesan WhatsApp
> memakai kanal WhatsApp Business «PENYEDIA PESAN». Data yang diperlukan untuk transaksi (nama, nomor
> WhatsApp, rincian paket) diteruskan ke penyedia tersebut. Syarat dan kebijakan privasi pihak ketiga
> berlaku pada layanan mereka.

**Provenance:** S=`src/app/api/scalev/create-order/route.ts:206-214`, `obsidian features/whatsapp-cloud-api.md` · A=A9 · O=LEGAL-3

**Batas:** jangan mengarang isi syarat/kebijakan pihak ketiga. Nama penyedia + tautan dokumen mereka =
keputusan owner (LEGAL-3). Jangan menulis "Meta" atau "Scalev" di dokumen publik tanpa persetujuan.

### T13. Penggunaan yang dilarang

> Dilarang menyalahgunakan layanan: mengirim spam, mencoba mengakses data pengguna lain, atau memakai
> layanan untuk hal yang melanggar hukum.

**Provenance:** S=`S0 kontrak §4`, `S0 kontrak §6` · A=— · O=—

### T14. Pembatalan dan penghentian

> Langganan tidak diperpanjang otomatis. Kamu bisa berhenti menerima pengingat kapan saja (T8). Kalau
> mau berhenti total dari layanan, hubungi Customer Service «KANAL PEMBATALAN».

**Provenance:** S=`src/app/companion/nina/onboarding/[step]/page.tsx:1590`, `src/app/privacy/page.tsx:93-100` · A=— · O=KONTAK-1, DATA-2

### T15. Batas tanggung jawab

> Layanan diberikan apa adanya untuk pendampingan kebiasaan; Thrivin tidak menjanjikan hasil kesehatan
> tertentu dan tidak bertanggung jawab atas keputusan medis yang kamu ambil. «BATAS TANGGUNG JAWAB
> (BENTUK FINAL)»

**Provenance:** S=— · A=— · O=LEGAL-1

### T16. Hukum yang berlaku

> Syarat ini tunduk pada hukum «YURISDIKSI» dan sengketa diselesaikan lewat «JALUR PENYELESAIAN».

**Provenance:** S=— · A=— · O=LEGAL-5

### T17. Kritik dan saran

> Masukan bisa dikirim lewat Customer Service WhatsApp `wa.me/6287788141388`«, atau halaman
> kritik & saran thrivin.id/companion/nina/kritiksaran (RENCANA, BELUM TERSEDIA)».

**Provenance:** S=`src/app/privacy/page.tsx:93-100`, `S0 kontrak §6` · A=A8 · O=KONTAK-1

---

## Yang sengaja TIDAK ditulis di draft ini (jangan ditambahkan tanpa keputusan)

1. Klaim kepatuhan hukum apa pun (UU PDP, GDPR, "sesuai peraturan", sertifikasi).
2. Janji retensi/data-deletion dengan angka, sampai DATA-1/DATA-2 dijawab.
3. Isi syarat/kebijakan pihak ketiga (Scalev, Meta) — LEGAL-3.
4. Klaim "terenkripsi 100%", SLA, atau jaminan uptime.
5. Sanksi/kuota promo spesifik sebagai janji (kuota bisa berubah di dashboard) — PROMO-1.
6. Kanal pemberitahuan perubahan syarat (WA/email/halaman) — TERMS-2.
