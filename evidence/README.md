# RC 15/10 — per-stream evidence from the merged source branches

Setiap branch batch-2026-10-15 menyimpan `report.md` + `evidence.json` di root
tree-nya sendiri. Saat integrasi, path root itu bentrok antar-branch, jadi di RC
bukti per-stream dipindah ke sini dengan nama branch-nya (isi byte-identik dengan
versi yang di-review; tidak ada yang ditimpa).

| Folder | Branch sumber | Head di-review |
|---|---|---|
| `w3-wa-first/` | `feat/wa-first-2026-10-15` | `e01a27a` (review t_a498a912 → RX t_ee4d66c7 → t_03564952) |
| `w5-feedback/` | `feat/feedback-kritiksaran-2026-10-15` | `ad92fb3` (review t_63b7eb66 → RX t_51e47cf0 → t_49e7e2a6) |
| `w4-consent-gate/` | `feat/checkout-consent-gate-2026-10-15` + RX2 follow-ups | `9e4e2ec`, `84837e5`, `161ba7e`, `e56724c` |

Catatan:

- Referensi di `docs/reverse-proxy-body-limit.md` (`report.md §F-1`) menunjuk ke
  versi W5: `evidence/w5-feedback/report.md`.
- Laporan RC sendiri (gabungan, angka suite akhir) ada di root worktree RC sebagai
  `report.md` + `evidence.json` (tidak di-commit — itu artefak kartu I1).
- W1 (`53e73b3`, `feat/web-copy-promo-garansi-2026-10-15`) dan W2 (`69b920d`,
  `docs/legal-draft-terms-privacy-2026-10-15`) tidak meng-commit laporan
  per-stream, jadi tidak ada entri di sini.
