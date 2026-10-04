# Server — Virtual Office Multi-Agent Workspace

> Docs ini menggantikan backend Express lama. Endpoint API kini bukan lagi file
> `routes.js`, melainkan App Router route handlers di `app/api/`.

## Menjalankan

```powershell
npm run dev      # http://localhost:3000 (hot reload)
npm run build && npm start
```

Entry point adalah `server/bootstrap.ts`, yang memuat `.env.local` **sebelum**
modul lain membacanya, lalu menjalankan `server/index.ts`.

## Isi

| File | Fungsi |
|---|---|
| `bootstrap.ts` | Memuat `.env.local`, lalu start server |
| `index.ts` | Custom server: menyatukan Next.js + WebSocket pada satu port |
| `websocket.ts` | Handler `/socket/office` (multi-sesi, aman dari JSON circular) |
| `skills/` | Berkas skill (dipakai sebagai referensi prompt) |

## Endpoint (App Router)

| Method | Path | Fungsi |
|---|---|---|
| GET | `/api/health` | Status app + konektivitas gateway OmniRoute |
| GET | `/api/models` | Katalog strategi routing + model terpakai |
| GET/POST | `/api/agents/config` | Konfigurasi routing per agent |
| POST | `/api/workflow/start` | Jalankan workflow sinkron (tanpa UI) |
| POST | `/api/chat` | Completion tunggal via OmniRoute |

## WebSocket `/socket/office`

**Client → server**
`start` · `hitl` · `interrupt` · `update_agents` · `nudge` · `ping`

**Server → client**
`HELLO` · `SNAPSHOT` · `PHASE_CHANGE` · `AGENT_MOVE_TO_ROOM` · `AGENT_THINKING` ·
`AGENT_TALKING` · `AGENT_MESSAGE` · `AGENT_STREAM_CHUNK` · `AGENT_DONE` ·
`ARTIFACT` · `LOG` · `HITL_REQUEST` · `WORKFLOW_DONE` · `ERROR`

## Environment

| Variabel | Default |
|---|---|
| `OMNIROUTE_BASE_URL` | `http://localhost:20128/v1` |
| `OMNIROUTE_API_KEY` | (dari OmniRoute) |
| `OMNIROUTE_COMPRESS` | `rtk` |
| `OMNIROUTE_COMBO` | `auto` |
| `PORT` / `HOST` | `3000` / `localhost` |

> `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` **tidak dipakai** —
> seluruh routing dikelola OmniRoute.

## Menjalankan

```powershell
npm run backend        # http://localhost:4000
```

## Environment variables

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `4000` | Port server |
| `LLM_BASE_URL` | `http://localhost:20128/v1` | Endpoint OmniRoute (OpenAI-compatible) |
| `LLM_API_KEY` | _(kosong)_ | API key OmniRoute |
| `LLM_MODEL` | `gpt-4o-mini` | Model default |
| `USE_OMNIROUTE` | _(kosong)_ | Set `1` untuk paksa mode LLM |
| `ALLOW_EXEC` | _(kosong)_ | Set `1` untuk mengizinkan `POST /api/exec` (berbahaya) |

## Endpoint

### Proyek
- `GET /api/projects` — daftar proyek
- `POST /api/projects` — buat proyek `{ task, agents? }`
- `GET /api/projects/:id` — detail
- `PUT /api/projects/:id` — update
- `DELETE /api/projects/:id` — hapus
- `POST /api/projects/:id/run` — jalankan agen (sinkron)
- `GET /api/projects/:id/stream` — SSE live percakapan agen
- `POST /api/projects/:id/folders` — buat folder baru `{ path }`
- `GET /api/projects/:id/export` — download semua file sebagai `.zip`
- `GET /api/projects/:id/files` — list file proyek
- `POST /api/projects/:id/files` — tambah file `{ path, content }`
- `PUT /api/projects/:id/files/<path>` — edit isi file `{ content }`
- `DELETE /api/projects/:id/files/<path>` — hapus file
- `GET /api/projects/:id/files/<path>` — isi satu file

### AI & Web
- `GET /api/health` — status server
- `GET /api/models` — proxy daftar model OmniRoute
- `POST /api/chat` — proxy chat completions OmniRoute
- `POST /api/browse` — akses web: `{ url }` → judul, teks, tautan (timeout 20 dtk)
- `POST /api/fetch-url` — ambil raw HTML URL (timeout 15 dtk)

### Tools
- `POST /api/ocr` — OCR gambar (`multipart/form-data`, field `image`, opsional `lang` default `ind+eng`)
- `POST /api/extract-pdf` — ekstrak teks PDF (field `file`)
- `POST /api/upload` — upload file umum (maks 10MB)
- `POST /api/exec` — jalankan shell (hanya jika `ALLOW_EXEC=1`)
- `GET /api/skills` — daftar skill tersedia

## Contoh

```powershell
# buat proyek & jalankan
$p = Invoke-RestMethod -Method Post http://localhost:4000/api/projects -ContentType 'application/json' -Body '{"task":"Todo app"}'
Invoke-RestMethod -Method Post "http://localhost:4000/api/projects/$($p.id)/run"

# export zip
Invoke-WebRequest "http://localhost:4000/api/projects/$($p.id)/export" -OutFile project.zip

# OCR
Invoke-RestMethod -Method Post http://localhost:4000/api/ocr -Form @{ image = Get-Item .\foto.png }

# browser
Invoke-RestMethod -Method Post http://localhost:4000/api/browse -ContentType 'application/json' -Body '{"url":"https://example.com"}'
```
