# Notices of Third-Party Code

Proyek ini berdiri di atas pekerjaan orang lain. Berikut daftar dan lisensinya.

---

## 1. Paradigma: ChatDev

Proyek ini terinspirasi langsung oleh **ChatDev** dari OpenBMB / THUNLP.

> ChatDev: Communicative Agents for Software Development — arXiv:2307.07924
> <https://arxiv.org/abs/2307.07924> · <https://github.com/OpenBMB/ChatDev>

Ide dasarnya — **"virtual software company"**, sekelompok agen yang berdiskusi
lewat seminar/phase untuk menyelesaikan siklus hidup perangkat lunak — diambil
dari sana. Yang kami bangun ulang: orkestrator berbasis LangGraph, kanvas kantor
virtual 2D, dan eksekusi program nyata.

**Lisensi ChatDev: Apache-2.0** (<https://github.com/OpenBMB/ChatDev/blob/main/LICENSE>)

Kami menghormati para penulis makalah tersebut.

---

## 2. Material Anthropic Skill

Folder `anthropic_skills/` berisi salinan skill dari Anthropic.

> © 2025 Anthropic, PBC. All rights reserved.
> Penggunaan material ini tunduk pada perjanjian Anda dengan Anthropic.

**Bukan lisensi open-source.** Material ini tidak boleh diperlakukan sebagai
karya Anda sendiri.

Folder `server/skills/` berisi campuran:

| Skill | Lisensi |
|---|---|
| `frontend-design`, `canvas-design`, `theme-factory`, `brand-guidelines`, `algorithmic-art`, `webapp-testing`, `internal-comms`, `skill-creator`, `web-artifacts-builder`, `mcp-builder`, `claude-api`, `discernment-nudge`, `slack-gif-creator`, `academy-guide` | Apache-2.0 |
| `docx`, `pdf`, `pptx`, `xlsx` | © Anthropic, PBC — proprietary |

Selalu periksa `LICENSE.txt` di dalam folder skill sebelum mem redistribusi.

---

## 3. Gateway LLM: OmniRoute

Seluruh panggilan model melewati **OmniRoute AI Gateway**. Kode proyek ini tidak
memanggil OpenAI/Anthropic/Gemini/Ollama secara langsung.

- <https://omniroute.ai>
- Lisensi: lihat repositori OmniRoute

---

## 4. Dependensi runtime

| Paket | Lisensi | Dipakai untuk |
|---|---|---|
| [Next.js](https://github.com/vercel/next.js) | MIT | Framework + custom server |
| [React](https://github.com/facebook/react) | MIT | UI |
| [@langchain/langgraph](https://github.com/langchain-ai/langgraph) | MIT | Orkestrasi fase |
| [openai](https://github.com/openai/openai-node) (SDK saja) | Apache-2.0 | Klien OpenAI-compatible |
| [ws](https://github.com/websockets/ws) | MIT | WebSocket |
| [zod](https://github.com/colinhacks/zod) | MIT | Validasi |
| [lucide-react](https://github.com/lucide-icons/lucide) | ISC | Ikon |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | MIT | Styling |
| [clsx](https://github.com/lclsx/clsx) | MIT | Class merge |
| [tailwind-merge](https://github.com/dcastil/tailwind-merge) | MIT | Class merge |

---

## 5. Font & Aset

Sprites, denah kantor, dan diagram README **dihasilkan sendiri oleh kode
proyek ini** melalui `npm run docs:images` — bukan aset pihak ketiga.

---

## 6. Kontributor

Lihat bagian [Kontributor](#kontributor) di `README.md`.