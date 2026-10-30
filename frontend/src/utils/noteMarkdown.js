// Portable note content for canvas bundles. ResearchOS notes store rich HTML;
// preserve wiki links and canvas embeds when exporting them as Markdown files.
export function noteMarkdown(content) {
  if (!/<[a-z][\s\S]*>/i.test(content || '')) return content || ''
  const doc = new DOMParser().parseFromString(content, 'text/html')
  function visit(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const tag = node.tagName.toLowerCase(), inner = () => [...node.childNodes].map(visit).join('')
    if (node.dataset.canvasFile) return `![[${node.dataset.canvasFile}]]\n\n`
    if (node.dataset.wikiName) return `[[${node.dataset.wikiName}]]`
    if (node.dataset.latex) return `$${node.dataset.latex}$`
    if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag[1]))} ${inner()}\n\n`
    if (['script', 'style', 'iframe', 'input'].includes(tag)) return ''
    if (['p', 'div'].includes(tag)) return `${inner()}\n\n`
    if (tag === 'br') return '\n'
    if (tag === 'hr') return '\n---\n\n'
    if (['strong', 'b'].includes(tag)) return `**${inner()}**`
    if (['em', 'i'].includes(tag)) return `*${inner()}*`
    if (['s', 'del'].includes(tag)) return `~~${inner()}~~`
    if (tag === 'code') return node.closest('pre') ? inner() : `\`${inner()}\``
    if (tag === 'pre') return `\`\`\`${node.querySelector('code')?.className.match(/language-(\w+)/)?.[1] || ''}\n${inner()}\n\`\`\`\n\n`
    if (tag === 'a') return `[${inner()}](${node.getAttribute('href') || ''})`
    if (tag === 'img') return `![${node.getAttribute('alt') || ''}](${node.getAttribute('src') || ''})`
    if (tag === 'blockquote') return `${inner().trim().split('\n').map(line => `> ${line}`).join('\n')}\n\n`
    if (['ul', 'ol'].includes(tag)) return [...node.children].map((li, i) => {
      const task = li.dataset.type === 'taskItem' || li.querySelector('input[type=checkbox]')
      const prefix = task ? `- [${li.dataset.checked === 'true' || li.querySelector('input')?.checked ? 'x' : ' '}]` : tag === 'ol' ? `${i + 1}.` : '-'
      return `${prefix} ${visit(li).trim()}\n`
    }).join('') + '\n'
    if (tag === 'table') {
      const rows = [...node.querySelectorAll('tr')]
      const lines = rows.map(row => '| ' + [...row.children].map(cell => visit(cell).trim().replace(/\n/g, ' ').replace(/\|/g, '\\|')).join(' | ') + ' |')
      if (rows.length) lines.splice(1, 0, '| ' + [...rows[0].children].map(() => '---').join(' | ') + ' |')
      return lines.join('\n') + '\n\n'
    }
    return inner()
  }
  return visit(doc.body).trim()
}
