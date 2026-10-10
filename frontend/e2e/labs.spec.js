import { expect, test } from '@playwright/test'

test('Labs saves websites and multiple PIs independently of members and papers', async ({ page }) => {
  let lab = null
  let failSave = true
  const pis = [{ authorId: 'pi_1', name: 'Ada Smith', orcid: null }, { authorId: 'pi_2', name: 'Bea Smith', orcid: null }]
  const calls = []
  await page.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    calls.push(`${method} ${path}`)
    if (path === '/api/libraries') return route.fulfill({ json: [] })
    if (path === '/api/labs/pi-options') return route.fulfill({ json: pis })
    if ((path === '/api/labs' && method === 'POST') || (path === '/api/labs/details' && method === 'PATCH')) {
      if (failSave) { failSave = false; return route.fulfill({ status: 503, json: { detail: 'Save failed. Please retry.' } }) }
      const data = request.postDataJSON()
      lab = { id: 'details', createdAt: '2026-10-08', ...data, principalInvestigators: pis.filter(pi => data.piAuthorIds.includes(pi.authorId)) }
      return route.fulfill({ status: method === 'POST' ? 201 : 200, json: lab })
    }
    if (path === '/api/labs') return route.fulfill({ json: { items: lab ? [lab] : [], total: lab ? 1 : 0, limit: 30, offset: 0 } })
    if (path === '/api/labs/details') return route.fulfill({ json: lab })
    if (path.endsWith('/members') || path.endsWith('/papers')) return route.fulfill({ json: { items: [], total: 0, limit: 25, offset: 0 } })
    return route.fulfill({ json: [] })
  })
  await page.goto('/labs')
  await page.getByRole('button', { name: 'Create lab', exact: true }).click()
  await page.getByLabel('Lab name').fill('Systems Lab')
  await page.getByLabel('Website 1', { exact: true }).fill('https://lab.example/')
  await page.getByRole('button', { name: 'Add website' }).click()
  await page.getByLabel('Website 2', { exact: true }).fill('https://lab.example/projects')
  await page.getByLabel('Search PI authors').fill('Smith')
  for (const pi of pis) await page.getByRole('button', { name: `Select PI ${pi.name}` }).click()
  await page.screenshot({ path: 'test-results/labs-details-form.png', fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: 'Create lab', exact: true }).last().click()
  await expect(page.getByRole('alert')).toHaveText('Save failed. Please retry.')
  await expect(page.getByLabel('Website 2', { exact: true })).toHaveValue('https://lab.example/projects')
  await expect(page.getByRole('button', { name: 'Remove PI Ada Smith' })).toBeVisible()
  await page.getByRole('button', { name: 'Create lab', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: 'Systems Lab' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ada Smith' })).toHaveAttribute('href', '/authors/pi_1')
  await expect(page.getByRole('link', { name: 'Bea Smith' })).toHaveAttribute('href', '/authors/pi_2')
  await expect(page.getByRole('link', { name: 'https://lab.example/', exact: true })).toHaveAttribute('target', '_blank')
  await expect(page.getByRole('heading', { name: 'Members (0)' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Papers (0)' })).toBeVisible()
  await page.screenshot({ path: 'test-results/labs-details-desktop.png', fullPage: true, animations: 'disabled' })
  await page.getByTitle('Collapse sidebar').click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/labs-details-mobile.png', fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: 'Edit lab', exact: true }).click()
  await expect(page.getByLabel('Website 2', { exact: true })).toHaveValue('https://lab.example/projects')
  for (const pi of pis) await page.getByRole('button', { name: `Remove PI ${pi.name}` }).click()
  await page.getByRole('button', { name: 'Remove website 2' }).click()
  await page.getByRole('button', { name: 'Remove website 1' }).click()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('No PIs selected. Use Edit lab to choose authors.')).toBeVisible()
  await expect(page.getByText('No websites added. Use Edit lab to add links.')).toBeVisible()
  await expect.poll(() => calls.filter(call => call === 'GET /api/labs/details/members').length).toBe(2)
  expect(calls.filter(call => call === 'GET /api/labs/details/papers')).toHaveLength(1)
  expect(calls.filter(call => /^(PUT|POST|DELETE).*\/(members|papers)/.test(call))).toHaveLength(0)
})

test('Labs supports explicit paper selection with or without members', async ({ page }) => {
  let lab = null
  let members = []
  let paperIds = []
  let failAdd = true
  let failPaperAdd = true
  const calls = []
  const authors = [{ authorId: 'a_1', name: 'Jane Smith', orcid: '0000-0001-2345-6789' }, { authorId: 'a_2', name: 'John Smith', orcid: null }]
  const paper = { id: 'p_shared', title: 'Learning together: shared research', authors: authors.map(a => a.name), year: 2026, venue: 'ICLR', status: 'read', libraryName: 'Research' }
  const otherPaper = { ...paper, id: 'p_other', title: 'Another paper by Jane' }
  const authorless = { ...paper, id: 'p_anonymous', title: 'Anonymous lab research', authors: [] }
  const allPapers = [paper, otherPaper, authorless]
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
      if (method === 'DELETE') { lab = null; members = []; paperIds = []; return route.fulfill({ status: 204 }) }
      if (method === 'PATCH') lab = { ...lab, ...request.postDataJSON() }
      return route.fulfill({ json: lab })
    }
    if (path === '/api/labs/lab_1/members') return route.fulfill({ json: paged(members, 50) })
    if (path === '/api/labs/lab_1/papers') {
      if (method === 'POST') {
        if (failPaperAdd) { failPaperAdd = false; return route.fulfill({ status: 502, json: { detail: 'Unable to save selection. Try again.' } }) }
        const selected = request.postDataJSON().paperIds
        const addedCount = selected.filter(id => !paperIds.includes(id)).length
        paperIds = [...new Set([...paperIds, ...selected])]
        return route.fulfill({ json: { addedCount } })
      }
      return route.fulfill({ json: paged(allPapers.filter(p => paperIds.includes(p.id) && p.title.toLowerCase().includes((url.searchParams.get('search') || '').toLowerCase())), 25) })
    }
    if (path.startsWith('/api/labs/lab_1/papers/')) {
      paperIds = paperIds.filter(id => id !== path.split('/').at(-1))
      return route.fulfill({ status: 204 })
    }
    if (path === '/api/labs/lab_1/paper-options') {
      const authorId = url.searchParams.get('author_id')
      return route.fulfill({ json: paged(allPapers.filter(p => !paperIds.includes(p.id) && (!authorId || p.id !== 'p_anonymous')), 25) })
    }
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
  // Direct selection works with no members and no paper-author records.
  await page.getByRole('button', { name: 'Add papers', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: `Select ${authorless.title}` })).not.toBeChecked()
  await page.getByRole('checkbox', { name: `Select ${authorless.title}` }).check()
  await page.getByRole('button', { name: 'Add selected papers (1)' }).click()
  await expect(page.getByRole('alert')).toHaveText('Unable to save selection. Try again.')
  await expect(page.getByRole('checkbox', { name: `Select ${authorless.title}` })).toBeChecked()
  await page.getByRole('button', { name: 'Add selected papers (1)' }).click()
  await expect(page.getByRole('heading', { name: 'Members (0)' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Papers (1)' })).toBeVisible()
  await page.getByRole('button', { name: 'Add members', exact: true }).click()
  await page.getByLabel('Search authors').fill('Smith')
  await page.getByRole('button', { name: 'Add Jane Smith' }).click()
  await expect(page.getByRole('alert')).toHaveText('Unable to add member. Try again.')
  await page.getByRole('button', { name: 'Add Jane Smith' }).click()
  await expect(page.getByRole('status')).toHaveText('Jane Smith added as a member.')
  await expect(page.getByRole('heading', { name: 'Papers (1)' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: `Select ${paper.title}` })).not.toBeChecked()
  await expect(page.getByRole('checkbox', { name: `Select ${otherPaper.title}` })).not.toBeChecked()
  await page.getByRole('checkbox', { name: `Select ${paper.title}` }).check()
  await page.screenshot({ path: 'test-results/labs-paper-picker.png', fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: 'Add selected papers (1)' }).click()
  await expect(page.getByRole('heading', { name: 'Papers (2)' })).toBeVisible()
  await page.getByRole('button', { name: 'Add John Smith' }).click()
  await expect(page.getByRole('status')).toHaveText('John Smith added as a member.')
  await page.getByRole('button', { name: 'Done without adding papers' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('heading', { name: 'Members (2)' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Papers (2)' })).toBeVisible()
  await expect(page.getByRole('link', { name: otherPaper.title })).toHaveCount(0)
  await expect(page.getByRole('link', { name: paper.title })).toHaveAttribute('href', '/library/paper/p_shared')
  await page.screenshot({ path: 'test-results/labs-desktop.png', fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByTitle('Collapse sidebar').click()
  await page.screenshot({ path: 'test-results/labs-mobile.png', fullPage: true, animations: 'disabled' })
  expect((await page.getByRole('heading', { name: 'Language and Learning Lab' }).boundingBox()).width).toBeGreaterThan(180)
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
  await expect(page.getByRole('heading', { name: 'Papers (2)' })).toBeVisible()
  await page.getByRole('button', { name: 'Remove John Smith', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Members (0)' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Papers (2)' })).toBeVisible()
  await page.getByRole('button', { name: `Remove paper ${paper.title}` }).click()
  await expect(page.getByRole('heading', { name: 'Papers (1)' })).toBeVisible()
  await expect(page.getByRole('link', { name: authorless.title })).toBeVisible()
  await page.getByRole('button', { name: 'Delete lab', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(page.getByText('No labs yet. Create your first lab to get started.')).toBeVisible()
  expect(calls.filter(call => call.startsWith('GET /api/authors'))).toEqual([])
})


test('Labs directory opens a dedicated workspace without loading every card detail', async ({ page }) => {
  test.setTimeout(60000)
  const labs = [
    ['Language and Learning Lab', 'Understanding how humans and machines learn, reason, and communicate through language.', 'https://language.example.org/'],
    ['Visual Intelligence Group', 'Exploring perception, spatial reasoning, and the next generation of visual representations.', 'https://vision.example.org/'],
    ['Human-Centered AI Lab', 'Building intelligent systems that support human creativity, collaboration, and agency.', 'https://hai.example.org/'],
    ['Robotics & Embodied Learning', 'Connecting learning algorithms to action in the physical world.', ''],
    ['Computational Discovery Lab', 'New methods at the intersection of machine learning and scientific discovery.', ''],
    ['Open Systems Research', 'Reproducible tools and shared infrastructure for open-ended research.', ''],
  ].map(([name, description, website], index) => ({ id: `design_${index}`, name, description, websites: website ? [website] : [], createdAt: '2026-10-09' }))
  const pis = [{ authorId: 'pi_1', name: 'Maya Chen' }, { authorId: 'pi_2', name: 'Daniel Park' }]
  const members = [{ authorId: 'a1', name: 'Sofia Martinez' }, { authorId: 'a2', name: 'Arjun Patel' }, { authorId: 'a3', name: 'Emma Wilson' }]
  const papers = [
    { id: 'p1', title: 'Learning to reason through language: a framework for compositional generalization', authors: ['Maya Chen', 'Sofia Martinez', 'Daniel Park'], year: 2026 },
    { id: 'p2', title: 'What language models learn from human feedback', authors: ['Arjun Patel', 'Emma Wilson'], year: 2025 },
    { id: 'p3', title: 'Grounding abstract concepts in interactive environments', authors: ['Daniel Park', 'Maya Chen'], year: 2025 },
  ]
  const calls = []
  const paged = (items, limit = 25) => ({ items, total: items.length, offset: 0, limit })
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    calls.push(path)
    if (path === '/api/labs') return route.fulfill({ json: paged(labs, 30) })
    if (path === '/api/labs/design_0') return route.fulfill({ json: { ...labs[0], principalInvestigators: pis } })
    if (path === '/api/labs/design_0/members') return route.fulfill({ json: paged(members, 50) })
    if (path === '/api/labs/design_0/papers') return route.fulfill({ json: paged(papers) })
    return route.fulfill({ json: [] })
  })
  await page.goto('/labs')
  await expect(page.getByRole('list', { name: 'Labs directory' }).getByRole('link')).toHaveCount(6)
  expect(calls.filter(path => path.startsWith('/api/labs'))).toEqual(['/api/labs'])
  const cards = page.getByRole('list', { name: 'Labs directory' }).getByRole('link')
  const boxes = await Promise.all([0, 1, 2, 3].map(index => cards.nth(index).boundingBox()))
  expect(boxes[0].y).toBe(boxes[1].y)
  expect(boxes[1].y).toBe(boxes[2].y)
  expect(boxes[3].y).toBeGreaterThan(boxes[0].y)
  expect(boxes[0].height).toBeLessThan(180)
  await page.screenshot({ path: 'test-results/labs-directory-desktop.png', fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByTitle('Collapse sidebar').click()
  await page.screenshot({ path: 'test-results/labs-directory-mobile.png', fullPage: true, animations: 'disabled' })
  await page.getByRole('link', { name: 'Open Language and Learning Lab' }).click()
  await expect(page).toHaveURL(/\/labs\/design_0$/)
  await expect(page.getByRole('heading', { level: 1, name: labs[0].name })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(844)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: 'test-results/labs-workspace-mobile.png', fullPage: true, animations: 'disabled' })
  await page.getByRole('link', { name: papers[0].title }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/labs-workspace-mobile-papers.png', fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByTitle('Expand sidebar').click()
  await page.getByRole('heading', { level: 1, name: labs[0].name }).scrollIntoViewIfNeeded()
  await expect(page.getByRole('complementary', { name: 'Lab people' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Status' })).toHaveCount(0)
  await expect(page.getByRole('row').filter({ hasText: papers[0].title }).locator('td').first()).toContainText('Maya Chen, Sofia Martinez, Daniel Park')
  await page.screenshot({ path: 'test-results/labs-workspace-desktop.png', fullPage: true, animations: 'disabled' })
  expect(calls.filter(path => path === '/api/labs')).toHaveLength(1)
  await page.reload()
  await expect(page.getByRole('link', { name: papers[0].title })).toBeVisible()
  expect(calls.filter(path => path === '/api/labs')).toHaveLength(1)
  await page.getByRole('link', { name: 'All labs' }).click()
  await expect(page).toHaveURL(/\/labs$/)
  await expect(page.getByRole('list', { name: 'Labs directory' }).getByRole('link')).toHaveCount(6)
})
