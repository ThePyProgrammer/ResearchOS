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


test.beforeEach(async ({ page }) => {
  await mockApi(page)
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
