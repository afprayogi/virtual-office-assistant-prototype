/**
 * lib/orchestrator/runner.ts
 * ---------------------------------------------------------------------------
 * MENJALANKAN program yang ditulis agent. Inilah yang mengubah "agent menulis
 * kode" menjadi "agent menulis kode lalu DIJALANKAN dan dibuktikan benar".
 *
 * Tanpa modul ini, `validation.ts` hanya bisa memeriksa kata kunci (`export`,
 * `function`, ...) sehingga kode yang gagal compile tetap ditulis "Sesuai".
 *
 * Keamanan (bukan opsional -- program ini menjalankan kode dari LLM):
 *  - TIDAK pernah memakai `shell`. `spawn(cmd, args, { shell: false })`
 *    mengirim argv terpisah, jadi string dari model tidak bisa disisipkan
 *    sebagai perintah shell (command injection mustahil lewat path model).
 *  - `cwd` dipaksa ke folder task lewat `resolveSafe()`.
 *  - `env` disaring: hanya PATH + HOME. `printenv` tidak bisa mencuri API key.
 *  - Timeout keras per langkah: `while(true)` tidak akan menggantung.
 *  - Output dipotong agar tidak membanjiri konteks LLM.
 *
 * Bahasa dua langkah (compile lalu jalankan) ditangani `runSteps()`, jadi tidak
 * perlu `&&` -- dan dengan begitu tidak perlu shell sama sekali.
 * ---------------------------------------------------------------------------
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { resolveProjectRoot, resolveSafe } from './workspace'

/** Node binary yang sedang berjalan dipakai untuk .js/.ts (tanpa shell). */
const NODE = process.execPath

/** Path absolut ke CLI tsx di node_modules, kalau ada. */
function tsxCli(): string | null {
  const p = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs')
  return fs.existsSync(p) ? p : null
}

/** Batas keras per langkah (ms). Mencegah loop tak berakhir. */
export const STEP_TIMEOUT_MS = 10_000

/** Batas total seluruh langkah satu program (ms). */
export const TOTAL_TIMEOUT_MS = 25_000

/** Output per langkah dipotong agar hemat konteks. */
const MAX_OUTPUT = 8_000

/**
 * Perintah berbahaya yang TIDAK PERNAH boleh dijalankan, apa pun alasan model.
 *
 * Bloklist ini defense-in-depth, bukan sandbox. Menjalankan kode LLM dengan
 * bloklist hanya cocok untuk mesin lokal/pribadi; untuk server publik hanya
 * Docker/VM yang benar-benar aman.
 */
const BLOCKED = [
  /\brm\s+-[rf]{1,2}\b/i,
  /\bdel\s+\/[sf]/i,
  /\bformat\b/i,
  /\b(shutdown|reboot|halt)\b/i,
  /\b(mkfs|fdisk|diskpart)\b/i,
  /\bcurl\b[^\n]*\|\s*(ba)?sh/i,
  /\bwget\b[^\n]*\|\s*(ba)?sh/i,
  /\bInvoke-Expression\b/i,
  /\bchmod\s+777\s+\//i,
  /\bnet\s+user\b.*\/(add|domain)/i,
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;\s*:/,
]

/** True bila command atau argumennya mengandung pola terlarang. */
export function isBlocked(args: readonly string[]): boolean {
  const joined = args.join(' ')
  return BLOCKED.some((re) => re.test(joined))
}

/** Hasil menjalankan satu program. */
export interface RunResult {
  /** True bila SEMUA langkah exit 0 dan tidak timeout. */
  ok: boolean
  /** Exit code langkah terakhir; null bila dibunuh / gagal spawn. */
  code: number | null
  stdout: string
  stderr: string
  durationMs: number
  timedOut: boolean
  /** Alasan tidak bisa jalan (runtime tidak ada, diblokir, dll). */
  skipped?: string
}

/** Satu langkah: program + argumen (tanpa shell). */
export type Step = readonly [string, readonly string[]]

/** Potong string ke MAX_OUTPUT dengan penanda bagian terlewat. */
function cap(text: string): string {
  if (text.length <= MAX_OUTPUT) return text
  return `${text.slice(0, MAX_OUTPUT)}\n... (dipotong, total ${text.length} karakter)`
}

/** Environment minimal -- tidak ada kredensial yang bisa bocor ke program. */
function safeEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? process.env.USERPROFILE ?? '',
    SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
    NODE_NO_WARNINGS: '1',
    // ProcessEnv di @types/node mewajibkan NODE_ENV (readonly), jadi harus
    // diisi saat pembuatan objek. Program tidak boleh membacanya anyways.
    NODE_ENV: 'production',
  }
}

/**
 * Jalankan satu langkah tanpa shell, dengan timeout keras.
 * Tidak pernah melempar -- kegagalan dikembalikan sebagai objek.
 */
function runStep(
  cmd: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(cmd, [...args], {
        cwd,
        env: safeEnv(),
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (err) {
      resolve({
        code: null,
        stdout: '',
        stderr: `Gagal menjalankan ${cmd}: ${err instanceof Error ? err.message : String(err)}`,
        timedOut: false,
      })
      return
    }

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false

    const timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill('SIGKILL')
      } catch {
        /* proses mungkin sudah mati */
      }
      // Di Windows, kill() kadang tidak menewaskan tree proses.
      if (process.platform === 'win32' && child.pid) {
        try {
          spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], {
            windowsHide: true,
            stdio: 'ignore',
            shell: false,
          })
        } catch {
          /* abaikan */
        }
      }
    }, timeoutMs)

    child.stdout?.on('data', (d: Buffer) => {
      if (stdout.length < MAX_OUTPUT * 2) stdout += d.toString()
    })
    child.stderr?.on('data', (d: Buffer) => {
      if (stderr.length < MAX_OUTPUT * 2) stderr += d.toString()
    })

    const done = (code: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut })
    }

    child.on('error', (err) => {
      stderr += `\n${err.message}`
      done(null)
    })
    child.on('close', (code) => done(code))
  })
}

/**
 * Jalankan program sebagai rangkaian langkah.
 *
 * Langkah dijalankan berurutan; begitu satu langkah gagal, langkah berikutnya
 * TIDAK dijalankan -- jadi yang muncul adalah error compile yang berguna,
 * bukan error "exe tidak ada" yang membingungkan.
 */
export async function runSteps(
  steps: readonly Step[],
  relDir = '.',
  timeoutMs = TOTAL_TIMEOUT_MS,
): Promise<RunResult> {
  const started = Date.now()

  const cwd = resolveSafe(relDir)
  if (!cwd || !fs.existsSync(cwd)) {
    return {
      ok: false, code: null, stdout: '', stderr: '',
      durationMs: 0, timedOut: false,
      skipped: `Folder tidak bisa dibuka: ${relDir}`,
    }
  }

  for (const [cmd, args] of steps) {
    // PENTING: nama perintah ikut digabung. Kalau hanya args yang dicek,
    // `['rm', ['-rf', '/']]` lolos karena pola `rm -rf` tidak pernah muncul
    // di dalam args itu saja.
    if (isBlocked([cmd, ...args])) {
      return {
        ok: false, code: null, stdout: '', stderr: '',
        durationMs: Date.now() - started, timedOut: false,
        skipped: `Perintah diblokir demi keamanan: ${[cmd, ...args].join(' ')}`,
      }
    }
  }

  let stdout = ''
  let stderr = ''
  let code: number | null = null

  for (const [cmd, args] of steps) {
    const remaining = timeoutMs - (Date.now() - started)
    if (remaining <= 0) {
      return {
        ok: false, code, stdout: cap(stdout), stderr: cap(stderr),
        durationMs: Date.now() - started, timedOut: true,
      }
    }

    const r = await runStep(cmd, args, cwd, Math.min(STEP_TIMEOUT_MS, remaining))
    stdout += r.stdout
    stderr += r.stderr
    code = r.code

    if (r.timedOut) {
      return {
        ok: false, code, stdout: cap(stdout),
        stderr: cap(`${stderr}\nProgram dihentikan setelah ${STEP_TIMEOUT_MS / 1000} detik - mungkin infinite loop.`),
        durationMs: Date.now() - started, timedOut: true,
      }
    }
    if (r.code !== 0) {
      return {
        ok: false, code, stdout: cap(stdout), stderr: cap(stderr),
        durationMs: Date.now() - started, timedOut: false,
      }
    }
  }

  return {
    ok: true, code, stdout: cap(stdout), stderr: cap(stderr),
    durationMs: Date.now() - started, timedOut: false,
  }
}

/* -------------------------------------------------------------------------- */
/*  DETEKSI BAHASA                                                            */
/* -------------------------------------------------------------------------- */
/*  DEPENDENCY (venv / npm)                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Nama paket yang TIDAK BOLEH di-install.
 *
 * Ini bukan sekadar formalitas: `pip install` bisa menjalankan `setup.py`
 * milik paket saat installs, jadi paket dengan nama ini ditolak supaya agent
 * tidak bisa menarik kode yang berbahaya ke mesin ini.
 */
const BLOCKED_PACKAGES = new Set([
  'virtualenv-prebuilt', 'pyvirtualenv',
])

/** Buang karakter yang tidak aman dari nama paket sebelum dipakai. */
function safePkg(name: string): string | null {
  const n = name.trim()
  if (!n) return null
  // WAJIB: nama paket tidak boleh diawali '-' — kalau tidak, pip akan
  // membacanya sebagai FLAG (mis. `--index-url=http://server.penyerang`).
  if (n.startsWith('-')) return null
  // Scope npm memakai garis miring: `@types/node`, `@vitejs/plugin-react`.
  // `/` aman karena TIDAK ada shell -- argumen selalu terpisah. Tapi `..`
  // tetap ditolak: `npm install ../../x` akan memasang dari folder lokal
  // yang bisa di luar sandbox.
  if (n.includes('..')) return null
  // Bagian nama (sebelum operator versi) hanya boleh karakter paket biasa.
  // Operator versi `==`, `>=`, `<`, `~=` tetap diizinkan karena itu bentuk
  // normal dari requirements.txt (`cowsay==6.1`).
  const base = n.split(/[<>=!~*[\]()]/)[0] ?? ''
  if (!/^[@a-zA-Z0-9._/-]+$/.test(base)) return null
  // Keseluruhan hanya boleh karakter spesifikasi dependensi PEP 508 + scope npm.
  // `;`, spasi, `|`, `&`, backtick, dan `$` TIDAK ada di sini — jadi tidak
  // mungkin menyisipkan operator shell.
  if (!/^[@a-zA-Z0-9._<>!=~*,\[\]()-]+$/.test(n) && !/^[@a-zA-Z0-9._/@-]+$/.test(n)) {
    return null
  }
  if (BLOCKED_PACKAGES.has(n.toLowerCase())) return null
  return n
}

/**
 * Lokasi venv milik proyek aktif.
 * Falls back ke `python` global bila venv belum dibuat.
 */
export function projectPython(absRoot: string): string {
  const win = path.join(absRoot, '.venv', 'Scripts', 'python.exe')
  if (fs.existsSync(win)) return win
  const posix = path.join(absRoot, '.venv', 'bin', 'python')
  if (fs.existsSync(posix)) return posix
  return 'python'
}

/** True bila proyek sudah punya venv. */
export function hasVenv(absRoot: string): boolean {
  return fs.existsSync(path.join(absRoot, '.venv'))
}

/**
 * Buat virtual environment untuk proyek (sekali saja).
 *
 * Dipakai `python -m venv` sehingga tidak butuh paket eksternal dan tidak
 * menyentuh Python global milik pengguna.
 */
export async function ensureVenv(absRoot: string): Promise<RunResult> {
  if (hasVenv(absRoot)) {
    return { ok: true, code: 0, stdout: 'venv sudah ada', stderr: '', durationMs: 0, timedOut: false }
  }
  const r = await runSteps([['python', ['-m', 'venv', path.join(absRoot, '.venv')]]], '.', 120_000)
  return r.ok
    ? { ...r, stdout: `venv dibuat di ${path.join(absRoot, '.venv')}` }
    : r
}

/**
 * Install satu paket ke proyek.
 *
 * `kind: 'python'` → pip ke dalam `.venv` proyek (venv dibuat otomatis).
 * `kind: 'node'`   → npm install di folder proyek.
 *
 * Timeout sengaja lebih longgar (2 menit) karena mengunduh paket memang
 * lambat — dan inilah jalur yang membuat LLM bisa punya dependency sendiri.
 */
/**
 * Command untuk memanggil npm TANPA shell.
 *
 * Ini bukan detail kecil. Diuji langsung di mesin ini:
 *   - `spawn('npm', …, {shell:false})`     → ENOENT (tidak ada executable)
 *   - `spawn('npm.cmd', …, {shell:false})` → EINVAL (Node memblokir .cmd
 *     sejak perbaikan CVE-2024-27980)
 *
 * Satu-satunya jalan yang tetap aman adalah menjalankan entry-point JS-nya
 * lewat node itu sendiri. Argumen tetap terpisah, jadi tidak ada permukaan
 * command injection yang ditambahkan.
 */
function npmCommand(): Step | null {
  const candidates = [
    // Lokasi tipikal install Node.js di Windows.
    path.join(path.dirname(NODE), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    // Instalasi lain (nvm, scoop, brew) — cari relatif terhadap node.
    path.join(path.dirname(NODE), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return [NODE, [c]]
  }
  // POSIX: `npm` memang executable biasa, jadi aman dipanggil langsung.
  return process.platform === 'win32' ? null : ['npm', []]
}

/**
 * Pastikan proyek punya package.json sebelum npm install.
 *
 * Tanpa ini `npm install` gagal dengan "package.json tidak ada" - error yang
 * tidak memberi petunjuk apa pun ke agent.
 */
async function ensurePackageJson(): Promise<void> {
  const npm = npmCommand()
  if (!npm) return
  if (fs.existsSync(path.join(resolveProjectRoot(), 'package.json'))) return
  await runSteps([[npm[0], [...npm[1], 'init', '-y']]], '.', 30_000)
}

export async function installDependency(
  absRoot: string,
  pkg: string,
  kind: 'python' | 'node' = 'python',
): Promise<RunResult> {
  const name = safePkg(pkg)
  if (!name) {
    return {
      ok: false, code: null, stdout: '', stderr: `Nama paket tidak aman: ${pkg}`,
      durationMs: 0, timedOut: false,
      skipped: `Nama paket tidak aman: ${pkg}`,
    }
  }

  if (kind === 'node') {
    const npm = npmCommand()
    if (!npm) {
      return {
        ok: false, code: null, stdout: '', stderr: '',
        durationMs: 0, timedOut: false,
        skipped: 'npm tidak ditemukan di mesin ini',
      }
    }
    await ensurePackageJson()
    const r = await runSteps([[npm[0], [...npm[1], 'install', name]]], '.', 300_000)
    return r.ok
      ? { ...r, stdout: `npm install ${name} berhasil`, stderr: r.stderr }
      : r
  }

  // Python: pastikan venv dulu, lalu pip install DI DALAM venv itu.
  const venv = await ensureVenv(absRoot)
  if (!venv.ok) {
    return { ...venv, stderr: `Gagal membuat venv: ${venv.stderr}` }
  }
  const py = projectPython(absRoot)
  const r = await runSteps([[py, ['-m', 'pip', 'install', name]]], '.', 180_000)
  return r.ok
    ? { ...r, stdout: `pip install ${name} berhasil (venv proyek)` }
    : r
}

/** Daftar paket python yang sudah terpasang di venv proyek. */
export async function listInstalled(absRoot: string): Promise<string[]> {
  const py = projectPython(absRoot)
  const r = await runSteps([[py, ['-m', 'pip', 'list', '--format=freeze']]], '.', 30_000)
  if (!r.ok) return []
  return r.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
}

/**
 * Baca daftar dependensi dari `requirements.txt` di folder kerja.
 *
 * Ini menutup kasus "programnya belum jadi": agent menulis kode yang
 * mengimpor `requests`, tapi lupa menyebutkannya baik di prompt maupun di
 * requirements. Satu-satunya bukti kebenaran adalah menjalankan programnya —
 * dan program itu akan gagal dengan `ModuleNotFoundError`.
 *
 * Karena itu requirements dibaca dan dipasang OTOMATIS sebelum menjalankan,
 * sehingga agent tidak perlu mengingat sendiri daftar paket yang dibutuhkan.
 */
export function readRequirements(absDir: string): string[] {
  const file = path.join(absDir, 'requirements.txt')
  if (!fs.existsSync(file)) return []
  try {
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .map((l) => l.split('#')[0].trim())
      .filter((l) => l && !l.startsWith('-'))
  } catch {
    return []
  }
}

/**
 * Pasang semua dependensi yang ditandai SEBELUM menjalankan program python.
 *
 * Dijalankan sekali per folder (cache lokal), lalu program memakai venv yang
 * sama. `requested` diisi bila ada yang gagal supaya pesan erroragent menyebut
 * nama paketnya, bukan sekadar "gagal install".
 */
export async function installRequirements(absDir: string): Promise<{
  installed: string[]
  failed: { name: string; error: string }[]
}> {
  const reqs = readRequirements(absDir)
  const installed: string[] = []
  const failed: { name: string; error: string }[] = []
  if (reqs.length === 0) return { installed, failed }

  const venv = await ensureVenv(absDir)
  if (!venv.ok) {
    return { installed, failed: [{ name: '(venv)', error: venv.stderr || 'gagal membuat venv' }] }
  }

  const py = projectPython(absDir)
  for (const name of reqs) {
    const safe = safePkg(name)
    if (!safe) {
      failed.push({ name, error: 'nama paket tidak aman' })
      continue
    }
    const r = await runSteps([[py, ['-m', 'pip', 'install', '-q', safe]]], '.', 180_000)
    if (r.ok) installed.push(safe)
    else failed.push({ name: safe, error: r.stderr.split('\n')[0] ?? 'gagal' })
  }
  return { installed, failed }
}

/* -------------------------------------------------------------------------- */

/** Hasil deteksi: langkah dijalankan, atau alasan tidak bisa jalan. */
export type Detected =
  | { ok: true; steps: Step[]; lang: string }
  | { ok: false; reason: string; lang: string }

/**
 * Petakan satu file program menjadi langkah eksekusi.
 *
 * Penting: `main.cpp` harus dikompilasi dulu sebelum bisa jalan, jadi
 * C/C++/Java menghasilkan DUA langkah. Program yang gagal compile berhenti di
 * langkah pertama -- agent langsung melihat error compile asli, bukan error
 * "exe tidak ada" yang membingungkan.
 *
 * Semua perintah memakai argv terpisah (tanpa `&&`, tanpa shell).
 */
export function detectCommand(relFile: string, relDir = '.'): Detected {
  const ext = (relFile.split('.').pop() ?? '').toLowerCase()
  const name = path.basename(relFile)
  const absDir = resolveSafe(relDir) ?? '.'
  const inDir = path.join(absDir, name)

  switch (ext) {
    case 'py':
    case 'pyw':
      // WAJIB pakai interpreter venv proyek bila ada.
      //
      // Ini bugs yang pernah nyata: `installDependency()` memasang library ke
      // dalam `.venv`, tapi program dijalankan dengan `python` global ->
      // import-nya tidak ketemu dan program mati dengan ModuleNotFoundError
      // padahal library-nya SUDAH terpasang. Interpreter harus sama dengan
      // tempat paket diinstall.
      return { ok: true, steps: [[projectPython(absDir), [inDir]]], lang: 'python' }

    case 'js':
    case 'mjs':
    case 'cjs':
      return { ok: true, steps: [[NODE, [inDir]]], lang: 'javascript' }

    case 'ts':
    case 'tsx': {
      const cli = tsxCli()
      if (!cli) {
        return { ok: false, lang: 'typescript', reason: 'tsx belum terpasang (npm install)' }
      }
      return { ok: true, steps: [[NODE, [cli, inDir]]], lang: 'typescript' }
    }

    case 'cpp':
    case 'cc':
    case 'cxx': {
      const exe = path.join(resolveSafe(relDir) ?? '.', `${path.parse(name).name}.exe`)
      return {
        ok: true,
        steps: [
          ['g++', [inDir, '-o', exe, '-std=c++17']],
          [exe, []],
        ],
        lang: 'cpp',
      }
    }

    case 'c': {
      const exe = path.join(resolveSafe(relDir) ?? '.', `${path.parse(name).name}.exe`)
      return {
        ok: true,
        steps: [
          ['gcc', [inDir, '-o', exe]],
          [exe, []],
        ],
        lang: 'c',
      }
    }

    case 'java': {
      const cls = path.parse(name).name
      return {
        ok: true,
        steps: [
          ['javac', [inDir]],
          ['java', ['-cp', resolveSafe(relDir) ?? '.', cls]],
        ],
        lang: 'java',
      }
    }

    case 'php':
      return { ok: true, steps: [['php', [inDir]]], lang: 'php' }

    default:
      return {
        ok: false,
        lang: ext || 'unknown',
        reason: `Ekstensi ".${ext}" belum punya runner. Didukung: py, js, ts, tsx, c, cpp, java, php.`,
      }
  }
}

/** Deteksi + jalankan satu file dalam satu panggilan. */
export async function runFile(relFile: string, relDir = '.'): Promise<RunResult> {
  const detected = detectCommand(relFile, relDir)
  if (!detected.ok) {
    return {
      ok: false, code: null, stdout: '', stderr: '',
      durationMs: 0, timedOut: false,
      skipped: detected.reason,
    }
  }
  return runSteps(detected.steps, relDir)
}
