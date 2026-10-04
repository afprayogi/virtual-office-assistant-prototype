/**
 * tools/render-readme-assets.ts
 * ---------------------------------------------------------------------------
 * Menghasilkan seluruh aset visual README dari kode (SVG statis + animasi).
 * Sumber kebenaran sama dengan runtime — tidak ada gambar manual.
 *
 * Jalankan: npx tsx ./tools/render-readme-assets.ts
 * ---------------------------------------------------------------------------
 */
import fs from 'node:fs'
import path from 'node:path'
import { OUT_DIR } from './readme/svg-kit'
import { renderArchitecture, renderHero } from './readme/assets-intro'
import { renderDashboard } from './readme/assets-dashboard'
import { renderWorkspace } from './readme/assets-workspace'
import { renderOfficeDemoSvg } from './readme/demo-svg'
import { renderOfficeDemoGif } from './readme/demo-gif'

const kb = (n: number): string => `${(n / 1024).toFixed(1)} KB`

/** Tulis satu berkas SVG + cetak ringkasan. */
function writeSvg(name: string, body: string): void {
  fs.writeFileSync(path.join(OUT_DIR, name), body, 'utf8')
  console.log(`  ✓ docs/images/${name} (${kb(body.length)})`)
}

console.log('Merender aset README…')

writeSvg('hero.svg', renderHero())
writeSvg('ui-dashboard.svg', renderDashboard())
writeSvg('ui-workspace.svg', renderWorkspace())
writeSvg('architecture.svg', renderArchitecture())
writeSvg('office-demo.svg', renderOfficeDemoSvg())

const gif = renderOfficeDemoGif()
fs.writeFileSync(path.join(OUT_DIR, 'office-demo.gif'), Buffer.from(gif.gif))
console.log(
  `  ✓ docs/images/office-demo.gif (${kb(gif.gif.length)}, ` +
    `${gif.frames} frame, ${gif.paletteSize} warna, ${gif.width}x${gif.height})`,
)

console.log('Selesai.')
