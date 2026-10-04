/**
 * lib/orchestrator/tools.ts
 * ---------------------------------------------------------------------------
 * Tool yang boleh dipanggil agent SAAT BEKERJA — bukan hanya setelah selesai.
 *
 * Sebelumnya agent hanya bisa menulis file lalu menunggu. Sekarang ia bisa:
 *   - melihat isi folder kerja (bukan hanya daftar nama file),
 *   - menjalankan program dan membaca stdout/stderr yang asli,
 *   - memasang library yang dibutuhkan.
 *
 * Hasil tool call dikembalikan ke model sebagai umpan balik, jadi agent bisa
 * MEMPERBAIKI kodenya sendiri berdasarkan error yang benar-benar terjadi.
 * Inilah yang membedakan "agent menulis kode" dari "agent mengerjakan tugas".
 *
 * Semua operasi sudah dibatasi oleh `runner.ts` (sandbox + timeout + blocklist).
 * ---------------------------------------------------------------------------
 */

import { installDependency, runFile, type RunResult } from './runner'
import {
  deleteWorkspaceFile,
  editWorkspaceFile,
  listProjectTree,
  listTaskFolders,
  readWorkspaceFile,
  resolveProjectRoot,
  setActiveTask,
} from './workspace'

/** Deskripsi tool dalam format OpenAI function-calling. */
export interface ToolSpec {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** Panggilan tool yang diminta model. */
export interface ToolCall {
  id: string
  name: string
  /** Argumen sudah di-parse dari JSON string. */
  args: Record<string, unknown>
}

/** Hasil eksekusi satu tool. */
export interface ToolResult {
  id: string
  name: string
  /** Ringkasan siap kirim balik ke model. */
  content: string
  ok: boolean
}

/** Potong teks panjang supaya tidak membanjiri konteks. */
function cap(text: string, max = 1500): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n… (dipotong, total ${text.length} karakter)`
}

/**
 * Daftar tool yang dikirim ke model.
 *
 * Sengaja DIBATAS. Setiap tool berarti kemampuan menjalankan sesuatu di mesin
 * ini, jadi menambah tool berarti menambah permukaan serangan.
 */
export const TOOL_SPECS: ToolSpec[] = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description:
        'Lihat daftar file yang sudah ada di direktori kerja proyek (termasuk file milik rekaanmu).',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Baca isi lengkap sebuah file di direktori kerja. Gunakan sebelum menyunting file rekaan.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path relatif, mis. src/server/api.ts' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description:
        'Lihat daftar folder task beserta hasil kerjanya (file apa saja yang sudah ditulis tiap agent). ' +
        'Pakai ini untuk melihat apa yang sudah dikerjakan rekananmu.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Buat file BARU di folder kerja taskmu. Gagal bila file sudah ada — ' +
        'untuk menimpa atau menyunting, pakai edit_file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path relatif, mis. src/server/api.ts' },
          content: { type: 'string', description: 'Isi lengkap file' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description:
        'Ubah file yang sudah ada. Mode "overwrite" menimpa seluruh isi, ' +
        '"append" menambah di akhir. Pakai setelah read_file agar tidak menimpa pekerjaan sendiri.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path relatif file yang mau diubah' },
          content: { type: 'string', description: 'Isi baru' },
          mode: { type: 'string', enum: ['overwrite', 'append'], description: 'Cara mengubah (default overwrite)' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description:
        'Hapus file yang tidak dipakai lagi. Hati-hati: tidak ada recycle bin.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path relatif file yang mau dihapus' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_program',
      description:
        'Jalankan program yang sudah ada di direktori kerja dan kembalikan stdout/stderr aslinya. ' +
        'Gunakan setelah menulis kode untuk memastikan program benar-benar bekerja.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path file program, mis. main.py atau src/app.ts' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'install_library',
      description:
        'Pasang library ATAU framework ke proyek, lalu kamu bisa memakainya. ' +
        'Pakai SEBELUM menjalankan program yang mengimpornya.\n' +
        'ecosystem "python" (default): Flask, Django, requests, numpy, pandas, scikit-learn, pygame, dst.\n' +
        'ecosystem "node": React, Vite, Express, Vue, Tailwind, Three.js, dst.',
      parameters: {
        type: 'object',
        properties: {
          package: { type: 'string', description: 'Nama paket/framework' },
          ecosystem: {
            type: 'string',
            enum: ['python', 'node'],
            description: 'Manajemen paket (default: python).',
          },
        },
        required: ['package'],
      },
    },
  },
]

/** Allow-list: hanya nama tool di TOOL_SPECS yang boleh dieksekusi. */
const ALLOWED = new Set(TOOL_SPECS.map((t) => t.function.name))

/**
 * Jalankan satu tool call dan kembalikan hasilnya.
 *
 * Fungsi ini tidak pernah melempar: error dikembalikan sebagai `content`
 * supaya model bisa membacanya dan memperbaiki langkahnya sendiri.
 */
export async function executeTool(
  call: ToolCall,
  activeTaskId: string | null,
): Promise<ToolResult> {
  // Kalau agent aktif di sebuah task, operasi file diarahkan ke folder task itu.
  if (activeTaskId) setActiveTask(activeTaskId)

  const fail = (msg: string): ToolResult => ({
    id: call.id,
    name: call.name,
    content: `ERROR: ${msg}`,
    ok: false,
  })

  if (!ALLOWED.has(call.name)) {
    return fail(`Tool "${call.name}" tidak dikenal. Yang tersedia: ${[...ALLOWED].join(', ')}`)
  }

  switch (call.name) {
    case 'list_tasks': {
      const views = listTaskFolders()
      if (views.length === 0) {
        return { id: call.id, name: call.name, ok: true, content: 'Belum ada folder task apa pun.' }
      }
      return {
        id: call.id,
        name: call.name,
        ok: true,
        content: views
          .map((v) =>
            v.empty
              ? `- ${v.taskId}: (belum ada file)`
              : `- ${v.taskId}: ${v.fileCount} file (${v.totalBytes} B)\n` +
                v.files.map((f) => `    ${f.path} (${f.size} B)`).join('\n'),
          )
          .join('\n'),
      }
    }

    case 'write_file': {
      const p = String(call.args.path ?? '').trim()
      const content = String(call.args.content ?? '')
      if (!p) return fail('Parameter "path" wajib diisi.')
      // Mode 'create' = gagal kalau file sudah ada. Ini sengaja: mencegah
      // agent menimpa hasil rekannya tanpa disadari.
      const r = editWorkspaceFile(p, content, 'create')
      if (!r.ok) return fail(`${p}: ${r.error}`)
      return {
        id: call.id,
        name: call.name,
        ok: true,
        content: `File dibuat: ${p} (${r.bytes} B)`,
      }
    }

    case 'edit_file': {
      const p = String(call.args.path ?? '').trim()
      const content = String(call.args.content ?? '')
      const mode = String(call.args.mode ?? 'overwrite')
      if (!p) return fail('Parameter "path" wajib diisi.')
      if (readWorkspaceFile(p) === null) {
        return fail(`File tidak ada: ${p}. Pakai write_file untuk membuat baru.`)
      }
      const r = editWorkspaceFile(p, content, mode === 'append' ? 'append' : 'overwrite')
      if (!r.ok) return fail(`${p}: ${r.error}`)
      return {
        id: call.id,
        name: call.name,
        ok: true,
        content: `File diubah (${mode}): ${p} (${r.bytes} B)`,
      }
    }

    case 'delete_file': {
      const p = String(call.args.path ?? '').trim()
      if (!p) return fail('Parameter "path" wajib diisi.')
      const r = deleteWorkspaceFile(p)
      if (!r.ok) return fail(`${p}: ${r.error}`)
      return { id: call.id, name: call.name, ok: true, content: `File dihapus: ${p}` }
    }

    case 'list_files': {
      const files = listProjectTree()
      if (files.length === 0) {
        return { id: call.id, name: call.name, ok: true, content: 'Direktori kerja masih kosong.' }
      }
      return {
        id: call.id,
        name: call.name,
        ok: true,
        content: files.map((f) => `- ${f.path} (${f.size} B)`).join('\n'),
      }
    }

    case 'read_file': {
      const p = String(call.args.path ?? '').trim()
      if (!p) return fail('Parameter "path" wajib diisi.')
      const body = readWorkspaceFile(p)
      if (body === null) return fail(`File tidak ditemukan atau di luar sandbox: ${p}`)
      return {
        id: call.id,
        name: call.name,
        ok: true,
        content: `<file path="${p}">\n${cap(body, 4000)}\n</file>`,
      }
    }

    case 'run_program': {
      const p = String(call.args.path ?? '').trim()
      if (!p) return fail('Parameter "path" wajib diisi.')
      const run: RunResult = await runFile(p)
      if (run.skipped) return fail(`Tidak bisa menjalankan ${p}: ${run.skipped}`)

      const head = run.ok
        ? `Program ${p} BERJALAN tanpa error (${run.durationMs} ms).`
        : `Program ${p} GAGAL${run.timedOut ? ' (timeout - mungkin infinite loop)' : ` (exit ${run.code})`}.`
      const parts = [head]
      if (run.stdout.trim()) parts.push(`stdout:\n${cap(run.stdout.trim())}`)
      if (run.stderr.trim()) parts.push(`stderr:\n${cap(run.stderr.trim())}`)

      return {
        id: call.id,
        name: call.name,
        ok: run.ok,
        content:
          `${parts.join('\n\n')}\n\n` +
          (run.ok
            ? 'Lanjutkan dengan tugas berikutnya.'
            : 'Perbaiki kodenya berdasarkan pesan error di atas, lalu jalankan lagi.'),
      }
    }

    case 'install_library': {
      const pkg = String(call.args.package ?? '').trim()
      if (!pkg) return fail('Parameter "package" wajib diisi.')
      // Ecosystem boleh diisi model, tapi kalau tidak, kita tebak sendiri dari
      // nama paket: scope npm (@vitejs/plugin-react) pasti node.
      const declared = String(call.args.ecosystem ?? '').toLowerCase()
      const eco: 'python' | 'node' =
        declared === 'node' || declared === 'python'
          ? declared
          : pkg.startsWith('@')
            ? 'node'
            : 'python'

      const r = await installDependency(resolveProjectRoot(), pkg, eco)
      if (r.skipped) return fail(`Tidak bisa memasang ${pkg}: ${r.skipped}`)
      if (!r.ok) {
        return fail(
          `Gagal memasang ${pkg} (${eco}): ${cap(r.stderr || 'tidak diketahui', 400)}`,
        )
      }

      // Setelah install_library sukses, paket itu SIAP dipakai. Beri model
      // langkah konkret berikutnya, bukan sekadar kata "sukses".
      const next =
        eco === 'node'
          ? `require/import "${pkg.split('/')[0].replace(/^@[^/]+\//, '')}" di kodemu.`
          : `import ${pkg.split(/[=<>!~ ]/)[0].replace(/-/g, '_')} di kodemu.`

      return {
        id: call.id,
        name: call.name,
        ok: true,
        content:
          `${pkg} berhasil dipasang (${eco}).\n` +
          (r.stdout ? `${cap(r.stdout.trim(), 400)}\n` : '') +
          `Sekarang ${next}`,
      }
    }

    default:
      return fail(`Tool "${call.name}" belum diimplementasikan.`)
  }
}
