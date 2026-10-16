"use client";

import Link from "next/link";
import { ArrowLeft, FileText, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import {
  CS_HOURS,
  CS_WA_LINK,
  JURISDICTION,
  LEGAL_ADDRESS,
  LEGAL_ENTITY,
  LEGAL_LAST_UPDATED,
  PRIVACY_PATH,
  STOP_KEYWORDS,
  TERMS_VERSION,
} from "@/lib/legal";

/**
 * /terms — Syarat & Ketentuan Thrivin (versi terms-2026-10-15-v1).
 *
 * Isi dokumen ini = teks yang disetujui owner 16/10 (19 keputusan, kartu W2
 * t_e8d57ab3). Yang BELUM diputuskan sengaja tidak ditulis sebagai janji:
 * tidak ada klaim kepatuhan hukum, tidak ada angka retensi selain yang
 * diputuskan, tidak ada nama pihak ketiga di luar yang disetujui, dan tidak ada
 * batas tanggung jawab tambahan yang belum ditetapkan.
 *
 * Versi ini juga yang dicatat di `consent_events.text_version` saat pelanggan
 * mencentang persetujuan di checkout — teks & bukti harus sama.
 */
export default function TermsPage() {
  return (
    <div className="min-h-screen bg-surface font-sans text-brand-950 flex flex-col">
      <Navbar />

      <main className="flex-1 pt-28 pb-16 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-brand-900 transition-colors mb-8 py-1 px-2.5 rounded-lg bg-surface-muted border border-surface-border w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Kembali ke Beranda</span>
        </Link>

        <div className="space-y-3 mb-10">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 border border-brand-200 text-xs font-bold text-accent-dark uppercase tracking-wider font-mono">
            <FileText className="w-3.5 h-3.5" />
            Syarat &amp; Ketentuan
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950 tracking-tight">
            Syarat &amp; Ketentuan Thrivin
          </h1>
          <p className="text-xs sm:text-sm text-text-secondary">
            Versi <span className="font-mono">{TERMS_VERSION}</span> · berlaku {LEGAL_LAST_UPDATED}.
            Ketentuan ini berlaku untuk pembelian dan penggunaan pendamping Nina.
          </p>
        </div>

        <div className="bg-white p-6 sm:p-10 rounded-3xl border border-surface-border shadow-xs space-y-8 text-sm sm:text-base text-text-secondary leading-relaxed">
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-3 text-emerald-900 text-xs sm:text-sm">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              Ringkas: bayar sekali (tanpa perpanjangan otomatis), estimasi Nina adalah perkiraan dan
              bukan nasihat medis, pengingat WhatsApp bersifat opsional, dan data pribadimu ditangani
              sesuai <Link href={PRIVACY_PATH} className="font-semibold underline underline-offset-2">Kebijakan Privasi</Link>.
            </div>
          </div>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">1. Penyedia Layanan dan Kontak</h2>
            <p>
              Layanan Thrivin disediakan oleh <strong>{LEGAL_ENTITY}</strong>. Alamat: {LEGAL_ADDRESS}.
              Pertanyaan, klaim garansi, atau permintaan terkait data bisa disampaikan lewat Customer
              Service WhatsApp{" "}
              <a
                href={CS_WA_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
              >
                wa.me/6287788141388
              </a>{" "}
              pada jam <strong>{CS_HOURS}</strong>.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">2. Ruang Lingkup Layanan</h2>
            <p>
              Nina adalah pendamping kebiasaan dan gaya hidup berbasis percakapan WhatsApp. Nina membantu
              mencatat, mengingatkan, dan memberi estimasi — misalnya estimasi kalori dari foto makanan
              dan ringkasan aktivitas harian.
            </p>
            <p>
              Semua estimasi bersifat <strong>perkiraan</strong> dan <strong>bukan</strong> nasihat,
              diagnosis, atau pengobatan medis. Untuk keluhan kesehatan, konsultasikan ke tenaga medis.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">3. Batas Usia</h2>
            <p>Layanan ini ditujukan untuk pengguna berusia 18 tahun ke atas.</p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">4. Akun dan Identitas</h2>
            <p>
              Akunmu diidentifikasi oleh nomor WhatsApp yang kamu daftarkan. Nomor tersebut
              dinormalisasi di server dan menjadi kunci akun; nomor yang tidak valid ditolak. Simpan
              akses ke nomor itu — siapa pun yang memegangnya bisa menerima pesan Nina.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">5. Pembelian, Harga, dan Kode Promo</h2>
            <p>
              Pembelian dilakukan <strong>sekali bayar tanpa penagihan otomatis berulang</strong>. Harga
              yang berlaku adalah harga yang ditampilkan pada halaman pembelian saat transaksi, dan
              dihitung di server dari katalog paket (bukan dari angka yang dikirim browser).
            </p>
            <p>
              Kode promo tunduk pada syarat masing-masing: masa berlaku, kuota, paket yang berlaku, dan
              batas satu kali per nomor WhatsApp. Promo bisa dinonaktifkan kalau kuotanya habis.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">6. Garansi Uang Kembali 3 Hari</h2>
            <p>
              Dalam <strong>72 jam</strong> sejak pembayaran kami terima, kamu berhak mengajukan
              pengembalian dana <strong>100% tanpa potongan</strong> kalau merasa pendampingan Nina belum
              cocok. Klaim diajukan lewat Customer Service WhatsApp{" "}
              <a
                href={CS_WA_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
              >
                wa.me/6287788141388
              </a>{" "}
              dan diproses maksimal 3 hari kerja setelah data klaim lengkap.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">7. Kuota Pemakaian Paket</h2>
            <p>
              Setiap paket punya kuota pemakaian sendiri. Kalau kuota paketmu habis sebelum masa aktif
              berakhir, layanan <strong>tetap berjalan dengan pembatasan kecepatan</strong> (tanpa
              pembelian tambahan). Cara ini bisa berubah pada versi ketentuan berikutnya, dan perubahan
              akan diberitahukan lebih dulu.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">
              8. Pengingat Nina (Opsional) dan Cara Berhenti
            </h2>
            <p>
              Pengingat proaktif dari Nina bersifat <strong>opsional</strong>. Kamu memilihnya sendiri
              lewat kotak centang terpisah saat checkout; menolak pengingat <strong>tidak menghalangi</strong>{" "}
              pembelianmu, dan pilihanmu tetap kami simpan. Pengingat hanya dikirim antara{" "}
              <strong>07.00–21.00</strong> waktu lokal dengan jeda minimal 20 jam antar pengingat.
            </p>
            <p>
              Berhenti kapan saja: tekan tombol <strong>berhenti</strong> pada pesan pengingat (berlaku
              langsung), atau balas <span className="font-mono">{STOP_KEYWORDS}</span>/
              <span className="font-mono">STOP</span> — untuk kata kunci, kami minta konfirmasi singkat
              dulu. Setelah berhenti, kamu tetap bisa memakai layanan dan chat Nina kapan saja, dan bisa
              mengaktifkan kembali pengingat lewat Customer Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">
              9. Penerimaan Syarat dan Versi Dokumen
            </h2>
            <p>
              Dengan mencentang kotak persetujuan sebelum pembayaran, kamu menyatakan sudah membaca dan
              menyetujui Syarat &amp; Ketentuan versi <span className="font-mono">{TERMS_VERSION}</span>{" "}
              serta Kebijakan Privasi. Kami menyimpan bukti persetujuan: nomor WhatsApp terverifikasi,
              waktu (timestamp server), versi teks yang kamu lihat, nilai persetujuan, dan sumbernya.
            </p>
            <p>
              Persetujuan Syarat &amp; Ketentuan <strong>bukan</strong> izin pemasaran dan{" "}
              <strong>tidak</strong> mengaktifkan pengingat — itu pilihan terpisah.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">10. Perubahan Syarat</h2>
            <p>
              Perubahan material pada syarat ini kami beritahukan lewat WhatsApp dan halaman ini sebelum
              berlaku, dengan nomor versi baru. Versi yang berlaku saat kamu menyetujui tetap tersimpan
              sebagai bukti.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">11. Data dan Privasi</h2>
            <p>
              Data yang kami proses: nomor WhatsApp, profil yang kamu isi saat onboarding (termasuk nama
              panggilan), media yang kamu kirim ke Nina, status persetujuan beserta versi teksnya, catatan
              kanal WhatsApp yang kami pakai, dan status pengingat. Rincian ada di{" "}
              <Link href={PRIVACY_PATH} className="font-semibold text-emerald-700 underline underline-offset-2">
                Kebijakan Privasi
              </Link>.
            </p>
            <p>
              Setelah langgananmu berakhir, data profil disimpan paling lama <strong>30 hari</strong>{" "}
              sebelum dihapus atau dianonimkan. Permintaan akses, salinan, atau penghapusan data
              dilayani lewat Customer Service WhatsApp dan diproses maksimal <strong>7 hari</strong>.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">12. Layanan Pihak Ketiga</h2>
            <p>
              Pembelian diproses lewat penyedia pembayaran <strong>Scalev</strong>, dan pengiriman pesan
              WhatsApp memakai kanal <strong>Meta</strong> (WhatsApp Business). Data minimum yang
              diperlukan untuk transaksi — nama, nomor WhatsApp, dan rincian paket — diteruskan ke
              penyedia tersebut. Syarat dan kebijakan privasi mereka berlaku pada layanan mereka.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">13. Penggunaan yang Dilarang</h2>
            <p>
              Dilarang menyalahgunakan layanan: mengirim spam, mencoba mengakses data pengguna lain, atau
              memakai layanan untuk hal yang melanggar hukum.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">14. Pembatalan dan Penghentian</h2>
            <p>
              Langganan <strong>tidak diperpanjang otomatis</strong>. Kamu bisa berhenti menerima
              pengingat kapan saja (pasal 8). Kalau mau berhenti total dari layanan atau menghapus akun,
              hubungi Customer Service WhatsApp.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">15. Batas Tanggung Jawab</h2>
            <p>
              Layanan diberikan apa adanya untuk pendampingan kebiasaan. Thrivin tidak menjanjikan hasil
              kesehatan tertentu dan tidak bertanggung jawab atas keputusan medis yang kamu ambil.
              Ketentuan batas tanggung jawab tambahan belum ditetapkan pada versi ini dan akan ditambahkan
              lewat versi dokumen berikutnya kalau diperlukan.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">16. Hukum yang Berlaku</h2>
            <p>
              Syarat ini tunduk pada hukum {JURISDICTION}. Sengketa diupayakan diselesaikan lebih dulu
              lewat musyawarah dengan Customer Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">17. Kritik dan Saran</h2>
            <p>
              Masukan bisa dikirim lewat Customer Service WhatsApp{" "}
              <a
                href={CS_WA_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
              >
                wa.me/6287788141388
              </a>
              . Kanal khusus kritik &amp; saran di situs sedang disiapkan.
            </p>
          </section>

          <div className="pt-2 border-t border-surface-border flex items-start gap-2 text-xs text-text-muted">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              Dokumen ini ditulis sebagai syarat layanan, bukan sebagai pernyataan kepatuhan pada
              regulasi tertentu. Versi: <span className="font-mono">{TERMS_VERSION}</span> · pembaruan
              terakhir {LEGAL_LAST_UPDATED}.
            </span>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
