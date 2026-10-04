/**
 * lib/orchestrator/workspace.ts
 * ---------------------------------------------------------------------------
 * Akses FILESYSTEM untuk agent — inilah yang membuat mereka "worker sungguhan".
 *
 * Agent tidak sekadar bicara: mereka menulis file nyata ke direktori kerja dan
 * bisa membaca file yang sudah dibuat rekannya di fase sebelumnya.
 *
 * Keamanan: SEMUA path dipetakan ke satu direktori sandbox. Path yang keluar
 * dari sandbox (`../`, path absolut, symlink escape) DITOLAK, bukan sekadar
 * "dibersihkan".
 * ---------------------------------------------------------------------------
 */
import fs from 'node:fs'
import path from 'node:path'

/** Direktori kerja hasil kerja tim (terpisah dari source code aplikasi). */
export const WORKSPACE_DIR = path.join(process.cwd(), 'workspace')

/** Semua proyek disimpan di sini, satu folder per proyek. */
export const PROJECTS_DIR = path.join(WORKSPACE_DIR, 'projects')

/** Folder yang tidak pernah ditampilkan/dibaca (noise + rahasia). */
const IGNORED = new Set(['node_modules', '.git', '.next', '.env', '.env.local'])

/** Batas ukuran file yang boleh dibaca ke dalam konteks LLM. */
const MAX_READ_BYTES = 24_000

/** Metadata sebuah proyek (satu folder di `projects/`). */
export interface ProjectMeta {
  /** Id unik, mis. 'catatan-taking-a1b2c3'. */
  id: string
  /** Nama proyek yang mudah dibaca. */
  name: string
  /** Path relatif terhadap workspace, mis. 'projects/catatan-taking-a1b2c3'. */
  path: string
  createdAt: number
}

/**
 * Proyek yang sedang aktif.
 *
 * Disimpan sebagai file penanda di dalam workspace supaya tetap konsisten
 * walau server di-restart di tengah pekerjaan.
 */
const ACTIVE_POINTER = path.join(WORKSPACE_DIR, '.active-project')

/** Ubah nama proyek jadi slug aman untuk nama folder. */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return base || 'proyek'
}

/**
 * Buat folder proyek BARU dan jadikan aktif.
 *
 * Tiap proyek mendapat foldernya sendiri sehingga hasil kerja antar proyek
 * tidak saling menimpa.
 */
export function createProject(name: string): ProjectMeta {
  ensureWorkspace()
  fs.mkdirSync(PROJECTS_DIR, { recursive: true })

  const id = `${slugify(name)}-${Date.now().toString(36)}`
  const rel = path.join('projects', id)
  fs.mkdirSync(path.join(WORKSPACE_DIR, rel), { recursive: true })

  const meta: ProjectMeta = {
    id,
    name: name.trim() || 'Proyek tanpa nama',
    path: rel.split(path.sep).join('/'),
    createdAt: Date.now(),
  }
  fs.writeFileSync(ACTIVE_POINTER, JSON.stringify(meta), 'utf8')
  return meta
}

/** Baca proyek aktif, atau null bila belum ada proyek. */
export function getActiveProject(): ProjectMeta | null {
  try {
    if (!fs.existsSync(ACTIVE_POINTER)) return null
    const meta = JSON.parse(fs.readFileSync(ACTIVE_POINTER, 'utf8')) as ProjectMeta
    // Validasi: folder-nya masih ada?
    if (fs.existsSync(path.join(WORKSPACE_DIR, meta.path))) return meta
    return null
  } catch {
    return null
  }
}

/**
 * Task yang sedang aktif.
 *
 * Setiap task mendapat folder sendiri DI DALAM proyek, supaya hasil kerja satu
 * task tidak tercampur dengan task lain:
 *
 *   projects/<proyek>/tasks/req-vision/docs/product-vision.pdf
 *   projects/<proyek>/tasks/code-impl/src/index.ts
 *
 * Ditulis ke disk juga supaya konsisten walau server restart di tengah jalan.
 */
const ACTIVE_TASK_POINTER = path.join(WORKSPACE_DIR, '.active-task')

/**
 * Folder proyek aktif. Bila ada task aktif, semua operasi tulis dibatasi ke
 * folder task itu — inilah yang mencegah file antar task bercampur.
 */
function activeRoot(): string {
  const meta = getActiveProject()
  const projectRoot = meta ? path.join(WORKSPACE_DIR, meta.path) : PROJECTS_DIR
  const task = getActiveTask()
  return task ? path.join(projectRoot, 'tasks', task) : projectRoot
}

/**
 * Set task aktif. Semua tulis berikutnya masuk ke folder task ini.
 * Pass `null` untuk kembali ke folder proyek (mis. saat mau merapikan).
 */
export function setActiveTask(taskId: string | null): void {
  ensureWorkspace()
  try {
    if (taskId) {
      fs.mkdirSync(taskRoot(taskId), { recursive: true })
      fs.writeFileSync(ACTIVE_TASK_POINTER, taskId, 'utf8')
    } else if (fs.existsSync(ACTIVE_TASK_POINTER)) {
      fs.rmSync(ACTIVE_TASK_POINTER, { force: true })
    }
  } catch {
    // Gagal menulis penanda tidak boleh mematikan workflow.
  }
}

/** Task aktif saat ini, atau null. */
export function getActiveTask(): string | null {
  try {
    if (!fs.existsSync(ACTIVE_TASK_POINTER)) return null
    const id = fs.readFileSync(ACTIVE_TASK_POINTER, 'utf8').trim()
    return id || null
  } catch {
    return null
  }
}

/** Path absolut folder sebuah task (tanpa bergantung pointer aktif). */
function taskRoot(taskId: string): string {
  const meta = getActiveProject()
  const projectRoot = meta ? path.join(WORKSPACE_DIR, meta.path) : PROJECTS_DIR
  return path.join(projectRoot, 'tasks', taskId)
}

/**
 * Daftar file di SELURUH proyek, termasuk semua folder task.
 * Path relatif sudah menyertakan prefix ''tasks/<taskId>/'', sehingga agent bisa
 * melihat hasil rekannya tanpa menabrak file miliknya sendiri.
 */
export function listProjectTree(): WorkspaceFile[] {
  const meta = getActiveProject()
  const root = meta ? path.join(WORKSPACE_DIR, meta.path) : PROJECTS_DIR
  const out: WorkspaceFile[] = []
  if (!fs.existsSync(root)) return out

  const walk = (dir: string) => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (IGNORED.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(full)
          out.push({
            path: path.relative(root, full).split(path.sep).join('/'),
            size: stat.size,
            modifiedAt: stat.mtimeMs,
          })
        } catch {
          // File hilang di tengah iterasi — abaikan.
        }
      }
    }
  }

  walk(root)
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * Petakan path relatif ke absolut DI DALAM proyek aktif.
 * Mengembalikan `null` bila path mencoba keluar dari sandbox.
 */
export function resolveSafe(relPath: string): string | null {
  if (!relPath) return null
  // Tolak path absolut & traversal Windows maupun POSIX.
  if (path.isAbsolute(relPath) || /^[a-zA-Z]:/.test(relPath)) return null

  const root = path.resolve(activeRoot())
  const normalized = path.normalize(relPath).replace(/^([/\\])+/, '')
  const full = path.resolve(root, normalized)

  // Second check: pastikan hasil resolve masih di dalam root.
  if (full !== root && !full.startsWith(root + path.sep)) return null
  return full
}

/** Ensure the workspace directory exists. */
export function ensureWorkspace(): void {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true })
  fs.mkdirSync(PROJECTS_DIR, { recursive: true })
}

/** One entry in the workspace tree. */
export interface WorkspaceFile {
  /** Path relatif terhadap workspace, selalu memakai '/'. */
  path: string
  size: number
  modifiedAt: number
}

/**
 * Daftar seluruh file di proyek aktif (tree datar), diurutkan.
 * Folder kosong / file terlalu besar tetap ditampilkan sebagai info.
 */
export function listWorkspace(): WorkspaceFile[] {
  const out: WorkspaceFile[] = []
  const root = path.resolve(activeRoot())
  if (!fs.existsSync(root)) return out

  const walk = (dir: string) => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (IGNORED.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(full)
          out.push({
            path: path.relative(root, full).split(path.sep).join('/'),
            size: stat.size,
            modifiedAt: stat.mtimeMs,
          })
        } catch {
          // File hilang di tengah iterasi — abaikan.
        }
      }
    }
  }

  walk(root)
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * Baca file dari workspace.
 * @returns isi file, atau `null` bila tidak ada / di luar sandbox.
 */
export function readWorkspaceFile(relPath: string): string | null {
  const full = resolveSafe(relPath)
  if (!full) return null
  try {
    if (!fs.statSync(full).isFile()) return null
    // Batasi agar file raksasa tidak membanjiri konteks.
    const stat = fs.statSync(full)
    if (stat.size > MAX_READ_BYTES) {
      return fs.readFileSync(full, 'utf8').slice(0, MAX_READ_BYTES)
    }
    return fs.readFileSync(full, 'utf8')
  } catch {
    return null
  }
}

/**
 * Tulis file ke workspace, membuat foldernya bila perlu.
 * @returns `true` bila berhasil ditulis.
 */
export function writeWorkspaceFile(relPath: string, content: string): boolean {
  const full = resolveSafe(relPath)
  if (!full) return false
  try {
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content, 'utf8')
    return true
  } catch {
    return false
  }
}

/**
 * Tulis file BINER (mis. PDF) ke workspace.
 * Dipakai untuk deliverable bertipe pdf: yang tersimpan di disk adalah file
 * PDF sungguhan, bukan Markdown ber ekstensi palsu.
 */
export function writeWorkspaceBinary(relPath: string, data: Buffer): boolean {
  const full = resolveSafe(relPath)
  if (!full) return false
  try {
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, data)
    return true
  } catch {
    return false
  }
}

/** Baca file sebagai buffer (untuk streamed download PDF). */
export function readWorkspaceBinary(relPath: string): Buffer | null {
  const full = resolveSafe(relPath)
  if (!full) return null
  try {
    return fs.readFileSync(full)
  } catch {
    return null
  }
}

/* -------------------------------------------------------------------------- */
/*  MEMORI PROYEK                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Memori kerja antar-task — ini yang membedakan alur "benar-benar ingat"
 * dari alur "mulai dari nol setiap task".
 *
 * Tanpa ini, setiap task hanya melihat `dependsOn` langsung. Task `doc-guide`
 * yang bergantung pada `test-verify` TIDAK tahu apa yang terjadi di
 * `req-vision` — padahal hasil itu relevan untuk menulis panduan.
 *
 * Solusi: setiap task selesai -> tulis 1 file ringkas berisi KESIMPULAN
 * (bukan transkrip chat, bukan kode) ke folder `memory/`. Task berikutnya
 * mencari kata kuncinya di ringkasan itu dan mengambil yang relevan.
 *
 * Sengaja TIDAK memakai FAISS/embedding: untuk 17 task per workflow,
 * pencarian kata kunci sudah cukup dan jauh lebih murah. Yang penting adalah
 * "ada sesuatu yang bisa diingat", bukan retrieval sempurna.
 */

/** Folder memori di dalam proyek aktif (di luar `tasks/`). */
const MEMORY_DIR = 'memory'

/** Berapa banyak ringkasan yang boleh disuntikkan ke prompt. */
const MAX_MEMORY_CHARS = 3000

/** Satu entri memori satu task. */
export interface MemoryNote {
  taskId: string
  title: string
  agentName: string
  phase: string
  /** Ringkasan hasil — inilah yang dicari task berikutnya. */
  summary: string
  /** File yang dihasilkan (path saja). */
  files: string[]
  /** Waktu penulisan. */
  at: number
}

/** Path absolut folder root proyek aktif (bukan folder task). */
export function resolveProjectRoot(): string {
  const meta = getActiveProject()
  return meta ? path.join(WORKSPACE_DIR, meta.path) : PROJECTS_DIR
}

/**
 * Ringkasan per task: folder apa yang dipakai dan file apa yang di dalamnya.
 *
 * Inilah yang membuat "direktori setiap task" bisa DILIHAT, bukan hanya
 * diasumsikan ada. Tanpa ini, agent dan user sama-sama tidak tahu hasil kerja
 * task lain sudah selesai atau belum.
 */
export interface TaskFolderView {
  taskId: string
  /** Jumlah file hasil kerja task ini. */
  fileCount: number
  /** Total byte file di task ini. */
  totalBytes: number
  /** Daftar path relatif terhadap folder task itu sendiri. */
  files: { path: string; size: number }[]
  /** True bila folder tidak ada (task belum menghasilkan apa pun). */
  empty: boolean
}

/**
 * Daftar folder task beserta hasil kerjanya, urut nama.
 *
 * Path dari `listProjectTree()` sudah berawalan `tasks/<taskId>/`, jadi di sini
 * cukup dikelompokkan — termasuk folder yang belum ada, supaya user melihat
 * task mana yang belum menghasilkan apa pun (bukan cuma yang ada isinya).
 */
export function listTaskFolders(): TaskFolderView[] {
  const meta = getActiveProject()
  const root = meta ? path.join(WORKSPACE_DIR, meta.path) : PROJECTS_DIR
  const tasksDir = path.join(root, 'tasks')

  const found = new Map<string, { path: string; size: number }[]>()
  let names: string[] = []
  try {
    names = fs.readdirSync(tasksDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  } catch {
    names = []
  }

  for (const f of listProjectTree()) {
    const m = /^tasks\/([^/]+)\/(.+)$/.exec(f.path)
    if (!m) continue
    const list = found.get(m[1]) ?? []
    list.push({ path: m[2], size: f.size })
    found.set(m[1], list)
  }

  return names.map((taskId) => {
    const files = (found.get(taskId) ?? []).sort((a, b) => a.path.localeCompare(b.path))
    return {
      taskId,
      fileCount: files.length,
      totalBytes: files.reduce((n, f) => n + f.size, 0),
      files,
      empty: files.length === 0,
    }
  })
}

/** Path absolut folder memori proyek aktif. */
function memoryRoot(): string {
  return path.join(resolveProjectRoot(), MEMORY_DIR)
}

/**
 * Simpan ringkasan hasil satu task ke memori proyek.
 *
 * Sengaja TIDAK memakai `resolveSafe()`: saat task selesai `setActiveTask()`
 * masih menunjuk ke folder task itu, sehingga path relatif akan salah. Memori
 * selalu disimpan di folder PROYEK, bukan folder task.
 */
export function saveMemory(note: Omit<MemoryNote, 'at'>): boolean {
  try {
    const dir = memoryRoot()
    fs.mkdirSync(dir, { recursive: true })
    const body = [
      `# ${note.title}`,
      '',
      `- task: ${note.taskId}`,
      `- agent: ${note.agentName}`,
      `- fase: ${note.phase}`,
      `- waktu: ${new Date().toISOString()}`,
      note.files.length ? `- file: ${note.files.join(', ')}` : '- file: (tidak ada)',
      '',
      '## Kesimpulan',
      note.summary.trim() || '(tidak ada ringkasan)',
      '',
    ].join('\n')
    fs.writeFileSync(path.join(dir, `${note.taskId}.md`), body, 'utf8')
    return true
  } catch {
    return false
  }
}

/** Baca semua catatan memori proyek, diurutkan lama -> baru. */
export function listMemory(): MemoryNote[] {
  const dir = memoryRoot()
  if (!fs.existsSync(dir)) return []

  const out: MemoryNote[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }

  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.md')) continue
    try {
      const full = path.join(dir, e.name)
      const raw = fs.readFileSync(full, 'utf8')
      const taskId = e.name.replace(/\.md$/, '')
      const rawFiles = /- file:\s*(.+)$/m.exec(raw)?.[1]?.trim() ?? ''
      out.push({
        taskId,
        title: /^#\s+(.+)$/m.exec(raw)?.[1]?.trim() ?? taskId,
        agentName: /- agent:\s*(.+)$/m.exec(raw)?.[1]?.trim() ?? '',
        phase: /- fase:\s*(.+)$/m.exec(raw)?.[1]?.trim() ?? '',
        summary: /##\s+Kesimpulan\s*\n([\s\S]*?)(?:\n## |$)/.exec(raw)?.[1]?.trim() ?? '',
        files:
          rawFiles && rawFiles !== '(tidak ada)'
            ? rawFiles.split(',').map((s) => s.trim()).filter(Boolean)
            : [],
        at: fs.statSync(full).mtimeMs,
      })
    } catch {
      // File rusak -> lewati, jangan gagalkan seluruh pembacaan memori.
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

/** Kata umum yang TIDAK boleh jadi sinyal relevansi. */
const STOPWORDS = new Set([
  'yang', 'dan', 'untuk', 'dengan', 'dari', 'pada', 'adalah', 'ini', 'itu',
  'sebuah', 'atau', 'akan', 'sudah', 'tidak', 'bisa', 'dalam', 'oleh',
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was',
])

/**
 * Cari catatan memori yang relevan dengan satu query.
 *
 * Skoring sederhana: jumlah kata kunci query yang muncul di ringkasan, dengan
 * bonus kalau kecocokannya juga di judul (judul lebih representatif).
 */
export function recallMemory(query: string, limit = 4): MemoryNote[] {
  const notes = listMemory()
  if (notes.length === 0) return []

  const terms = [
    ...new Set(
      query
        .toLowerCase()
        .replace(/[^a-z0-9\s]/gi, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOPWORDS.has(w)),
    ),
  ]
  if (terms.length === 0) return []

  return notes
    .map((n) => {
      const body = n.summary.toLowerCase()
      const title = n.title.toLowerCase()
      let score = 0
      for (const t of terms) {
        if (body.includes(t)) score += 1
        if (title.includes(t)) score += 2
      }
      return { note: n, score }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.note)
}

/**
 * Blok memori untuk disuntikkan ke prompt.
 *
 * Dipanggil SETIAP task (bukan hanya yang punya `dependsOn`), jadi task
 * tanpa dependensi formal pun bisa "ingat" keputusan sebelumnya.
 */
export function memoryContext(query: string): string {
  const hits = recallMemory(query)
  if (hits.length === 0) return ''

  let out = ''
  for (const h of hits) {
    const block =
      `<memory task="${h.taskId}" oleh="${h.agentName}">\n` +
      `${h.title}\n${h.summary.slice(0, 900)}\n</memory>`
    if (out.length + block.length > MAX_MEMORY_CHARS) break
    out += (out ? '\n\n' : '') + block
  }

  if (!out) return ''
  return (
    `Yang sudah disepakati tim sebelumnya (ingat, jangan mengulang dari nol):\n${out}\n` +
    `Rujuk catatan ini sebelum mengerjakan tugasmu.`
  )
}

/** Hapus seluruh memori proyek (dipanggil saat workflow baru dimulai). */
export function clearMemory(): number {
  const dir = memoryRoot()
  if (!fs.existsSync(dir)) return 0
  try {
    fs.rmSync(dir, { recursive: true, force: true })
    return 1
  } catch {
    return 0
  }
}

/**
 * Ringkasan workspace untuk disuntikkan ke prompt agent.
 *
 * Inilah "membaca direktori kerja": agent melihat file apa saja yang SUDAH
 * ada (dari rekannya), sehingga bisa melanjutkan, mereview, atau menulis
 * revisi alih-alih mengulang dari nol.
 */
export function workspaceContext(maxFiles = 40): string {
  const files = listWorkspace()
  if (files.length === 0) {
    return '(workspace masih kosong — kamu yang pertama)'
  }
  const shown = files.slice(-maxFiles)
  const lines = shown.map(
    (f) => `- ${f.path} (${f.size} B)${f.size > MAX_READ_BYTES ? ' [dipotong]' : ''}`,
  )
  const more = files.length - shown.length
  return [
    ...lines,
    ...(more > 0 ? [`- … dan ${more} file lain`] : []),
  ].join('\n')
}

/**
 * Baca beberapa file sekaligus untuk disuntikkan sebagai konteks.
 * File yang tidak ada diam-diam dilewati.
 */
export function readWorkspaceFiles(paths: string[]): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = []
  for (const p of paths) {
    const content = readWorkspaceFile(p)
    if (content !== null) out.push({ path: p, content })
  }
  return out
}

/**
 * Bersihkan seluruh isi proyek aktif.
 * Dipakai saat workflow baru dimulai agar file lama tidak mengotori hasil.
 */
export function clearWorkspace(): number {
  const root = path.resolve(activeRoot())
  if (!fs.existsSync(root)) return 0
  let removed = 0
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue
    fs.rmSync(path.join(root, entry.name), { recursive: true, force: true })
    removed++
  }
  return removed
}

/* ------------------------------- CRUD file ------------------------------- */

/** Hasil operasi tulis file, supaya UI bisa memberi umpan balik jelas. */
export type WriteMode = 'create' | 'overwrite' | 'append'

export interface WriteResult {
  ok: boolean
  /** Alasan kegagalan bila `ok` false. */
  error?: string
  /** True bila file baru dibuat (mode create). */
  created?: boolean
  bytes?: number
}

/**
 * Tulis file dengan mode eksplisit — ini inti dari "bisa menambah, mengedit,
 * dan menulis" yang diminta.
 *
 * - `create`   → gagal bila file sudah ada (mencegah menimpa tanpa sengaja)
 * - `overwrite` → edit penuh (tulis ulang isi)
 * - `append`   → menambah di akhir (untuk log/catatan)
 */
export function editWorkspaceFile(
  relPath: string,
  content: string,
  mode: WriteMode = 'overwrite',
): WriteResult {
  const full = resolveSafe(relPath)
  if (!full) return { ok: false, error: 'Path di luar folder proyek' }

  const exists = fs.existsSync(full)
  if (mode === 'create' && exists) {
    return { ok: false, error: 'File sudah ada — gunakan mode edit atau append' }
  }

  try {
    fs.mkdirSync(path.dirname(full), { recursive: true })
    if (mode === 'append' && exists) {
      fs.appendFileSync(full, content, 'utf8')
    } else {
      fs.writeFileSync(full, content, 'utf8')
    }
    return { ok: true, created: !exists, bytes: fs.statSync(full).size }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Gagal menulis' }
  }
}

/**
 * Hapus file dari proyek aktif.
 *
 * File di luar folder proyek akan ditolak oleh `resolveSafe`.
 */
export function deleteWorkspaceFile(relPath: string): WriteResult {
  const full = resolveSafe(relPath)
  if (!full) return { ok: false, error: 'Path di luar folder proyek' }
  try {
    if (!fs.statSync(full).isFile()) {
      return { ok: false, error: 'Hanya file yang bisa dihapus' }
    }
    const bytes = fs.statSync(full).size
    fs.rmSync(full, { force: true })
    return { ok: true, bytes }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Gagal menghapus' }
  }
}

/**
 * Hapus folder kosong (atau folder beserta isinya bila `recursive`).
 * Berguna untuk merapikan proyek setelah file dihapus.
 */
export function deleteWorkspaceDir(relPath: string, recursive = false): WriteResult {
  const full = resolveSafe(relPath)
  if (!full) return { ok: false, error: 'Path di luar folder proyek' }
  try {
    if (!fs.existsSync(full)) return { ok: false, error: 'Folder tidak ditemukan' }
    fs.rmSync(full, { recursive, force: true })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Gagal menghapus folder' }
  }
}

/** Daftar folder di proyek aktif (dalam bentuk path relatif). */
export function listWorkspaceDirs(): string[] {
  const root = path.resolve(activeRoot())
  if (!fs.existsSync(root)) return []
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED.has(entry.name) || !entry.isDirectory()) continue
      const full = path.join(dir, entry.name)
      out.push(path.relative(root, full).split(path.sep).join('/'))
      walk(full)
    }
  }
  walk(root)
  return out.sort()
}