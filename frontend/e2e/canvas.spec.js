import { expect, test } from '@playwright/test'

const text = (id, x = 0, value = 'A thought') => ({ id, type: 'text', x, y: 0, width: 300, height: 200, text: value })
const makeCanvas = (nodes = [], edges = []) => JSON.stringify({ nodes, edges })

async function setup(page, initial = []) {
  const notes = [
    { id: 'folder', name: 'Research', type: 'folder', parentId: null, content: '' },
    { id: 'summary', name: 'Summary', type: 'file', parentId: 'folder', content: '<h2>Results</h2><p>Referenced evidence</p><h2>Other</h2><p>More evidence</p>' },
    { id: 'nested', name: 'Nested.canvas', type: 'canvas', parentId: null, content: makeCanvas([text('nested-text', 0, 'Nested thought')]) },
    ...initial,
  ]
  const writes = [], errors = []
  page.on('pageerror', err => errors.push(err.message))
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (path === '/api/libraries') return route.fulfill({ json: [{ id: 'lib', name: 'Research' }] })
    if (path === '/api/libraries/lib/notes' && request.method() === 'POST') {
      const note = { id: `created-${notes.length}`, ...request.postDataJSON() }
      notes.push(note); return route.fulfill({ status: 201, json: note })
    }
    if (path === '/api/libraries/lib/notes') return route.fulfill({ json: notes })
    if (path.startsWith('/api/notes/') && request.method() === 'PATCH') {
      const note = notes.find(n => n.id === path.split('/').at(-1))
      Object.assign(note, request.postDataJSON()); writes.push({ id: note.id, ...request.postDataJSON() })
      return route.fulfill({ json: note })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/library/notes')
  await expect(page.getByText('Nested.canvas').first()).toBeVisible()
  return { notes, writes, errors }
}

async function openCanvas(page, name = 'Map.canvas') {
  await page.getByRole('button', { name: new RegExp(name.replace('.', '\\.')) }).first().click()
  await expect(page.getByRole('toolbar', { name: 'Canvas tools' })).toBeVisible()
}

test('creates a canvas in the directory and saves text through tab switches and reload', async ({ page }, testInfo) => {
  const { notes, writes, errors } = await setup(page)
  await page.getByTitle('New canvas in Library').click()
  const input = page.getByPlaceholder('File name')
  await input.fill('Map'); await input.press('Enter')
  await expect(page.getByRole('toolbar', { name: 'Canvas tools' })).toBeVisible()
  await page.getByRole('button', { name: '＋ Text', exact: true }).click()
  await page.getByRole('textbox', { name: 'Card text', exact: true }).fill('# Main idea\n\nEvidence matters.')
  await openCanvas(page, 'Nested.canvas')
  await expect.poll(() => writes.some(w => w.id.startsWith('created-') && w.content?.includes('Evidence matters'))).toBe(true)
  await openCanvas(page)
  await expect(page.locator('.canvas-card-content').getByText('Evidence matters.')).toBeVisible()
  await page.reload()
  await openCanvas(page)
  await expect(page.locator('.canvas-card-content').getByText('Evidence matters.')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('canvas-editor.png') })
  expect(notes.find(n => n.name === 'Map.canvas').type).toBe('canvas')
  expect(errors).toEqual([])
})

test('embeds notes and canvases, narrows headings, and protects against recursive previews', async ({ page }) => {
  const { writes, errors } = await setup(page, [{ id: 'map', name: 'Map.canvas', type: 'canvas', content: makeCanvas() }])
  await openCanvas(page)
  await page.getByRole('button', { name: 'File / canvas', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Summary/ }).click()
  await expect(page.locator('.canvas-card-content').getByText('Referenced evidence')).toBeVisible()
  await page.getByLabel('Heading / block', { exact: true }).fill('#Results')
  await expect(page.locator('.canvas-card-content').getByText('More evidence')).toHaveCount(0)
  await page.getByRole('button', { name: 'File / canvas', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Nested.canvas/ }).click()
  await expect(page.getByRole('img', { name: 'Nested canvas preview' })).toBeVisible()
  await page.getByRole('button', { name: 'File / canvas', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Map.canvas/ }).click()
  await expect(page.getByText(/Circular canvas reference/)).toBeVisible()
  await page.getByRole('button', { name: 'Save canvas', exact: true }).click()
  await expect.poll(() => writes.some(w => JSON.parse(w.content).nodes.length === 3)).toBe(true)
  expect(errors).toEqual([])
})

test('imports full JSON Canvas, edits connections, and preserves extensions on export', async ({ page }) => {
  const { writes } = await setup(page, [{ id: 'map', name: 'Map.canvas', type: 'canvas', content: makeCanvas() }])
  await openCanvas(page)
  const imported = { nodes: [text('a', 0), text('b', 450)], edges: [{ id: 'edge', fromNode: 'a', toNode: 'b', fromSide: 'right', toSide: 'left', color: '5', label: 'supports', fromEnd: 'arrow', custom: 42 }], vendor: { version: 7 } }
  await page.getByLabel('Import canvas file').setInputFiles({ name: 'test.canvas', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) })
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await page.locator('.react-flow__edge').click()
  await page.getByLabel('Connection label', { exact: true }).fill('contradicts')
  await page.getByLabel('to endpoint', { exact: true }).selectOption('none')
  await page.getByRole('button', { name: 'Save canvas', exact: true }).click()
  await expect.poll(() => writes.at(-1)?.content.includes('contradicts')).toBe(true)
  const saved = JSON.parse(writes.at(-1).content)
  expect(saved.vendor).toEqual({ version: 7 })
  expect(saved.edges[0]).toMatchObject({ custom: 42, fromEnd: 'arrow', toEnd: 'none', label: 'contradicts' })
  await page.getByText('Export', { exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download .canvas', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('Map.canvas')
})

for (const surface of ['.canvas-card-title', '.canvas-card-content']) {
  test(`cards follow the pointer throughout a drag from ${surface}`, async ({ page }) => {
    const { writes } = await setup(page, [{ id: 'map', name: 'Map.canvas', type: 'canvas', content: makeCanvas([text('a'), text('b', 500)]) }])
    await openCanvas(page)
    await page.getByText('Settings', { exact: true }).click()
    await page.getByRole('checkbox', { name: 'Snap to grid', exact: true }).uncheck()
    await page.getByText('Settings', { exact: true }).click()
    const card = page.locator('[data-id="a"].react-flow__node')
    // Test both the initial selection and a subsequent drag of the selected card.
    for (let attempt = 0; attempt < 2; attempt++) {
      const handle = await card.locator(surface).boundingBox()
      const pointer = { x: handle.x + 25, y: handle.y + 15 }
      await page.mouse.move(pointer.x, pointer.y)
      await page.mouse.down()
      // Cross the graph library's drag threshold before measuring movement.
      await page.mouse.move(pointer.x + 2, pointer.y + 2)
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      const draggingStart = await card.boundingBox()
      for (const distance of [25, 55, 90]) {
        await page.mouse.move(pointer.x + 2 + distance, pointer.y + 2 + distance / 2, { steps: 4 })
        await expect.poll(async () => Math.abs((await card.boundingBox()).x - draggingStart.x - distance)).toBeLessThan(3)
        await expect.poll(async () => Math.abs((await card.boundingBox()).y - draggingStart.y - distance / 2)).toBeLessThan(3)
      }
      await page.mouse.up()
    }
    await page.getByRole('button', { name: 'Save canvas', exact: true }).click()
    await expect.poll(() => writes.length).toBeGreaterThan(0)
    expect(JSON.parse(writes.at(-1).content).nodes.find(n => n.id === 'a').x).toBeGreaterThan(0)
  })
}

test('editing card text does not drag the card', async ({ page }) => {
  await setup(page, [{ id: 'map', name: 'Map.canvas', type: 'canvas', content: makeCanvas([text('a'), text('b', 500)]) }])
  await openCanvas(page)
  const card = page.locator('[data-id="a"].react-flow__node')
  await card.locator('.canvas-card-content').dblclick()
  const editor = page.getByRole('textbox', { name: 'Card text', exact: true })
  await editor.fill('Select and edit this text')
  const before = await card.boundingBox(), field = await editor.boundingBox()
  await page.mouse.move(field.x + 10, field.y + 10); await page.mouse.down()
  await page.mouse.move(field.x + 80, field.y + 20, { steps: 6 }); await page.mouse.up()
  const after = await card.boundingBox()
  expect(after.x).toBeCloseTo(before.x, 0)
  expect(after.y).toBeCloseTo(before.y, 0)
  await expect(editor).toHaveValue('Select and edit this text')
})

test('moves and resizes cards, groups selection, and undoes deletion', async ({ page }) => {
  const { writes, errors } = await setup(page, [{ id: 'map', name: 'Map.canvas', type: 'canvas', content: makeCanvas([text('a'), text('b', 400)]) }])
  await openCanvas(page)
  const title = page.locator('[data-id="a"] .canvas-card-title')
  const rect = await title.boundingBox()
  await page.mouse.move(rect.x + 30, rect.y + 10); await page.mouse.down(); await page.mouse.move(rect.x + 100, rect.y + 60, { steps: 5 }); await page.mouse.up()
  await page.getByRole('button', { name: 'Save canvas', exact: true }).click()
  await expect.poll(() => JSON.parse(writes.at(-1)?.content || '{}').nodes?.find(n => n.id === 'a')?.x).not.toBe(0)
  await page.getByLabel('Card width', { exact: true }).fill('420')
  await page.getByLabel('Card width', { exact: true }).press('Tab')
  await page.locator('.canvas-editor').focus()
  await page.keyboard.press('Control+a')
  await page.getByRole('button', { name: 'Group selection', exact: true }).click()
  await expect(page.locator('.canvas-card-group')).toHaveCount(1)
  await page.getByRole('button', { name: 'Remove selection', exact: true }).click()
  await expect(page.locator('.canvas-card-group')).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.canvas-card-group')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('invalid imports preserve the current canvas and read-only blocks edits', async ({ page }) => {
  await setup(page, [{ id: 'map', name: 'Map.canvas', type: 'canvas', content: makeCanvas([text('a')]) }])
  await openCanvas(page)
  await page.getByLabel('Import canvas file').setInputFiles({ name: 'bad.canvas', mimeType: 'application/json', buffer: Buffer.from('{"nodes":[{"id":"bad"}]}') })
  await expect(page.getByRole('alert')).toContainText('Unknown canvas node type')
  await expect(page.locator('.canvas-card')).toHaveCount(1)
  await page.getByText('Settings', { exact: true }).click()
  await page.getByRole('checkbox', { name: 'Read-only', exact: true }).check()
  await expect(page.getByRole('button', { name: '＋ Text', exact: true })).toBeDisabled()
  await page.locator('.canvas-editor').focus()
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete')
  await expect(page.locator('.canvas-card')).toHaveCount(1)
})

test('draws connections between card sides and exports PNG and a portable bundle', async ({ page }) => {
  const { writes, errors } = await setup(page, [{ id: 'map', name: 'Map.canvas', type: 'canvas', content: makeCanvas([text('a'), text('b', 440)]) }])
  await openCanvas(page)
  const from = await page.locator('[data-id="a"] .react-flow__handle-right').boundingBox()
  const to = await page.locator('[data-id="b"] .react-flow__handle-left').boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down(); await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 }); await page.mouse.up()
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await page.getByRole('button', { name: 'Save canvas', exact: true }).click()
  await expect.poll(() => JSON.parse(writes.at(-1)?.content || '{}').edges?.length).toBe(1)
  expect(JSON.parse(writes.at(-1).content).edges[0]).toMatchObject({ fromNode: 'a', toNode: 'b', fromSide: 'right', toSide: 'left' })
  await page.getByText('Export', { exact: true }).click()
  const png = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Full canvas PNG (1×)', exact: true }).click()
  expect((await png).suggestedFilename()).toBe('Map.png')
  const zip = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Canvas + files (.zip)', exact: true }).click()
  expect((await zip).suggestedFilename()).toBe('Map.zip')
  expect(errors).toEqual([])
})

test('edits a linked note in place and embeds a canvas inside a note', async ({ page }) => {
  const { notes, errors } = await setup(page, [{ id: 'map', name: 'Map.canvas', type: 'canvas', content: makeCanvas([{ id: 'ref', type: 'file', file: 'Research/Summary.md', researchos: { noteId: 'summary' }, x: 0, y: 0, width: 360, height: 300 }]) }])
  await openCanvas(page)
  await page.locator('.canvas-card-title').click()
  await page.getByRole('button', { name: 'Edit linked note', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit Summary', exact: true })
  await dialog.locator('.tiptap').fill('Edited evidence from canvas')
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.locator('.canvas-card-content')).toContainText('Edited evidence from canvas')
  expect(notes.find(n => n.id === 'summary').content).toContain('Edited evidence')
  await page.getByRole('button', { name: 'Open file', exact: true }).click()
  await page.getByLabel('Embed canvas', { exact: true }).selectOption('nested')
  await expect(page.locator('.canvas-note-embed').getByRole('img', { name: 'Nested canvas preview' })).toBeVisible()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => notes.find(n => n.id === 'summary').content.includes('data-canvas-file')).toBe(true)
  expect(errors).toEqual([])
})

test('creates a canvas inside a notes folder and imports local media', async ({ page }) => {
  const { notes, writes, errors } = await setup(page)
  await page.getByRole('button', { name: /Research.*star/ }).click({ button: 'right' })
  await page.getByRole('button', { name: /New canvas$/ }).click()
  const input = page.getByPlaceholder('File name')
  await input.fill('Folder map'); await input.press('Enter')
  await expect(page.getByRole('toolbar', { name: 'Canvas tools' })).toBeVisible()
  const created = notes.find(n => n.name === 'Folder map.canvas')
  expect(created.parentId).toBe('folder')
  await page.getByLabel('Import media files').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8WQAAAAASUVORK5CYII=', 'base64') })
  await expect(page.locator('.canvas-card-content img')).toBeVisible()
  await page.getByRole('button', { name: 'Save canvas', exact: true }).click()
  await expect.poll(() => writes.some(w => w.id === created.id && w.content.includes('data:image/png'))).toBe(true)
  expect(errors).toEqual([])
})

test('creates and persists a project canvas', async ({ page }) => {
  const notes = [], errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (path === '/api/projects/project') return route.fulfill({ json: { id: 'project', name: 'Canvas project', description: '', status: 'active' } })
    if (path === '/api/projects/project/notes') {
      if (request.method() === 'POST') { const note = { id: 'project-canvas', ...request.postDataJSON() }; notes.push(note); return route.fulfill({ status: 201, json: note }) }
      return route.fulfill({ json: notes })
    }
    if (path === '/api/notes/project-canvas') { Object.assign(notes[0], request.postDataJSON()); return route.fulfill({ json: notes[0] }) }
    return route.fulfill({ json: [] })
  })
  await page.goto('/projects/project/notes')
  await page.getByTitle('New canvas', { exact: true }).click()
  const input = page.getByPlaceholder('File name')
  await input.fill('Project map'); await input.press('Enter')
  await expect(page.getByRole('toolbar', { name: 'Canvas tools' })).toBeVisible()
  await page.getByRole('button', { name: '＋ Text', exact: true }).click()
  await page.getByRole('textbox', { name: 'Card text', exact: true }).fill('Project idea')
  await page.getByRole('button', { name: 'Save canvas', exact: true }).click()
  await expect.poll(() => notes[0]?.content.includes('Project idea')).toBe(true)
  expect(errors).toEqual([])
})
