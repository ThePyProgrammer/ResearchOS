import { Mark, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'
import { makeCitationKey, makeCitationLabel } from '../utils/citationKeys.js'

/**
 * Citation Tiptap Extension (Mark-based)
 *
 * Lets users insert citation references via @-mention in the notes editor.
 * Renders an inline author-year chip: (Vaswani et al., 2017)
 *
 * The chip is stored in HTML as:
 *   <span class="citation-chip"
 *         data-cite-key="vaswani2017attention"
 *         data-cite-paper-id="paper_abc123"
 *         data-cite-label="(Vaswani et al., 2017)">
 *     (Vaswani et al., 2017)
 *   </span>
 *
 * Clicking the chip opens a context menu.
 * The LaTeX serializer (Plan 01) reads data-cite-key to emit \cite{key}.
 *
 * Follows the exact same Mark.create + Suggestion architecture as WikiLinkExtension.js.
 */
export function createCitationExtension({
  getLinkedItems,
  getAllLibraryItems,
  onAutoLink,
  onOpenItem,
  getBibtexEntry,
}) {
  return Mark.create({
    name: 'citation',

    // Don't extend the mark when typing immediately after it
    inclusive: false,

    addAttributes() {
      return {
        paperId: {
          default: null,
          parseHTML: element => element.getAttribute('data-cite-paper-id') || null,
          renderHTML: attributes => attributes.paperId
            ? { 'data-cite-paper-id': attributes.paperId }
            : {},
        },
        websiteId: {
          default: null,
          parseHTML: element => element.getAttribute('data-cite-website-id') || null,
          renderHTML: attributes => attributes.websiteId
            ? { 'data-cite-website-id': attributes.websiteId }
            : {},
        },
        citationKey: {
          default: null,
          parseHTML: element => element.getAttribute('data-cite-key') || null,
          renderHTML: attributes => attributes.citationKey
            ? { 'data-cite-key': attributes.citationKey }
            : {},
        },
        displayLabel: {
          default: null,
          parseHTML: element => element.getAttribute('data-cite-label') || null,
          renderHTML: attributes => attributes.displayLabel
            ? { 'data-cite-label': attributes.displayLabel }
            : {},
        },
      }
    },

    parseHTML() {
      return [{ tag: 'span[data-cite-key]' }]
    },

    renderHTML({ HTMLAttributes }) {
      // Build a native tooltip from available metadata
      const parts = []
      if (HTMLAttributes['data-cite-label']) parts.push(HTMLAttributes['data-cite-label'])
      if (HTMLAttributes['data-cite-key'])   parts.push(`Key: ${HTMLAttributes['data-cite-key']}`)
      const title = parts.join(' | ')

      return [
        'span',
        mergeAttributes({ class: 'citation-chip', title }, HTMLAttributes),
        0,
      ]
    },

    addProseMirrorPlugins() {
      const markName = this.name

      // ── Find the full text range covered by a citation mark at pos ───────
      function findMarkRange(doc, pos) {
        const $pos = doc.resolve(pos)
        const citeMark = $pos.marks().find(m => m.type.name === markName)
        if (!citeMark) return null

        const parentStart = pos - $pos.parentOffset
        const parent = $pos.parent

        const segments = []
        parent.forEach((child, offset) => {
          if (!child.isText) return
          if (child.marks.some(m => m.type.name === markName && m.attrs.citationKey === citeMark.attrs.citationKey)) {
            segments.push({ from: parentStart + offset, to: parentStart + offset + child.nodeSize })
          }
        })
        if (!segments.length) return null

        const merged = segments.reduce((acc, seg) => ({
          from: Math.min(acc.from, seg.from),
          to: Math.max(acc.to, seg.to),
        }))

        return { ...merged, mark: citeMark }
      }

      // ── Context menu helper (imperatively rendered, same style as WikiLink) ──
      let ctxMenu = null

      function removeCtxMenu() {
        if (ctxMenu) { ctxMenu.remove(); ctxMenu = null }
        document.removeEventListener('mousedown', onOutsideClick)
      }

      function onOutsideClick(e) {
        if (ctxMenu && !ctxMenu.contains(e.target)) removeCtxMenu()
      }

      function showContextMenu(view, pos, x, y, range) {
        removeCtxMenu()

        const { mark } = range
        const { paperId, websiteId, citationKey, displayLabel } = mark.attrs

        ctxMenu = document.createElement('div')
        ctxMenu.style.cssText = [
          'position:fixed',
          `top:${y}px`,
          `left:${x}px`,
          'z-index:9999',
          'background:#fff',
          'border:1px solid #e2e8f0',
          'border-radius:8px',
          'box-shadow:0 8px 24px rgba(0,0,0,.12)',
          'min-width:220px',
          'padding:4px 0',
          'font-family:ui-sans-serif,system-ui,sans-serif',
        ].join(';')

        // ── Header: label + citation key ────────────────────────────────────
        const header = document.createElement('div')
        header.style.cssText = 'padding:6px 12px 5px;border-bottom:1px solid #f1f5f9;margin-bottom:4px;'
        const labelText = displayLabel || '(citation)'
        const keyText = citationKey || ''
        header.innerHTML = `
          <span style="font-size:10px;color:#94a3b8;display:block;font-weight:500;text-transform:uppercase;letter-spacing:.05em;margin-bottom:1px;">Citation</span>
          <span style="font-size:12px;color:#334155;font-weight:500;">${labelText}</span>
          ${keyText ? `<span style="display:block;font-size:10px;color:#64748b;margin-top:1px;font-family:monospace;">${keyText}</span>` : ''}
        `
        ctxMenu.appendChild(header)

        function addMenuItem(icon, label, color, onClick) {
          const btn = document.createElement('div')
          btn.style.cssText = `padding:6px 12px;cursor:pointer;font-size:12px;color:${color};display:flex;align-items:center;gap:8px;`
          btn.innerHTML = `<span style="font-size:13px;">${icon}</span> ${label}`
          btn.addEventListener('mouseenter', () => { btn.style.background = '#f8fafc' })
          btn.addEventListener('mouseleave', () => { btn.style.background = '' })
          btn.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); onClick(e) })
          ctxMenu.appendChild(btn)
          return btn
        }

        // ── Open paper ───────────────────────────────────────────────────────
        addMenuItem('📄', 'Open paper', '#374151', () => {
          removeCtxMenu()
          onOpenItem?.(paperId, websiteId)
        })

        // ── Copy citation key ────────────────────────────────────────────────
        addMenuItem('🔑', 'Copy citation key', '#374151', async () => {
          if (citationKey) {
            await navigator.clipboard.writeText(citationKey).catch(() => {})
          }
          removeCtxMenu()
        })

        // ── Copy BibTeX entry ────────────────────────────────────────────────
        addMenuItem('📋', 'Copy BibTeX entry', '#374151', async () => {
          try {
            const bibtex = await getBibtexEntry?.(paperId, websiteId)
            if (bibtex) {
              await navigator.clipboard.writeText(bibtex).catch(() => {})
            }
          } catch (_) {
            // silently skip on error
          }
          removeCtxMenu()
        })

        // ── Separator ────────────────────────────────────────────────────────
        const sep = document.createElement('div')
        sep.style.cssText = 'height:1px;background:#f1f5f9;margin:4px 0;'
        ctxMenu.appendChild(sep)

        // ── Remove citation ──────────────────────────────────────────────────
        addMenuItem('🗑️', 'Remove citation', '#ef4444', () => {
          const { state, dispatch } = view
          dispatch(state.tr.removeMark(range.from, range.to, mark.type))
          removeCtxMenu()
          view.focus()
        })

        document.body.appendChild(ctxMenu)

        // Clamp to viewport
        requestAnimationFrame(() => {
          if (!ctxMenu) return
          const r = ctxMenu.getBoundingClientRect()
          if (r.right  > window.innerWidth)  ctxMenu.style.left = `${window.innerWidth  - r.width  - 8}px`
          if (r.bottom > window.innerHeight) ctxMenu.style.top  = `${window.innerHeight - r.height - 8}px`
        })

        setTimeout(() => document.addEventListener('mousedown', onOutsideClick), 0)
      }

      return [
        // ── Click + right-click handler ──────────────────────────────────────
        new Plugin({
          props: {
            handleClick(view, pos, event) {
              if (event.button !== 0) return false
              const citeMark = view.state.doc.resolve(pos).marks().find(m => m.type.name === markName)
              if (citeMark) {
                event.preventDefault()
                const range = findMarkRange(view.state.doc, pos)
                if (range) {
                  showContextMenu(view, pos, event.clientX, event.clientY, range)
                }
                return true
              }
              return false
            },

            handleDOMEvents: {
              contextmenu(view, event) {
                const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
                if (!pos) return false
                const range = findMarkRange(view.state.doc, pos.pos)
                if (!range) return false
                event.preventDefault()
                showContextMenu(view, pos.pos, event.clientX, event.clientY, range)
                return true
              },
            },
          },
        }),

        // ── Suggestion: @ triggers autocomplete popup ────────────────────────
        Suggestion({
          pluginKey: new PluginKey('citationSuggestion'),
          editor: this.editor,
          char: '@',
          allowSpaces: true,

          // Prevent triggering when @ follows a word character (email collision avoidance)
          allow({ state, range }) {
            const { from } = range
            if (from < 2) return true
            const charBefore = state.doc.textBetween(from - 2, from - 1)
            return !/\w/.test(charBefore)
          },

          command: ({ editor, range, props }) => {
            if (props._isDivider) return

            const key = makeCitationKey({
              authors: props.authors,
              year: props.year,
              title: props.title,
            })
            const label = makeCitationLabel({
              authors: props.authors,
              year: props.year,
              title: props.title,
            })

            const paperId = props.type === 'paper' ? props.id : null
            const websiteId = props.type === 'website' ? props.id : null

            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent([
                {
                  type: 'text',
                  text: label,
                  marks: [{
                    type: markName,
                    attrs: {
                      paperId,
                      websiteId,
                      citationKey: key,
                      displayLabel: label,
                    },
                  }],
                },
                { type: 'text', text: ' ' },
              ])
              .run()

            if (!props.isLinked) {
              onAutoLink?.(paperId, websiteId)
            }
          },

          items: ({ query }) => {
            const q = query.toLowerCase().trim()

            const linkedItems = (getLinkedItems?.() ?? [])
            const libraryItems = (getAllLibraryItems?.() ?? [])

            function matchItem(item) {
              if (!q) return true
              const titleMatch = (item.title || '').toLowerCase().includes(q)
              const authorMatch = (item.authors || []).some(a => a.toLowerCase().includes(q))
              const yearMatch = String(item.year || '').includes(q)
              return titleMatch || authorMatch || yearMatch
            }

            const linked = linkedItems
              .filter(matchItem)
              .map(item => ({ ...item, isLinked: true }))
              .slice(0, 8)

            // If query given and fewer than 5 linked results, also show library items
            if (q && linked.length < 5) {
              const linkedIds = new Set(linked.map(i => i.id))
              const library = libraryItems
                .filter(item => !linkedIds.has(item.id) && matchItem(item))
                .map(item => ({ ...item, isLinked: false }))
                .slice(0, 8 - linked.length)

              if (library.length > 0) {
                return [
                  ...linked,
                  { _isDivider: true, id: '__divider__', title: 'Search full library...' },
                  ...library,
                ]
              }
            }

            return linked
          },

          render: () => {
            let popup = null
            let selectedIndex = 0

            function removePopup() {
              if (popup) { popup.remove(); popup = null }
            }

            function getSelectableItems() {
              if (!popup) return []
              return Array.from(popup.querySelectorAll('[data-index]'))
            }

            function highlight() {
              if (!popup) return
              const items = getSelectableItems()
              items.forEach((el, i) => {
                el.style.background = i === selectedIndex ? '#f1f5f9' : ''
              })
            }

            function buildPopup(props) {
              removePopup()
              popup = document.createElement('div')
              popup.className = 'citation-popup'
              popup.style.cssText = [
                'position:fixed',
                'z-index:9999',
                'background:#fff',
                'border:1px solid #e2e8f0',
                'border-radius:8px',
                'box-shadow:0 8px 24px rgba(0,0,0,.12)',
                'min-width:320px',
                'max-height:260px',
                'overflow-y:auto',
                'padding:4px 0',
                'visibility:hidden',
              ].join(';')
              renderItems(props)
              document.body.appendChild(popup)
              requestAnimationFrame(() => {
                applyPosition(props)
                if (popup) popup.style.visibility = 'visible'
              })
            }

            function renderItems(props) {
              if (!popup) return
              popup.innerHTML = ''
              selectedIndex = 0

              if (!props.items.length) {
                const empty = document.createElement('div')
                empty.style.cssText = 'padding:8px 12px;font-size:12px;color:#94a3b8;font-style:italic;'
                empty.textContent = 'No papers found'
                popup.appendChild(empty)
                return
              }

              let selectableCount = 0
              props.items.forEach((item) => {
                if (item._isDivider) {
                  // Section header — not clickable
                  const div = document.createElement('div')
                  div.style.cssText = [
                    'padding:4px 12px 3px',
                    'font-size:10px',
                    'color:#94a3b8',
                    'font-weight:500',
                    'text-transform:uppercase',
                    'letter-spacing:.05em',
                    'border-top:1px solid #f1f5f9',
                    'margin-top:2px',
                  ].join(';')
                  div.textContent = 'Search full library...'
                  popup.appendChild(div)
                  return
                }

                const idx = selectableCount++
                const el = document.createElement('div')
                el.setAttribute('data-index', idx)
                el.style.cssText = [
                  'padding:6px 10px',
                  'cursor:pointer',
                  'display:flex',
                  'align-items:center',
                  'gap:7px',
                  idx === selectedIndex ? 'background:#f1f5f9' : '',
                ].join(';')

                const icon = item.type === 'website' ? '🌐' : '📄'
                const authorStr = Array.isArray(item.authors) && item.authors.length > 0
                  ? item.authors[0].split(',')[0] + (item.authors.length > 1 ? ' et al.' : '')
                  : ''
                const yearStr = item.year ? String(item.year) : ''
                const subtitle = [authorStr, yearStr].filter(Boolean).join(', ')

                const titleDisplay = (item.title || '').length > 45
                  ? (item.title || '').slice(0, 43) + '…'
                  : (item.title || '')

                el.innerHTML = [
                  `<span style="font-size:13px;flex-shrink:0;">${icon}</span>`,
                  `<span style="flex:1;min-width:0;">`,
                  `  <span style="display:block;font-size:12px;color:#1e293b;font-weight:${item.isLinked ? '600' : '400'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${titleDisplay}</span>`,
                  subtitle ? `  <span style="display:block;font-size:10px;color:#94a3b8;">${subtitle}</span>` : '',
                  `</span>`,
                  item.isLinked
                    ? `<span style="font-size:10px;background:#dbeafe;color:#2563eb;padding:1px 5px;border-radius:4px;font-weight:500;flex-shrink:0;">Linked</span>`
                    : '',
                ].join('')

                el.addEventListener('mouseenter', () => { selectedIndex = idx; highlight() })
                el.addEventListener('mouseleave', () => { el.style.background = '' })
                el.addEventListener('mousedown', e => {
                  e.preventDefault()
                  props.command(item)
                })

                popup.appendChild(el)
              })
            }

            function applyPosition(props) {
              if (!popup || !props.clientRect) return
              const rect = props.clientRect()
              if (!rect) return

              const POPUP_H = popup.offsetHeight || 260
              const POPUP_W = 320
              const MARGIN  = 6
              const vh = window.innerHeight
              const vw = window.innerWidth

              let top = rect.bottom + MARGIN
              if (top + POPUP_H > vh) top = rect.top - POPUP_H - MARGIN
              top  = Math.max(MARGIN, Math.min(top,  vh - POPUP_H - MARGIN))
              let left = Math.max(MARGIN, Math.min(rect.left, vw - POPUP_W - MARGIN))

              popup.style.top  = `${top}px`
              popup.style.left = `${left}px`
            }

            return {
              onStart: props => buildPopup(props),

              onUpdate: props => {
                if (!popup) buildPopup(props)
                else { renderItems(props); applyPosition(props) }
              },

              onKeyDown: ({ event }) => {
                if (!popup) return false
                const selectableItems = getSelectableItems()
                const count = selectableItems.length

                if (event.key === 'ArrowDown') {
                  selectedIndex = Math.min(selectedIndex + 1, count - 1)
                  highlight(); return true
                }
                if (event.key === 'ArrowUp') {
                  selectedIndex = Math.max(selectedIndex - 1, 0)
                  highlight(); return true
                }
                if (event.key === 'Enter') {
                  selectableItems[selectedIndex]?.dispatchEvent(
                    new MouseEvent('mousedown', { bubbles: true })
                  )
                  return true
                }
                if (event.key === 'Escape') { removePopup(); return true }
                return false
              },

              onExit: () => removePopup(),
            }
          },
        }),
      ]
    },
  })
}

/**
 * Extract all citation references from note HTML content.
 * Returns a deduplicated array of { citationKey, paperId, websiteId }.
 *
 * Uses regex parsing (same approach as extractWikiLinks) — NOT DOMParser,
 * since this is called on stored HTML strings outside the editor context.
 */
export function extractCitations(htmlContent) {
  if (!htmlContent) return []

  const results = []
  const seenKeys = new Set()

  const spanRegex = /<span\b([^>]*)>/g
  let m
  while ((m = spanRegex.exec(htmlContent)) !== null) {
    const attrs = m[1]

    // Only process spans that have data-cite-key
    const keyMatch = /data-cite-key="([^"]*)"/.exec(attrs)
    if (!keyMatch) continue

    const citationKey = keyMatch[1].trim()
    if (!citationKey) continue

    // Deduplicate by citationKey
    if (seenKeys.has(citationKey)) continue
    seenKeys.add(citationKey)

    const paperIdMatch = /data-cite-paper-id="([^"]*)"/.exec(attrs)
    const websiteIdMatch = /data-cite-website-id="([^"]*)"/.exec(attrs)

    results.push({
      citationKey,
      paperId: paperIdMatch ? paperIdMatch[1] : null,
      websiteId: websiteIdMatch ? websiteIdMatch[1] : null,
    })
  }

  return results
}
