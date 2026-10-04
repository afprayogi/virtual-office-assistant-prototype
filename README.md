<div align="center">

# AI Assistant Visual

### Kantor virtual 2D dengan 12 agen AI yang benar-benar mengerjakan tugas

**Agen menulis kode → menjalankannya → membaca error asli → memperbaiki sendiri.**

[![Next.js](https://img.shields.io/badge/Next.js-14-000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Orchestration](https://img.shields.io/badge/Orchestration-LangGraph-1f3c5f)](https://langchain-ai.github.io/langgraph/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-278%20passing-22c55e)](tests/)
[![Gateway](https://img.shields.io/badge/LLM-OmniRoute%20Gateway-8b5cf6)](https://omniroute.ai)

**Bahasa Indonesia** · [Mulai cepat](#memulai) · [Arsitektur](#arsitektur) · [Lisensi](LICENSE) · [Kontribusi](CONTRIBUTING.md)

</div>

---

<p align="center">
  <img src="docs/images/hero.svg" alt="AI Assistant Visual — 12 agen AI di kantor virtual 2D" width="100%">
</p>

---

## Apa ini?

Bayangkan sebuah perusahaan perangkat lunak dengan **12 anggota tim**, masing-masing
dengan spesialisasi dan wewenang berbeda. Mereka duduk di kantor virtual 2D — bisa
berjalan, duduk di kursi, berdiskusi di ruang rapat, dan kembali ke meja masing-masing.

Anda cukup mengetik **satu baris brief** untuk memulai. Tim menyusun requirement,
merancang arsitektur, menulis program, **menjalankannya**, menguji, dan menulis
dokumentasi — semuanya **satu per satu sesuai peran**, bukan sekadar chatbot yang
menjawab pertanyaan.

Yang membedakannya dari sekadar "AI yang menulis kode":

- 🏃 **Kode benar-benar dijalankan** — Python, JavaScript, TypeScript, C++, C, Java, PHP.
- 🧯 **Error asli dikembalikan ke agen** — agen membaca `stderr`, lalu memperbaiki sendiri.
- 📦 **Library dipasang otomatis** — `pip` (venv) & `npm`, sesuai kebutuhan program.
- 📁 **Hasil kerja = file nyata** — tersimpan di folder proyek, bukan cuma diskusi.
- 🧠 **Ingat antar-task** — setiap task menyimpan kesimpulan untuk task berikutnya.
- 🛠️ **Tool CRUD per agen** — baca, tulis, ubah, hapus file di folder kerjanya.

## Daftar isi

| Bagian | Isi |
|---|---|
| [Tampilan antarmuka](#tampilan-antarmuka) | Tangkapan visual dashboard & Workspace |
| [Demo langsung](#demo-langsung) | Animasi kantor virtual (GIF + SVG) |
| [Kantor virtual](#kantor-virtual) | Denah, ruangan, dan 12 agen |
| [Cara kerjanya](#cara-kerjanya) | 6 fase, loop per task, tool agen |
| [Arsitektur](#arsitektur) | Diagram berlapis & struktur folder |
| [Memulai](#memulai) | Prasyarat, instal, konfigurasi, jalankan |
| [Variabel lingkungan](#variabel-lingkungan) | Semua env yang dipakai |
| [Keamanan](#keamanan) | Mitigasi eksekusi program |
| [Pengujian & pengembangan](#pengujian--pengembangan) | Skrip test & pipeline |
| [Kredit & kolaborasi](#kredit--kolaborasi) | Karya pihak lain yang kami hormati |
| [Lisensi](#lisensi) | MIT + pengecualian |
