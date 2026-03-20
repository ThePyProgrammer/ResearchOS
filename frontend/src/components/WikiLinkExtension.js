import { Mark, mergeAttributes, markInputRule } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'

/**
 * WikiLink Tiptap Extension (Mark-based)
 *
 * Renders wiki links as styled inline text — no visible [[]] brackets.
 * The display text IS the link text (editable). The target note name is
 * stored in data-wiki-name on the surrounding <span>.
 *
 * Supported syntax (via input rules):
 *   [[Note Name]]          → "Note Name" linked to "Note Name"
 *   [[Note Name|My Label]] → "My Label" linked to "Note Name"
 *
 * The [[ autocomplete popup inserts a link via the Suggestion plugin.
 * After insertion the display text can be edited freely in the editor.
 * Clicking a link fires onWikiLinkClick(noteName).
 */
export function createWikiLinkExtension({ getAllNotes, onWikiLinkClick }) {
  return Mark.create({
    name: 'wikiLink',

    // Don't extend the mark when typing immediately after it
    inclusive: false,

    addAttributes() {
      return {
        name: {
          default: null,
          parseHTML: element => element.getAttribute('data-wiki-name'),
          renderHTML: attributes => ({
            'data-wiki-name': attributes.name,
          }),
        },
        noteId: {
          default: null,
          parseHTML: element => element.getAttribute('data-wiki-id') || null,
          renderHTML: attributes => attributes.noteId ? { 'data-wiki-id': attributes.noteId } : {},
        },
      }
    },

    parseHTML() {
      return [{ tag: 'span[data-wiki-name]' }]
    },

    renderHTML({ HTMLAttributes }) {
      // `0` at the end means "render children here" (the display text)
      return ['span', mergeAttributes({ class: 'wiki-link' }, HTMLAttributes), 0]
    },

    addInputRules() {
      return [
        // [[Note Name|Display Label]] → "Display Label" linked to "Note Name"
        markInputRule({
          find: /\[\[([^\]|]+)\|([^\]]+)\]\]$/,
          type: this.type,
          getAttributes: match => ({ name: match[1].trim() }),
        }),
        // [[Note Name]] → "Note Name" linked to "Note Name"
        markInputRule({
          find: /\[\[([^\][|]+)\]\]$/,
          type: this.type,
          getAttributes: match => ({ name: match[1].trim() }),
        }),
      ]
    },

    addProseMirrorPlugins() {
      const markName = this.name

      // ── Find the full text range covered by a wiki-link mark at pos ──────
      function findMarkRange(doc, pos) {
        const $pos = doc.resolve(pos)
        const wikiMark = $pos.marks().find(m => m.type.name === markName)
        if (!wikiMark) return null

        const parentStart = pos - $pos.parentOffset
        const parent = $pos.parent

        // Collect all text-node ranges in this paragraph that share the same mark
        const segments = []
        parent.forEach((child, offset) => {
          if (!child.isText) return
          if (child.marks.some(m => m.type.name === markName && m.attrs.name === wikiMark.attrs.name)) {
            segments.push({ from: parentStart + offset, to: parentStart + offset + child.nodeSize })
          }
        })
        if (!segments.length) return null

        // Merge contiguous segments into one range
        const merged = segments.reduce((acc, seg) => ({
          from: Math.min(acc.from, seg.from),
          to: Math.max(acc.to, seg.to),
        }))

        return { ...merged, mark: wikiMark }
      }

      // ── Context menu helper (imperatively rendered) ───────────────────────
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
        const noteName = mark.attrs.name

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
          'min-width:200px',
          'padding:4px 0',
          'font-family:ui-sans-serif,system-ui,sans-serif',
        ].join(';')

        // Header: show the target note name
        const header = document.createElement('div')
        header.style.cssText = 'padding:6px 12px 5px;border-bottom:1px solid #f1f5f9;margin-bottom:4px;'
        header.innerHTML = `<span style="font-size:10px;color:#94a3b8;display:block;font-weight:500;text-transform:uppercase;letter-spacing:.05em;margin-bottom:1px;">Wiki link</span><span style="font-size:12px;color:#334155;font-weight:500;">📄 ${noteName}</span>`
        ctxMenu.appendChild(header)

        // ── Set label ─────────────────────────────────────────────────────
        const setLabelBtn = document.createElement('div')
        setLabelBtn.style.cssText = 'padding:6px 12px;cursor:pointer;font-size:12px;color:#374151;display:flex;align-items:center;gap:8px;'
        setLabelBtn.innerHTML = '<span style="font-size:13px;">✏️</span> Set label'
        setLabelBtn.addEventListener('mouseenter', () => setLabelBtn.style.background = '#f8fafc')
        setLabelBtn.addEventListener('mouseleave', () => setLabelBtn.style.background = '')
        setLabelBtn.addEventListener('mousedown', e => {
          e.preventDefault()
          e.stopPropagation()
          // Replace button area with an input form
          setLabelBtn.remove()
          removeLinkBtn.remove()

          const form = document.createElement('div')
          form.style.cssText = 'padding:6px 10px 8px;display:flex;gap:6px;align-items:center;'

          const input = document.createElement('input')
          // Pre-fill with the current display text
          const currentText = view.state.doc.textBetween(range.from, range.to)
          input.value = currentText
          input.placeholder = 'Display label…'
          input.style.cssText = 'flex:1;min-width:0;padding:4px 8px;font-size:12px;border:1px solid #cbd5e1;border-radius:6px;outline:none;'
          input.addEventListener('focus', () => input.style.borderColor = '#6366f1')
          input.addEventListener('blur',  () => input.style.borderColor = '#cbd5e1')

          const confirmBtn = document.createElement('button')
          confirmBtn.textContent = '✓'
          confirmBtn.style.cssText = 'padding:4px 8px;font-size:12px;background:#6366f1;color:#fff;border:none;border-radius:6px;cursor:pointer;flex-shrink:0;'
          confirmBtn.addEventListener('mouseenter', () => confirmBtn.style.background = '#4f46e5')
          confirmBtn.addEventListener('mouseleave', () => confirmBtn.style.background = '#6366f1')

          function applyLabel() {
            const newLabel = input.value.trim()
            if (!newLabel) { removeCtxMenu(); return }
            const { state, dispatch } = view
            dispatch(
              state.tr.replaceWith(
                range.from,
                range.to,
                state.schema.text(newLabel, [mark])
              )
            )
            removeCtxMenu()
            view.focus()
          }

          confirmBtn.addEventListener('mousedown', e => { e.preventDefault(); applyLabel() })
          input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); applyLabel() }
            if (e.key === 'Escape') removeCtxMenu()
          })

          form.appendChild(input)
          form.appendChild(confirmBtn)
          ctxMenu.appendChild(form)

          // Focus input after render
          requestAnimationFrame(() => { input.focus(); input.select() })
        })
        ctxMenu.appendChild(setLabelBtn)

        // ── Remove link ───────────────────────────────────────────────────
        const removeLinkBtn = document.createElement('div')
        removeLinkBtn.style.cssText = 'padding:6px 12px;cursor:pointer;font-size:12px;color:#ef4444;display:flex;align-items:center;gap:8px;'
        removeLinkBtn.innerHTML = '<span style="font-size:13px;">🔗</span> Remove link'
        removeLinkBtn.addEventListener('mouseenter', () => removeLinkBtn.style.background = '#fef2f2')
        removeLinkBtn.addEventListener('mouseleave', () => removeLinkBtn.style.background = '')
        removeLinkBtn.addEventListener('mousedown', e => {
          e.preventDefault()
          const { state, dispatch } = view
          // Keep the text, just remove the mark
          dispatch(state.tr.removeMark(range.from, range.to, mark.type))
          removeCtxMenu()
          view.focus()
        })
        ctxMenu.appendChild(removeLinkBtn)

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
        // ── Click + right-click handler ──────────────────────────────────
        new Plugin({
          props: {
            handleClick(view, pos, event) {
              if (event.button !== 0) return false
              const wikiMark = view.state.doc.resolve(pos).marks().find(m => m.type.name === markName)
              if (wikiMark) {
                event.preventDefault()
                onWikiLinkClick?.(wikiMark.attrs.name, wikiMark.attrs.noteId || null)
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

        // ── Suggestion: [[ triggers autocomplete popup ───────────────────
        Suggestion({
          pluginKey: 'wikiLinkSuggestion',
          editor: this.editor,
          char: '[[',
          allowSpaces: true,

          command: ({ editor, range, props }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent([
                {
                  type: 'text',
                  text: props.name,
                  marks: [{ type: markName, attrs: { name: props.name, noteId: props.noteId || null } }],
                },
                { type: 'text', text: ' ' },
              ])
              .run()
          },

          items: ({ query }) => {
            const notes = getAllNotes?.() ?? []
            const q = query.toLowerCase().trim()

            if (!q) {
              return notes.filter(n => n.type === 'file').slice(0, 10)
            }

            const scored = notes
              .filter(n => n.type === 'file')
              .map(n => {
                const name = n.name.toLowerCase()
                const src  = (n.sourceName || '').toLowerCase()

                let score = 0
                if (name === q)              score = 100
                else if (name.startsWith(q)) score = 80
                else if (name.includes(q))   score = 60
                else if (src === q)          score = 50
                else if (src.startsWith(q))  score = 40
                else if (src.includes(q))    score = 30

                return { note: n, score }
              })
              .filter(({ score }) => score > 0)
              .sort((a, b) => b.score - a.score)
              .slice(0, 10)
              .map(({ note }) => note)

            const hasExact = scored.some(n => n.name.toLowerCase() === q)
            if (!hasExact) {
              scored.push({ id: '__new__', name: query, isNew: true })
            }

            return scored
          },

          render: () => {
            let popup = null
            let selectedIndex = 0

            const SOURCE_BADGE = {
              library: { bg: '#f1f5f9', color: '#64748b', label: 'Library' },
              paper:   { bg: '#dbeafe', color: '#2563eb', label: 'Paper'   },
              website: { bg: '#ccfbf1', color: '#0d9488', label: 'Website' },
              github:  { bg: '#ede9fe', color: '#7c3aed', label: 'GitHub'  },
            }

            function removePopup() {
              if (popup) { popup.remove(); popup = null }
            }

            function buildPopup(props) {
              removePopup()
              popup = document.createElement('div')
              popup.className = 'wiki-link-popup'
              popup.style.cssText = [
                'position:fixed',
                'z-index:9999',
                'background:#fff',
                'border:1px solid #e2e8f0',
                'border-radius:8px',
                'box-shadow:0 8px 24px rgba(0,0,0,.12)',
                'min-width:300px',
                'max-height:240px',
                'overflow-y:auto',
                'padding:4px 0',
                'visibility:hidden',   /* hide until positioned */
              ].join(';')
              renderItems(props)
              document.body.appendChild(popup)
              // Defer one frame so the suggestion decoration is in the DOM
              // before we ask for its bounding rect.
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
                empty.style.cssText =
                  'padding:8px 12px;font-size:12px;color:#94a3b8;font-style:italic;'
                empty.textContent = 'No notes found'
                popup.appendChild(empty)
                return
              }

              props.items.forEach((item, i) => {
                const el = document.createElement('div')
                el.style.cssText = [
                  'padding:5px 10px',
                  'cursor:pointer',
                  'display:flex',
                  'align-items:center',
                  'gap:7px',
                  i === selectedIndex ? 'background:#f1f5f9' : '',
                ].join(';')

                if (item.isNew) {
                  el.innerHTML = [
                    `<span style="font-size:10px;background:#eef2ff;color:#6366f1;padding:1px 6px;border-radius:4px;font-weight:600;flex-shrink:0;">new</span>`,
                    `<span style="font-size:12px;color:#6366f1;">${item.name}</span>`,
                  ].join('')
                } else {
                  const badge = SOURCE_BADGE[item.source] || SOURCE_BADGE.library
                  const sourceName = item.sourceName || badge.label
                  const truncated = sourceName.length > 28 ? sourceName.slice(0, 26) + '…' : sourceName
                  el.innerHTML = [
                    `<span style="font-size:11px;color:#94a3b8;flex-shrink:0;">📄</span>`,
                    `<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#1e293b;">${item.name}</span>`,
                    `<span style="flex-shrink:0;font-size:10px;padding:1px 6px;border-radius:4px;background:${badge.bg};color:${badge.color};font-weight:500;white-space:nowrap;" title="${sourceName}">${truncated}</span>`,
                  ].join('')
                }

                el.addEventListener('mouseenter', () => { selectedIndex = i; highlight() })
                el.addEventListener('mouseleave', () => { el.style.background = '' })
                el.addEventListener('mousedown', e => {
                  e.preventDefault()
                  props.command({ name: item.name, noteId: item.isNew ? null : (item.id || null) })
                })

                popup.appendChild(el)
              })
            }

            function highlight() {
              if (!popup) return
              Array.from(popup.children).forEach((el, i) => {
                el.style.background = i === selectedIndex ? '#f1f5f9' : ''
              })
            }

            function applyPosition(props) {
              if (!popup || !props.clientRect) return
              const rect = props.clientRect()
              if (!rect) return

              const POPUP_H = popup.offsetHeight || 240
              const POPUP_W = 320
              const MARGIN  = 6
              const vh = window.innerHeight
              const vw = window.innerWidth

              // Prefer opening below; flip above if not enough room
              let top = rect.bottom + MARGIN
              if (top + POPUP_H > vh) top = rect.top - POPUP_H - MARGIN

              // Hard-clamp to viewport
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
                if (event.key === 'ArrowDown') {
                  selectedIndex = Math.min(selectedIndex + 1, popup.children.length - 1)
                  highlight(); return true
                }
                if (event.key === 'ArrowUp') {
                  selectedIndex = Math.max(selectedIndex - 1, 0)
                  highlight(); return true
                }
                if (event.key === 'Enter') {
                  popup.children[selectedIndex]?.dispatchEvent(
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
 * Extract all wiki-link references from note HTML content.
 * Returns an array of { name, noteId } objects.
 *   - noteId is populated when the link was created via autocomplete (data-wiki-id present).
 *   - noteId is null for links typed as raw [[...]] text.
 * Handles both rendered <span data-wiki-name="..."> and raw [[...]] syntax.
 */
export function extractWikiLinks(htmlContent) {
  if (!htmlContent) return []
  const refs = []
  // Track seen keys so we don't emit duplicates.
  // ID-keyed spans also mark their name so raw-text duplicates are suppressed.
  const seenIds   = new Set()
  const seenNames = new Set()

  const spanRegex = /<span\b([^>]*)>/g
  let m
  while ((m = spanRegex.exec(htmlContent)) !== null) {
    const attrs = m[1]
    const nameMatch = /data-wiki-name="([^"]*)"/.exec(attrs)
    if (!nameMatch) continue
    const name = nameMatch[1].trim()
    if (!name) continue
    const idMatch = /data-wiki-id="([^"]*)"/.exec(attrs)
    const noteId  = idMatch ? idMatch[1] : null
    if (noteId) {
      if (seenIds.has(noteId)) continue
      seenIds.add(noteId)
      seenNames.add(name.toLowerCase()) // suppress same-name raw-text duplicate
    } else {
      if (seenNames.has(name.toLowerCase())) continue
      seenNames.add(name.toLowerCase())
    }
    refs.push({ name, noteId })
  }

  // Also handle raw [[...]] text that hasn't been converted to a span yet
  const rawRegex = /\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g
  while ((m = rawRegex.exec(htmlContent)) !== null) {
    const name = m[1].trim()
    if (seenNames.has(name.toLowerCase())) continue
    seenNames.add(name.toLowerCase())
    refs.push({ name, noteId: null })
  }

  return refs
}
