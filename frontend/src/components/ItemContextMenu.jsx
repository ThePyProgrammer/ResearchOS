import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function ItemContextMenu({ x, y, title, groups, onClose }) {
  const menuRef = useRef(null)
  const [position, setPosition] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const menu = menuRef.current
    const previousFocus = document.activeElement
    const bounds = menu.getBoundingClientRect()
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8)),
    })
    menu.querySelector('button:not(:disabled)')?.focus()
    const outside = event => { if (!menu.contains(event.target)) onClose() }
    const scroll = event => { if (!menu.contains(event.target)) onClose() }
    window.addEventListener('pointerdown', outside)
    window.addEventListener('resize', onClose)
    window.addEventListener('blur', onClose)
    document.addEventListener('scroll', scroll, true)
    return () => {
      window.removeEventListener('pointerdown', outside)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('blur', onClose)
      document.removeEventListener('scroll', scroll, true)
      if (menu.contains(document.activeElement)) previousFocus?.focus()
    }
  }, [x, y, onClose])

  const handleKeyDown = event => {
    event.stopPropagation()
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault()
      onClose()
      return
    }
    const buttons = [...menuRef.current.querySelectorAll('button:not(:disabled)')]
    const index = buttons.indexOf(document.activeElement)
    const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length
      : event.key === 'ArrowUp' ? (index - 1 + buttons.length) % buttons.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : null
    if (next !== null) {
      event.preventDefault()
      buttons[next]?.focus()
    }
  }

  return createPortal(
    <div ref={menuRef} role="menu" aria-label={title} onKeyDown={handleKeyDown}
      onContextMenu={event => event.preventDefault()}
      style={position}
      className="fixed z-[100] w-64 max-w-[calc(100vw-16px)] max-h-[calc(100vh-16px)] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
      <div className="px-3 py-2 text-xs font-semibold text-slate-500 truncate" title={title}>{title}</div>
      {groups.filter(group => group.actions.length).map(group => (
        <div key={group.label} role="group" aria-label={group.label} className="border-t border-slate-100 py-1">
          <div className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{group.label}</div>
          {group.actions.map(action => (
            <button key={action.label} role="menuitem" disabled={action.disabled}
              onClick={() => { onClose(); action.run() }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs outline-none hover:bg-slate-50 focus:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed ${action.danger ? 'text-red-600' : 'text-slate-700'}`}>
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>
      ))}
    </div>, document.body,
  )
}
