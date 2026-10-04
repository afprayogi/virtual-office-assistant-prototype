# Berkontribusi

Terima kasih sudah mau membantu. Kontribusi dalam bentuk apa pun sangat diterima —
kode, laporan bug, ide, atau perbaikan dokumentasi.

## Sebelum mulai

### Gaya kode

Proyek ini **sepenuhnya berbahasa Indonesia** — nama variabel, komentar, dan
pesan log. Ikuti gaya yang sudah ada:

- Komentar menjelaskan **kenapa**, bukan apa. Jawab "mengapa" di dalam kode.
- Namai hal dengan Bahasa Indonesia yang lugas (`jumlahAgent`, `jalankanProgram`).
- Fungsi Pure-function di modul terpisah bila bisa diuji tanpa DOM.

### Yang wajib dijaga

| Aturan | Kenapa |
|---|---|
| Semua proses wajib `shell: false` | Command injection adalah risiko utama |
| Semua path wajib lewat `resolveSafe()` | Mencegah keluar dari sandbox |
| Semua spawn wajib punya timeout | `while(true)` tidak boleh menggantung |
| Test wajib menyertakan kasus gagal | Test yang hanya menguji success tidak berguna |

### Pipeline wajib

```bash
npm run typecheck    # wajib lolos
npm run test:tools   # wajib lolos (tool + sandbox)
npm run test:runner  # wajib lolos (eksekusi program)
```

Test suite lengkap boleh dijalankan kalau pipeline wajib sudah hijau.

## Alur kerja

1. **Buka issue dulu** untuk fitur besar — supaya tidak ada dua orang menggarap
   hal yang sama.
2. Buat branch: `git checkout -b fitur/nama-cukup-singkat`
3. Tulis kode + test-nya
4. Pastikan pipeline wajib hijau
5. Buka PR dengan penjelasan: **apa** yang berubah dan **kenapa**

## Menambah agen baru

Cukup empat langkah:

1. `lib/orchestrator/defaults.ts` — entri agent (guard, skill, homeStation)
2. `types/office.ts` — workstation baru (tiap agen wajib punya mejanya sendiri)
3. `lib/orchestrator/taskRegistry.ts` — task + deliverable milik role tersebut
4. Tulis test: guard tidak boleh tumpang tindih dengan role lain

## Menambah bahasa / runner baru

1. `lib/orchestrator/runner.ts` — tambahkan kasus di `detectCommand()`
2. Pastikan paket bisa di-install lebih dulu (venv atau npm)
3. Tambah test di `tests/runner.test.ts` — **wajib** menguji program yang
   benar-benar jalan, bukan hanya theoretically benar

## Menambah tool

1. `lib/orchestrator/tools.ts` — spec + implementasi di `executeTool()`
2. `executeTool()` **tidak boleh melempar** — error dikembalikan sebagai `content`
   supaya agent bisa membacanya dan memperbaiki langkahnya sendiri
3. Tambah test di `tests/tools.test.ts`, termasuk kasus sandbox ditolak

## Aturan commits

Gunakan format Conventional Commits:

```
feat(runner): tambah runner untuk Go
fix(tools): perbaiki parsing argumen tool yang terpotong
docs(readme): jelaskan cara menjalankan fase creative
test(sandbox): tambah kasus path traversal bersarang
```

---

Lisensi: dengan berkontribusi, kamu setuju bahwa karyamu lisensikan di bawah
MIT — dengan pengecualian yang tercantum di
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).