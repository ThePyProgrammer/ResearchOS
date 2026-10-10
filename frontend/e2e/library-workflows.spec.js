import { expect, test } from '@playwright/test'


async function mockApi(page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const method = route.request().method()

    if (path === '/api/libraries' && method === 'GET') {
      return route.fulfill({ json: [{ id: 'lib_1', name: 'My Library', autoNoteEnabled: true }] })
    }
    if (path === '/api/collections' && method === 'GET') {
      return route.fulfill({ json: [{ id: 'c_1', name: 'Inbox', paperCount: 2 }] })
    }
    if (path === '/api/proposals' && method === 'GET') {
      return route.fulfill({ json: [] })
    }
    if (path === '/api/papers' && method === 'GET') {
      return route.fulfill({
        json: [
          {
            id: 'p_1',
            title: 'Paper Alpha',
            authors: ['Jane Smith'],
            status: 'inbox',
            year: 2024,
            venue: 'NeurIPS',
            source: 'human',
            collections: ['c_1'],
            createdAt: '2026-03-09T00:00:00Z',
          },
        ],
      })
    }
    if (path === '/api/websites' && method === 'GET') {
      return route.fulfill({
        json: [
          {
            id: 'w_1',
            title: 'Website Beta',
            authors: ['Alice'],
            status: 'inbox',
            url: 'https://example.com',
            itemType: 'website',
            collections: ['c_1'],
          },
        ],
      })
    }
    if (path === '/api/papers/p_1' && method === 'GET') {
      return route.fulfill({
        json: {
          id: 'p_1',
          title: 'Paper Alpha',
          authors: ['Jane Smith'],
          status: 'inbox',
          year: 2024,
          venue: 'NeurIPS',
          source: 'human',
          collections: ['c_1'],
          abstract: 'Test abstract',
        },
      })
    }
    if (path === '/api/papers/p_1/notes' && method === 'GET') {
      return route.fulfill({ json: [] })
    }
    if (path.match(/\/api\/papers\/[^/]+\/author-links/) && method === 'GET') {
      return route.fulfill({ json: [] })
    }
    if (path === '/api/websites/w_1' && method === 'GET') {
      return route.fulfill({
        json: {
          id: 'w_1',
          title: 'Website Beta',
          authors: ['Alice'],
          status: 'inbox',
          url: 'https://example.com',
          description: 'Site description',
          collections: ['c_1'],
        },
      })
    }
    if (path === '/api/websites/w_1/notes' && method === 'GET') {
      return route.fulfill({ json: [] })
    }
    if (path === '/api/papers/import' && method === 'POST') {
      return route.fulfill({
        json: {
          id: 'p_2',
          title: 'Imported Paper',
          authors: ['Importer'],
          year: 2025,
          venue: 'arXiv',
          already_exists: false,
          status: 'inbox',
          source: 'human',
          collections: [],
        },
      })
    }
    if (path === '/api/github-repos' && method === 'GET') {
      return route.fulfill({ json: [] })
    }
    if (path === '/api/search' && method === 'GET') {
      return route.fulfill({ json: [] })
    }

    return route.fulfill({ json: [] })
  })
}


test.beforeEach(async ({ context }) => {
  // Install mocks before popup pages issue their first API requests.
  await mockApi(context)
})

test('notes load in a batch and can be searched without opening paper folders', async ({ page }) => {
  let batchCount = 0
  const individualNoteReads = []
  page.on('request', request => {
    if (/\/api\/(papers|websites|github-repos)\/[^/]+\/notes$/.test(new URL(request.url()).pathname)) {
      individualNoteReads.push(request.url())
    }
  })
  await page.route('**/api/notes/batch', async route => {
    batchCount++
    const { items } = route.request().postDataJSON()
    return route.fulfill({ json: items.map(item => ({ ...item, notes: item.id === 'p_1' ? [{
      id: 'note_batch', paperId: 'p_1', name: 'Batched summary', type: 'file',
      content: '<p>Distinctive batched content</p>', createdAt: '2026-01-01', updatedAt: '2026-01-01',
    }] : [] })) })
  })
  await page.goto('/library/notes')
  await page.getByPlaceholder('Search notes…').fill('Distinctive batched')
  await expect(page.getByText('Batched summary')).toBeVisible()
  expect(batchCount).toBe(1)
  expect(individualNoteReads).toEqual([])
})

test('library detail action opens paper page', async ({ page, context }) => {
  await page.goto('/library')
  await expect(page.getByText('Paper Alpha')).toBeVisible()

  const paperRow = page.locator('tbody tr').filter({ has: page.getByText('Paper Alpha') }).first()
  await paperRow.click()
  await expect(page.getByRole('button', { name: /Open Paper/i })).toBeVisible()

  const [newPage] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: /Open Paper/i }).click(),
  ])
  await newPage.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/papers/p_1') {
      return route.fulfill({ json: { id: 'p_1', title: 'Paper Alpha', authors: ['Jane Smith'], status: 'inbox', year: 2024, venue: 'NeurIPS', source: 'human', collections: ['c_1'], abstract: 'Test abstract' } })
    }
    if (url.pathname === '/api/papers/p_1/notes') return route.fulfill({ json: [] })
    if (url.pathname === '/api/libraries') return route.fulfill({ json: [{ id: 'lib_1', name: 'My Library', autoNoteEnabled: true }] })
    if (url.pathname === '/api/collections') return route.fulfill({ json: [{ id: 'c_1', name: 'Inbox', paperCount: 2 }] })
    return route.fulfill({ json: [] })
  })
  await newPage.waitForLoadState()

  await expect(newPage).toHaveURL(/\/library\/paper\/p_1$/)
  await expect(newPage.getByRole('heading', { name: 'Paper Alpha' })).toBeVisible()
  await newPage.close()
})

test('library detail action opens website page', async ({ page, context }) => {
  await page.goto('/library')
  await expect(page.getByText('Website Beta')).toBeVisible()

  const websiteRow = page.locator('tbody tr').filter({ has: page.getByText('Website Beta') }).first()
  await websiteRow.click()

  const [newPage] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: /Open Website/i }).click(),
  ])
  await newPage.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/websites/w_1') {
      return route.fulfill({ json: { id: 'w_1', title: 'Website Beta', authors: ['Alice'], status: 'inbox', url: 'https://example.com', description: 'Site description', collections: ['c_1'] } })
    }
    if (url.pathname === '/api/websites/w_1/notes') return route.fulfill({ json: [] })
    if (url.pathname === '/api/libraries') return route.fulfill({ json: [{ id: 'lib_1', name: 'My Library', autoNoteEnabled: true }] })
    if (url.pathname === '/api/collections') return route.fulfill({ json: [{ id: 'c_1', name: 'Inbox', paperCount: 2 }] })
    return route.fulfill({ json: [] })
  })
  await newPage.waitForLoadState()

  await expect(newPage).toHaveURL(/\/library\/website\/w_1$/)
  await expect(newPage.getByText('Website Beta')).toBeVisible()
  await newPage.close()
})

test('quick add imports a paper from header modal', async ({ page }) => {
  await page.goto('/library')
  await page.getByRole('button', { name: /Quick Add/i }).click()
  await page.getByPlaceholder(/Paste DOI, arXiv ID, or URL/i).fill('10.1000/test-doi')
  await page.getByPlaceholder(/Paste DOI, arXiv ID, or URL/i).press('Enter')

  await expect(page.getByText(/Paper added to library/i)).toBeVisible()
  await expect(page.getByText('Imported Paper')).toBeVisible()
})

test('bulk status reports partial success and retries only the failed selection', async ({ page }) => {
  const requests = []
  await page.route('**/api/batch/items', async route => {
    const body = route.request().postDataJSON()
    requests.push(body)
    if (requests.length === 1) {
      return route.fulfill({ json: { succeededIds: ['p_1'], failed: [{ id: 'w_1', detail: 'Temporary failure' }] } })
    }
    return route.fulfill({ json: { succeededIds: ['w_1'], failed: [] } })
  })
  await page.goto('/library')
  await expect(page.getByText('Paper Alpha')).toBeVisible()
  await page.locator('thead input[type="checkbox"]').check()
  await page.locator('tr[data-item-id="w_1"]').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Organize' }).hover()
  await page.getByRole('menuitem', { name: 'Mark as Read' }).click()
  await expect(page.getByRole('alert')).toContainText('1 succeeded; 1 could not be completed')
  await expect(page.locator('tbody input:checked')).toHaveCount(1)
  await page.locator('tr[data-item-id="w_1"]').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Organize' }).hover()
  await page.getByRole('menuitem', { name: 'Mark as Read' }).click()
  await expect(page.locator('tbody input:checked')).toHaveCount(0)
  expect(requests).toHaveLength(2)
  expect(requests[0].items).toHaveLength(2)
  expect(requests[1].items).toEqual([{ id: 'w_1', itemType: 'website' }])
})


test('library filters collapse, preserve selections, and fit narrow widths', async ({ page }) => {
  await page.goto('/library')
  await expect(page.getByText('Paper Alpha')).toBeVisible()
  const toggle = page.getByRole('button', { name: /^Filters/ })
  const panel = page.locator('#library-filters')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(panel).toBeHidden()
  await toggle.click()
  await page.getByPlaceholder('Filter by title...').fill('Alpha')
  await expect(page.getByText('Website Beta')).toBeHidden()
  await toggle.click()
  await expect(toggle).toContainText('1 active')
  await expect(page.getByText('Website Beta')).toBeHidden()
  await toggle.click()
  await expect(page.getByPlaceholder('Filter by title...')).toHaveValue('Alpha')
  for (const width of [1280, 640]) {
    await page.setViewportSize({ width, height: 800 })
    await expect(panel).toBeVisible()
    expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  }
  await toggle.click()
  await page.getByRole('button', { name: 'Clear all filters' }).click()
  await expect(page.getByText('Website Beta')).toBeVisible()
  await expect(panel).toBeHidden()
})

test('row context menu fits the viewport and supports clipboard and keyboard actions', async ({ page }) => {
  await mockApi(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copiedCitation = text } } })
  })
  await page.goto('/library')
  const row = page.locator('tr[data-item-id="p_1"]')
  await row.click({ button: 'right' })
  const menu = page.getByRole('menu', { name: 'Paper Alpha' })
  await expect(menu).toBeVisible()
  const bounds = await menu.boundingBox()
  const viewport = page.viewportSize()
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.y).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height)
  await expect(menu.getByRole('menuitem')).toHaveCount(5)
  await page.getByRole('menuitem', { name: 'Copy & export' }).hover()
  const submenu = page.getByRole('menu', { name: 'Copy & export' })
  await expect(submenu).toBeVisible()
  const submenuBounds = await submenu.boundingBox()
  expect(submenuBounds.x).toBeGreaterThanOrEqual(bounds.x + bounds.width - 1)
  expect(submenuBounds.x + submenuBounds.width).toBeLessThanOrEqual(viewport.width)
  await page.getByRole('menuitem', { name: 'Copy BibTeX citation' }).click()
  await expect(page.getByRole('status')).toContainText('BibTeX copied')
  expect(await page.evaluate(() => window.copiedCitation)).toContain('Paper Alpha')
  await page.getByRole('button', { name: 'Actions for Paper Alpha' }).click()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('menuitem', { name: 'Copy BibTeX citation' })).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('menuitem', { name: 'Copy & export' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(page.getByRole('menuitem', { name: /^Delete item/ })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(page.getByRole('button', { name: 'Actions for Paper Alpha' })).toBeFocused()
  await page.getByRole('button', { name: 'Actions for Paper Alpha' }).click()
  await page.getByRole('menuitem', { name: 'Copy & export' }).hover()
  const rightMenuBounds = await menu.boundingBox()
  const leftSubmenuBounds = await submenu.boundingBox()
  expect(leftSubmenuBounds.x).toBeGreaterThanOrEqual(0)
  expect(leftSubmenuBounds.x + leftSubmenuBounds.width).toBeLessThanOrEqual(rightMenuBounds.x + 1)
  await page.getByRole('menuitem', { name: 'Copy title', exact: true }).click()
  await expect(menu).toBeHidden()
})


test('authors search batches typing, opens profiles, and surfaces errors', async ({ page }) => {
  await mockApi(page)
  const author = { id: 'a1', name: 'Jane Smith', paperCount: 1, affiliations: [], libraries: [], labs: [
    { id: 'l1', name: 'Language Lab', isMember: true, isPi: true },
    { id: 'l2', name: 'Vision Lab', isMember: false, isPi: true },
  ] }
  await page.route('**/api/labs**', route => {
    const path = new URL(route.request().url()).pathname
    const lab = { id: 'l1', name: 'Language Lab', createdAt: '2026-10-08', websites: [], principalInvestigators: [] }
    if (path === '/api/labs/l1') return route.fulfill({ json: lab })
    return route.fulfill({ json: { items: path === '/api/labs' ? [lab] : [], total: path === '/api/labs' ? 1 : 0, offset: 0, limit: 30 } })
  })
  const searches = []
  await page.route('**/api/authors**', route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/authors/a1') return route.fulfill({ json: author })
    if (url.pathname === '/api/authors/a1/papers') return route.fulfill({ json: [] })
    const search = url.searchParams.get('search')
    searches.push(search)
    if (search === 'failure') return route.fulfill({ status: 502, json: { detail: 'Author lookup unavailable' } })
    return route.fulfill({ json: [author] })
  })
  await page.goto('/authors')
  await expect(page.getByText('Jane Smith', { exact: true })).toBeVisible()
  await page.getByPlaceholder('Search authors...').pressSequentially('Jane', { delay: 30 })
  await expect.poll(() => searches.filter(Boolean)).toEqual(['Jane'])
  await expect(page.getByRole('columnheader', { name: 'Labs' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Vision Lab PI' })).toBeVisible()
  await page.screenshot({ path: 'test-results/authors-labs-table.png', fullPage: true, animations: 'disabled' })
  await page.getByRole('link', { name: /Language Lab PI.*Member/ }).click()
  await expect(page).toHaveURL(/\/labs\/l1$/)
  await expect(page.getByRole('heading', { name: 'Language Lab', exact: true })).toBeVisible()
  await page.goBack()
  await expect(page.getByText('Jane Smith', { exact: true })).toBeVisible()
  await page.getByText('Jane Smith', { exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Jane Smith' })).toBeVisible()
  const labSection = page.getByRole('region', { name: 'Author labs' })
  await expect(labSection.getByRole('link', { name: /Language Lab PI.*Member/ })).toHaveAttribute('href', '/labs/l1')
  await expect(labSection.getByRole('link', { name: 'Vision Lab PI' })).toHaveAttribute('href', '/labs/l2')
  await page.screenshot({ path: 'test-results/author-labs-profile.png', fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: 'All Authors' }).click()
  await page.getByPlaceholder('Search authors...').fill('failure')
  await expect(page.getByText('Author lookup unavailable')).toBeVisible()
})
