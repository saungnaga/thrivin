"use client";

import Link from "next/link";
import { ArrowLeft, ShieldCheck, Lock, CheckCircle2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import {
  CS_HOURS,
  LEGAL_ENTITY,
  PRIVACY_LAST_UPDATED,
  PRIVACY_VERSION,
  TERMS_PATH,
} from "@/lib/legal";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface font-sans text-brand-950 flex flex-col">
      <Navbar />

      <main className="flex-1 pt-28 pb-16 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full">
        {/* Breadcrumb */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-brand-900 transition-colors mb-8 py-1 px-2.5 rounded-lg bg-surface-muted border border-surface-border w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Kembali ke Beranda</span>
        </Link>

        {/* Title */}
        <div className="space-y-3 mb-10">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 border border-brand-200 text-xs font-bold text-accent-dark uppercase tracking-wider font-mono">
            <ShieldCheck className="w-3.5 h-3.5" />
            Privasi & Keamanan Data
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950 tracking-tight">
            Kebijakan Privasi Thrivin
          </h1>
          <p className="text-xs sm:text-sm text-text-secondary">
            Terakhir diperbarui: {PRIVACY_LAST_UPDATED} (versi{" "}
            <span className="font-mono">{PRIVACY_VERSION}</span>). Kami berkomitmen menjaga data pribadimu
            tetap aman.
          </p>
        </div>

        {/* Policy Content */}
        <div className="bg-white p-6 sm:p-10 rounded-3xl border border-surface-border shadow-xs space-y-8 text-sm sm:text-base text-text-secondary leading-relaxed">
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-3 text-emerald-900 text-xs sm:text-sm">
            <Lock className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold block mb-0.5">Komitmen Privasi Utama:</strong>
              Data nomor WhatsApp, foto makanan, riwayat olahraga, dan percakapan pribadimu dengan AI
              Companion dienkripsi saat dikirim, tidak pernah dijual, dan tidak disebarkan ke pengiklan
              pihak ketiga. Data hanya diteruskan ke pihak yang diperlukan untuk menjalankan layanan
              (lihat pasal 6).
            </div>
          </div>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">
              1. Data Apa Saja yang Kami Kumpulkan?
            </h2>
            <ul className="space-y-2 list-disc pl-5">
              <li>
                <strong>Data Kontak:</strong> Nomor WhatsApp yang kamu daftarkan untuk menghubungkan bot AI Companion.
              </li>
              <li>
                <strong>Data Profil Fisik & Target:</strong> Usia, berat, tinggi, fokus program, dan tingkat aktivitas untuk kalkulasi blueprint metabolisme harian (TDEE dan target protein).
              </li>
              <li>
                <strong>Preferensi Panggilan:</strong> nama panggilan yang kamu isi, dipakai Nina untuk menyapamu.
              </li>
              <li>
                <strong>Status Persetujuan:</strong> catatan kapan dan dari mana kamu menyetujui Syarat &amp; Ketentuan serta pengingat WhatsApp, termasuk versi teks yang kamu lihat. Catatan ini bersifat <em>append-only</em>: kami menambah baris baru, tidak menimpa riwayat.
              </li>
              <li>
                <strong>Kanal WhatsApp &amp; Catatan Kanal:</strong> jenis kanal yang kamu pakai (WhatsApp Business/Cloud API atau kanal WhatsApp lain), ID nomor pengirim untuk kanal Cloud, serta waktu pesan masuk terakhir. Data ini dipakai untuk menentukan apakah Nina boleh mengirim pesan bebas di luar template resmi.
              </li>
              <li>
                <strong>Status Pengingat:</strong> ikut/tidak ikut pengingat proaktif — pilihan ini terpisah dari persetujuan transaksi.
              </li>
              <li>
                <strong>Media yang Kamu Kirim:</strong> foto makanan untuk estimasi kalori dan tangkapan layar Strava/smartwatch untuk evaluasi olahraga harian. Tangkapan layar aktivitas diperlakukan sebagai <strong>data sensitif</strong>: tidak dipakai untuk melatih model dan dihapus bersama akunmu.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">
              2. Bagaimana Kami Menggunakan Data Tersebut?
            </h2>
            <p>
              Data yang kamu kirimkan semata-mata digunakan oleh asisten AI Companion (seperti Nina) untuk:
            </p>
            <ul className="space-y-2 list-disc pl-5">
              <li>Menghitung estimasi gizi dan kalori foto piring makan secara akurat.</li>
              <li>Mengingatkan jadwal aktivitas fisik dan mengecek progres harianmu.</li>
              <li>Mengingat riwayat cedera atau preferensi latihan agar rekomendasi tetap aman.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">
              3. Pengingat WhatsApp &amp; Cara Berhenti
            </h2>
            <p>
              Pengingat proaktif dari Nina bersifat <strong>opsional</strong>: hanya dikirim kalau kamu
              mengaktifkannya sendiri lewat kotak centang terpisah saat checkout, dan menolaknya tidak
              menghalangi pembelian. Pengingat hanya dikirim antara <strong>07.00–21.00</strong> waktu
              lokal, dengan jeda minimal 20 jam antar pengingat.
            </p>
            <p>
              Kamu bisa berhenti kapan saja: tekan tombol berhenti pada pesan pengingat (berlaku
              langsung), atau balas <span className="font-mono">BERHENTI</span>/
              <span className="font-mono">STOP</span> — untuk kata kunci, kami minta konfirmasi singkat
              dulu. Setelah berhenti, kamu tetap bisa memakai layanan, dan bisa mengaktifkan kembali
              lewat Customer Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">
              4. Garansi Uang Kembali 3 Hari
            </h2>
            <p>
              Kami mengutamakan kepuasan pengguna. Dalam <strong>72 jam</strong> sejak pembayaran kami
              terima, kamu berhak mengajukan pengembalian dana <strong>100% tanpa potongan</strong> kalau
              merasa pendampingan Nina tidak cocok dengan kebutuhanmu. Klaim diajukan lewat Customer
              Service WhatsApp dan diproses maksimal 3 hari kerja setelah data klaim lengkap.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">
              5. Berapa Lama Kami Menyimpan Data
            </h2>
            <p>
              Setelah langgananmu berakhir, data profil dan media disimpan paling lama{" "}
              <strong>30 hari</strong> sebelum dihapus atau dianonimkan. Kamu bisa meminta akses, salinan,
              atau penghapusan data lewat Customer Service WhatsApp — permintaan diproses maksimal{" "}
              <strong>7 hari</strong>. Menghapus akun juga menghapus tangkapan layar aktivitas yang kamu
              kirim.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">
              6. Pihak Ketiga yang Kami Pakai
            </h2>
            <p>
              Untuk memproses pembelian kami memakai penyedia pembayaran <strong>Scalev</strong>; untuk
              mengirim pesan WhatsApp kami memakai kanal <strong>Meta</strong> (WhatsApp Business). Data
              minimum yang diperlukan (nama, nomor WhatsApp, dan rincian paket) diteruskan ke penyedia
              tersebut. Syarat &amp; kebijakan privasi mereka berlaku pada layanan mereka. Profil
              kesehatanmu (berat, tinggi, usia) sengaja <strong>tidak</strong> dikirim ke penyedia
              pembayaran.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">
              7. Perubahan Kebijakan &amp; Versi
            </h2>
            <p>
              Kalau kebijakan ini berubah secara material, kami memberitahukan lewat WhatsApp dan halaman
              ini sebelum berlaku. Versi teks yang kamu setujui tersimpan bersama bukti persetujuanmu
              (nomor terverifikasi, timestamp server, nilai persetujuan, dan sumbernya).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand-950">
              8. Hubungi Kami
            </h2>
            <p className="leading-relaxed">
              Layanan ini disediakan oleh {LEGAL_ENTITY}. Jika memiliki pertanyaan
              mengenai kebijakan privasi, permohonan penghapusan data, atau membutuhkan bantuan akun,
              silakan{" "}
              <a
                href="https://wa.me/6287788141388?text=Halo%20Customer%20Service%20Thrivin,%20saya%20punya%20pertanyaan%20seputar%20kebijakan%20privasi%20atau%20data%20akun"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
              >
                hubungi Customer Service Thrivin via WhatsApp
              </a>{" "}
              pada jam {CS_HOURS}. Syarat &amp; Ketentuan layanan ada di{" "}
              <Link href={TERMS_PATH} className="font-bold text-emerald-700 hover:text-emerald-800 underline underline-offset-2">
                halaman Syarat &amp; Ketentuan
              </Link>{" "}
              (versi <span className="font-mono">{PRIVACY_VERSION}</span>).
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
