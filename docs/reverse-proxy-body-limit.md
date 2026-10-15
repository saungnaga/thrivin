# Reverse-proxy body limit for `POST /api/feedback` (F-1)

**Status:** DRAFT — **belum diterapkan di mana pun.** Pemilik penerapan: Atlas (infra).
**Konteks:** temuan F-1 audit W5 (`security/review-w5-feedback-2026-10-15.md`).
**Berkas ini dokumen, bukan konfigurasi hidup** — tidak ada nginx/Caddy yang diubah dari kartu W5-RX.

## Kenapa

Route handler Next 15 tidak punya batas body sendiri. Aplikasi sekarang menolak body
besar **di dalam proses** (`readBoundedBody()`): `content-length` dicek sebelum body
disentuh, dan body chunked dihentikan begitu lewat 8 KiB. Itu menahan alokasi memori,
tapi tetap membuat proses Node menerima koneksi dan byte sampai titik itu.

Batas di tepi (reverse proxy) menolak lebih murah lagi: byte tidak pernah masuk ke
aplikasi. Dua lapis, bukan salah satu.

Aplikasi melayani halaman yang butuh upload? **Tidak** untuk rute ini. Batas di bawah
dipasang per-location `/api/feedback`, jangan global, supaya rute lain tidak ikut kena.

## nginx

```nginx
location = /api/feedback {
    # 8 KiB di aplikasi + sedikit ruang header/JSON wrapper.
    client_max_body_size 16k;
    client_body_buffer_size 16k;

    # Lewatkan header asli; aplikasi memakai x-forwarded-for (lihat F-2, kartu terpisah).
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP $remote_addr;

    proxy_pass http://127.0.0.1:3000;
}
```

`client_max_body_size` yang dilampaui dijawab nginx dengan **413** tanpa membaca body —
perilaku yang sama dengan jawaban aplikasi, jadi klien tidak melihat perbedaan skema.

## Caddy

```caddyfile
@feedback path /api/feedback
handle @feedback {
    request_body {
        max_size 16KB
    }
    reverse_proxy 127.0.0.1:3000
}
```

Caddy membalas **413** saat `max_size` dilampaui.

## Verifikasi setelah dipasang (staging)

```bash
# Body 100 KiB: harus 413, dan TIDAK ada baris log aplikasi untuk request ini.
head -c 102400 /dev/zero | tr '\0' 'a' > /tmp/big.txt
curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://<staging-host>/api/feedback \
  -H 'Content-Type: application/json' --data-binary @/tmp/big.txt

# Tanpa content-length (chunked), 64 KiB: harus 413 dan koneksi ditutup lebih awal.
curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://<staging-host>/api/feedback \
  -H 'Content-Type: application/json' -H 'Transfer-Encoding: chunked' --data-binary @/tmp/big.txt
```

Kalau proxy sudah memasang batas, 413 datang dari proxy dan log aplikasi tetap bersih.
Kalau 413 datang dari aplikasi, `readBoundedBody()` yang bekerja (lapis kedua).

## Batas klaim

- Snippet di atas **belum dijalankan** pada reverse proxy mana pun: konfigurasi proxy
  produksi bukan milik repo ini (bukan bagian dari worktree W5).
- Tidak ada deployment, tidak ada perubahan infra, tidak ada kredensial yang disentuh.
- Bukti yang dijalankan di kartu W5-RX adalah lapis aplikasi (lihat `report.md` §F-1).
