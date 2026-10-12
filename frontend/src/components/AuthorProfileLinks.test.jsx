import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import AuthorProfileLinks from './AuthorProfileLinks'

const AUTHOR = {
  name: 'Jane', websiteUrl: 'https://example.org', linkedinUrl: 'https://www.linkedin.com/in/jane',
  twitterUrl: 'https://x.com/jane', googleScholarUrl: 'https://scholar.google.com/citations?user=jane',
  githubUsername: 'jane', orcid: '0000-0001-2345-6789', openreviewUrl: 'https://openreview.net/profile?id=jane',
}
const ORDER = ['Website', 'LinkedIn', 'X / Twitter', 'Google Scholar', 'GitHub', 'ORCID', 'OpenReview']
const visibleLabels = () => screen.getAllByRole('link').map(link => link.title)

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it.each([true, false])('hides only the optional links when compact=%s and restores them on resize', compact => {
  let width = 260
  let resize
  const disconnect = vi.fn()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width }))
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) { resize = callback }
    observe() {}
    disconnect() { disconnect() }
  })
  const { rerender, unmount } = render(<AuthorProfileLinks author={AUTHOR} compact={compact} />)
  expect(visibleLabels()).toEqual(ORDER)
  act(() => { width = 150; resize() })
  expect(visibleLabels()).toEqual(ORDER.slice(0, 5))
  act(() => { width = 260; resize() })
  expect(visibleLabels()).toEqual(ORDER)
  // Missing primary links free space for ORCID and OpenReview, even at a narrow width.
  act(() => { width = 80; resize() })
  rerender(<AuthorProfileLinks author={{ name: 'Jane', orcid: AUTHOR.orcid, openreviewUrl: AUTHOR.openreviewUrl }} compact={compact} />)
  expect(visibleLabels()).toEqual(['ORCID', 'OpenReview'])
  unmount()
  expect(disconnect).toHaveBeenCalled()
})
