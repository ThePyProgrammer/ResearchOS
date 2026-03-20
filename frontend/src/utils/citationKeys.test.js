import { describe, it, expect } from 'vitest'
import { makeCitationKey, deduplicateKeys, makeCitationLabel } from './citationKeys'

describe('makeCitationKey', () => {
  it('generates key for standard "First Last" author format', () => {
    const key = makeCitationKey({
      authors: ['Ashish Vaswani'],
      year: 2017,
      title: 'Attention Is All You Need',
    })
    expect(key).toBe('vaswani2017attention')
  })

  it('handles "Last, First" author format', () => {
    const key = makeCitationKey({
      authors: ['Vaswani, Ashish'],
      year: 2017,
      title: 'Attention Is All You Need',
    })
    expect(key).toBe('vaswani2017attention')
  })

  it('returns unknown prefix when no authors provided', () => {
    const key = makeCitationKey({
      authors: [],
      year: 2020,
      title: 'Deep Learning',
    })
    expect(key).toBe('unknown2020deep')
  })

  it('returns unknown prefix when authors is null', () => {
    const key = makeCitationKey({
      authors: null,
      year: 2020,
      title: 'Deep Learning',
    })
    expect(key).toBe('unknown2020deep')
  })

  it('omits year when year is null', () => {
    const key = makeCitationKey({
      authors: ['John Smith'],
      year: null,
      title: 'Neural Networks',
    })
    expect(key).toBe('smithneural')
  })

  it('omits year when year is undefined', () => {
    const key = makeCitationKey({
      authors: ['John Smith'],
      title: 'Neural Networks',
    })
    expect(key).toBe('smithneural')
  })

  it('omits title word when title is empty', () => {
    const key = makeCitationKey({
      authors: ['John Smith'],
      year: 2024,
      title: '',
    })
    expect(key).toBe('smith2024')
  })

  it('skips stop word "a" in title', () => {
    const key = makeCitationKey({
      authors: ['Jane Doe'],
      year: 2021,
      title: 'A Study of Transformers',
    })
    expect(key).toBe('doe2021study')
  })

  it('skips stop word "the" in title', () => {
    const key = makeCitationKey({
      authors: ['Jane Doe'],
      year: 2021,
      title: 'The Transformer Model',
    })
    expect(key).toBe('doe2021transformer')
  })

  it('skips all stop words: a, an, the, on, of, for, in, to, and, with, is, are, by', () => {
    const key = makeCitationKey({
      authors: ['Alice Chen'],
      year: 2022,
      title: 'A An The On Of For In To And With Is Are By Networks',
    })
    expect(key).toBe('chen2022networks')
  })

  it('strips non-alpha characters from last name', () => {
    const key = makeCitationKey({
      authors: ["O'Brien, Patrick"],
      year: 2019,
      title: 'Language Models',
    })
    // O'Brien -> OBrien -> obrien
    expect(key).toBe('obrien2019language')
  })

  it('strips non-alpha characters from title word', () => {
    const key = makeCitationKey({
      authors: ['Bob Lee'],
      year: 2023,
      title: 'GPT-4: Technical Report',
    })
    // "GPT-4:" -> gpt
    expect(key).toBe('lee2023gpt')
  })

  it('handles website-like item with no year', () => {
    const key = makeCitationKey({
      authors: ['OpenAI'],
      year: null,
      title: 'ChatGPT Documentation',
    })
    expect(key).toBe('openai' + 'chatgpt')
  })

  it('returns "entry" for completely empty item', () => {
    const key = makeCitationKey({
      authors: [],
      year: null,
      title: '',
    })
    expect(key).toBe('entry')
  })
})

describe('deduplicateKeys', () => {
  it('returns original keys when all are unique', () => {
    const items = [
      { authors: ['Alice Smith'], year: 2020, title: 'Topic A' },
      { authors: ['Bob Jones'], year: 2021, title: 'Topic B' },
    ]
    const result = deduplicateKeys(items)
    expect(result[0]._resolvedKey).toBe('smith2020topic')
    expect(result[1]._resolvedKey).toBe('jones2021topic')
  })

  it('first item keeps base key, second gets "b" suffix', () => {
    const items = [
      { authors: ['John Smith'], year: 2024, title: 'Alpha Research' },
      { authors: ['John Smith'], year: 2024, title: 'Alpha Method' },
    ]
    const result = deduplicateKeys(items)
    expect(result[0]._resolvedKey).toBe('smith2024alpha')
    expect(result[1]._resolvedKey).toBe('smith2024alphab')
  })

  it('three colliding items get base, b, c suffixes', () => {
    const items = [
      { authors: ['John Smith'], year: 2024, title: 'Alpha First' },
      { authors: ['John Smith'], year: 2024, title: 'Alpha Second' },
      { authors: ['John Smith'], year: 2024, title: 'Alpha Third' },
    ]
    const result = deduplicateKeys(items)
    expect(result[0]._resolvedKey).toBe('smith2024alpha')
    expect(result[1]._resolvedKey).toBe('smith2024alphab')
    expect(result[2]._resolvedKey).toBe('smith2024alphac')
  })

  it('preserves order of items in result', () => {
    const items = [
      { authors: ['Charlie Brown'], year: 2018, title: 'First Paper' },
      { authors: ['Alice Doe'], year: 2019, title: 'Second Paper' },
      { authors: ['Bob Lee'], year: 2020, title: 'Third Paper' },
    ]
    const result = deduplicateKeys(items)
    expect(result[0].authors[0]).toBe('Charlie Brown')
    expect(result[1].authors[0]).toBe('Alice Doe')
    expect(result[2].authors[0]).toBe('Bob Lee')
  })

  it('preserves all original item properties', () => {
    const items = [{ authors: ['Mary Wang'], year: 2022, title: 'Study', abstract: 'Test abstract' }]
    const result = deduplicateKeys(items)
    expect(result[0].abstract).toBe('Test abstract')
    expect(result[0]._resolvedKey).toBe('wang2022study')
  })

  it('handles empty array', () => {
    expect(deduplicateKeys([])).toEqual([])
  })
})

describe('makeCitationLabel', () => {
  it('formats single author as "(Author, Year)"', () => {
    const label = makeCitationLabel({ authors: ['Ashish Vaswani'], year: 2017 })
    expect(label).toBe('(Vaswani, 2017)')
  })

  it('formats two authors as "(Author1 & Author2, Year)"', () => {
    const label = makeCitationLabel({
      authors: ['Alice Smith', 'Bob Jones'],
      year: 2020,
    })
    expect(label).toBe('(Smith & Jones, 2020)')
  })

  it('formats three or more authors as "(Author1 et al., Year)"', () => {
    const label = makeCitationLabel({
      authors: ['Alice Smith', 'Bob Jones', 'Carol Lee'],
      year: 2021,
    })
    expect(label).toBe('(Smith et al., 2021)')
  })

  it('omits year when not present', () => {
    const label = makeCitationLabel({ authors: ['Alice Smith'], year: null })
    expect(label).toBe('(Smith)')
  })

  it('uses title word when no authors', () => {
    const label = makeCitationLabel({
      authors: [],
      year: 2022,
      title: 'Neural Networks Survey',
    })
    expect(label).toBe('(Neural, 2022)')
  })

  it('handles "Last, First" author format', () => {
    const label = makeCitationLabel({ authors: ['Vaswani, Ashish'], year: 2017 })
    expect(label).toBe('(Vaswani, 2017)')
  })
})
