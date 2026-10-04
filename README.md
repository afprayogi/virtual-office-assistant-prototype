<div align="center">

# AI Assistant Visual

### Kantor virtual 2D dengan 12 agen AI yang benar-benar mengerjakan tugas

**Agent menulis kode → menjalankan programnya → membaca error asli → memperbaiki sendiri.**

[![Next.js](https://img.shields.io/badge/Next.js-14-000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Orchestration](https://img.shields.io/badge/Orchestration-LangGraph-1f3c5f)](https://langchain-ai.github.io/langgraph/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-278%20passing-22c55e)](tests/)
[![Gateway](https://img.shields.io/badge/LLM-OmniRoute%20Gateway-8b5cf6)](https://omniroute.ai)

**Bahasa Indonesia** · [Lisensi](LICENSE) · [Notis pihak ketiga](THIRD_PARTY_NOTICES.md) · [Kontribusi](CONTRIBUTING.md)

</div>

---

## Apa ini?

Bayangkan sebuah perusahaan perangkat lunak dengan **12 anggota tim**, masing-masing
dengan spesialisasi dan wewenang berbeda. Mereka duduk di kantor virtual 2D — bisa
berjalan, duduk di kursi, berdiskusi di ruang rapat, dan kembali ke meja masing-masing.

Anda cukup mengetik **satu baris** untuk memulai. Mereka menyusun requirement,
merancang arsitektur, menulis program, menjalankannya, menguji, dan menulis dokumentasi
— semuanya **satu per satu, bukan asal jalan paralel**.

Yang membedakan dari sekadar "chatbot yang nulis kode":

| Kemampuan | Status |
|---|---|
| Kode **benar-benar dijalankan** | Python, JS, TS, C++, C, Java, PHP |
| Error **asli** dikembalikan ke agent | agent baca `stderr`, lalu perbaiki sendiri |
| **Library/framework** dipasang otomatis | pip (venv) & npm, sesuai kebutuhan |
| Hasil kerja = **file nyata** | 20/20 task menghasilkan file, bukan cuma diskusi |
| **Ingat** antar task | setiap task menyimpan kesimpulan untuk task berikutnya |
| **Tool CRUD** per agen | baca, tulis, ubah, hapus file di folder kerjanya |

---

## Kantor virtual

Denah di bawah dirender langsung dari `types/office.ts` — grid 22×14.

<p align="center">
  <img src="docs/images/office-map.svg" alt="Denah kantor virtual dengan 6 ruangan" width="820">
</p>

| Ruangan | Isi |
|---|---|
| 🚪 Lobby | tempat santai agent |
| 🗣️ Ruang Rapat | 6 kursi — agent **duduk** saat berdiskusi |
| 💻 Ruang Coding | 12 meja, tiap agent punya komputer sendiri |
| 🧪 Lab QA | meja pengujian |
| 🎤 Panggung Demo | tempat menyiapkan demo |
| ☕ Lounge | tempat santai sambil menulis dokumentasi |

### Para agen

Sprites di bawah bukan gambar desain — di-render dari `pixel-sprites.ts`.

<p align="center">
  <img src="docs/images/agents-sprites.svg" alt="Sheet sprite agen dalam 6 pose" width="820">
</p>

Tiap agen punya **guard** (batas kewenangan) sehingga tidak ada yang mengerjakan
jobdesc orang lain. Contoh nyata:

- **QA Automation** → *tidak boleh* menulis kode produksi
- **CEO** → *tidak boleh* merancang arsitektur detail
- **Character Designer** → *tidak boleh* menyusun cerita / storyboard
- **Storyboard Artist** → *tidak boleh* menggambar desain karakter
---

## Cara kerjanya

<p align="center">
  <img src="docs/images/workflow.svg" alt="Diagram 6 fase workflow" width="820">
</p>

| Fase | Isi | Status |
|---|---|---|
| Requirement | visi, user story, analisis risiko | wajib |
| Design | arsitektur, design system, alur UX | wajib |
| **Creative** | desain karakter, storyboard, struktur cerita | **opsional** |
| Coding | backend, frontend, prototipe UI | wajib |
| Testing | test plan, traceability, skrip demo | wajib |
| Documenting | panduan, release notes, handoff | wajib |

> Fase **Creative** hanya jalan bila proyeknya memang bergenre kreatif
> (cerita, karakter, game, animasi). Proyek backend biasa **melewatinya** — tidak
> ada agent yang sia-sia bekerja atau membakar kuota gateway.

### Di dalam setiap task

1. Agent membaca konteks: **memori** task sebelumnya + file kerja rekannya
2. Menulis file ke `workspace/projects/<proyek>/tasks/<taskId>/`
3. **Menjalankan programnya** → dapat `stdout`/`stderr` asli
4. Kalau gagal → baca error → perbaiki → jalankan lagi (maks 2×)
5. Kalau butuh library → pasang dulu ke venv / npm
6. Atasan menilai; kalau belum sesuai → diproses ulang (maks 2×)

### Tool yang tersedia untuk agent

| Tool | Fungsi |
|---|---|
| `list_tasks` | lihat folder tiap agent + apa yang sudah dikerjakan |
| `list_files` | lihat file di proyek |
| `read_file` | baca isi file |
| `write_file` | buat file baru |
| `edit_file` | ubah file (overwrite/append) |
| `delete_file` | hapus file |
| `run_program` | **jalanin program, dapat error aslinya** |
| `install_library` | pasang library/framework |

---

## Menjalankan

### Prasyarat

- **Node.js 18+**
- **Python 3.11+** — hanya bila ingin menjalankan program Python
- **OmniRoute AI Gateway** berjalan di `localhost:20128`

### 1. Instal

```bash
git clone <repo-url>
cd ai-assistant-visual
npm install
```

### 2. Konfigurasi

```bash
cp .env.example .env.local
```

```env
OMNIROUTE_BASE_URL=http://localhost:20128/v1
OMNIROUTE_API_KEY=isi-dari-omniroute
```

### 3. Jalankan

```bash
npm run dev                      # pengembangan, http://localhost:3000
# atau
npm run build && npm start       # produksi
```

<details>
<summary><b>Tidak punya gateway? Tetap bisa jalan</b></summary>

```bash
node mock-gateway.cjs            # gateway tiruan di :20128
npm run dev
```

Aplikasi otomatis turun ke **mode simulasi** — tapi hasilnya konten karangan,
bukan model sungguhan. Aplikasi akan menandainya dengan jelas.

**Jangan** jalankan mock gateway kalau OmniRoute asli sudah berjalan di port
yang sama — keduanya berebut port.
</details>

<details>
<summary><b>Kendala gateway yang sering muncul</b></summary>

| Gejala | Arti | Solusi |
|---|---|---|
| `HTTP 402: Add credits` | saldo akun habis | top up, atau pilih model `:free` |
| `HTTP 429: rate limit` | kena limit model gratis | tunggu, atau ganti model |
| `HTTP 503: no backend` | tidak ada backend tersedia | pilih model lain |
| `HTTP 401` | API key salah/kedaluwarsa | cek `OMNIROUTE_API_KEY` |

Kalau sampai gagal, aplikasi **tidak diam-diam** — ia menandai output dengan
---

## Arsitektur

```
Browser ──WebSocket──▶ Server (Express + Next.js)
                            │
                            ▼
                    ChatDevEngine (LangGraph)
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   workspace.ts         runner.ts             tools.ts
   (file + memori)     (jalan program)     (CRUD + install)
        │                   │                   │
        └───────────────────┴───────────────────┘
                            │
                    config/omniroute.ts
                 (SATU-SATUNYA jalan keluar LLM)
```

> **Aturan arsitektur:** tidak ada kode yang memanggil OpenAI / Anthropic /
> Gemini / Ollama secara langsung. Satu-satunya jalan keluar LLM adalah
> `config/omniroute.ts`.

### Struktur folder

```
├── config/omniroute.ts      ★ klien gateway + routing/compression
├── lib/orchestrator/
│   ├── ChatDevEngine.ts     ★ otak workflow (LangGraph, 6 fase, tool loop)
│   ├── runner.ts            ★ eksekusi program 7 bahasa + venv/npm
│   ├── tools.ts             ★ 8 tool yang boleh dipanggil agen
│   ├── taskRegistry.ts      20 task + deliverable per task
│   ├── workspace.ts         sandbox filesystem + memori per proyek
│   ├── hierarchy.ts         review atasan → bawahan
│   ├── validation.ts        verifikasi kelayakan hasil kerja
│   └── memory (di workspace) memori antar-task
├── components/office/       kanvas 2D, sprite pixel-art, pathfinding BFS
├── components/chat/         UI percakapan ala Claude Desktop
├── server/                  custom server + WebSocket
├── tools/                   generator gambar dokumentasi
└── tests/                   16 berkas uji
```

---

## Keamanan

Eksekusi program adalah bagian paling berisiko dari proyek ini.

| Ancaman | Mitigasi |
|---|---|
| Command injection | `spawn(cmd, args, { shell: false })` — **tidak pernah** pakai shell |
| Akses ke luar folder | `resolveSafe()` menolak `../`, path absolut, symlink escape |
| Command berbahaya | blocklist `rm -rf`, `del /f`, `format`, `shutdown`, `curl\|sh` |
| Loop tak berakhir | timeout keras 10 detik per langkah |
| Bocor API key | env proses disaring — hanya `PATH` + `HOME` |
| Name injection | `;`, `&&`, `..`, flag tersembunyi ditolak sebelum install |
| SVG berbahaya (XSS) | dirender lewat `<img>`, **tidak** di-inline |
| Memori beracun | path traversal ditolak saat agent membaca/menulis file |

---

## Pengembangan

```bash
npm run typecheck           # cek TypeScript

npm test                    # parser Markdown              (16)
npm run test:orchestration  # roster, skill, dispatch, sprite (79)
npm run test:deliverables   # kontrak deliverable + LangGraph (29)
npm run test:tools          # tool agent, CRUD, sandbox     (36)
npm run test:runner         # eksekusi program 7 bahasa     (13)
npm run test:deps           # venv + install library nyata (13)
npm run test:memory         # memori antar-task             (15)
npm run test:workspace      # sandbox filesystem           (26)
npm run test:project-crud   # CRUD proyek                  (35)
npm run test:task-folder    # folder per task              (16)

npm run docs:images         # render ulang gambar README dari kode
```
`⚠️ SIMULASI — BUKAN MODEL SUNGGUHAN`.
</details>

## Kredit & Kolaborasi

Proyek ini berdiri di atas karya orang lain. **Kami tidak mengklaim sebagai karya asli.**

### [:memo: ChatDev](https://github.com/OpenBMB/ChatDev) — OpenBMB / THUNLP

Paradigma **"virtual software company"** — sekelompok agen yang berdiskusi lewat
seminar/phase untuk menyelesaikan siklus hidup perangkat lunak — berasal dari
makalah *ChatDev: Communicative Agents for Software Development*
([arXiv:2307.07924](https://arxiv.org/abs/2307.07924)).

Kami menghormati para penulisnya. Yang kami bangun ulang: orkestrator LangGraph,
kanvas kantor virtual, dan eksekusi program nyata.
Lisensi ChatDev: Apache-2.0.

### [:zap: OmniRoute AI Gateway](https://omniroute.ai)

Seluruh panggilan model melewati OmniRoute. Kode proyek ini **tidak** memanggil
OpenAI / Anthropic / Gemini / Ollama secara langsung.

### [:honeybee: Anthropic Skill](https://github.com/anthropics/skills)

Folder `anthropic_skills/` dan sebagian `server/skills/` berisi material Anthropic,
© Anthropic PBC — **tidak berlisensi open-source**.

### [:package: Dependensi open-source

[Next.js](https://nextjs.org) · [React](https://react.dev) ·
[LangGraph](https://langchain-ai.github.io/langgraph/) ·
[OpenAI Node SDK](https://github.com/openai/openai-node) ·
[Tailwind CSS](https://tailwindcss.com) · [lucide](https://lucide.dev) ·
[ws](https://github.com/websockets/ws) · [zod](https://zod.dev)

Rincian lengkap ada di [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

### Aset visual

**Semua sprite, denah kantor, dan diagram di README ini dihasilkan oleh kode
proyek ini sendiri** lewat `npm run docs:images` — bukan aset pihak ketiga.
Kalau sprite berubah, gambarnya ikut berubah setelah dijalankan ulang.

---

## Kontributor

Kontribusi diterima dengan senang hati — kode, laporan bug, ide, atau dokumentasi.

- Daftar kontributor ada di halaman GitHub repository ini
- Ingin mulai? Baca [CONTRIBUTING.md](CONTRIBUTING.md)

### Cara membantu

| Jenis sumbangan | Contoh |
|---|---|
| 🐛 Melaporkan bug | Langkah reproduksi, harapan vs kenyataan |
| ✨ Menambah fitur | buka PR dulu untuk diskusi desain |
| 📖 Dokumentasi | memperbaiki bagian yang membingungkan |
| 🧪 Testing | kasus uji untuk runner, sandbox, atau validasi |

---

## Lisensi

Kode proyek ini berlisensi **MIT** — lihat [LICENSE](LICENSE).

⚠️ Dikecualikan: `anthropic_skills/` dan sebagian `server/skills/` yang
merupakan material Anthropic. Lihat [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

<div align="center">
  <sub>Dibangun dengan Next.js · LangGraph · dan banyak kopi</sub>
</div>
> ⚠️ **Penting:** bloklist adalah *defense-in-depth*, bukan sandbox sungguhan.
> `npm install` dan `pip install` menjalankan kode dari internet.
> Untuk penggunaan lokal/pribadi ini cukup. **Untuk server publik, jalankan
> di dalam Docker** — hanya itu yang benar-benar mengisolasi kode dari mesin.

---

