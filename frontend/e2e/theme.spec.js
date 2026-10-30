import { expect, test } from '@playwright/test'

async function fixtures(page) {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const paper = { id: 'paper', title: 'Attention and memory', authors: ['Ada Researcher'], status: 'inbox', year: 2026, venue: 'NeurIPS', collections: [], createdAt: '2026-10-20T12:00:00Z' }
  const project = { id: 'project', name: 'Memory research', description: 'A study of attention and memory.', status: 'active' }
  const notes = [
    { id: 'note', name: 'Research notes', type: 'file', parentId: null, content: '<h1>Research notes</h1><p>Evidence and ideas.</p><pre><code>const result = 42</code></pre><table><tbody><tr><th>Result</th><th>Value</th></tr><tr><td>Accuracy</td><td>95%</td></tr></tbody></table>' },
    { id: 'canvas', name: 'Ideas.canvas', type: 'canvas', parentId: null, content: JSON.stringify({ nodes: [
      { id: 'text', type: 'text', x: 0, y: 0, width: 300, height: 200, text: '# A connected idea\n\nSupporting evidence.' },
      { id: 'file', type: 'file', x: 400, y: 0, width: 300, height: 200, file: 'Research notes', researchos: { noteId: 'note' } },
    ], edges: [{ id: 'edge', fromNode: 'text', toNode: 'file', fromSide: 'right', toSide: 'left', label: 'supports' }] }) },
  ]
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    let json = []
    if (path === '/api/libraries') json = [{ id: 'lib', name: 'Research' }]
    if (path === '/api/papers') json = [paper]
    if (path === '/api/papers/paper') json = paper
    if (path === '/api/libraries/lib/notes') json = notes
    if (path === '/api/settings/models') json = { current: {}, defaults: {}, descriptions: {}, available_chat_models: [], available_embedding_models: [] }
    if (path === '/api/projects') json = [project]
    if (path === '/api/projects/project') json = project
    if (path === '/api/projects/project/notes') json = notes
    if (path === '/api/projects/project/task-columns') json = [{ id: 'todo', projectId: 'project', name: 'To do', color: '#93c5fd', position: 0 }]
    if (path === '/api/projects/project/tasks') json = [{ id: 'task', projectId: 'project', columnId: 'todo', title: 'Review evidence', position: 0, priority: 'medium', tags: [], customFields: {} }]
    if (path === '/api/authors') json = [{ id: 'ada', name: 'Ada Researcher', paperCount: 1 }]
    if (path === '/api/labs') json = { items: [], total: 0, limit: 50, offset: 0 }
    return route.fulfill({ json })
  })
  return errors
}

test('theme choice persists, follows system changes, and works in the collapsed sidebar', async ({ page, context }) => {
  await fixtures(page)
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/library')
  const selector = page.getByLabel('Color theme')
  await expect(selector).toHaveValue('system')
  await expect(page.locator('html')).toHaveClass('dark')
  await selector.selectOption('light')
  await page.reload()
  await expect(page.locator('html')).not.toHaveClass('dark')
  await expect(selector).toHaveValue('light')
  await page.getByTitle('Collapse sidebar').click()
  await selector.selectOption('dark')
  await expect(page.locator('html')).toHaveClass('dark')
  // A second tab shares the saved preference and receives live updates.
  const other = await context.newPage()
  await fixtures(other)
  await other.goto('/authors')
  await expect(other.locator('html')).toHaveClass('dark')
  await selector.selectOption('light')
  await expect(other.locator('html')).not.toHaveClass('dark')
  await other.close()
  await selector.selectOption('system')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).not.toHaveClass('dark')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveClass('dark')
})

test('dark surfaces cover the application, dialogs, and charts', async ({ page }, testInfo) => {
  test.setTimeout(60000)
  const errors = await fixtures(page)
  await page.addInitScript(() => localStorage.setItem('researchos.theme', 'dark'))
  for (const route of ['/dashboard', '/library', '/authors', '/labs', '/agents', '/projects', '/projects/project', '/projects/project/literature', '/projects/project/experiments', '/projects/project/tasks', '/projects/project/notes', '/proposals', '/library/settings', '/library/map', '/library/paper/paper']) {
    await page.goto(route)
    await expect(page.getByLabel('Color theme').first(), route).toBeVisible()
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(25, 25, 25)')
    await expect(page.locator('main'), route).not.toBeEmpty()
    await expect(page.locator('.theme-sidebar')).toHaveCSS('background-color', 'rgb(24, 24, 24)')
    // Check actual computed values, including panels rendered through portals.
    for (const panel of await page.locator('.bg-white:visible').all()) {
      await expect(panel).toHaveCSS('background-color', 'rgb(30, 30, 30)')
    }
    if (route === '/dashboard') {
      await expect(page.getByRole('heading', { name: /Added Over Time/ })).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath('dashboard-dark.png') })
    }
    if (route === '/projects/project/tasks') {
      await expect(page.getByText('Review evidence')).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath('tasks-dark.png') })
    }
  }
  await page.goto('/authors')
  await page.getByRole('button', { name: 'Add author' }).click()
  await expect(page.getByRole('combobox', { name: 'Name *' })).toHaveCSS('background-color', 'rgb(30, 30, 30)')
  await page.screenshot({ path: testInfo.outputPath('dialog-dark.png') })
  expect(errors).toEqual([])
})

test('notes, graph, and canvas stay legible when switching themes without losing content', async ({ page }, testInfo) => {
  const errors = await fixtures(page)
  await page.addInitScript(() => localStorage.setItem('researchos.theme', 'dark'))
  await page.goto('/library/notes')
  await page.getByRole('button', { name: /Research notes/ }).first().click()
  await expect(page.locator('.tiptap-editor h1')).toHaveCSS('color', 'rgb(237, 237, 237)')
  await expect(page.locator('.tiptap-editor pre')).toHaveCSS('background-color', 'rgb(25, 25, 25)')
  await page.screenshot({ path: testInfo.outputPath('notes-dark.png') })
  await page.getByRole('button', { name: /Ideas.canvas/ }).first().click()
  await expect(page.locator('.canvas-card').first()).toHaveCSS('background-color', 'rgb(30, 30, 30)')
  await expect(page.locator('.react-flow__controls-button').first()).toHaveCSS('background-color', 'rgb(30, 30, 30)')
  await expect(page.locator('.react-flow__minimap')).toHaveCSS('background-color', 'rgb(30, 30, 30)')
  await page.screenshot({ path: testInfo.outputPath('canvas-dark.png') })
  await page.getByRole('button', { name: 'File / canvas', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCSS('background-color', 'rgb(30, 30, 30)')
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  await page.getByLabel('Color theme').selectOption('light')
  await expect(page.locator('.canvas-card').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(page.locator('.canvas-card-content').getByText('Supporting evidence.')).toBeVisible()
  await page.getByLabel('Color theme').selectOption('dark')
  await page.getByRole('button', { name: /Graph/ }).first().click()
  await expect(page.locator('main svg text').filter({ hasText: 'Research notes' }).first()).toHaveCSS('fill', 'rgb(212, 212, 212)')
  await page.screenshot({ path: testInfo.outputPath('graph-dark.png') })
  expect(errors).toEqual([])
})
