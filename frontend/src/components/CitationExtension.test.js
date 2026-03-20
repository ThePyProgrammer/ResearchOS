import { describe, it, expect } from 'vitest'
import { extractCitations } from './CitationExtension.js'

describe('extractCitations', () => {
  it('returns a single citation from a span with data-cite-key', () => {
    const html = '<p>Some text <span class="citation-chip" data-cite-key="vaswani2017attention" data-cite-paper-id="paper_abc" data-cite-label="(Vaswani et al., 2017)">(Vaswani et al., 2017)</span> more text</p>'
    const result = extractCitations(html)
    expect(result).toEqual([{ citationKey: 'vaswani2017attention', paperId: 'paper_abc', websiteId: null }])
  })

  it('returns all entries when there are multiple different citations', () => {
    const html = [
      '<span class="citation-chip" data-cite-key="vaswani2017attention" data-cite-paper-id="paper_abc" data-cite-label="(Vaswani et al., 2017)">(Vaswani et al., 2017)</span>',
      ' and ',
      '<span class="citation-chip" data-cite-key="lecun1989backprop" data-cite-paper-id="paper_def" data-cite-label="(LeCun, 1989)">(LeCun, 1989)</span>',
    ].join('')
    const result = extractCitations(html)
    expect(result).toHaveLength(2)
    expect(result[0].citationKey).toBe('vaswani2017attention')
    expect(result[1].citationKey).toBe('lecun1989backprop')
  })

  it('deduplicates citations by citationKey when the same key appears twice', () => {
    const html = [
      '<span class="citation-chip" data-cite-key="vaswani2017attention" data-cite-paper-id="paper_abc">(Vaswani et al., 2017)</span>',
      ' some text ',
      '<span class="citation-chip" data-cite-key="vaswani2017attention" data-cite-paper-id="paper_abc">(Vaswani et al., 2017)</span>',
    ].join('')
    const result = extractCitations(html)
    expect(result).toHaveLength(1)
    expect(result[0].citationKey).toBe('vaswani2017attention')
  })

  it('returns empty array when there are no citation spans', () => {
    const html = '<p>Just plain text with no citations here.</p>'
    const result = extractCitations(html)
    expect(result).toEqual([])
  })

  it('returns empty array for empty string input', () => {
    expect(extractCitations('')).toEqual([])
  })

  it('returns empty array for null input', () => {
    expect(extractCitations(null)).toEqual([])
  })

  it('returns entry with null paperId for a website citation (no data-cite-paper-id)', () => {
    const html = '<span class="citation-chip" data-cite-key="openai2024gpt" data-cite-website-id="web_xyz" data-cite-label="(OpenAI, 2024)">(OpenAI, 2024)</span>'
    const result = extractCitations(html)
    expect(result).toEqual([{ citationKey: 'openai2024gpt', paperId: null, websiteId: 'web_xyz' }])
  })

  it('handles mixed paper and website citations correctly', () => {
    const html = [
      '<span class="citation-chip" data-cite-key="vaswani2017attention" data-cite-paper-id="paper_abc">(Vaswani et al., 2017)</span>',
      ' and ',
      '<span class="citation-chip" data-cite-key="openai2024gpt" data-cite-website-id="web_xyz">(OpenAI, 2024)</span>',
    ].join('')
    const result = extractCitations(html)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ citationKey: 'vaswani2017attention', paperId: 'paper_abc', websiteId: null })
    expect(result[1]).toEqual({ citationKey: 'openai2024gpt', paperId: null, websiteId: 'web_xyz' })
  })

  it('ignores non-citation spans (e.g. wiki-link spans)', () => {
    const html = [
      '<span data-wiki-name="Some Note">Some Note</span>',
      ' and ',
      '<span class="citation-chip" data-cite-key="vaswani2017attention" data-cite-paper-id="paper_abc">(Vaswani et al., 2017)</span>',
    ].join('')
    const result = extractCitations(html)
    expect(result).toHaveLength(1)
    expect(result[0].citationKey).toBe('vaswani2017attention')
  })
})
