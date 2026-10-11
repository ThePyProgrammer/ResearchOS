import { expect, test } from '@playwright/test'

async function mockAuthor(page) {
  let author = {
    id: 'a1', name: 'Jane Smith', paperCount: 2, orcid: '0000-0001-2345-6789',
    websiteUrl: 'https://janesmith.example/research', googleScholarUrl: 'https://scholar.google.com/citations?user=janesmith',
    githubUsername: 'janesmith', emails: ['jane@university.example'],
    affiliations: [
      { institution: 'Stanford University', role: 'Associate Professor', startDate: '2021', endDate: null },
      { institution: 'University of Washington', role: 'Postdoctoral Researcher', startDate: '2018', endDate: '2021' },
    ],
    labs: [{ id: 'l1', name: 'Language and Learning Lab', isPi: true, isMember: true }],
  }
  const lab = { id: 'l2', name: 'Human-Centered AI Lab' }
  const papers = [
    { id: 'p1', title: 'Understanding how language models learn from human feedback', authors: ['Jane Smith', 'Alex Chen', 'Maya Patel'], year: 2026, libraryId: 'lib1' },
    { id: 'p2', title: 'Evaluating collaborative reasoning in research assistants', authors: ['Alex Chen', 'Jane Smith'], year: 2025, libraryId: 'lib1' },
  ]
  const candidate = { paper: { id: 'p3', title: 'A shared foundation for reliable scientific discovery', authors: ['Alex Chen', 'J. Smith'], year: 2026 }, rawName: 'J. Smith', confidence: 'likely' }
  let linked = [...papers]
  let failLink = true
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    if (path === '/api/libraries') return route.fulfill({ json: [{ id: 'lib1', name: 'Research' }] })
    if (path === '/api/authors/a1') {
      if (method === 'PATCH') author = { ...author, ...request.postDataJSON() }
      return route.fulfill({ json: author })
    }
    if (path === '/api/authors/a1/papers') return route.fulfill({ json: linked })
    if (path === '/api/authors/a1/potential-papers') return route.fulfill({ json: linked.some(p => p.id === 'p3') ? [] : [candidate] })
    if (path === '/api/papers/p3/authors/link') {
      if (failLink) { failLink = false; return route.fulfill({ status: 502, json: { detail: 'Could not link paper. Try again.' } }) }
      expect(request.postDataJSON()).toEqual({ author_id: 'a1', position: 1, raw_name: 'J. Smith' })
      linked.push(candidate.paper)
      return route.fulfill({ json: {} })
    }
    if (path === '/api/papers/p3/authors/link/a1') {
      linked = linked.filter(p => p.id !== 'p3')
      return route.fulfill({ status: 204 })
    }
    if (path === '/api/labs') return route.fulfill({ json: { items: [lab], total: 1, offset: 0, limit: 20 } })
    if (path === '/api/labs/l2/members/a1') {
      author.labs = method === 'PUT' ? [...author.labs, { ...lab, isMember: true, isPi: false }] : author.labs.filter(l => l.id !== lab.id)
      return route.fulfill(method === 'PUT' ? { json: {} } : { status: 204 })
    }
    if (path === '/api/labs/l2/pis/a1') {
      author.labs = author.labs.map(l => l.id === lab.id ? { ...l, isPi: method === 'PUT' } : l)
      return route.fulfill({ json: {} })
    }
    return route.fulfill({ json: [] })
  })
}

test('author detail manages papers, affiliations, and labs with persisted state', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await mockAuthor(page)
  await page.goto('/authors/a1')
  await expect(page.getByRole('heading', { name: 'Jane Smith', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('author-desktop.png'), fullPage: true })
  const affiliations = page.getByRole('region', { name: 'Author affiliations' })
  await affiliations.getByRole('button', { name: 'Move University of Washington up' }).click()
  await expect(affiliations.getByRole('listitem').first()).toContainText('University of Washington')
  await page.getByRole('button', { name: 'Link paper', exact: true }).click()
  await expect(page.getByText('As “J. Smith”')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('author-paper-modal.png'), fullPage: true })
  await page.getByRole('button', { name: 'Link A shared foundation for reliable scientific discovery' }).click()
  await expect(page.getByRole('alert')).toHaveText('Could not link paper. Try again.')
  await page.getByRole('button', { name: 'Link A shared foundation for reliable scientific discovery' }).click()
  await expect(page.getByRole('status')).toContainText('Linked')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Papers (3)' })).toBeVisible()
  await page.getByRole('button', { name: 'Manage labs', exact: true }).click()
  await page.getByRole('button', { name: 'Join Human-Centered AI Lab' }).click()
  await page.getByRole('button', { name: 'Make PI in Human-Centered AI Lab' }).click()
  await expect(page.getByRole('link', { name: 'Human-Centered AI Lab PI' })).toBeVisible()
  await page.getByRole('button', { name: 'Remove PI role in Human-Centered AI Lab' }).click()
  await expect(page.getByRole('link', { name: 'Human-Centered AI Lab Member' })).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Papers (3)' })).toBeVisible()
  await expect(affiliations.getByRole('listitem').first()).toContainText('University of Washington')
  await expect(page.getByRole('link', { name: 'Human-Centered AI Lab Member' })).toBeVisible()
  await page.getByRole('button', { name: 'Unlink paper A shared foundation for reliable scientific discovery' }).click()
  await expect(page.getByRole('heading', { name: 'Papers (2)' })).toBeVisible()
})

test('author profile and paper modal remain usable at mobile width', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockAuthor(page)
  await page.goto('/authors/a1')
  await page.getByTitle('Collapse sidebar').click()
  await expect(page.getByRole('heading', { name: 'Jane Smith', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('author-mobile.png'), fullPage: true })
  await page.getByRole('button', { name: 'Link paper', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Search potential papers' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('author-modal-mobile.png'), fullPage: true })
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: 'Manage labs', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Join Human-Centered AI Lab' })).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
})
