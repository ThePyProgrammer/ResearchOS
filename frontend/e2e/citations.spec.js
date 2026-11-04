import { expect, test } from '@playwright/test'

test('paper citations show direction, indexing state, and target navigation', async ({ page }) => {
  const paper = id => ({ id, title: id === 'p_a' ? 'Source Paper' : 'Target Paper',
    authors: ['Researcher'], year: 2025, venue: 'Journal', status: 'read', source: 'human',
    libraryId: 'lib_citations', tags: [], collections: [], links: [], createdAt: '2026-11-03T00:00:00Z' })
  let queued = false
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path === '/api/libraries') return route.fulfill({ json: [{ id: 'lib_citations', name: 'Citation Library' }] })
    if (path === '/api/papers/p_a/citations/reindex') { queued = true; return route.fulfill({ status: 202, json: [] }) }
    if (/\/papers\/p_[ab]\/citations$/.test(path)) {
      const outgoing = url.searchParams.get('direction') === 'outgoing'
      const source = path.includes('/p_a/')
      const items = source && outgoing ? [{ ...paper('p_b'), evidence: [{ provider: 'openalex',
        method: 'exact_identifier', indexedAt: '2026-11-03T00:00:00Z',
        reference: { source_work: 'W1', target_work: 'W2' } }] }] : []
      return route.fulfill({ json: { items, total: items.length, limit: 10, offset: 0,
        direction: outgoing ? 'outgoing' : 'incoming', unresolvedCount: 1, indexedPapers: 2, libraryPapers: 2,
        pendingJobs: queued ? 2 : 0, jobs: queued ? [{ status: 'pending' }] : [],
        runs: [{ active: true, provider: 'openalex', indexedAt: '2026-11-03T00:00:00Z' }],
      } })
    }
    if (/\/papers\/p_[ab]$/.test(path)) return route.fulfill({ json: paper(path.split('/').at(-1)) })
    return route.fulfill({ json: [] })
  })
  await page.goto('/library/paper/p_a')
  const citations = page.getByRole('region', { name: 'Paper citations' })
  await expect(citations.getByRole('heading', { name: 'References in this library (1)' })).toBeVisible()
  await citations.getByRole('button', { name: 'Cited by', exact: true }).click()
  await expect(citations.getByText('No papers in this library are linked as citing this paper yet.')).toBeVisible()
  await citations.getByRole('button', { name: 'References', exact: true }).click()
  await citations.getByRole('button', { name: 'Index', exact: true }).click()
  await expect(citations.getByText('Indexing queued or in progress.')).toBeVisible()
  await expect(citations.getByRole('button', { name: 'Indexing…' })).toBeDisabled()
  await citations.getByRole('link', { name: 'Target Paper' }).click()
  await expect(page).toHaveURL(/\/library\/paper\/p_b$/)
  await expect(citations.getByRole('heading', { name: 'References in this library (0)' })).toBeVisible()
})
