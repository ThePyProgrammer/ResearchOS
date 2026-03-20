import { describe, it, expect } from 'vitest'
import { htmlToLatex, escapeLatex } from './latexSerializer'

describe('escapeLatex', () => {
  it('escapes backslash first', () => {
    expect(escapeLatex('\\')).toBe('\\textbackslash{}')
  })

  it('escapes & to \\&', () => {
    expect(escapeLatex('A & B')).toBe('A \\& B')
  })

  it('escapes % to \\%', () => {
    expect(escapeLatex('50%')).toBe('50\\%')
  })

  it('escapes # to \\#', () => {
    expect(escapeLatex('#hash')).toBe('\\#hash')
  })

  it('escapes $ to \\$', () => {
    expect(escapeLatex('$money')).toBe('\\$money')
  })

  it('escapes _ to \\_', () => {
    expect(escapeLatex('a_b')).toBe('a\\_b')
  })

  it('escapes ^ to \\textasciicircum{}', () => {
    expect(escapeLatex('a^b')).toBe('a\\textasciicircum{}b')
  })

  it('escapes ~ to \\textasciitilde{}', () => {
    expect(escapeLatex('a~b')).toBe('a\\textasciitilde{}b')
  })

  it('escapes { to \\{', () => {
    expect(escapeLatex('a{b}')).toBe('a\\{b\\}')
  })

  it('escapes } to \\}', () => {
    expect(escapeLatex('}')).toBe('\\}')
  })

  it('escapes multiple special chars in order', () => {
    // backslash must be done first to avoid double-escaping
    expect(escapeLatex('\\&')).toBe('\\textbackslash{}\\&')
  })

  it('returns empty string for empty input', () => {
    expect(escapeLatex('')).toBe('')
  })
})

describe('htmlToLatex', () => {
  it('returns empty string for empty input', () => {
    expect(htmlToLatex('').latex).toBe('')
  })

  it('returns empty string for null input', () => {
    expect(htmlToLatex(null).latex).toBe('')
  })

  it('converts h1 to \\section{}', () => {
    const { latex } = htmlToLatex('<h1>Introduction</h1>')
    expect(latex).toContain('\\section{Introduction}')
  })

  it('converts h2 to \\subsection{}', () => {
    const { latex } = htmlToLatex('<h2>Background</h2>')
    expect(latex).toContain('\\subsection{Background}')
  })

  it('converts h3 to \\subsubsection{}', () => {
    const { latex } = htmlToLatex('<h3>Details</h3>')
    expect(latex).toContain('\\subsubsection{Details}')
  })

  it('converts paragraph to text with double newlines', () => {
    const { latex } = htmlToLatex('<p>Hello world</p>')
    expect(latex).toContain('Hello world\n\n')
  })

  it('converts strong to \\textbf{}', () => {
    const { latex } = htmlToLatex('<p><strong>bold text</strong></p>')
    expect(latex).toContain('\\textbf{bold text}')
  })

  it('converts b to \\textbf{}', () => {
    const { latex } = htmlToLatex('<p><b>bold</b></p>')
    expect(latex).toContain('\\textbf{bold}')
  })

  it('converts em to \\textit{}', () => {
    const { latex } = htmlToLatex('<p><em>italic text</em></p>')
    expect(latex).toContain('\\textit{italic text}')
  })

  it('converts i to \\textit{}', () => {
    const { latex } = htmlToLatex('<p><i>italic</i></p>')
    expect(latex).toContain('\\textit{italic}')
  })

  it('converts u to \\underline{}', () => {
    const { latex } = htmlToLatex('<p><u>underlined</u></p>')
    expect(latex).toContain('\\underline{underlined}')
  })

  it('converts s to \\sout{}', () => {
    const { latex } = htmlToLatex('<p><s>struck</s></p>')
    expect(latex).toContain('\\sout{struck}')
  })

  it('converts inline code to \\texttt{}', () => {
    const { latex } = htmlToLatex('<p><code>inlineCode()</code></p>')
    expect(latex).toContain('\\texttt{inlineCode()}')
  })

  it('converts pre/code block to verbatim', () => {
    const { latex } = htmlToLatex('<pre><code>function foo() {}</code></pre>')
    expect(latex).toContain('\\begin{verbatim}')
    expect(latex).toContain('function foo() {}')
    expect(latex).toContain('\\end{verbatim}')
  })

  it('converts blockquote to \\begin{quote}', () => {
    const { latex } = htmlToLatex('<blockquote><p>A quote</p></blockquote>')
    expect(latex).toContain('\\begin{quote}')
    expect(latex).toContain('\\end{quote}')
  })

  it('converts hr to \\hrule', () => {
    const { latex } = htmlToLatex('<hr>')
    expect(latex).toContain('\\hrule')
  })

  it('converts ul to \\begin{itemize}', () => {
    const { latex } = htmlToLatex('<ul><li>item one</li><li>item two</li></ul>')
    expect(latex).toContain('\\begin{itemize}')
    expect(latex).toContain('\\item item one')
    expect(latex).toContain('\\item item two')
    expect(latex).toContain('\\end{itemize}')
  })

  it('converts ol to \\begin{enumerate}', () => {
    const { latex } = htmlToLatex('<ol><li>first</li><li>second</li></ol>')
    expect(latex).toContain('\\begin{enumerate}')
    expect(latex).toContain('\\item first')
    expect(latex).toContain('\\item second')
    expect(latex).toContain('\\end{enumerate}')
  })

  it('converts table to \\begin{tabular}', () => {
    const html = `<table>
      <tr><th>Name</th><th>Value</th></tr>
      <tr><td>Alice</td><td>42</td></tr>
    </table>`
    const { latex } = htmlToLatex(html)
    expect(latex).toContain('\\begin{tabular}')
    expect(latex).toContain('\\end{tabular}')
    expect(latex).toContain('\\hline')
    expect(latex).toContain('Name')
    expect(latex).toContain('Value')
    expect(latex).toContain('Alice')
    expect(latex).toContain('42')
    // columns joined with &
    expect(latex).toContain('&')
  })

  it('table has correct column spec with pipes', () => {
    const html = '<table><tr><th>A</th><th>B</th></tr></table>'
    const { latex } = htmlToLatex(html)
    expect(latex).toContain('| l | l |')
  })

  it('converts citation span to \\cite{key} and adds to usedKeys', () => {
    const html = '<span data-cite-key="vaswani2017attention" data-cite-paper-id="abc">(Vaswani et al., 2017)</span>'
    const { latex, usedKeys } = htmlToLatex(html)
    expect(latex).toContain('\\cite{vaswani2017attention}')
    expect(usedKeys.has('vaswani2017attention')).toBe(true)
  })

  it('tracks multiple different citation keys in usedKeys', () => {
    const html = '<p><span data-cite-key="smith2020a">...</span> and <span data-cite-key="jones2019b">...</span></p>'
    const { usedKeys } = htmlToLatex(html)
    expect(usedKeys.has('smith2020a')).toBe(true)
    expect(usedKeys.has('jones2019b')).toBe(true)
    expect(usedKeys.size).toBe(2)
  })

  it('converts inline math span to $...$ without escaping content', () => {
    const html = '<span data-latex="\\alpha + \\beta">alpha plus beta</span>'
    const { latex } = htmlToLatex(html)
    expect(latex).toContain('$\\alpha + \\beta$')
    // the content should not be double-escaped
    expect(latex).not.toContain('\\textbackslash{}')
  })

  it('escapes LaTeX special characters in regular text nodes', () => {
    const html = '<p>Revenue is $100 &amp; costs are 50%</p>'
    const { latex } = htmlToLatex(html)
    expect(latex).toContain('\\$')
    expect(latex).toContain('\\&')
    expect(latex).toContain('\\%')
  })

  it('does NOT escape inside math spans', () => {
    const html = '<span data-latex="x_1 + x_2">...</span>'
    const { latex } = htmlToLatex(html)
    // underscore in math should not be escaped
    expect(latex).toContain('$x_1 + x_2$')
    expect(latex).not.toContain('x\\_1')
  })

  it('handles nested formatting: bold inside heading', () => {
    const html = '<h1>The <strong>Key</strong> Result</h1>'
    const { latex } = htmlToLatex(html)
    expect(latex).toContain('\\section{The \\textbf{Key} Result}')
  })

  it('converts anchor links to \\href{url}{text}', () => {
    const html = '<a href="https://example.com">Example</a>'
    const { latex } = htmlToLatex(html)
    expect(latex).toContain('\\href{https://example.com}{Example}')
  })

  it('wiki-name spans emit inner text only', () => {
    const html = '<span data-wiki-name="SomeNote">SomeNote</span>'
    const { latex } = htmlToLatex(html)
    expect(latex).toContain('SomeNote')
    expect(latex).not.toContain('[[')
  })

  it('usedKeys is empty Set when no citations present', () => {
    const { usedKeys } = htmlToLatex('<p>No citations here.</p>')
    expect(usedKeys).toBeInstanceOf(Set)
    expect(usedKeys.size).toBe(0)
  })
})
