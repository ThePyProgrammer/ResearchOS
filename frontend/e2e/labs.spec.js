import { expect, test } from '@playwright/test'

test('Labs supports creation, membership, shared papers, errors, and deletion', async ({ page }) => {
  let lab = null
  let members = []
  let failAdd = true
  const calls = []
  const authors = [{ authorId: 'a_1', name: 'Jane Smith', orcid: '0000-0001-2345-6789' }, { authorId: 'a_2', name: 'John Smith', orcid: null }]
  const paper = { id: 'p_shared', title: 'Learning together: shared research', authors: authors.map(a => a.name), year: 2026, venue: 'ICLR', status: 'read', libraryName: 'Research' }
  const paged = (items, limit) => ({ items, total: items.length, offset: 0, limit })
  await page.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    calls.push(`${method} ${path}`)
    if (path === '/api/libraries') return route.fulfill({ json: [{ id: 'lib_1', name: 'Research' }] })
    if (path === '/api/labs') {
      if (method === 'POST') {
        lab = { id: 'lab_1', ...request.postDataJSON(), createdAt: '2026-10-07' }
        return route.fulfill({ status: 201, json: lab })
      }
      return route.fulfill({ json: paged(lab ? [lab] : [], 30) })
    }
    if (path === '/api/labs/lab_1') {
      if (method === 'DELETE') { lab = null; members = []; return route.fulfill({ status: 204 }) }
      if (method === 'PATCH') lab = { ...lab, ...request.postDataJSON() }
      return route.fulfill({ json: lab })
    }
    if (path === '/api/labs/lab_1/members') return route.fulfill({ json: paged(members, 50) })
    if (path === '/api/labs/lab_1/papers') return route.fulfill({ json: paged(members.length && paper.title.toLowerCase().includes((url.searchParams.get('search') || '').toLowerCase()) ? [paper] : [], 25) })
    if (path === '/api/labs/lab_1/member-options') return route.fulfill({ json: authors.filter(a => !members.some(m => m.authorId === a.authorId)) })
    if (path.startsWith('/api/labs/lab_1/members/')) {
      const authorId = path.split('/').at(-1)
      if (method === 'DELETE') { members = members.filter(m => m.authorId !== authorId); return route.fulfill({ status: 204 }) }
      if (failAdd) { failAdd = false; return route.fulfill({ status: 502, json: { detail: 'Unable to add member. Try again.' } }) }
      const member = authors.find(a => a.authorId === authorId)
      members = [...members.filter(m => m.authorId !== authorId), member]
      return route.fulfill({ json: member })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/labs')
  const authorsLink = page.getByRole('link', { name: 'groups Authors' })
  const labsLink = page.getByRole('link', { name: 'science Labs' })
  await expect(labsLink).toBeVisible()
  expect((await labsLink.boundingBox()).y).toBeGreaterThan((await authorsLink.boundingBox()).y)
  await page.getByRole('button', { name: 'Create lab', exact: true }).click()
  await page.getByLabel('Lab name').fill('Language and Learning Lab')
  await page.getByLabel('Description (optional)').fill('Tracking language research across our libraries.')
  await page.getByRole('button', { name: 'Create lab', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: 'Language and Learning Lab' })).toBeVisible()
  await page.getByRole('button', { name: 'Add members', exact: true }).click()
  await page.getByLabel('Search authors').fill('Smith')
  await page.getByRole('button', { name: 'Add Jane Smith' }).click()
  await expect(page.getByRole('alert')).toHaveText('Unable to add member. Try again.')
  await page.getByRole('button', { name: 'Add Jane Smith' }).click()
  await expect(page.getByRole('status')).toHaveText('Jane Smith added.')
  await page.getByRole('button', { name: 'Add John Smith' }).click()
  await expect(page.getByRole('status')).toHaveText('John Smith added.')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('heading', { name: 'Members (2)' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Papers (1)' })).toBeVisible()
  await expect(page.getByRole('link', { name: paper.title })).toHaveAttribute('href', '/library/paper/p_shared')
  await page.screenshot({ path: 'test-results/labs-desktop.png', fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByTitle('Collapse sidebar').click()
  await page.screenshot({ path: 'test-results/labs-mobile.png', fullPage: true, animations: 'disabled' })
  expect((await page.getByRole('heading', { name: 'Language and Learning Lab' }).boundingBox()).width).toBeGreaterThan(240)
  await page.getByRole('link', { name: paper.title }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/labs-mobile-papers.png', fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByTitle('Expand sidebar').click()
  const beforeSearch = calls.length
  await page.getByRole('textbox', { name: 'Search lab papers' }).fill('no match')
  await expect(page.getByText('No papers match this search.')).toBeVisible()
  expect(calls.slice(beforeSearch)).toEqual(['GET /api/labs/lab_1/papers'])
  await page.getByRole('textbox', { name: 'Search lab papers' }).fill('')
  await page.getByRole('button', { name: 'Remove Jane Smith', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Members (1)' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Papers (1)' })).toBeVisible()
  await page.getByRole('button', { name: 'Remove John Smith', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Papers (0)' })).toBeVisible()
  await page.getByRole('button', { name: 'Delete lab', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(page.getByText('No labs yet. Create your first lab to get started.')).toBeVisible()
  expect(calls.filter(call => call.startsWith('GET /api/authors'))).toEqual([])
})
