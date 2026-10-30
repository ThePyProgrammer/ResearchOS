// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync, utimesSync, rmSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import { expect, it } from 'vitest'

it('reloads theme configuration and its palette in a running Tailwind process', async () => {
  const frontend = fileURLToPath(new URL('../', import.meta.url))
  const directory = mkdtempSync(join(frontend, '.theme-config-test-'))
  const configPath = join(directory, 'tailwind.config.cjs')
  const palettePath = join(directory, 'themePalette.cjs')
  const config = readFileSync(join(frontend, 'tailwind.config.cjs'), 'utf8')
  const palette = readFileSync(join(frontend, 'themePalette.cjs'), 'utf8')
  const content = "module.exports.content = [{ raw: '<html class=\"dark\"><div class=\"bg-white text-slate-900 hover:bg-slate-100\"></div></html>' }];"
  try {
    writeFileSync(configPath, config + '\n' + content)
    writeFileSync(palettePath, palette)
    const processor = postcss([tailwindcss(configPath)])
    const compile = () => processor.process('@tailwind base; @tailwind utilities;', { from: join(directory, 'input.css') })
    const initial = (await compile()).css
    expect(initial).toContain('--surface: 30 30 30')
    expect(initial).toContain('background-color: rgb(var(--surface)')

    // Exercise the same process after edits, rather than starting a fresh build.
    writeFileSync(palettePath, palette.replace("'--surface': '30 30 30'", "'--surface': '31 31 31'"))
    const nextTime = new Date(Date.now() + 2000)
    utimesSync(palettePath, nextTime, nextTime)
    expect((await compile()).css).toContain('--surface: 31 31 31')

    writeFileSync(configPath, config + '\n' + content + '\nmodule.exports.theme.extend.backgroundColor.white = "#121212";')
    utimesSync(configPath, nextTime, nextTime)
    expect((await compile()).css).toMatch(/\.bg-white\s*\{[^}]*rgb\(18 18 18/)
  } finally {
    // Only remove the isolated directory created by this test.
    if (dirname(directory) === dirname(join(frontend, 'placeholder')) && basename(directory).startsWith('.theme-config-test-')) {
      rmSync(directory, { recursive: true, force: true })
    }
  }
})
