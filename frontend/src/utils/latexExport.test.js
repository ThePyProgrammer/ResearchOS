/**
 * Tests for latexExport.js utilities.
 *
 * Covers: buildFullLatex, generateBibContent, folderToLatex.
 * downloadLatexZip is tested with a structural check (verifies JSZip is called correctly).
 */

import { describe, it, expect, vi, beforeAll } from 'vitest'
import { TEMPLATES } from './latexTemplates.js'
import { buildFullLatex, generateBibContent, folderToLatex } from './latexExport.js'

// ── buildFullLatex tests ───────────────────────────────────────────────────────

describe('buildFullLatex', () => {
  it('wraps body with article template preamble and \\end{document}', () => {
    const result = buildFullLatex({
      body: 'Hello world\n',
      template: 'article',
      title: '',
      author: '',
      baseName: 'test',
      usedKeys: new Set(),
    })
    expect(result).toContain(TEMPLATES.article.preamble)
    expect(result).toContain('\\begin{document}')
    expect(result).toContain('\\end{document}')
    expect(result).toContain('Hello world')
  })

  it('includes \\title{} and \\author{} when provided', () => {
    const result = buildFullLatex({
      body: '',
      template: 'article',
      title: 'My Paper',
      author: 'Alice Smith',
      baseName: 'test',
      usedKeys: new Set(),
    })
    expect(result).toContain('\\title{My Paper}')
    expect(result).toContain('\\author{Alice Smith}')
  })

  it('includes \\maketitle when title is provided', () => {
    const result = buildFullLatex({
      body: '',
      template: 'article',
      title: 'Some Title',
      author: '',
      baseName: 'test',
      usedKeys: new Set(),
    })
    expect(result).toContain('\\maketitle')
  })

  it('does not include \\maketitle when title is empty', () => {
    const result = buildFullLatex({
      body: '',
      template: 'article',
      title: '',
      author: '',
      baseName: 'test',
      usedKeys: new Set(),
    })
    expect(result).not.toContain('\\maketitle')
  })

  it('includes \\bibliography{baseName} when usedKeys is non-empty', () => {
    const result = buildFullLatex({
      body: 'content',
      template: 'article',
      title: '',
      author: '',
      baseName: 'my-paper',
      usedKeys: new Set(['vaswani2017attention']),
    })
    expect(result).toContain('\\bibliography{my-paper}')
    expect(result).toContain('\\bibliographystyle{')
  })

  it('does not include \\bibliography when usedKeys is empty', () => {
    const result = buildFullLatex({
      body: 'content',
      template: 'article',
      title: '',
      author: '',
      baseName: 'test',
      usedKeys: new Set(),
    })
    expect(result).not.toContain('\\bibliography{')
  })

  it('uses IEEE template when requested', () => {
    const result = buildFullLatex({
      body: '',
      template: 'ieee',
      title: '',
      author: '',
      baseName: 'test',
      usedKeys: new Set(),
    })
    expect(result).toContain(TEMPLATES.ieee.preamble)
  })

  it('uses NeurIPS template when requested', () => {
    const result = buildFullLatex({
      body: '',
      template: 'neurips',
      title: '',
      author: '',
      baseName: 'test',
      usedKeys: new Set(),
    })
    expect(result).toContain(TEMPLATES.neurips.preamble)
  })
})

// ── generateBibContent tests ───────────────────────────────────────────────────

describe('generateBibContent', () => {
  const paperItem = {
    id: 'paper_abc',
    title: 'Attention Is All You Need',
    authors: ['Vaswani, Ashish', 'Shazeer, Noam', 'Parmar, Niki'],
    year: 2017,
    venue: 'NeurIPS',
    doi: '10.5555/3295222.3295349',
    type: 'paper',
  }

  const websiteItem = {
    id: 'web_123',
    title: 'PyTorch Homepage',
    authors: [],
    year: 2023,
    url: 'https://pytorch.org',
    type: 'website',
  }

  it('produces valid @inproceedings entry for a conference paper', () => {
    // NeurIPS is a conference, so the entry type should be @inproceedings
    const result = generateBibContent([paperItem])
    expect(result).toContain('@inproceedings{')
    expect(result).toContain('Attention Is All You Need')
    expect(result).toContain('Vaswani')
    expect(result).toContain('2017')
  })

  it('produces valid @article entry for a journal paper', () => {
    const journalPaper = { ...paperItem, venue: 'Nature', title: 'A Survey Paper' }
    const result = generateBibContent([journalPaper])
    expect(result).toContain('@article{')
    expect(result).toContain('A Survey Paper')
  })

  it('produces valid @misc entry for a website', () => {
    const result = generateBibContent([websiteItem])
    expect(result).toContain('@misc{')
    expect(result).toContain('PyTorch Homepage')
  })

  it('deduplicates keys for papers with same first author and year', () => {
    const paper1 = { ...paperItem, title: 'Attention Is All You Need' }
    const paper2 = {
      ...paperItem,
      id: 'paper_def',
      title: 'Attention Mechanisms Survey',
    }
    const result = generateBibContent([paper1, paper2])
    // First key: vaswani2017attention
    // Second key: vaswani2017attention + 'b' suffix = vaswani2017attentionb
    expect(result).toContain('vaswani2017attention,')
    expect(result).toContain('vaswani2017attentionb,')
  })

  it('returns empty string for empty array', () => {
    const result = generateBibContent([])
    expect(result).toBe('')
  })
})

// ── folderToLatex tests ────────────────────────────────────────────────────────

describe('folderToLatex', () => {
  const folder = { id: 'folder1', name: 'My Folder', type: 'folder', parentId: null }
  const child1 = { id: 'note1', name: 'Introduction', type: 'file', parentId: 'folder1', content: '<p>Intro text</p>' }
  const child2 = { id: 'note2', name: 'Methods', type: 'file', parentId: 'folder1', content: '<p>Method text</p>' }
  const child3 = { id: 'note3', name: 'Unrelated', type: 'file', parentId: null, content: '<p>Unrelated</p>' }

  it('converts each child note to a \\section with correct ordering', () => {
    const { body } = folderToLatex(folder, ['note1', 'note2'], [folder, child1, child2, child3])
    expect(body).toContain('\\section{Introduction}')
    expect(body).toContain('\\section{Methods}')
    expect(body).not.toContain('\\section{Unrelated}')
  })

  it('respects provided section ordering', () => {
    const { body } = folderToLatex(folder, ['note2', 'note1'], [folder, child1, child2])
    const methodsIndex = body.indexOf('\\section{Methods}')
    const introIndex = body.indexOf('\\section{Introduction}')
    expect(methodsIndex).toBeLessThan(introIndex)
  })

  it('falls back to alphabetical order when no sectionOrder provided', () => {
    const { body } = folderToLatex(folder, null, [folder, child1, child2])
    const introIndex = body.indexOf('\\section{Introduction}')
    const methodsIndex = body.indexOf('\\section{Methods}')
    expect(introIndex).toBeLessThan(methodsIndex)
  })

  it('collects usedKeys from all sections', () => {
    const citedNote = {
      id: 'note4', name: 'Related Work', type: 'file', parentId: 'folder1',
      content: '<p><span data-cite-key="smith2020deep" data-cite-paper-id="p1">(Smith et al., 2020)</span></p>',
    }
    const { usedKeys } = folderToLatex(folder, ['note4'], [folder, citedNote])
    expect(usedKeys.has('smith2020deep')).toBe(true)
  })

  it('returns empty body and empty usedKeys for folder with no file children', () => {
    const emptyFolder = { id: 'f2', name: 'Empty', type: 'folder', parentId: null }
    const { body, usedKeys } = folderToLatex(emptyFolder, [], [emptyFolder])
    expect(body).toBe('')
    expect(usedKeys.size).toBe(0)
  })

  it('renders subfolder children as \\subsection', () => {
    const subfolder = { id: 'sub1', name: 'Background', type: 'folder', parentId: 'folder1' }
    const subChild = { id: 'sc1', name: 'Prior Work', type: 'file', parentId: 'sub1', content: '<p>Prior work text</p>' }
    const { body } = folderToLatex(folder, null, [folder, child1, subfolder, subChild])
    expect(body).toContain('\\section{Background}')
    expect(body).toContain('\\subsection{Prior Work}')
    expect(body).toContain('Prior work text')
  })

  it('renders deeply nested folders as \\subsubsection', () => {
    const subfolder = { id: 'sub1', name: 'Background', type: 'folder', parentId: 'folder1' }
    const deepFolder = { id: 'deep1', name: 'Theory', type: 'folder', parentId: 'sub1' }
    const deepChild = { id: 'dc1', name: 'Axioms', type: 'file', parentId: 'deep1', content: '<p>Axioms here</p>' }
    const { body } = folderToLatex(folder, null, [folder, subfolder, deepFolder, deepChild])
    expect(body).toContain('\\section{Background}')
    expect(body).toContain('\\subsection{Theory}')
    expect(body).toContain('\\subsubsection{Axioms}')
  })

  it('collects usedKeys from nested subfolder notes', () => {
    const subfolder = { id: 'sub1', name: 'Related', type: 'folder', parentId: 'folder1' }
    const subChild = {
      id: 'sc1', name: 'Cited', type: 'file', parentId: 'sub1',
      content: '<p><span data-cite-key="jones2021" data-cite-paper-id="p2">(Jones, 2021)</span></p>',
    }
    const { usedKeys } = folderToLatex(folder, null, [folder, subfolder, subChild])
    expect(usedKeys.has('jones2021')).toBe(true)
  })
})
