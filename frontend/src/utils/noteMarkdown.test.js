import { expect, it } from 'vitest'
import { noteMarkdown } from './noteMarkdown'

it('exports rich notes with wiki links, canvas embeds, tasks and formatting intact', () => {
  const html = '<h2>Evidence</h2><p><strong>Strong</strong> result <span data-wiki-name="Method">Method</span></p><div data-canvas-file="Maps/Plan.canvas">ignored</div><ul><li data-type="taskItem" data-checked="true"><p>Read paper</p></li></ul>'
  expect(noteMarkdown(html)).toBe('## Evidence\n\n**Strong** result [[Method]]\n\n![[Maps/Plan.canvas]]\n\n- [x] Read paper')
})

it('keeps plain Markdown and excludes active HTML from bundles', () => {
  expect(noteMarkdown('# Markdown')).toBe('# Markdown')
  expect(noteMarkdown('<p>Safe</p><script>alert(1)</script><iframe src="x"></iframe>')).toBe('Safe')
})
