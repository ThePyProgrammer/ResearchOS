import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const PANEL_CLASS = 'fixed z-[100] w-60 max-w-[calc(100vw-16px)] max-h-[calc(100vh-16px)] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl'
const BUTTON_CLASS = 'flex w-full items-center gap-2 px-3 py-2 text-left text-xs outline-none hover:bg-slate-50 focus:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed'

function Icon({ name }) {
  return <span aria-hidden="true" className="material-symbols-outlined text-[16px]">{name}</span>
}

function ActionButton({ action, onClose, onMouseEnter }) {
  return <button role="menuitem" disabled={action.disabled} onMouseEnter={onMouseEnter}
    onClick={() => { onClose(); action.run() }}
    className={`${BUTTON_CLASS} ${action.danger ? 'text-red-600' : 'text-slate-700'}`}>
    <Icon name={action.icon} />{action.label}
  </button>
}

function Submenu({ branch, onClose, onBack }) {
  const ref = useRef(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  useLayoutEffect(() => {
    const bounds = ref.current.getBoundingClientRect()
    const anchor = branch.trigger.getBoundingClientRect()
    const parent = branch.trigger.closest('[role="menu"]').getBoundingClientRect()
    const left = parent.right + bounds.width <= window.innerWidth - 8 ? parent.right : parent.left - bounds.width
    setPosition({
      left: Math.max(8, Math.min(left, window.innerWidth - bounds.width - 8)),
      top: Math.max(8, Math.min(anchor.top, window.innerHeight - bounds.height - 8)),
    })
    if (branch.focus) ref.current.querySelector('button:not(:disabled)')?.focus()
  }, [branch])

  return <div ref={ref} role="menu" aria-label={branch.group.label} style={position} className={PANEL_CLASS}
    onKeyDown={event => {
      if (event.key === 'ArrowLeft' || event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onBack()
      }
    }}>
    {branch.group.actions.map(action => <ActionButton key={action.label} action={action} onClose={onClose} />)}
  </div>
}

export default function ItemContextMenu({ x, y, title, groups, onClose }) {
  const rootRef = useRef(null)
  const menuRef = useRef(null)
  const [branch, setBranch] = useState(null)
  const [position, setPosition] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const menu = menuRef.current
    const previousFocus = document.activeElement
    const bounds = rootRef.current.getBoundingClientRect()
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
    const buttons = [...event.target.closest('[role="menu"]').querySelectorAll('button:not(:disabled)')]
    const index = buttons.indexOf(document.activeElement)
    const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length
      : event.key === 'ArrowUp' ? (index - 1 + buttons.length) % buttons.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : null
    if (next !== null) {
      event.preventDefault()
      if (event.target.closest('[role="menu"]') === rootRef.current) setBranch(null)
      buttons[next]?.focus()
    }
  }

  return createPortal(
    <div ref={menuRef} onKeyDown={handleKeyDown} onContextMenu={event => event.preventDefault()}>
      <div ref={rootRef} role="menu" aria-label={title} style={position} className={PANEL_CLASS}>
      <div className="px-3 py-2 text-xs font-semibold text-slate-500 truncate" title={title}>{title}</div>
      {groups.filter(group => group.actions.length).map(group => group.actions.length === 1 ? (
        <div key={group.label} className="border-t border-slate-100 mt-1 pt-1">
          <ActionButton action={group.actions[0]} onClose={onClose} onMouseEnter={() => setBranch(null)} />
        </div>
      ) : (
        <button key={group.label} role="menuitem" aria-haspopup="menu" aria-expanded={branch?.group.label === group.label}
          className={`${BUTTON_CLASS} text-slate-700 ${branch?.group.label === group.label ? 'bg-blue-50' : ''}`}
          onMouseEnter={event => setBranch({ group, trigger: event.currentTarget, focus: false })}
          onClick={event => setBranch({ group, trigger: event.currentTarget, focus: true })}
          onKeyDown={event => {
            if (event.key === 'ArrowRight') {
              event.preventDefault()
              event.stopPropagation()
              setBranch({ group, trigger: event.currentTarget, focus: true })
            }
          }}>
          <Icon name={group.actions[0].icon} />
          <span className="flex-1">{group.label}</span>
          <Icon name="chevron_right" />
        </button>
      ))}
      </div>
      {branch && <Submenu branch={branch} onClose={onClose} onBack={() => {
        branch.trigger.focus()
        setBranch(null)
      }} />}
    </div>, document.body,
  )
}
