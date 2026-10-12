# Smoke Test Manual — Scalev Webhook (SATU INI saja, sengaja manual)

**Jangan dijalankan otomatis.** Ini menembak **Scalev PRODUKSI** dan membuat order
sungguhan. Jalankan hanya saat benar-benar perlu memverifikasi jalur live
(sebelum rilis / setelah ganti kredensial), dan hanya dengan **nomor + paket test**.

Otomatisasi penuh (termasuk test konkuren H-6) sudah ada di:

```
bash tests/run-all.sh
```

Suite itu pakai Postgres + PostgREST lokal + `tests/mock-scalev.mjs` — nol sentuh
Scalev produksi. File test lama `test-webhook-scalev.mjs` dihapus karena menembak
`api.scalev.com` sungguhan dan bergantung pada disk fallback yang sekarang sengaja
dimatikan di produksi (H-3). Lihat review Sentinel M-7.

---

## Langkah manual

1. Set kredensial uji di shell (JANGAN di-tulis ke file):

   ```bash
   export SCALEV_API_KEY=sk_...        # dari rak kredensial
   export SCALEV_STORE_ID=store_...
   export SCALEV_WEBHOOK_SECRET=...
   ```

2. Jalankan app lokal:

   ```bash
   npm run build && npm start -- -p 3123
   ```

3. Buat order test dengan nomor test (bukan nomor customer):

   ```bash
   curl -s -X POST http://127.0.0.1:3123/api/scalev/create-order \
     -H 'Content-Type: application/json' \
     -d '{"planId":"month","customerName":"Smoke Test","customerPhone":"6281299900099",
          "onboarding":{"gender":"Laki-laki","age":26,"weight":70,"height":175,
          "activityLevel":"Moderat","workoutLocation":"Di Gym",
          "programFocus":["Workout & Strength"],"biggestChallenge":"Konsistensi",
          "communicationStyle":"Tegas & Terarah"}}'
   ```

4. Verifikasi di dashboard Scalev bahwa order muncul dengan **harga server**
   (bukan `amount` yang dikirim client).

5. Hapus / tandai order test di Scalev setelah selesai.

## Yang HARUS terlihat
- `create-order` tidak pernah memakai `amount` dari client (B-2).
- Order notes **tidak** memuat berat/tinggi/umur/gender (PII).
- Webhook asli yang datang dari Scalev diterima 200 dan mengaktifkan langganan 1x (H-6).