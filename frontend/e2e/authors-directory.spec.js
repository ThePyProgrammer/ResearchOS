import { expect, test } from '@playwright/test'

test('author directory reaches Yann beyond the first fifty and retries failed pages', async ({ page }) => {
  test.setTimeout(120000)
  const authors = Array.from({ length: 57 }, (_, index) => ({
    id: `a${index}`, name: `Author ${String(index).padStart(2, '0')}`, paperCount: 0,
  }))
  authors.push({ id: 'yann', name: 'Yann LeCun', paperCount: 0 })
  let failNextPage = true
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/libraries') return route.fulfill({ json: [{ id: 'lib1', name: 'Research' }] })
    if (url.pathname === '/api/authors') {
      const offset = Number(url.searchParams.get('offset') || 0)
      const limit = Number(url.searchParams.get('limit') || 50)
      expect(limit).toBe(51)
      if (offset === 50 && failNextPage) {
        failNextPage = false
        return route.fulfill({ status: 503, json: { detail: 'Could not load this page' } })
      }
      const search = (url.searchParams.get('search') || '').toLowerCase()
      const matches = authors.filter(author => author.name.toLowerCase().includes(search))
      return route.fulfill({ json: matches.slice(offset, offset + limit) })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/authors')
  await expect(page.getByText('Showing 1–50 authors')).toBeVisible({ timeout: 30000 })
  await expect(page.getByRole('link', { name: 'Open Yann LeCun' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page.getByRole('alert')).toContainText('Could not load this page')
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByRole('link', { name: 'Open Yann LeCun' })).toBeVisible()
  await expect(page.getByText('Showing 51–58 authors')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled()
  await page.getByRole('textbox', { name: 'Search authors' }).fill('Yann')
  await expect(page.getByText('Showing 1–1 authors matching your search')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Yann LeCun' })).toHaveAttribute('href', '/authors/yann')
  await expect(page.getByRole('navigation', { name: 'Author pages' })).toHaveCount(0)
})


test('add author suggests frequent names and still accepts custom names after a suggestion failure', async ({ page }, testInfo) => {
  let failSuggestions = false
  const created = []
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/libraries') return route.fulfill({ json: [{ id: 'lib1', name: 'Research' }] })
    if (path === '/api/authors/suggestions') return failSuggestions
      ? route.fulfill({ status: 503, json: { detail: 'Suggestions unavailable' } })
      : route.fulfill({ json: [{ name: 'Jane Smith', paperCount: 8 }, { name: 'Alex Doe', paperCount: 2 }] })
    if (path === '/api/authors' && request.method() === 'POST') {
      const author = { id: 'a' + created.length, ...request.postDataJSON() }
      created.push(author)
      return route.fulfill({ status: 201, json: author })
    }
    if (path === '/api/authors') return route.fulfill({ json: created })
    return route.fulfill({ json: [] })
  })
  await page.goto('/authors')
  await page.getByRole('button', { name: 'Add author' }).click()
  const input = page.getByRole('combobox', { name: 'Name *' })
  await expect(page.getByRole('option')).toHaveText(['Jane Smith8 papers', 'Alex Doe2 papers'])
  await page.screenshot({ path: testInfo.outputPath('author-suggestions.png') })
  await input.fill('alex')
  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(input).toHaveValue('Alex Doe')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Open Alex Doe' })).toBeVisible()
  failSuggestions = true
  await page.getByRole('button', { name: 'Add author' }).click()
  await expect(page.getByRole('alert')).toContainText('Suggestions unavailable')
  await input.fill('My Own Author')
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Open My Own Author' })).toBeVisible()
  expect(created.map(author => author.name)).toEqual(['Alex Doe', 'My Own Author'])
})
